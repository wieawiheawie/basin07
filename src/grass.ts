import * as THREE from "three";
import { HALF, groundHeight, valueNoise } from "./terrain";

export interface Grass {
  mesh: THREE.InstancedMesh;
  max: number;
  setCount(count: number): void;
  update(time: number, crate: THREE.Object3D, push: number): void;
}

function bladeGeometry(): THREE.BufferGeometry {
  // Unit-height blade: wide base, narrowing mid section, curved tip. Scaled per instance.
  const positions = new Float32Array([
    -0.5, 0, 0,
    0.5, 0, 0,
    -0.33, 0.55, 0.07,
    0.33, 0.55, 0.07,
    0, 1, 0.32
  ]);
  const base = new THREE.Color("#173d12");
  const mid = new THREE.Color("#3f8426");
  const tip = new THREE.Color("#9ccb4a");
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
    uPush: { value: 0 }
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uCrate = uniforms.uCrate;
    shader.uniforms.uCrateInv = uniforms.uCrateInv;
    shader.uniforms.uPush = uniforms.uPush;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        uniform float uTime;
        uniform mat4 uCrate;
        uniform mat4 uCrateInv;
        uniform float uPush;`)
      .replace("#include <project_vertex>", `
        float bladeT = clamp(position.y, 0.0, 1.0);
        float bladeH = length(instanceMatrix[1].xyz);
        vec4 gpos = instanceMatrix * vec4(transformed, 1.0);
        float w1 = sin(uTime * 1.7 + gpos.x * 0.75 + gpos.z * 0.55);
        float w2 = sin(uTime * 2.9 + gpos.x * 1.9 - gpos.z * 1.3) * 0.4;
        float gust = (w1 + w2) * 0.5 + 0.15;
        float bend = bladeT * bladeT * bladeH;
        gpos.x += gust * 0.20 * bend;
        gpos.z += gust * 0.09 * bend;
        // Crate collision against the real oriented box (half-size 0.5), done in the crate's local space.
        vec4 rootW = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 rl = (uCrateInv * rootW).xyz;
        vec3 qr = abs(rl) - vec3(0.5);
        float dRoot = length(max(qr, 0.0)) + min(max(qr.x, max(qr.y, qr.z)), 0.0);
        // Blades rooted under the crate are squashed flat beneath it.
        float footprint = step(abs(rl.x), 0.5) * step(abs(rl.z), 0.5) * step(-0.35, rl.y) * step(rl.y, 0.5);
        float collapse = footprint * (1.0 - smoothstep(0.05, 0.16, dRoot));
        gpos.xyz = mix(gpos.xyz, rootW.xyz, collapse);
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
        vec4 mvPosition = modelViewMatrix * gpos;
        gl_Position = projectionMatrix * mvPosition;`);
    // Keep the up-facing blade normal on both sides so the back of a blade isn't lit from below.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      "#include <normal_fragment_begin>\n        normal = normalize(vNormal);"
    );
  };

  const mesh = new THREE.InstancedMesh(bladeGeometry(), material, max);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  const tint = new THREE.Color();
  let seed = 0x1badf00d;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < max; i += 1) {
    const x = (random() * 2 - 1) * (HALF - 0.06);
    const z = (random() * 2 - 1) * (HALF - 0.06);
    const lush = 0.6 + 0.4 * valueNoise(x * 0.5 + 20, z * 0.5 + 4);
    const height = (0.24 + random() * 0.34) * lush;
    const width = 0.04 + random() * 0.035;
    dummy.position.set(x, groundHeight(x, z) - 0.015, z);
    euler.set((random() - 0.5) * 0.35, random() * Math.PI * 2, 0);
    dummy.quaternion.setFromEuler(euler);
    dummy.scale.set(width, height, height);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    const dryness = THREE.MathUtils.smoothstep(valueNoise(x * 0.35 + 5, z * 0.35 + 1), 0.6, 0.85);
    const brightness = 0.8 + random() * 0.45;
    tint.setRGB(
      brightness * (1 + 0.35 * dryness),
      brightness * (1 + 0.05 * dryness),
      brightness * (1 - 0.45 * dryness)
    );
    mesh.setColorAt(i, tint);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  return {
    mesh,
    max,
    setCount(count: number): void {
      mesh.count = Math.max(0, Math.min(max, Math.floor(count)));
    },
    update(time: number, crate: THREE.Object3D, push: number): void {
      uniforms.uTime.value = time;
      crate.updateMatrixWorld(true);
      uniforms.uCrate.value.copy(crate.matrixWorld);
      uniforms.uCrateInv.value.copy(crate.matrixWorld).invert();
      uniforms.uPush.value = push;
    }
  };
}
