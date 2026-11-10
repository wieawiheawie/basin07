import * as THREE from "three";

/** Day/night dreamscape around the table: gradient sky, stars, a drifting cloud sea, distant peaks and soft sun shafts. */

interface Theme {
  top: string; horizon: string; below: string; glow: string;
  fog: string; sun: string; sunIntensity: number;
  hemiSky: string; hemiGround: string; hemiIntensity: number;
  env: number; exposure: number;
  cloud: string; mountain: string; ray: string; rayOpacity: number;
}

const DAY: Theme = {
  top: "#1c3f9e", horizon: "#3cc6c4", below: "#d8e8f3", glow: "#ffe2a8",
  fog: "#b9e0e4", sun: "#fff0d6", sunIntensity: 3.4,
  hemiSky: "#bcd4ff", hemiGround: "#4a3a28", hemiIntensity: 0.3,
  env: 0.55, exposure: 0.9,
  cloud: "#ffffff", mountain: "#ffffff", ray: "#fff1c9", rayOpacity: 0.07
};

const NIGHT: Theme = {
  top: "#0e0933", horizon: "#8a3a9c", below: "#2b1a52", glow: "#b9b9ff",
  fog: "#3a2262", sun: "#8fa6ff", sunIntensity: 1.7,
  hemiSky: "#6a5cc0", hemiGround: "#1a1030", hemiIntensity: 0.8,
  env: 0.55, exposure: 1.2,
  cloud: "#5d5496", mountain: "#6a5fa0", ray: "#8fa0ff", rayOpacity: 0.04
};

export interface Atmosphere {
  update(dt: number, time: number): void;
  toggle(): void;
  isNight(): boolean;
}

interface Options {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sunDir: THREE.Vector3;
}

