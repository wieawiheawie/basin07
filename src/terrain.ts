import * as THREE from "three";

/** Half-width of the playable ground. The mesh runs slightly past it so its edge hides under the rim. */
export const HALF = 16;
const MESH_HALF = HALF + 0.12;
const SEGMENTS = 200;

function hash(ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sz;
}

function fbm(x: number, z: number, octaves: number): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * frequency, z * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum;
}

/** Ground surface height above the tabletop at (x, z): broad hills, small rolls and deeper hollows. Between about 0.1 and 1.2. */
export function groundHeight(x: number, z: number): number {
  const hills = (fbm(x * 0.075 + 11, z * 0.075 + 7, 4) - 0.47) * 2.6;
  const rolling = (fbm(x * 0.28 + 3, z * 0.28 + 19, 3) - 0.44) * 0.5;
  const detail = (valueNoise(x * 2.1, z * 2.1) - 0.5) * 0.05;
  const raw = 0.42 + hills + rolling + detail;
  // Soft floor so hollows flatten out instead of hitting the tabletop.
  const h = raw < 0.3 ? 0.1 + 0.2 * THREE.MathUtils.smoothstep(raw, -0.5, 0.3) : raw;
  return Math.min(h, 1.2);
}

/** 0 on dry high ground, 1 in damp hollows. Drives grass density, height and colour. */
export function lushnessFromHeight(h: number): number {
  return 1 - THREE.MathUtils.smoothstep(h, 0.22, 0.75);
}

export function lushness(x: number, z: number): number {
  return lushnessFromHeight(groundHeight(x, z));
}

export type BrushKind = "dig" | "fill";

export interface Rect { x0: number; x1: number; z0: number; z1: number }

/** Lowest the ground can be dug: just above the wooden tabletop. */
export const BEDROCK = 0.03;
/** Highest the ground can be built up: just under the rim top. */
export const CEILING = 1.45;

export interface Terrain {
  mesh: THREE.Mesh;
  positions: Float32Array;
  indices: Uint32Array;
  /** Physics heightfield: heights[ix * (segments + 1) + iz], spanning -extent/2..extent/2 on x and z. Edited in place by `brush`. */
  heightfield: { segments: number; extent: number; heights: Float32Array };
  /** Current ground height at (x, z), matching the rendered and physical surface. */
  sample(x: number, z: number): number;
  /** Current height minus the original generated height at (x, z): negative where dug, positive where built up. */
  delta(x: number, z: number): number;
  /** Dig or fill with a round brush. Returns the world-space area that changed. */
  brush(kind: BrushKind, x: number, z: number, radius: number, amount: number): Rect;
  /** First point where a ray meets the ground, or null. */
  raycast(ray: THREE.Ray, maxDistance?: number): THREE.Vector3 | null;
}

