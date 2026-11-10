import * as THREE from "three";

/** Half-width of the playable ground. The mesh runs slightly past it so its edge hides under the rim. */
export const HALF = 5;
const MESH_HALF = 5.12;
const SEGMENTS = 96;

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

/** Ground surface height above the tabletop at (x, z). Always between about 0.08 and 0.46. */
export function groundHeight(x: number, z: number): number {
  const rolling = (fbm(x * 0.3 + 11, z * 0.3 + 7, 3) - 0.4375) * 0.5;
  const detail = (valueNoise(x * 2.1, z * 2.1) - 0.5) * 0.06;
  return 0.27 + rolling * 1.1 + detail;
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
  const moss = new THREE.Color("#3f6a2b");
  const dry = new THREE.Color("#6b6a3a");
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
      tint.multiplyScalar(0.75 + h * 0.6);
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
