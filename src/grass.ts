import * as THREE from "three";
import { HALF, groundHeight, lushnessFromHeight, valueNoise } from "./terrain";

export interface Grass {
  group: THREE.Group;
  /** 0..1 share of the full blade budget. Blades are also thinned with distance from the camera. */
  setQuality(quality: number): void;
  quality(): number;
  /** Blades drawn last frame. */
  drawn(): number;
  update(time: number, crate: THREE.Object3D, push: number, sunDirView: THREE.Vector3, cameraPosition: THREE.Vector3): void;
}

const CHUNKS = 8;
/** Density (share of the full budget) that blades keep their natural width at. Thinner areas get slightly wider blades. */
const REFERENCE_DENSITY = 0.7;

function bladeGeometry(): THREE.BufferGeometry {
  // Unit-height blade: wide base, narrowing mid section, curved tip. Scaled per instance.
  const positions = new Float32Array([
    -0.5, 0, 0,
    0.5, 0, 0,
    -0.33, 0.55, 0.07,
    0.33, 0.55, 0.07,
    0, 1, 0.32
  ]);
  const base = new THREE.Color("#0f2a0d");
  const mid = new THREE.Color("#2c5a1b");
  const tip = new THREE.Color("#6c9633");
  const colours = new Float32Array([
    ...base.toArray(), ...base.toArray(),
    ...mid.toArray(), ...mid.toArray(),
    ...tip.toArray()
  ]);
  const normals = new Float32Array([0, 1, 0.15, 0, 1, 0.15, 0, 1, 0.1, 0, 1, 0.1, 0, 1, 0]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 4]);
  return geometry;
}