export function createTerrain(): Terrain {
  const side = SEGMENTS + 1;
  const cell = (MESH_HALF * 2) / SEGMENTS;
  const positions = new Float32Array(side * side * 3);
  const colours = new Float32Array(side * side * 3);
  const heights = new Float32Array(side * side);
  const soil = new THREE.Color("#4a3a26");
  const moss = new THREE.Color("#34562a");
  const dry = new THREE.Color("#5c5a34");
  const tint = new THREE.Color();

  for (let iz = 0; iz < side; iz += 1) {
    for (let ix = 0; ix < side; ix += 1) {
      const x = -MESH_HALF + (ix / SEGMENTS) * MESH_HALF * 2;
      const z = -MESH_HALF + (iz / SEGMENTS) * MESH_HALF * 2;
      const h = groundHeight(x, z);
      const i = iz * side + ix;
      positions[i * 3] = x;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = z;
      heights[ix * side + iz] = h;

      const patch = valueNoise(x * 0.9 + 3, z * 0.9 + 9);
      tint.copy(soil).lerp(moss, THREE.MathUtils.smoothstep(patch, 0.3, 0.6));
      tint.lerp(dry, THREE.MathUtils.smoothstep(valueNoise(x * 0.4, z * 0.4), 0.62, 0.9) * 0.6);
      tint.multiplyScalar(0.6 + h * 0.45 - lushness(x, z) * 0.12);
      colours[i * 3] = tint.r;
      colours[i * 3 + 1] = tint.g;
      colours[i * 3 + 2] = tint.b;
    }
  }
  const base = heights.slice();
  const baseColours = colours.slice();

  const indices = new Uint32Array(SEGMENTS * SEGMENTS * 6);
  let n = 0;
  for (let iz = 0; iz < SEGMENTS; iz += 1) {
    for (let ix = 0; ix < SEGMENTS; ix += 1) {
      const a = iz * side + ix;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices[n++] = a; indices[n++] = c; indices[n++] = b;
      indices[n++] = b; indices[n++] = c; indices[n++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const colourAttribute = new THREE.BufferAttribute(colours, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  colourAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", colourAttribute);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), MESH_HALF * 1.5);

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;

  /** Triangle-accurate height from a grid array, matching how the mesh is triangulated. */
  function interpolate(grid: Float32Array, x: number, z: number): number {
    const fx = THREE.MathUtils.clamp((x + MESH_HALF) / cell, 0, SEGMENTS - 1e-6);
    const fz = THREE.MathUtils.clamp((z + MESH_HALF) / cell, 0, SEGMENTS - 1e-6);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const u = fx - ix;
    const v = fz - iz;
    const a = grid[ix * side + iz]!;
    const b = grid[(ix + 1) * side + iz]!;
    const c = grid[ix * side + iz + 1]!;
    const d = grid[(ix + 1) * side + iz + 1]!;
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (b - d) * (1 - v) + (c - d) * (1 - u);
  }

  const dug = new THREE.Color("#3a2a1a");
  const mixed = new THREE.Color();

  function brush(kind: BrushKind, x: number, z: number, radius: number, amount: number): Rect {
    const reach = radius * 1.7;
    const ix0 = Math.max(0, Math.floor((x - reach + MESH_HALF) / cell));
    const ix1 = Math.min(SEGMENTS, Math.ceil((x + reach + MESH_HALF) / cell));
    const iz0 = Math.max(0, Math.floor((z - reach + MESH_HALF) / cell));
    const iz1 = Math.min(SEGMENTS, Math.ceil((z + reach + MESH_HALF) / cell));
    for (let iz = iz0; iz <= iz1; iz += 1) {
      for (let ix = ix0; ix <= ix1; ix += 1) {
        const wx = -MESH_HALF + ix * cell;
        const wz = -MESH_HALF + iz * cell;
        const d = Math.hypot(wx - x, wz - z) / radius;
        if (d >= 1.7) continue;
        const core = d < 1 ? 0.5 * (1 + Math.cos(Math.PI * d)) : 0;
        let change = 0;
        if (kind === "dig") {
          // Digging also throws a little soil up around the edge of the hole.
          const spoil = d >= 1 ? Math.sin((Math.PI * (d - 1)) / 0.7) ** 2 : 0;
          change = -amount * core + amount * 0.22 * spoil;
        } else {
          change = amount * core;
        }
        if (change === 0) continue;
        const hi = ix * side + iz;
        const h = THREE.MathUtils.clamp(heights[hi]! + change, BEDROCK, CEILING);
        heights[hi] = h;
        const i = iz * side + ix;
        positions[i * 3 + 1] = h;
        // Disturbed ground turns to soil, darker the deeper it is dug.
        const edited = THREE.MathUtils.clamp(Math.abs(h - base[hi]!) / 0.05, 0, 1);
        const shade = 1 - THREE.MathUtils.clamp((base[hi]! - h) * 0.35, 0, 0.35);
        mixed.setRGB(baseColours[i * 3]!, baseColours[i * 3 + 1]!, baseColours[i * 3 + 2]!).lerp(dug, edited).multiplyScalar(shade);
        colours[i * 3] = mixed.r;
        colours[i * 3 + 1] = mixed.g;
        colours[i * 3 + 2] = mixed.b;
      }
    }
    positionAttribute.needsUpdate = true;
    colourAttribute.needsUpdate = true;
    return { x0: x - reach, x1: x + reach, z0: z - reach, z1: z + reach };
  }

  const hit = new THREE.Vector3();
  const box = new THREE.Box3(new THREE.Vector3(-HALF, 0, -HALF), new THREE.Vector3(HALF, 2.4, HALF));
  const entry = new THREE.Vector3();

  function raycast(ray: THREE.Ray, maxDistance = 400): THREE.Vector3 | null {
    if (!ray.intersectBox(box, entry)) return null;
    const startT = Math.max(0, entry.distanceTo(ray.origin) - 0.01);
    const step = cell * 0.9;
    let previous = startT;
    for (let t = startT; t < Math.min(maxDistance, startT + 120); t += step) {
      ray.at(t, hit);
      if (hit.y <= interpolate(heights, hit.x, hit.z)) {
        // Refine between the last point above ground and this one below it.
        let lo = previous;
        let hi = t;
        for (let k = 0; k < 14; k += 1) {
          const mid = (lo + hi) / 2;
          ray.at(mid, hit);
          if (hit.y <= interpolate(heights, hit.x, hit.z)) hi = mid;
          else lo = mid;
        }
        ray.at(hi, hit);
        hit.y = interpolate(heights, hit.x, hit.z);
        return hit.clone();
      }
      previous = t;
    }
    return null;
  }

  return {
    mesh,
    positions,
    indices,
    heightfield: { segments: SEGMENTS, extent: MESH_HALF * 2, heights },
    sample: (x, z) => interpolate(heights, x, z),
    delta: (x, z) => interpolate(heights, x, z) - interpolate(base, x, z),
    brush,
    raycast
  };
}