function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function skyMaterial(sunDir: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBelow: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uSunDir: { value: sunDir.clone().normalize() }
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vDir = w.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBelow; uniform vec3 uGlow; uniform vec3 uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 up = mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), 0.55));
        vec3 down = mix(uHorizon, uBelow, smoothstep(0.0, 0.35, -y));
        vec3 col = mix(up, down, step(y, 0.0));
        float s = max(dot(d, uSunDir), 0.0);
        col += uGlow * (pow(s, 700.0) * 2.0 + pow(s, 28.0) * 0.22);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`
  });
}

function setSkyColours(material: THREE.ShaderMaterial, a: Theme, b: Theme, k: number): void {
  const u = material.uniforms;
  (u.uTop!.value as THREE.Color).set(a.top).lerp(new THREE.Color(b.top), k);
  (u.uHorizon!.value as THREE.Color).set(a.horizon).lerp(new THREE.Color(b.horizon), k);
  (u.uBelow!.value as THREE.Color).set(a.below).lerp(new THREE.Color(b.below), k);
  (u.uGlow!.value as THREE.Color).set(a.glow).lerp(new THREE.Color(b.glow), k);
}

function cloudSea(): THREE.Group {
  const group = new THREE.Group();
  const rand = random(0x51ca);
  const puffs: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let c = 0; c < 230; c += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = Math.sqrt(rand()) * 200;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const baseY = -11.5 + (rand() - 0.5) * 3;
    const n = 6 + Math.floor(rand() * 6);
    for (let i = 0; i < n; i += 1) {
      const s = 3 + rand() * 4.5;
      e.set(rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(cx + (rand() - 0.5) * 12, baseY + rand() * 2.5, cz + (rand() - 0.5) * 12),
        q,
        new THREE.Vector3(s * 1.3, s * 0.62, s * 1.1)
      );
      puffs.push(m.clone());
    }
  }
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, metalness: 0, flatShading: true, emissive: "#9fb4d8", emissiveIntensity: 0.35 });
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), material, puffs.length);
  const tint = new THREE.Color();
  puffs.forEach((matrix, i) => {
    mesh.setMatrixAt(i, matrix);
    const v = 0.9 + rand() * 0.1;
    mesh.setColorAt(i, tint.setRGB(v, v, 1));
  });
  mesh.frustumCulled = false;
  group.add(mesh);
  // Solid cloud floor so nothing below the sea is ever visible between puffs.
  const floorMaterial = new THREE.MeshStandardMaterial({ color: "#a9bfdc", roughness: 1, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(430, 48), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -12.5;
  group.add(floor);
  group.userData.material = material;
  group.userData.floor = floorMaterial;
  return group;
}

function mountains(): THREE.Group {
  const group = new THREE.Group();
  const rand = random(0x70a1);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
  const lo = new THREE.Color("#3d4b7c");
  const hi = new THREE.Color("#e4ecff");
  const col = new THREE.Color();
  const count = 9;
  for (let i = 0; i < count; i += 1) {
    const height = 80 + rand() * 50;
    const radius = 30 + rand() * 25;
    const geometry = new THREE.ConeGeometry(radius, height, 6, 4);
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colours = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v += 1) {
      const x = pos.getX(v);
      const y = pos.getY(v);
      const z = pos.getZ(v);
      const t = (y + height / 2) / height;
      if (t < 0.97) {
        const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
        const j = (h - Math.floor(h) - 0.5) * radius * 0.35;
        pos.setXYZ(v, x + j, y + j * 0.4, z - j);
      }
      col.copy(lo).lerp(hi, THREE.MathUtils.smoothstep(t, 0.55, 0.9));
      colours[v * 3] = col.r;
      colours[v * 3 + 1] = col.g;
      colours[v * 3 + 2] = col.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    const angle = (i / count) * Math.PI * 2 + rand() * 0.5;
    const dist = 170 + rand() * 70;
    const tipY = -2 + rand() * 16;
    mesh.position.set(Math.cos(angle) * dist, tipY - height / 2, Math.sin(angle) * dist);
    mesh.rotation.y = rand() * Math.PI;
    group.add(mesh);
  }
  group.userData.material = material;
  return group;
}

function stars(): THREE.InstancedMesh {
  const rand = random(0x57a2);
  const material = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, fog: false, depthWrite: false, depthTest: false });
  const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), material, 260);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < 260; i += 1) {
    const theta = rand() * Math.PI * 2;
    const y = 0.08 + rand() * 0.92;
    const r = Math.sqrt(1 - y * y);
    const s = 2 + rand() * 3.5;
    e.set(0, rand() * Math.PI, 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(420), q, new THREE.Vector3(s, s * 1.7, s));
    mesh.setMatrixAt(i, m);
  }
  mesh.frustumCulled = false;
  mesh.renderOrder = -900;
  mesh.visible = false;
  return mesh;
}

function sunShafts(sunDir: THREE.Vector3): { group: THREE.Group; material: THREE.ShaderMaterial } {
  const group = new THREE.Group();
  const rand = random(0x9a75);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0.07 }, uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
      varying vec2 vUv;
      void main() {
        float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
        across *= across;
        float along = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float shimmer = 0.8 + 0.2 * sin(uTime * 0.5 + vUv.y * 5.0);
        gl_FragColor = vec4(uColor, across * along * shimmer * uOpacity);
      }`
  });
  const length = 70;
  const dir = sunDir.clone().normalize();
  const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  for (let i = 0; i < 10; i += 1) {
    const width = 2.5 + rand() * 4.5;
    const base = new THREE.Vector3((rand() * 2 - 1) * 15, 1.5, (rand() * 2 - 1) * 15);
    for (const turn of [0, Math.PI / 2]) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material);
      mesh.quaternion.copy(align).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn));
      mesh.position.copy(base).addScaledVector(dir, length / 2);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }
  return { group, material };
}

