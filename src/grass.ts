import * as THREE from "three";
import { HALF, groundHeight, valueNoise } from "./terrain";

export interface CubeInfluence {
  x: number;
  y: number;
  z: number;
  radius: number;
  /** 0 when the crate is lifted clear of the grass, 1 when it rests on it. */
  push: number;
}

export interface Grass {
  mesh: THREE.InstancedMesh;
  max: number;
  setCount(count: number): void;
  update(time: number, cube: CubeInfluence): void;
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
    uCube: { value: new THREE.Vector4(0, 0, 0, 1) },
    uPush: { value: 0 }
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uCube = uniforms.uCube;
    shader.uniforms.uPush = uniforms.uPush;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        uniform float uTime;
        uniform vec4 uCube;
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
        vec2 away = gpos.xz - uCube.xz;
        float dist = length(away);
        float press = uPush * (1.0 - smoothstep(uCube.w * 0.75, uCube.w * 1.4, dist));
        gpos.xz += (away / max(dist, 0.001)) * press * bladeT * bladeH * 0.9;
        gpos.y -= press * bladeT * bladeH * 0.55;
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
    update(time: number, cube: CubeInfluence): void {
      uniforms.uTime.value = time;
      uniforms.uCube.value.set(cube.x, cube.y, cube.z, cube.radius);
      uniforms.uPush.value = cube.push;
    }
  };
}