export function createGrass(max: number): Grass {
  const perChunk = Math.floor(max / (CHUNKS * CHUNKS));
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide
  });

  const uniforms = {
    uTime: { value: 0 },
    uCrate: { value: new THREE.Matrix4() },
    uCrateInv: { value: new THREE.Matrix4() },
    uPush: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uSunView: { value: new THREE.Vector3(0, 1, 0) },
    uLod: { value: 1 }
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uCrate = uniforms.uCrate;
    shader.uniforms.uCrateInv = uniforms.uCrateInv;
    shader.uniforms.uPush = uniforms.uPush;
    shader.uniforms.uCenter = uniforms.uCenter;
    shader.uniforms.uSunView = uniforms.uSunView;
    shader.uniforms.uLod = uniforms.uLod;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        uniform float uTime;
        uniform mat4 uCrate;
        uniform mat4 uCrateInv;
        uniform float uPush;
        uniform vec3 uCenter;
        uniform float uLod;
        varying float vAO;
        varying float vTip;
        varying vec3 vRay;`)
      .replace("#include <project_vertex>", `
        float bladeT = clamp(position.y, 0.0, 1.0);
        float bladeH = length(instanceMatrix[1].xyz);
        vec3 blade = transformed;
        blade.x *= uLod;
        vec4 gpos = instanceMatrix * vec4(blade, 1.0);
        float w1 = sin(uTime * 1.7 + gpos.x * 0.75 + gpos.z * 0.55);
        float w2 = sin(uTime * 2.9 + gpos.x * 1.9 - gpos.z * 1.3) * 0.4;
        float gust = (w1 + w2) * 0.5 + 0.15;
        float bend = bladeT * bladeT * bladeH;
        gpos.x += gust * 0.20 * bend;
        gpos.z += gust * 0.09 * bend;
        vAO = 1.0;
        vec4 rootW = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 toCrate = rootW.xyz - uCenter;
        if (dot(toCrate, toCrate) < 6.0) {
        // Crate collision against the real oriented box (half-size 0.5), done in the crate's local space.
        vec3 rl = (uCrateInv * rootW).xyz;
        vec3 qr = abs(rl) - vec3(0.5);
        float dRoot = length(max(qr, 0.0)) + min(max(qr.x, max(qr.y, qr.z)), 0.0);
        // Grass under the crate is pressed down: cast a ray straight up from the root; if it hits the box,
        // cap the blade below the box underside and squash it inward.
        vec3 du = mat3(uCrateInv) * vec3(0.0, 1.0, 0.0) + vec3(1e-5);
        vec3 invd = 1.0 / du;
        vec3 t1 = (vec3(-0.5) - rl) * invd;
        vec3 t2 = (vec3(0.5) - rl) * invd;
        vec3 tmn = min(t1, t2);
        vec3 tmx = max(t1, t2);
        float tNear = max(max(tmn.x, tmn.y), tmn.z);
        float tFar = min(min(tmx.x, tmx.y), tmx.z);
        float hitU = step(max(tNear, 0.0), tFar);
        float gap = max(tNear, 0.0);
        gpos.y = mix(gpos.y, min(gpos.y, rootW.y + max(gap - 0.03, 0.0)), hitU);
        gpos.xz = mix(gpos.xz, rootW.xz, hitU * (1.0 - smoothstep(0.0, 0.25, gap)) * 0.9);
        float collapse = hitU;
        // Blades beside it lean away from the nearest face, in the box's own orientation.
        vec3 nl = rl - clamp(rl, vec3(-0.5), vec3(0.5));
        vec3 wdir = mat3(uCrate) * (nl / max(length(nl), 0.0001));
        float lean = uPush * (1.0 - smoothstep(0.02, 0.5, dRoot)) * (1.0 - collapse);
        vec2 leanDir = normalize(wdir.xz + vec2(0.0001));
        gpos.xz += leanDir * lean * bladeT * bladeH * 0.9;
        gpos.y -= lean * bladeT * bladeT * bladeH * 0.5;
        // Final safety: any vertex still inside the (slightly grown) box is pushed out through the nearest face.
        vec3 pl = (uCrateInv * gpos).xyz;
        vec3 q = abs(pl) - vec3(0.53);
        if (max(q.x, max(q.y, q.z)) < 0.0) {
          vec3 sg = sign(pl);
          if (q.x > q.y && q.x > q.z) pl.x = sg.x * 0.53;
          else if (q.z > q.y) pl.z = sg.z * 0.53;
          else pl.y = sg.y * 0.53;
          gpos = uCrate * vec4(pl, 1.0);
        }
        // Soft ambient occlusion in the crease where the crate meets the ground.
        vec3 rlg = (uCrateInv * gpos).xyz;
        vec3 qg = abs(rlg) - vec3(0.5);
        float dg = length(max(qg, 0.0)) + min(max(qg.x, max(qg.y, qg.z)), 0.0);
        vAO = 1.0 - 0.55 * uPush * (1.0 - smoothstep(0.0, 0.7, dg));
        }
        vTip = bladeT;
        vec4 mvPosition = modelViewMatrix * gpos;
        vRay = mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;`);
    // Keep the up-facing blade normal on both sides so the back of a blade isn't lit from below.
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform vec3 uSunView;
        varying float vAO;
        varying float vTip;
        varying vec3 vRay;`)
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n        normal = normalize(vNormal);")
      .replace("#include <opaque_fragment>", `
        // Subtle backlight: blades pick up a little warm light when the sun is behind them.
        float back = pow(clamp(dot(normalize(vRay), normalize(uSunView)), 0.0, 1.0), 4.0);
        outgoingLight = outgoingLight * vAO + diffuseColor.rgb * vec3(1.0, 0.95, 0.7) * back * vTip * 0.22;
        #include <opaque_fragment>`);
  };

  const geometry = bladeGeometry();
  const group = new THREE.Group();
  const chunkSize = (HALF * 2) / CHUNKS;
  const dummy = new THREE.Object3D();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  const tint = new THREE.Color();
  let seed = 0x1badf00d;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  interface Chunk { mesh: THREE.InstancedMesh; centre: THREE.Vector3 }
  const chunks: Chunk[] = [];
  for (let cx = 0; cx < CHUNKS; cx += 1) {
    for (let cz = 0; cz < CHUNKS; cz += 1) {
      const x0 = -HALF + cx * chunkSize;
      const z0 = -HALF + cz * chunkSize;
      const mesh = new THREE.InstancedMesh(geometry, material, perChunk);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      let placed = 0;
      while (placed < perChunk) {
        const x = Math.min(HALF - 0.06, Math.max(-HALF + 0.06, x0 + random() * chunkSize));
        const z = Math.min(HALF - 0.06, Math.max(-HALF + 0.06, z0 + random() * chunkSize));
        const h = groundHeight(x, z);
        const damp = lushnessFromHeight(h);
        // Denser grass in hollows, sparser on dry hilltops.
        if (random() > 0.4 + 0.6 * damp) continue;
        const i = placed;
        placed += 1;
        const lush = (0.55 + 0.45 * valueNoise(x * 0.5 + 20, z * 0.5 + 4)) * (0.8 + 0.45 * damp);
        const height = (0.24 + random() * 0.34) * lush;
        const width = 0.05 + random() * 0.04;
        dummy.position.set(x, h - 0.015, z);
        euler.set((random() - 0.5) * 0.35, random() * Math.PI * 2, 0);
        dummy.quaternion.setFromEuler(euler);
        dummy.scale.set(width, height, height);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        const dryness = Math.max(
          THREE.MathUtils.smoothstep(valueNoise(x * 0.35 + 5, z * 0.35 + 1), 0.6, 0.85),
          (1 - damp) * 0.5
        );
        const brightness = (0.6 + random() * 0.35) * (1 - damp * 0.15);
        tint.setRGB(
          brightness * (1 + 0.45 * dryness),
          brightness * (1 + 0.05 * dryness),
          brightness * (1 - 0.5 * dryness)
        );
        mesh.setColorAt(i, tint);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const centre = new THREE.Vector3(x0 + chunkSize / 2, 0.6, z0 + chunkSize / 2);
      // Tight bounds so off-screen chunks are skipped entirely.
      mesh.boundingSphere = new THREE.Sphere(centre.clone(), chunkSize * 0.71 + 1.8);
      mesh.onBeforeRender = () => {
        uniforms.uLod.value = mesh.userData.lod as number;
      };
      mesh.userData.lod = 1;
      group.add(mesh);
      chunks.push({ mesh, centre });
    }
  }

  let quality = 1;
  let drawn = 0;

  return {
    group,
    setQuality(value: number): void {
      quality = THREE.MathUtils.clamp(value, 0.05, 1);
    },
    quality: () => quality,
    drawn: () => drawn,
    update(time: number, crate: THREE.Object3D, push: number, sunDirView: THREE.Vector3, cameraPosition: THREE.Vector3): void {
      uniforms.uTime.value = time;
      uniforms.uSunView.value.copy(sunDirView);
      crate.updateMatrixWorld(true);
      uniforms.uCenter.value.setFromMatrixPosition(crate.matrixWorld);
      uniforms.uCrate.value.copy(crate.matrixWorld);
      uniforms.uCrateInv.value.copy(crate.matrixWorld).invert();
      uniforms.uPush.value = push;
      // Thin out distant chunks: far blades are sub-pixel, so keep full density only close to the camera.
      drawn = 0;
      for (const chunk of chunks) {
        const distance = chunk.centre.distanceTo(cameraPosition);
        const frac = THREE.MathUtils.clamp(1 - (distance - 18) / 60, 0.3, 1);
        const density = quality * frac;
        chunk.mesh.count = Math.floor(perChunk * density);
        chunk.mesh.userData.lod = THREE.MathUtils.clamp(Math.sqrt(REFERENCE_DENSITY / density), 1, 2.3);
        drawn += chunk.mesh.count;
      }
    }
  };
}