export function createAtmosphere({ renderer, scene, sun, hemi, sunDir }: Options): Atmosphere {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), skyMaterial(sunDir));
  sky.renderOrder = -1000;
  sky.frustumCulled = false;

  const clouds = cloudSea();
  const peaks = mountains();
  const starField = stars();
  const shafts = sunShafts(sunDir);
  scene.add(sky, starField, clouds, peaks, shafts.group);
  scene.fog = new THREE.FogExp2(DAY.fog, 0.0025);

  // Bake an environment map for each theme so lighting matches the sky.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const bake = (k: number): THREE.Texture => {
    const envScene = new THREE.Scene();
    const material = skyMaterial(sunDir);
    setSkyColours(material, DAY, NIGHT, k);
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), material));
    const texture = pmrem.fromScene(envScene, 0.02, 0.1, 1000).texture;
    material.dispose();
    return texture;
  };
  const envDay = bake(0);
  const envNight = bake(1);
  pmrem.dispose();
  scene.environment = envDay;

  let target = 0;
  let k = 0;
  const colour = new THREE.Color();
  const mix = (a: string, b: string, out: THREE.Color): THREE.Color => out.set(a).lerp(colour.set(b), k);
  const scratch = new THREE.Color();

  function apply(): void {
    setSkyColours(sky.material as THREE.ShaderMaterial, DAY, NIGHT, k);
    (scene.fog as THREE.FogExp2).color.set(DAY.fog).lerp(scratch.set(NIGHT.fog), k);
    sun.color.copy(mix(DAY.sun, NIGHT.sun, new THREE.Color()));
    sun.intensity = THREE.MathUtils.lerp(DAY.sunIntensity, NIGHT.sunIntensity, k);
    hemi.color.copy(mix(DAY.hemiSky, NIGHT.hemiSky, new THREE.Color()));
    hemi.groundColor.copy(mix(DAY.hemiGround, NIGHT.hemiGround, new THREE.Color()));
    hemi.intensity = THREE.MathUtils.lerp(DAY.hemiIntensity, NIGHT.hemiIntensity, k);
    scene.environment = k < 0.5 ? envDay : envNight;
    const dip = 1 - 0.5 * Math.sin(Math.PI * k); // dim briefly while the environment swaps
    scene.environmentIntensity = THREE.MathUtils.lerp(DAY.env, NIGHT.env, k) * dip;
    renderer.toneMappingExposure = THREE.MathUtils.lerp(DAY.exposure, NIGHT.exposure, k);
    const cloudMat = clouds.userData.material as THREE.MeshStandardMaterial;
    cloudMat.color.copy(mix(DAY.cloud, NIGHT.cloud, new THREE.Color()));
    (clouds.userData.floor as THREE.MeshStandardMaterial).color.set("#a9bfdc").lerp(scratch.set("#2a2360"), k);
    cloudMat.emissiveIntensity = THREE.MathUtils.lerp(0.35, 0.05, k);
    (peaks.userData.material as THREE.MeshStandardMaterial).color.copy(mix(DAY.mountain, NIGHT.mountain, new THREE.Color()));
    shafts.material.uniforms.uColor!.value.copy(mix(DAY.ray, NIGHT.ray, new THREE.Color()));
    shafts.material.uniforms.uOpacity!.value = THREE.MathUtils.lerp(DAY.rayOpacity, NIGHT.rayOpacity, k);
    (starField.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.smoothstep(k, 0.35, 1);
    starField.visible = k > 0.35;
  }
  apply();

  return {
    update(dt: number, time: number): void {
      if (k !== target) {
        k = target > k ? Math.min(target, k + dt * 0.7) : Math.max(target, k - dt * 0.7);
        apply();
      }
      clouds.rotation.y += dt * 0.003;
      starField.rotation.y += dt * 0.002;
      shafts.material.uniforms.uTime!.value = time;
    },
    toggle(): void {
      target = target === 0 ? 1 : 0;
    },
    isNight: () => target === 1
  };
}
