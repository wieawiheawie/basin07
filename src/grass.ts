import * as THREE from "three";
import { HALF, groundHeight, lushnessFromHeight, valueNoise } from "./terrain";

/** An object the grass reacts to: an oriented box whose half-size is 0.5 in the object's local space (scale it to resize). */
export interface Interactor {
  object: THREE.Object3D;
  /** 0 when resting on the ground, 1 when lifted clear: how strongly nearby blades are pushed aside. */
  push: number;
}

export const MAX_INTERACTORS = 4;

export interface Grass {
  group: THREE.Group;
  /** 0..1 share of the full blade budget. Blades are also thinned with distance from the camera. */
  setQuality(quality: number): void;
  quality(): number;
  /** Blades drawn last frame. */
  drawn(): number;
  update(time: number, interactors: Interactor[], sunDirView: THREE.Vector3, cameraPosition: THREE.Vector3): void;
  /** After terrain edits: re-root blades in the area onto the new ground and remove any that were dug out or buried. */
  rebuildRegion(rect: { x0: number; x1: number; z0: number; z1: number }, heightAt: (x: number, z: number) => number, deltaAt: (x: number, z: number) => number): void;
}

const CHUNKS = 8;
/** Beyond this distance a blade is under a pixel wide, so it is drawn as a single triangle. */
const LITE_DISTANCE = 36;
/** Density (share of the full budget) that blades keep their natural width at. Thinner areas get slightly wider blades. */
const REFERENCE_DENSITY = 0.7;

function liteBladeGeometry(): THREE.BufferGeometry {
  // One triangle: wide base, pointed tip. Used for distant chunks (3 vertices instead of 5).
  const base = new THREE.Color("#0f2a0d");
  const tip = new THREE.Color("#2c5a1b").lerp(new THREE.Color("#6c9633"), 0.6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-0.6, 0, 0, 0.6, 0, 0, 0, 1, 0.25]), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array([...base.toArray(), ...base.toArray(), ...tip.toArray()]), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([0, 1, 0.15, 0, 1, 0.15, 0, 1, 0.05]), 3));
  geometry.setIndex([0, 1, 2]);
  return geometry;
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

