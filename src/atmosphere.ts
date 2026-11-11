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
  cloud: "#ffffff", mountain: "#ffffff", ray: "#fff1c9", rayOpacity: 0.12
};

const NIGHT: Theme = {
  top: "#0e0933", horizon: "#8a3a9c", below: "#2b1a52", glow: "#b9b9ff",
  fog: "#3a2262", sun: "#8fa6ff", sunIntensity: 1.7,
  hemiSky: "#6a5cc0", hemiGround: "#1a1030", hemiIntensity: 0.8,
  env: 0.55, exposure: 1.2,
  cloud: "#756bb0", mountain: "#6a5fa0", ray: "#8fa0ff", rayOpacity: 0.06
};

export interface Atmosphere {
  update(dt: number, time: number): void;
  toggle(): void;
  setShafts(visible: boolean): void;
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

interface CloudLayer { group: THREE.Group; speed: number; phase: number }

/** Cumulus-style clumps: a wide flat base with a billowing mound of domes on top. Three layers drift at different speeds for parallax. */
function cloudSea(): THREE.Group {
  const root = new THREE.Group();
  const rand = random(0x51ca);
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff", roughness: 1, metalness: 0, flatShading: true, emissive: "#9fb4d8", emissiveIntensity: 0.3
  });
  const layers: CloudLayer[] = [];
  const specs = [
    { rMin: 0, rMax: 75, clumps: 85, detail: 1, size: [4.5, 8], speed: 0.004 },
    { rMin: 60, rMax: 160, clumps: 110, detail: 0, size: [6, 11], speed: 0.0026 },
    { rMin: 150, rMax: 300, clumps: 90, detail: 0, size: [10, 20], speed: 0.0014 }
  ];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const tint = new THREE.Color();
  const white = new THREE.Color("#ffffff");
  const shade = new THREE.Color("#a9bddd");

  specs.forEach((spec, layerIndex) => {
    const entries: { matrix: THREE.Matrix4; colour: THREE.Color }[] = [];
    const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, height01: number): void => {
      e.set(rand() * 0.5, rand() * Math.PI * 2, rand() * 0.5);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
      const colour = tint.clone().copy(shade).lerp(white, THREE.MathUtils.clamp(0.25 + height01 * 0.9 + (rand() - 0.5) * 0.15, 0, 1));
      entries.push({ matrix: m.clone(), colour });
    };
    for (let c = 0; c < spec.clumps; c += 1) {
      const angle = rand() * Math.PI * 2;
      const radius = spec.rMin + Math.sqrt(rand()) * (spec.rMax - spec.rMin);
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;
      const s = spec.size[0]! + rand() * (spec.size[1]! - spec.size[0]!);
      const baseY = -11.2 + (rand() - 0.5) * 2.2 + layerIndex * 0.6;
      add(cx, baseY, cz, s * 1.9, s * 0.3, s * 1.5, 0);
      const domes = 4 + Math.floor(rand() * 4);
      for (let d = 0; d < domes; d += 1) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * s * 0.95;
        const mound = 1 - r / (s * 0.95 + 0.001);
        const ds = s * (0.38 + 0.4 * mound + rand() * 0.18);
        const y = baseY + s * (0.1 + 0.55 * mound);
        add(cx + Math.cos(a) * r * 1.2, y, cz + Math.sin(a) * r, ds * 1.1, ds * 0.85, ds, 0.3 + mound * 0.7);
      }
    }
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, spec.detail), material, entries.length);
    entries.forEach((entry, i) => {
      mesh.setMatrixAt(i, entry.matrix);
      mesh.setColorAt(i, entry.colour);
    });
    mesh.frustumCulled = false;
    const group = new THREE.Group();
    group.add(mesh);
    root.add(group);
    layers.push({ group, speed: spec.speed, phase: rand() * 6 });
  });

  // Solid cloud floor so nothing below the sea is ever visible between puffs.
  const floorMaterial = new THREE.MeshStandardMaterial({ color: "#a9bfdc", roughness: 1, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(430, 48), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -12.8;
  root.add(floor);
  root.userData.material = material;
  root.userData.floor = floorMaterial;
  root.userData.layers = layers;
  return root;
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
    const tipY = 6 + rand() * 24;
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

/** Soft streaky light shafts. They fade near the camera and the ground, and breathe slowly. */
function sunShafts(sunDir: THREE.Vector3): { group: THREE.Group; material: THREE.ShaderMaterial } {
  const group = new THREE.Group();
  const rand = random(0x9a75);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0.1 }, uTime: { value: 0 } },
    vertexShader: `
      attribute float aSeed;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vSeed;
      void main() {
        vUv = uv;
        vSeed = aSeed;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
      varying vec2 vUv; varying vec3 vWorld; varying float vSeed;
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      float noise(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }
      void main() {
        float edge = 1.0 - abs(vUv.x * 2.0 - 1.0);
        float across = smoothstep(0.0, 0.85, edge);
        float streak = 0.45 + 0.55 * noise(vUv.x * 14.0 + vSeed * 17.0 + uTime * 0.05);
        float along = smoothstep(0.0, 0.2, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
        float breathe = 0.65 + 0.35 * sin(uTime * 0.35 + vSeed * 6.2831);
        float camFade = smoothstep(5.0, 30.0, distance(vWorld, cameraPosition));
        gl_FragColor = vec4(uColor, across * streak * along * breathe * camFade * uOpacity);
      }`
  });
  const length = 75;
  const count = 10;
  const dir = sunDir.clone().normalize();
  const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const geometry = new THREE.PlaneGeometry(1, length);
  const seeds = new Float32Array(count * 2);
  const mesh = new THREE.InstancedMesh(geometry, material, count * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i += 1) {
    const width = 2 + rand() * 6;
    const base = new THREE.Vector3((rand() * 2 - 1) * 16, 0.8, (rand() * 2 - 1) * 16);
    const centre = base.clone().addScaledVector(dir, length / 2);
    const seed = rand();
    [0, Math.PI / 2].forEach((turn, k) => {
      q.copy(align).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn));
      m.compose(centre, q, new THREE.Vector3(width, 1, 1));
      mesh.setMatrixAt(i * 2 + k, m);
      seeds[i * 2 + k] = seed;
    });
  }
  geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  mesh.frustumCulled = false;
  group.add(mesh);
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
      for (const layer of clouds.userData.layers as CloudLayer[]) {
        layer.group.rotation.y += dt * layer.speed;
        layer.group.position.y = Math.sin(time * 0.12 + layer.phase) * 0.35;
      }
      starField.rotation.y += dt * 0.002;
      shafts.material.uniforms.uTime!.value = time;
    },
    toggle(): void {
      target = target === 0 ? 1 : 0;
    },
    setShafts(visible: boolean): void {
      shafts.group.visible = visible;
    },
    isNight: () => target === 1
  };
}
