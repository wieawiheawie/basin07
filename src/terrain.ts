import * as THREE from "three";

/** Half-width of the playable ground. The mesh runs slightly past it so its edge hides under the rim. */
export const HALF = 16;
const MESH_HALF = HALF + 0.12;
const SEGMENTS = 320;

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
export function lushness(x: number, z: number): number {
  return 1 - THREE.MathUtils.smoothstep(groundHeight(x, z), 0.22, 0.75);
}

export interface Terrain {
  mesh: THREE.Mesh;
  positions: Float32Array;
  indices: Uint32Array;
}

export function createTerrain(): Terrain {
  const side = SEGMENTS + 1;
  const positions = new Float32Array(side * side * 3);
  const colours = new Float32Array(side * side * 3);
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

      const patch = valueNoise(x * 0.9 + 3, z * 0.9 + 9);
      tint.copy(soil).lerp(moss, THREE.MathUtils.smoothstep(patch, 0.3, 0.6));
      tint.lerp(dry, THREE.MathUtils.smoothstep(valueNoise(x * 0.4, z * 0.4), 0.62, 0.9) * 0.6);
      tint.multiplyScalar(0.6 + h * 0.45 - lushness(x, z) * 0.12);
      colours[i * 3] = tint.r;
      colours[i * 3 + 1] = tint.g;
      colours[i * 3 + 2] = tint.b;
    }
  }

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
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return { mesh, positions, indices };
}