export async function createGrass(
  max: number,
  sunDir: THREE.Vector3,
  onProgress?: (done: number, total: number) => void
): Promise<Grass> {
  const perChunk = Math.floor(max / (CHUNKS * CHUNKS));
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide
  });

  const identity = (): THREE.Matrix4[] => Array.from({ length: MAX_INTERACTORS }, () => new THREE.Matrix4());
  const uniforms = {
    uTime: { value: 0 },
    uLod: { value: 1 },
    uBoxCount: { value: 0 },
    uBoxM: { value: identity() },
    uBoxInv: { value: identity() },
    uBoxCentre: { value: Array.from({ length: MAX_INTERACTORS }, () => new THREE.Vector3()) },
    uBoxPush: { value: new Array<number>(MAX_INTERACTORS).fill(0) },
    uSunWorld: { value: sunDir.clone().normalize() },
    uSunView: { value: new THREE.Vector3(0, 1, 0) }
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        uniform float uTime;
        uniform float uLod;
        uniform int uBoxCount;
        uniform mat4 uBoxM[${MAX_INTERACTORS}];
        uniform mat4 uBoxInv[${MAX_INTERACTORS}];
        uniform vec3 uBoxCentre[${MAX_INTERACTORS}];
        uniform float uBoxPush[${MAX_INTERACTORS}];
        uniform vec3 uSunWorld;
        attribute vec3 aRoot;
        attribute vec4 aShape;
        attribute vec4 aTint;
        varying float vAO;
        varying float vShade;
        varying float vTip;
        varying vec3 vRay;
        // 1.0 if a ray from o along d (in box-local space, half-size 0.5) hits the box.
        float rayBox(vec3 o, vec3 d) {
          vec3 inv = 1.0 / (d + vec3(1e-6));
          vec3 t1 = (vec3(-0.5) - o) * inv;
          vec3 t2 = (vec3(0.5) - o) * inv;
          vec3 tmn = min(t1, t2);
          vec3 tmx = max(t1, t2);
          float tn = max(max(tmn.x, tmn.y), tmn.z);
          float tf = min(min(tmx.x, tmx.y), tmx.z);
          return step(max(tn, 0.02), tf);
        }`)
      .replace("#include <color_vertex>", `#include <color_vertex>
        vColor.rgb *= aTint.rgb * 1.5;`)
      .replace("#include <project_vertex>", `
        // Blade shape and orientation are packed into a few bytes per blade and rebuilt here.
        float bladeT = clamp(position.y, 0.0, 1.0);
        float bWidth = aShape.x * 0.12 * uLod;
        float bladeH = aShape.y * 0.8;
        float yaw = aShape.z * 6.2831853;
        float tilt = (aShape.w - 0.5) * 0.35;
        vec3 lp = vec3(transformed.x * bWidth, transformed.y * bladeH, transformed.z * bladeH);
        float ct = cos(tilt); float st = sin(tilt);
        lp = vec3(lp.x, lp.y * ct - lp.z * st, lp.y * st + lp.z * ct);
        float cy = cos(yaw); float sy = sin(yaw);
        lp = vec3(cy * lp.x + sy * lp.z, lp.y, -sy * lp.x + cy * lp.z);
        vec4 rootW = vec4(aRoot, 1.0);
        vec4 gpos = vec4(aRoot + lp, 1.0);
        float w1 = sin(uTime * 1.7 + gpos.x * 0.75 + gpos.z * 0.55);
        float w2 = sin(uTime * 2.9 + gpos.x * 1.9 - gpos.z * 1.3) * 0.4;
        float gust = (w1 + w2) * 0.5 + 0.15;
        float bend = bladeT * bladeT * bladeH;
        gpos.x += gust * 0.20 * bend;
        gpos.z += gust * 0.09 * bend;
        vAO = 1.0;
        vShade = 0.0;
        for (int k = 0; k < ${MAX_INTERACTORS}; k++) {
          if (k >= uBoxCount) break;
          vec3 toBox = rootW.xyz - uBoxCentre[k];
          if (dot(toBox, toBox) < 6.0) {
            // Collision against the real oriented box, done in the box's local space.
            vec3 rl = (uBoxInv[k] * rootW).xyz;
            vec3 qr = abs(rl) - vec3(0.5);
            float dRoot = length(max(qr, 0.0)) + min(max(qr.x, max(qr.y, qr.z)), 0.0);
            // Grass under the box is pressed down: cast a ray straight up from the root; if it hits the box,
            // cap the blade below the underside and squash it inward.
            vec3 du = mat3(uBoxInv[k]) * vec3(0.0, 1.0, 0.0) + vec3(1e-5);
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
            // Blades beside it lean away from the nearest face, in the box's own orientation.
            vec3 nl = rl - clamp(rl, vec3(-0.5), vec3(0.5));
            vec3 wdir = mat3(uBoxM[k]) * (nl / max(length(nl), 0.0001));
            float lean = uBoxPush[k] * (1.0 - smoothstep(0.02, 0.5, dRoot)) * (1.0 - hitU);
            vec2 leanDir = normalize(wdir.xz + vec2(0.0001));
            gpos.xz += leanDir * lean * bladeT * bladeH * 0.9;
            gpos.y -= lean * bladeT * bladeT * bladeH * 0.5;
            // Final safety: any vertex still inside the (slightly grown) box is pushed out through the nearest face.
            vec3 pl = (uBoxInv[k] * gpos).xyz;
            vec3 q = abs(pl) - vec3(0.53);
            if (max(q.x, max(q.y, q.z)) < 0.0) {
              vec3 sg = sign(pl);
              if (q.x > q.y && q.x > q.z) pl.x = sg.x * 0.53;
              else if (q.z > q.y) pl.z = sg.z * 0.53;
              else pl.y = sg.y * 0.53;
              gpos = uBoxM[k] * vec4(pl, 1.0);
            }
            // Soft ambient occlusion in the crease where the box meets the ground.
            vec3 rlg = (uBoxInv[k] * gpos).xyz;
            vec3 qg = abs(rlg) - vec3(0.5);
            float dg = length(max(qg, 0.0)) + min(max(qg.x, max(qg.y, qg.z)), 0.0);
            vAO = min(vAO, 1.0 - 0.55 * uBoxPush[k] * (1.0 - smoothstep(0.0, 0.7, dg)));
          }
        }
        // Analytic soft shadow from each box (five rays toward the sun). Grass doesn't sample the shadow map.
        vec3 sa = normalize(cross(uSunWorld, vec3(0.0, 1.0, 0.0)));
        vec3 sb = cross(uSunWorld, sa);
        for (int k = 0; k < ${MAX_INTERACTORS}; k++) {
          if (k >= uBoxCount) break;
          vec3 toBox = rootW.xyz - uBoxCentre[k];
          if (dot(toBox, toBox) < 36.0) {
            mat3 inv3 = mat3(uBoxInv[k]);
            vec3 o = (uBoxInv[k] * gpos).xyz;
            vec3 d = inv3 * uSunWorld;
            vec3 a = inv3 * (sa * 0.16);
            vec3 b = inv3 * (sb * 0.16);
            float hit = rayBox(o, d) + rayBox(o + a, d) + rayBox(o - a, d) + rayBox(o + b, d) + rayBox(o - b, d);
            vShade = max(vShade, hit * 0.2);
          }
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
        varying float vShade;
        varying float vTip;
        varying vec3 vRay;`)
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n        normal = normalize(vNormal);")
      .replace("#include <opaque_fragment>", `
        // Subtle backlight: blades pick up a little warm light when the sun is behind them.
        float back = pow(clamp(dot(normalize(vRay), normalize(uSunView)), 0.0, 1.0), 4.0);
        outgoingLight = outgoingLight * vAO * mix(1.0, 0.45, vShade)
          + diffuseColor.rgb * vec3(1.0, 0.95, 0.7) * back * vTip * 0.22 * (1.0 - vShade);
        #include <opaque_fragment>`);
  };

  const base = bladeGeometry();
  const liteBase = liteBladeGeometry();
  const group = new THREE.Group();
  const chunkSize = (HALF * 2) / CHUNKS;
  let seed = 0x1badf00d;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const byte = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));

  interface Chunk { roots: Float32Array; shapes: Uint8Array; minX: number; maxX: number; minZ: number; maxZ: number; mesh: THREE.Mesh; geometry: THREE.InstancedBufferGeometry; lite: THREE.InstancedBufferGeometry; centre: THREE.Vector3; lod: number }
  const chunks: Chunk[] = [];
  for (let cx = 0; cx < CHUNKS; cx += 1) {
    for (let cz = 0; cz < CHUNKS; cz += 1) {
      const x0 = -HALF + cx * chunkSize;
      const z0 = -HALF + cz * chunkSize;
      const roots = new Float32Array(perChunk * 3);
      const shapes = new Uint8Array(perChunk * 4);
      const tints = new Uint8Array(perChunk * 4);
      let placed = 0;
      while (placed < perChunk) {
        const x = Math.min(HALF - 0.06, Math.max(-HALF + 0.06, x0 + random() * chunkSize));
        const z = Math.min(HALF - 0.06, Math.max(-HALF + 0.06, z0 + random() * chunkSize));
        const h = groundHeight(x, z);
        const damp = lushnessFromHeight(h);
        // Denser grass in hollows, sparser on dry hilltops.
        if (random() > 0.4 + 0.6 * damp) continue;
        const lush = (0.55 + 0.45 * valueNoise(x * 0.5 + 20, z * 0.5 + 4)) * (0.8 + 0.45 * damp);
        const height = (0.24 + random() * 0.34) * lush;
        const width = 0.05 + random() * 0.04;
        const i = placed;
        placed += 1;
        roots[i * 3] = x;
        roots[i * 3 + 1] = h - 0.015;
        roots[i * 3 + 2] = z;
        shapes[i * 4] = byte(width / 0.12);
        shapes[i * 4 + 1] = byte(height / 0.8);
        shapes[i * 4 + 2] = byte(random());
        shapes[i * 4 + 3] = byte((random() - 0.5) * 0.35 / 0.35 + 0.5);

        const dryness = Math.max(
          THREE.MathUtils.smoothstep(valueNoise(x * 0.35 + 5, z * 0.35 + 1), 0.6, 0.85),
          (1 - damp) * 0.5
        );
        const brightness = (0.6 + random() * 0.35) * (1 - damp * 0.15);
        tints[i * 4] = byte((brightness * (1 + 0.45 * dryness)) / 1.5);
        tints[i * 4 + 1] = byte((brightness * (1 + 0.05 * dryness)) / 1.5);
        tints[i * 4 + 2] = byte((brightness * (1 - 0.5 * dryness)) / 1.5);
        tints[i * 4 + 3] = 255;
      }

      const geometry = new THREE.InstancedBufferGeometry();
      geometry.index = base.index;
      for (const name of ["position", "color", "normal"]) geometry.setAttribute(name, base.getAttribute(name));
      geometry.setAttribute("aRoot", new THREE.InstancedBufferAttribute(roots, 3).setUsage(THREE.StaticDrawUsage));
      geometry.setAttribute("aShape", new THREE.InstancedBufferAttribute(shapes, 4, true).setUsage(THREE.StaticDrawUsage));
      geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 4, true).setUsage(THREE.StaticDrawUsage));
      geometry.instanceCount = perChunk;
      const centre = new THREE.Vector3(x0 + chunkSize / 2, 0.6, z0 + chunkSize / 2);
      // Tight bounds so off-screen chunks are skipped entirely.
      geometry.boundingSphere = new THREE.Sphere(centre.clone(), chunkSize * 0.71 + 1.8);

      // Same per-blade data, simpler blade shape, for distant chunks.
      const lite = new THREE.InstancedBufferGeometry();
      lite.index = liteBase.index;
      for (const name of ["position", "color", "normal"]) lite.setAttribute(name, liteBase.getAttribute(name));
      for (const name of ["aRoot", "aShape", "aTint"]) lite.setAttribute(name, geometry.getAttribute(name));
      lite.boundingSphere = geometry.boundingSphere;

      const mesh = new THREE.Mesh(geometry, material);
      // Grass takes its shadow from the analytic box shadow above, not from the shadow map (saves a lot of pixel work).
      mesh.receiveShadow = false;
      mesh.castShadow = false;
      const chunk: Chunk = { roots, shapes, minX: x0, maxX: x0 + chunkSize, minZ: z0, maxZ: z0 + chunkSize, mesh, geometry, lite, centre, lod: 1 };
      mesh.onBeforeRender = () => {
        uniforms.uLod.value = chunk.lod;
      };
      group.add(mesh);
      chunks.push(chunk);
      onProgress?.(chunks.length, CHUNKS * CHUNKS);
      // Yield so the page stays responsive and the loading text can update.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
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
    rebuildRegion(rect, heightAt, deltaAt): void {
      for (const chunk of chunks) {
        if (chunk.maxX < rect.x0 || chunk.minX > rect.x1 || chunk.maxZ < rect.z0 || chunk.minZ > rect.z1) continue;
        const { roots, shapes } = chunk;
        let changed = false;
        for (let i = 0; i < perChunk; i += 1) {
          const x = roots[i * 3]!;
          const z = roots[i * 3 + 2]!;
          if (x < rect.x0 || x > rect.x1 || z < rect.z0 || z > rect.z1) continue;
          roots[i * 3 + 1] = heightAt(x, z) - 0.015;
          // Blades whose ground was dug away or buried are gone for good.
          if (Math.abs(deltaAt(x, z)) > 0.05) {
            shapes[i * 4] = 0;
            shapes[i * 4 + 1] = 0;
          }
          changed = true;
        }
        if (changed) {
          chunk.geometry.getAttribute("aRoot").needsUpdate = true;
          chunk.geometry.getAttribute("aShape").needsUpdate = true;
        }
      }
    },
    update(time: number, interactors: Interactor[], sunDirView: THREE.Vector3, cameraPosition: THREE.Vector3): void {
      uniforms.uTime.value = time;
      uniforms.uSunView.value.copy(sunDirView);
      const count = Math.min(interactors.length, MAX_INTERACTORS);
      uniforms.uBoxCount.value = count;
      for (let i = 0; i < count; i += 1) {
        const { object, push } = interactors[i]!;
        object.updateMatrixWorld(true);
        uniforms.uBoxM.value[i]!.copy(object.matrixWorld);
        uniforms.uBoxInv.value[i]!.copy(object.matrixWorld).invert();
        uniforms.uBoxCentre.value[i]!.setFromMatrixPosition(object.matrixWorld);
        uniforms.uBoxPush.value[i] = push;
      }
      // Thin out distant chunks: far blades are sub-pixel, so keep full density only close to the camera.
      drawn = 0;
      for (const chunk of chunks) {
        const distance = chunk.centre.distanceTo(cameraPosition);
        const frac = THREE.MathUtils.clamp(1 - (distance - 18) / 60, 0.3, 1);
        const density = quality * frac;
        const n = Math.floor(perChunk * density);
        const useLite = distance > LITE_DISTANCE;
        const active = useLite ? chunk.lite : chunk.geometry;
        if (chunk.mesh.geometry !== active) chunk.mesh.geometry = active;
        active.instanceCount = n;
        chunk.lod = THREE.MathUtils.clamp(Math.sqrt(REFERENCE_DENSITY / density), 1, 2.3) * (useLite ? 1.25 : 1);
        drawn += n;
      }
    }
  };
}
