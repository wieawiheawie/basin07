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
  /** Copy of the current heights, for undo. */
  snapshot(): Float32Array;
  /** Put heights back from a snapshot. Returns the area that changed (all of it). */
  restore(heights: Float32Array): Rect;
  /** Back to the original generated ground. */
  reset(): Rect;
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
  const normals = new Float32Array(side * side * 3);
  const normalAttribute = new THREE.BufferAttribute(normals, 3);
  normalAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("normal", normalAttribute);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), MESH_HALF * 1.5);

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
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

  /** Smooth normals from height differences, so edited ground shades softly instead of in facets. */
  function updateNormals(ix0: number, ix1: number, iz0: number, iz1: number): void {
    for (let iz = Math.max(0, iz0); iz <= Math.min(SEGMENTS, iz1); iz += 1) {
      for (let ix = Math.max(0, ix0); ix <= Math.min(SEGMENTS, ix1); ix += 1) {
        const xm = Math.max(ix - 1, 0);
        const xp = Math.min(ix + 1, SEGMENTS);
        const zm = Math.max(iz - 1, 0);
        const zp = Math.min(iz + 1, SEGMENTS);
        const nx = -(heights[xp * side + iz]! - heights[xm * side + iz]!) / ((xp - xm) * cell);
        const nz = -(heights[ix * side + zp]! - heights[ix * side + zm]!) / ((zp - zm) * cell);
        const inv = 1 / Math.hypot(nx, 1, nz);
        const i = (iz * side + ix) * 3;
        normals[i] = nx * inv;
        normals[i + 1] = inv;
        normals[i + 2] = nz * inv;
      }
    }
    normalAttribute.needsUpdate = true;
  }
  updateNormals(0, SEGMENTS, 0, SEGMENTS);

  // Soil layers, from the surface down: loam, subsoil, clay, stone. Pit walls show them as bands.
  const loam = new THREE.Color("#3d2c1c");
  const subsoil = new THREE.Color("#7a5230");
  const clay = new THREE.Color("#8c7458");
  const stone = new THREE.Color("#6d6c68");
  const filledColour = new THREE.Color("#6f5535");
  const mixed = new THREE.Color();
  const sstep = THREE.MathUtils.smoothstep;

  function paint(ix: number, iz: number): void {
    const hi = ix * side + iz;
    const i = iz * side + ix;
    const d = heights[hi]! - base[hi]!;
    mixed.setRGB(baseColours[i * 3]!, baseColours[i * 3 + 1]!, baseColours[i * 3 + 2]!);
    const a = Math.abs(d);
    if (a > 0.004) {
      const w = sstep(a, 0.004, 0.1);
      if (d < 0) {
        const depth = -d;
        mixed.lerp(loam, w);
        mixed.lerp(subsoil, sstep(depth, 0.12, 0.22));
        mixed.lerp(clay, sstep(depth, 0.34, 0.44));
        mixed.lerp(stone, sstep(depth, 0.62, 0.72));
        mixed.multiplyScalar(1 + Math.sin(depth * 70) * 0.05 * sstep(depth, 0.1, 0.2));
      } else mixed.lerp(filledColour, w);
      mixed.multiplyScalar(1 + (valueNoise(ix * 1.7, iz * 1.7) - 0.5) * 0.3 * w);
    }
    colours[i * 3] = mixed.r;
    colours[i * 3 + 1] = mixed.g;
    colours[i * 3 + 2] = mixed.b;
  }

  const MAX_SLOPE = 1.15; // steepest the loose soil will stand, as rise over run

  /** Let over-steep soil slump downhill (volume is kept), so pit walls and heaps settle naturally. */
  function relax(ix0: number, ix1: number, iz0: number, iz1: number): void {
    const limit = cell * MAX_SLOPE;
    for (let pass = 0; pass < 4; pass += 1) {
      for (let iz = iz0; iz <= iz1; iz += 1) {
        for (let ix = ix0; ix <= ix1; ix += 1) {
          const a = ix * side + iz;
          for (const b of [ix < SEGMENTS ? a + side : -1, iz < SEGMENTS ? a + 1 : -1]) {
            if (b < 0) continue;
            const diff = heights[a]! - heights[b]!;
            const excess = Math.abs(diff) - limit;
            if (excess <= 0) continue;
            const move = excess * 0.25 * Math.sign(diff);
            heights[a] = THREE.MathUtils.clamp(heights[a]! - move, BEDROCK, CEILING);
            heights[b] = THREE.MathUtils.clamp(heights[b]! + move, BEDROCK, CEILING);
          }
        }
      }
    }
  }

  function sync(ix0: number, ix1: number, iz0: number, iz1: number): void {
    for (let iz = iz0; iz <= iz1; iz += 1) {
      for (let ix = ix0; ix <= ix1; ix += 1) positions[(iz * side + ix) * 3 + 1] = heights[ix * side + iz]!;
    }
    updateNormals(ix0 - 1, ix1 + 1, iz0 - 1, iz1 + 1);
    for (let iz = iz0; iz <= iz1; iz += 1) for (let ix = ix0; ix <= ix1; ix += 1) paint(ix, iz);
    positionAttribute.needsUpdate = true;
    colourAttribute.needsUpdate = true;
  }

  function brush(kind: BrushKind, x: number, z: number, radius: number, amount: number): Rect {
    const reach = radius * 1.8;
    const ix0 = Math.max(0, Math.floor((x - reach + MESH_HALF) / cell));
    const ix1 = Math.min(SEGMENTS, Math.ceil((x + reach + MESH_HALF) / cell));
    const iz0 = Math.max(0, Math.floor((z - reach + MESH_HALF) / cell));
    const iz1 = Math.min(SEGMENTS, Math.ceil((z + reach + MESH_HALF) / cell));
    let removed = 0;
    let bermWeight = 0;
    for (let iz = iz0; iz <= iz1; iz += 1) {
      for (let ix = ix0; ix <= ix1; ix += 1) {
        const d = Math.hypot(-MESH_HALF + ix * cell - x, -MESH_HALF + iz * cell - z) / radius;
        if (d >= 1.8) continue;
        const hi = ix * side + iz;
        const pit = 1 - sstep(d, 0.4, 1);
        if (kind === "fill") {
          heights[hi] = THREE.MathUtils.clamp(heights[hi]! + amount * pit, BEDROCK, CEILING);
        } else if (pit > 0) {
          // The deeper the pit, the harder the ground: digging slows right down.
          const hardness = 1 - 0.7 * sstep(base[hi]! - heights[hi]!, 0.25, 1.1);
          const next = Math.max(BEDROCK, heights[hi]! - amount * pit * hardness);
          removed += heights[hi]! - next;
          heights[hi] = next;
        } else bermWeight += Math.exp(-(((d - 1.2) / 0.25) ** 2));
      }
    }
    if (kind === "dig" && removed > 0 && bermWeight > 0) {
      // Most of the soil you remove is heaped around the edge of the hole.
      const share = (removed * 0.7) / bermWeight;
      for (let iz = iz0; iz <= iz1; iz += 1) {
        for (let ix = ix0; ix <= ix1; ix += 1) {
          const d = Math.hypot(-MESH_HALF + ix * cell - x, -MESH_HALF + iz * cell - z) / radius;
          if (d < 1 || d >= 1.8) continue;
          const hi = ix * side + iz;
          heights[hi] = Math.min(CEILING, heights[hi]! + share * Math.exp(-(((d - 1.2) / 0.25) ** 2)));
        }
      }
    }
    const pad = 3;
    const r = { ix0: Math.max(0, ix0 - pad), ix1: Math.min(SEGMENTS, ix1 + pad), iz0: Math.max(0, iz0 - pad), iz1: Math.min(SEGMENTS, iz1 + pad) };
    relax(r.ix0, r.ix1, r.iz0, r.iz1);
    sync(r.ix0, r.ix1, r.iz0, r.iz1);
    return { x0: -MESH_HALF + r.ix0 * cell, x1: -MESH_HALF + r.ix1 * cell, z0: -MESH_HALF + r.iz0 * cell, z1: -MESH_HALF + r.iz1 * cell };
  }

  const everything: Rect = { x0: -MESH_HALF, x1: MESH_HALF, z0: -MESH_HALF, z1: MESH_HALF };
  function restore(source: Float32Array): Rect {
    heights.set(source);
    sync(0, SEGMENTS, 0, SEGMENTS);
    return everything;
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
    snapshot: () => heights.slice(),
    restore,
    reset: () => restore(base),
    raycast
  };
}
