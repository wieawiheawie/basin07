import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { Simulation } from "../pkg/deskbound_sim.js";

type HoverCallback = (name: string) => void;

interface SceneApi {
  sync(): void;
  render(time: number): void;
}

interface ObjectVisual {
  root: THREE.Group;
  cap: THREE.Mesh;
  looseCap: THREE.Group;
  fill: THREE.Mesh;
  kind: string;
}

const GRID = 128;
const DESK_SIZE = 10;
const vertexCount = GRID * GRID;
const RESIDENT_HEIGHT = 0.40;
const PACK_SCALE = RESIDENT_HEIGHT / 5;
const TABLE_TOP_HEIGHT = 3 * PACK_SCALE;
const PLATFORM_THICKNESS = 0.76 * PACK_SCALE;
const TAVERN_SURFACE_Y = 0.431 + PLATFORM_THICKNESS;
const TAVERN_TABLE_Y = TAVERN_SURFACE_Y + TABLE_TOP_HEIGHT;
const TAVERN_MODELS = [
  "round_table", "stool", "tankard", "mug", "bread_basket", "cheese_wheel",
  "barrel", "crate", "sack", "candle", "lantern", "plank_floor"
] as const;

function woodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas textures are unavailable.");
  context.fillStyle = "#aa7950";
  context.fillRect(0, 0, 768, 768);
  for (let row = 0; row < 9; row += 1) {
    const y = row * 86;
    const shade = 91 + (row * 17) % 39;
    context.fillStyle = "rgb(" + (shade + 91) + "," + (shade + 42) + "," + shade + ")";
    context.fillRect(0, y, 768, 84);
    context.strokeStyle = "rgba(66,37,22,.23)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, y + 2);
    context.lineTo(768, y + 2);
    context.stroke();
    for (let grain = 0; grain < 40; grain += 1) {
      const x = (grain * 197 + row * 83) % 768;
      const length = 20 + (grain * 31) % 160;
      const wave = (grain * 23 + row * 11) % 48;
      context.strokeStyle = grain % 4 === 0 ? "rgba(62,34,19,.13)" : "rgba(255,218,163,.07)";
      context.lineWidth = grain % 5 === 0 ? 2 : 1;
      context.beginPath();
      context.moveTo(x, y + 12 + wave);
      context.bezierCurveTo(x + length * .22, y + 8 + wave, x + length * .7, y + 18 + wave, x + length, y + 11 + wave);
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = 4;
  return texture;
}

function floorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas textures are unavailable.");
  context.fillStyle = "#6b5948";
  context.fillRect(0, 0, 256, 256);
  for (let z = 0; z < 8; z += 1) {
    for (let x = 0; x < 4; x += 1) {
      const tone = (z * 5 + x * 3) % 4;
      context.fillStyle = ["#74614e", "#806b55", "#695845", "#78634f"][tone] ?? "#74614e";
      context.fillRect(x * 64 + (z % 2) * 32, z * 32, 64, 32);
    }
  }
  context.strokeStyle = "rgba(39,27,21,.38)";
  context.lineWidth = 2;
  for (let i = 0; i <= 8; i += 1) {
    context.beginPath();
    context.moveTo(0, i * 32);
    context.lineTo(256, i * 32);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 5);
  texture.anisotropy = 4;
  return texture;
}

function makeBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  radiusSegments = 1
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2], radiusSegments, 1, radiusSegments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createDeskScene(
  simulation: Simulation,
  memory: WebAssembly.Memory,
  container: HTMLElement,
  onHover: HoverCallback
): SceneApi {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#28231e");
  scene.fog = new THREE.Fog("#28231e", 21, 39);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 90);
  const target = new THREE.Vector3(0, 0.08, 0);
  let cameraDistance = 17.8;
  let cameraAzimuth = -0.22;
  let cameraElevation = 1.08;

  function updateCamera(): void {
    const horizontal = Math.cos(cameraElevation) * cameraDistance;
    camera.position.set(
      target.x + Math.sin(cameraAzimuth) * horizontal,
      target.y + Math.sin(cameraElevation) * cameraDistance,
      target.z + Math.cos(cameraAzimuth) * horizontal
    );
    camera.lookAt(target);
  }
  updateCamera();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "desk-canvas";
  renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
  container.prepend(renderer.domElement);

  scene.add(new THREE.HemisphereLight("#f9e5c7", "#4a463e", 1.7));
  const keyLight = new THREE.DirectionalLight("#ffe5c1", 2.1);
  keyLight.position.set(-7, 13, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1536, 1536);
  keyLight.shadow.camera.left = -12;
  keyLight.shadow.camera.right = 12;
  keyLight.shadow.camera.top = 12;
  keyLight.shadow.camera.bottom = -12;
  keyLight.shadow.bias = -0.00025;
  keyLight.shadow.normalBias = 0.025;
  scene.add(keyLight);

  const warmFill = new THREE.PointLight("#f0a75e", 7.5, 8, 2);
  warmFill.position.set(-3.35, 2.55, -3.25);
  scene.add(warmFill);

  const wood = woodTexture();
  const floorMap = floorTexture();
  const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.76, color: "#e0bd91" });
  const edgeWood = new THREE.MeshStandardMaterial({ color: "#71492f", roughness: 0.72 });
  const wallMat = new THREE.MeshStandardMaterial({ color: "#d2bda0", roughness: 0.94 });
  const trimMat = new THREE.MeshStandardMaterial({ color: "#9b795b", roughness: 0.82 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.96 });
  const darkMat = new THREE.MeshStandardMaterial({ color: "#39342d", roughness: 0.9 });
  const brassMat = new THREE.MeshStandardMaterial({ color: "#b38a4f", metalness: 0.66, roughness: 0.33 });
  const ceramicMat = new THREE.MeshStandardMaterial({ color: "#d8cfb8", roughness: 0.54 });
  const greenMat = new THREE.MeshStandardMaterial({ color: "#81936e", roughness: 0.76 });
  const soilMat = new THREE.MeshStandardMaterial({ color: "#49382b", roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: "#8ba66f", roughness: 0.82 });
  const bookMaterials = [
    new THREE.MeshStandardMaterial({ color: "#8b6656", roughness: 0.93 }),
    new THREE.MeshStandardMaterial({ color: "#73816b", roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: "#b48b5a", roughness: 0.9 })
  ];
  const pencilMaterials = [
    new THREE.MeshStandardMaterial({ color: "#d0a15f", roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ color: "#c06f50", roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ color: "#85947b", roughness: 0.72 })
  ];

  const tavernWood = new THREE.MeshStandardMaterial({ color: "#a9794e", roughness: 0.84 });
  const tavernWoodLight = new THREE.MeshStandardMaterial({ color: "#c29562", roughness: 0.82 });
  const tavernIron = new THREE.MeshStandardMaterial({ color: "#776657", metalness: 0.35, roughness: 0.62 });
  const tavernCloth = new THREE.MeshStandardMaterial({ color: "#9d8065", roughness: 0.95 });
  const tavernCeramic = new THREE.MeshStandardMaterial({ color: "#cbb99b", roughness: 0.55 });
  const tavernCheese = new THREE.MeshStandardMaterial({ color: "#dfbd68", roughness: 0.76 });
  const tavernFlame = new THREE.MeshStandardMaterial({
    color: "#ffbf6a", emissive: "#ff9b35", emissiveIntensity: 2.4, roughness: 0.35
  });

  function makeTavernFallback(kind: string): THREE.Group {
    const group = new THREE.Group();
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number,number,number]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    if (kind === "round_table") {
      add(new THREE.CylinderGeometry(1.97, 1.97, 0.18, 20), tavernWoodLight, [0, 2.61, 0]).castShadow = true;
      add(new THREE.CylinderGeometry(0.20, 0.26, 2.55, 8), tavernWood, [0, 1.27, 0]);
      add(new THREE.CylinderGeometry(0.72, 0.72, 0.16, 10), tavernWood, [0, 0.12, 0]);
    } else if (kind === "stool") {
      add(new THREE.CylinderGeometry(0.72, 0.72, 0.16, 12), tavernWoodLight, [0, 1.8, 0]).castShadow = true;
      for (const x of [-0.48, 0.48]) for (const z of [-0.48, 0.48]) {
        add(new THREE.CylinderGeometry(0.085, 0.10, 1.76, 6), tavernWood, [x, 0.88, z]);
      }
    } else if (kind === "tankard" || kind === "mug") {
      const radius = kind === "tankard" ? 0.30 : 0.34;
      const height = kind === "tankard" ? 0.55 : 0.50;
      add(new THREE.CylinderGeometry(radius * 0.94, radius, height, 10, 1, true), tavernCeramic, [0,height/2,0]);
      add(new THREE.TorusGeometry(radius, 0.055, 6, 12), tavernCeramic, [radius * 1.08,height*0.52,0]).rotation.y = Math.PI/2;
    } else if (kind === "bread_basket") {
      add(new THREE.BoxGeometry(1.1,0.22,0.88), tavernWood, [0,0.14,0]);
      for (let i=0;i<3;i++) add(new THREE.SphereGeometry(0.22,8,6), tavernCheese, [-0.28+i*0.28,0.37,0]);
    } else if (kind === "cheese_wheel") {
      add(new THREE.CylinderGeometry(0.85,0.85,0.24,14), tavernCheese, [0,0.12,0]).castShadow = true;
    } else if (kind === "barrel") {
      add(new THREE.CylinderGeometry(1.02,0.94,2.68,12), tavernWood, [0,1.34,0]).castShadow = true;
      for (const y of [0.42,2.24]) add(new THREE.TorusGeometry(1.02,0.055,5,14), tavernIron, [0,y,0]).rotation.x = Math.PI/2;
      add(new THREE.CylinderGeometry(0.98,0.98,0.10,12), tavernWoodLight, [0,2.70,0]);
    } else if (kind === "crate") {
      add(new THREE.BoxGeometry(2.4,2.4,2.4), tavernWood, [0,1.2,0]).castShadow = true;
      for (const y of [0.18,2.22]) add(new THREE.BoxGeometry(2.48,0.09,2.48), tavernWoodLight, [0,y,0]);
    } else if (kind === "sack") {
      const sack = add(new THREE.SphereGeometry(0.73,10,8), tavernCloth, [0,0.78,0]);
      sack.scale.set(1,1.15,0.82);
      add(new THREE.CylinderGeometry(0.22,0.30,0.35,8), tavernCloth, [0,1.62,0]);
    } else if (kind === "candle") {
      add(new THREE.CylinderGeometry(0.13,0.15,0.54,8), tavernCeramic, [0,0.27,0]);
      add(new THREE.ConeGeometry(0.085,0.25,6), tavernFlame, [0,0.67,0]);
    } else if (kind === "lantern") {
      add(new THREE.BoxGeometry(0.42,0.60,0.42), new THREE.MeshStandardMaterial({color:"#e4b86e",emissive:"#bb742d",emissiveIntensity:0.3,transparent:true,opacity:0.58}), [0,0.38,0]);
      add(new THREE.BoxGeometry(0.52,0.07,0.52), tavernIron, [0,0.02,0]);
      add(new THREE.BoxGeometry(0.52,0.07,0.52), tavernIron, [0,0.74,0]);
      add(new THREE.ConeGeometry(0.34,0.28,4), tavernIron, [0,0.91,0]);
    } else if (kind === "plank_floor") {
      add(new THREE.BoxGeometry(12,0.12,12), tavernWood, [0,0,0]).castShadow = false;
      for (let i=0;i<6;i++) add(new THREE.BoxGeometry(1.96,0.035,11.9), tavernWoodLight, [-5+i*2,0.085,0]);
    }
    group.scale.setScalar(PACK_SCALE);
    return group;
  }

  // Room around the miniature world.
  makeBox(scene, [32, 0.22, 26], [0, -1.08, 0], floorMat);
  makeBox(scene, [32, 5.5, 0.35], [0, 1.7, -12.7], wallMat);
  makeBox(scene, [0.35, 5.5, 26], [-16, 1.7, 0], wallMat);
  makeBox(scene, [0.35, 5.5, 26], [16, 1.7, 0], wallMat);
  makeBox(scene, [32, 0.25, 0.35], [0, 0.15, -12.48], trimMat);
  makeBox(scene, [0.35, 0.25, 26], [-15.78, 0.15, 0], trimMat);
  makeBox(scene, [0.35, 0.25, 26], [15.78, 0.15, 0], trimMat);

  // Desk carcass and four chunky legs.
  makeBox(scene, [10.65, 0.38, 10.65], [0, 0.15, 0], edgeWood);
  makeBox(scene, [10.35, 0.08, 10.35], [0, 0.38, 0], woodMat);
  for (const x of [-4.75, 4.75]) {
    for (const z of [-4.75, 4.75]) {
      makeBox(scene, [0.45, 1.15, 0.45], [x, -0.50, z], edgeWood);
      makeBox(scene, [0.52, 0.12, 0.52], [x, -1.01, z], trimMat);
    }
  }
  makeBox(scene, [9.25, 0.14, 0.22], [0, -0.18, 4.45], darkMat);
  makeBox(scene, [0.22, 0.14, 9.25], [4.45, -0.18, 0], darkMat);

  // Low rim walls around the desk surface.
  makeBox(scene, [10.42, 0.64, 0.18], [0, 0.72, -5.08], edgeWood);
  makeBox(scene, [10.42, 0.64, 0.18], [0, 0.72, 5.08], edgeWood);
  makeBox(scene, [0.18, 0.64, 10.42], [-5.08, 0.72, 0], edgeWood);
  makeBox(scene, [0.18, 0.64, 10.42], [5.08, 0.72, 0], edgeWood);
  makeBox(scene, [10.48, 0.055, 0.21], [0, 1.045, -5.08], trimMat);
  makeBox(scene, [10.48, 0.055, 0.21], [0, 1.045, 5.08], trimMat);
  makeBox(scene, [0.21, 0.055, 10.48], [-5.08, 1.045, 0], trimMat);
  makeBox(scene, [0.21, 0.055, 10.48], [5.08, 1.045, 0], trimMat);

  // Terrain and translucent water use vertex buffers owned by Rust/WASM.
  const terrainGeometry = new THREE.BufferGeometry();
  const indices = new Uint16Array((GRID - 1) * (GRID - 1) * 6);
  let indexCursor = 0;
  for (let z = 0; z < GRID - 1; z += 1) {
    for (let x = 0; x < GRID - 1; x += 1) {
      const a = z * GRID + x;
      const b = a + 1;
      const c = a + GRID;
      const d = c + 1;
      indices[indexCursor++] = a;
      indices[indexCursor++] = c;
      indices[indexCursor++] = b;
      indices[indexCursor++] = b;
      indices[indexCursor++] = c;
      indices[indexCursor++] = d;
    }
  }
  terrainGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const waterGeometry = new THREE.BufferGeometry();
  waterGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

  let boundBuffer = memory.buffer;
  let heightView: Float32Array;
  let waterView: Float32Array;
  let terrainPositions: Float32Array;
  let terrainNormals: Float32Array;
  let waterPositions: Float32Array;
  let waterNormals: Float32Array;
  let peopleView: Float32Array;

  function bindWasmViews(): void {
    heightView = new Float32Array(memory.buffer, simulation.heightPtr(), vertexCount);
    waterView = new Float32Array(memory.buffer, simulation.waterPtr(), vertexCount);
    terrainPositions = new Float32Array(memory.buffer, simulation.terrainPositionsPtr(), vertexCount * 3);
    terrainNormals = new Float32Array(memory.buffer, simulation.terrainNormalsPtr(), vertexCount * 3);
    waterPositions = new Float32Array(memory.buffer, simulation.waterPositionsPtr(), vertexCount * 3);
    waterNormals = new Float32Array(memory.buffer, simulation.waterNormalsPtr(), vertexCount * 3);
    peopleView = new Float32Array(memory.buffer, simulation.peoplePtr(), simulation.peopleCount() * 5);

    terrainGeometry.setAttribute("position", new THREE.BufferAttribute(terrainPositions, 3).setUsage(THREE.DynamicDrawUsage));
    terrainGeometry.setAttribute("normal", new THREE.BufferAttribute(terrainNormals, 3).setUsage(THREE.DynamicDrawUsage));
    waterGeometry.setAttribute("position", new THREE.BufferAttribute(waterPositions, 3).setUsage(THREE.DynamicDrawUsage));
    waterGeometry.setAttribute("normal", new THREE.BufferAttribute(waterNormals, 3).setUsage(THREE.DynamicDrawUsage));
    waterGeometry.setAttribute("depth", new THREE.BufferAttribute(waterView, 1).setUsage(THREE.DynamicDrawUsage));
    boundBuffer = memory.buffer;
  }
  bindWasmViews();

  const terrain = new THREE.Mesh(terrainGeometry, woodMat);
  terrain.receiveShadow = true;
  terrain.position.y = 0;
  scene.add(terrain);

  const waterMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float depth;
      varying float vDepth;
      varying vec3 vPosition;
      varying vec3 vNormal;
      void main() {
        vDepth = depth;
        vPosition = position;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      varying float vDepth;
      varying vec3 vPosition;
      varying vec3 vNormal;
      void main() {
        if (vDepth < 0.0018) discard;
        float depthTone = smoothstep(0.002, 0.11, vDepth);
        float ripple = 0.035 * sin(vPosition.x * 3.0 + uTime * 0.8) * sin(vPosition.z * 2.4 - uTime * 0.65);
        vec3 shallow = vec3(0.40, 0.68, 0.66);
        vec3 deep = vec3(0.10, 0.34, 0.39);
        vec3 color = mix(shallow, deep, depthTone) + ripple;
        float fresnel = 0.92 + 0.08 * (1.0 - abs(vNormal.y));
        float alpha = mix(0.28, 0.76, depthTone) * fresnel;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
  const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
  waterMesh.renderOrder = 2;
  scene.add(waterMesh);

  // The lamp is a decorative warm source, not a gameplay object.
  const lamp = new THREE.Group();
  lamp.position.set(-3.55, 0.42, -3.55);
  scene.add(lamp);
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.34, 0.10, 12), brassMat);
  lampBase.position.y = 0.05;
  lamp.add(lampBase);
  const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.95, 8), brassMat);
  lampStem.position.y = 0.54;
  lampStem.rotation.z = -0.10;
  lamp.add(lampStem);
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.48, 0.42, 10, 1, true), ceramicMat);
  lampShade.position.set(-0.08, 1.02, 0);
  lampShade.rotation.z = -0.10;
  lamp.add(lampShade);
  const lampRim = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 6, 12), brassMat);
  lampRim.position.set(-0.08, 0.81, 0);
  lampRim.rotation.x = Math.PI / 2;
  lamp.add(lampRim);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffe3a8" }));
  bulb.position.set(-0.08, 0.83, 0);
  lamp.add(bulb);
  const lampLight = new THREE.SpotLight("#ffcb86", 62, 11, Math.PI / 4, 0.68, 2);
  lampLight.position.set(-3.6, 2.75, -3.5);
  lampLight.target.position.set(-1.7, 0.2, -1.1);
  lampLight.castShadow = false;
  lampLight.shadow.mapSize.set(768, 768);
  scene.add(lampLight, lampLight.target);

  // Shared geometries and materials keep all repeated props lightweight.
  const bottleBodyGeometry = new THREE.CylinderGeometry(0.15, 0.17, 0.68, 10);
  const bottleNeckGeometry = new THREE.CylinderGeometry(0.075, 0.11, 0.15, 10);
  const capGeometry = new THREE.CylinderGeometry(0.087, 0.087, 0.075, 10);
  const bottleGlass = new THREE.MeshPhysicalMaterial({
    color: "#8db7ad", roughness: 0.22, metalness: 0, transmission: 0.23,
    transparent: true, opacity: 0.78, thickness: 0.18
  });
  const bottleWater = new THREE.MeshStandardMaterial({
    color: "#76b7c2", roughness: 0.28, transparent: true, opacity: 0.86
  });
  const bookGeometry = new THREE.BoxGeometry(0.92, 0.16, 1.28);
  const paperGeometry = new THREE.BoxGeometry(0.86, 0.10, 1.22);
  const pencilGeometry = new THREE.CylinderGeometry(0.035, 0.035, 1.45, 6);
  const leadGeometry = new THREE.ConeGeometry(0.035, 0.15, 6);
  const objectVisuals: ObjectVisual[] = [];
  const pickables: THREE.Object3D[] = [];
  const paintPalette = [
    new THREE.Color("#c45a4b"), new THREE.Color("#4f78b5"), new THREE.Color("#70945e"),
    new THREE.Color("#d4ae4d"), new THREE.Color("#916445"), new THREE.Color("#8971ad"),
    new THREE.Color("#e4dfd0"), new THREE.Color("#35383c")
  ];
  const paintOriginals = new WeakMap<THREE.Material, THREE.Color>();
  const appliedObjectColours = new Uint8Array(simulation.objectCount());
  appliedObjectColours.fill(255);

  function makeBottle(index: number): ObjectVisual {
    const root = new THREE.Group();
    const body = new THREE.Mesh(bottleBodyGeometry, bottleGlass);
    body.position.y = 0.42;
    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);
    const neck = new THREE.Mesh(bottleNeckGeometry, bottleGlass);
    neck.position.y = 0.82;
    root.add(neck);
    const cap = new THREE.Mesh(capGeometry, index === 0
      ? new THREE.MeshStandardMaterial({ color: "#c07f58", roughness: 0.62 })
      : new THREE.MeshStandardMaterial({ color: "#708e79", roughness: 0.62 }));
    cap.position.y = 0.94;
    cap.castShadow = true;
    root.add(cap);

    const fill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.119, 0.139, 0.48, 10),
      bottleWater
    );
    fill.position.y = 0.27;
    root.add(fill);

    const looseCap = new THREE.Group();
    const capPiece = new THREE.Mesh(capGeometry, cap.material);
    capPiece.castShadow = true;
    looseCap.add(capPiece);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.071, 0.009, 5, 10), brassMat);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = -0.035;
    looseCap.add(innerRing);
    looseCap.visible = false;
    scene.add(looseCap);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.151, 0.151, 0.23, 10, 1, true),
      new THREE.MeshStandardMaterial({ color: index === 0 ? "#d2c4a6" : "#c1cbb4", roughness: 0.82 })
    );
    label.position.y = 0.37;
    root.add(label);
    return { root, cap, looseCap, fill, kind: "bottle" };
  }

  function makeBook(index: number): ObjectVisual {
    const root = new THREE.Group();
    const cover = new THREE.Mesh(bookGeometry, bookMaterials[index % bookMaterials.length]);
    cover.position.y = 0.13;
    cover.castShadow = true;
    cover.receiveShadow = true;
    root.add(cover);
    const pages = new THREE.Mesh(paperGeometry, new THREE.MeshStandardMaterial({ color: "#d9cbb0", roughness: 0.98 }));
    pages.position.y = 0.14;
    root.add(pages);
    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.175, 1.28),
      bookMaterials[index % bookMaterials.length]
    );
    spine.position.set(-0.425, 0.135, 0);
    root.add(spine);
    return { root, cap: new THREE.Mesh(), looseCap: new THREE.Group(), fill: new THREE.Mesh(), kind: "book" };
  }

  function makePencil(index: number): ObjectVisual {
    const root = new THREE.Group();
    const body = new THREE.Mesh(pencilGeometry, pencilMaterials[index % pencilMaterials.length]);
    body.rotation.z = Math.PI / 2;
    body.rotation.x = 0.08;
    body.position.y = 0.055;
    body.castShadow = true;
    root.add(body);
    const point = new THREE.Mesh(leadGeometry, darkMat);
    point.rotation.z = -Math.PI / 2;
    point.position.set(0.79, 0.055, 0);
    root.add(point);
    const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.09, 6), ceramicMat);
    eraser.rotation.z = Math.PI / 2;
    eraser.position.set(-0.76, 0.055, 0);
    root.add(eraser);
    return { root, cap: new THREE.Mesh(), looseCap: new THREE.Group(), fill: new THREE.Mesh(), kind: "pencil" };
  }

  function makeGarden(): ObjectVisual {
    const root = new THREE.Group();
    const frameMaterial = new THREE.MeshStandardMaterial({ color: "#896b4e", roughness: 0.92 });
    const plot = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 1.38), frameMaterial);
    plot.position.y = 0.11;
    plot.castShadow = true;
    root.add(plot);
    const soil = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.075, 1.24), soilMat);
    soil.position.y = 0.225;
    soil.receiveShadow = true;
    root.add(soil);
    const sproutGeometry = new THREE.ConeGeometry(0.09, 0.34, 5);
    for (let i = 0; i < 9; i += 1) {
      const x = ((i % 3) - 1) * 0.42;
      const z = (Math.floor(i / 3) - 1) * 0.37;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.23, 5), greenMat);
      stem.position.set(x, 0.36, z);
      root.add(stem);
      const leaf = new THREE.Mesh(sproutGeometry, leafMat);
      leaf.position.set(x + (i % 2 ? 0.09 : -0.08), 0.47, z);
      leaf.rotation.z = i % 2 ? 0.42 : -0.42;
      root.add(leaf);
    }
    return { root, cap: new THREE.Mesh(), looseCap: new THREE.Group(), fill: new THREE.Mesh(), kind: "garden" };
  }

  const modelCache = new Map<string, THREE.Group>();
  const modelTargets = new Map<string, THREE.Group[]>();
  const barrelLights: { light: THREE.PointLight; phase: number; base: number }[] = [];

  for (let index = 0; index < simulation.objectCount(); index += 1) {
    const kind = simulation.objectKind(index);
    let visual: ObjectVisual;
    const isTavernModel = (TAVERN_MODELS as readonly string[]).includes(kind);
    if (kind === "bottle") visual = makeBottle(index);
    else if (kind === "book") visual = makeBook(index);
    else if (kind === "pencil") visual = makePencil(index);
    else if (kind === "garden") visual = makeGarden();
    else {
      const root = new THREE.Group();
      const fallback = makeTavernFallback(kind);
      fallback.userData.proceduralFallback = true;
      root.add(fallback);
      visual = { root, cap: new THREE.Mesh(), looseCap: new THREE.Group(), fill: new THREE.Mesh(), kind };
      if (isTavernModel) {
        const targets = modelTargets.get(kind) ?? [];
        targets.push(root);
        modelTargets.set(kind, targets);
      }
      if (kind === "lantern") {
        const light = new THREE.PointLight("#ffbe78", 1.15, 2.6, 2);
        light.position.set(0, 0.055, 0);
        root.add(light);
        barrelLights.push({ light, phase: barrelLights.length * 1.73, base: 1.15 });
      }
    }

    const onTavernTable = ["tankard","mug","bread_basket","cheese_wheel","candle","lantern"].includes(kind);
    const y = isTavernModel
      ? (kind === "plank_floor" || kind === "barrel" || kind === "crate" || kind === "sack"
          ? 0.431
          : kind === "round_table" || kind === "stool"
            ? TAVERN_SURFACE_Y
            : onTavernTable ? TAVERN_TABLE_Y : 0.431)
      : 0.36;
    visual.root.position.set(simulation.objectX(index) - 5, y, simulation.objectZ(index) - 5);
    visual.root.rotation.y = simulation.objectYaw(index);
    if (kind === "pencil" || kind === "book" || kind === "bottle") {
      visual.root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (Array.isArray(child.material)) {
          child.material = child.material.map((material) => material.clone());
        } else {
          child.material = child.material.clone();
        }
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
            paintOriginals.set(material, material.color.clone());
          }
        }
      });
    }
    visual.root.userData.label = simulation.objectName(index);
    visual.root.userData.objectIndex = index;
    scene.add(visual.root);
    pickables.push(visual.root);
    objectVisuals.push(visual);
  }

  function applyObjectColour(index: number, colourIndex: number): void {
    if (appliedObjectColours[index] === colourIndex) return;
    appliedObjectColours[index] = colourIndex;
    const visual = objectVisuals[index];
    if (!visual) return;
    const tint = colourIndex === 0 ? null : paintPalette[colourIndex - 1];
    visual.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial)) continue;
        const original = paintOriginals.get(material);
        if (!original) continue;
        if (tint) material.color.copy(original).lerp(tint, 0.76);
        else material.color.copy(original);
      }
    });
  }

  function warmGrade(model: THREE.Group, modelId: string): void {
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = ["round_table","barrel","crate","lantern"].includes(modelId);
      child.receiveShadow = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        const name = (child.name + " " + material.name).toLowerCase();
        if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
          if (name.includes("wood") || name.includes("frame") || name.includes("wicker") || name.includes("boards") || name.includes("subfloor")) {
            material.color.lerp(new THREE.Color("#c58e59"), 0.18);
          } else if (name.includes("iron") || name.includes("metal")) material.color.lerp(new THREE.Color("#b18c66"), 0.12);
          else if (name.includes("cloth")) material.color.lerp(new THREE.Color("#b99a76"), 0.12);
          else if (name.includes("glass")) material.color.lerp(new THREE.Color("#b4c5b0"), 0.08);
          else if (name.includes("wax")) material.color.lerp(new THREE.Color("#eee0bd"), 0.10);
          if (name.includes("flame") || modelId === "candle" && name.includes("fire")) {
            material.emissive = new THREE.Color("#ff9b42");
            material.emissiveIntensity = 2.4;
          }
          material.needsUpdate = true;
        }
      }
      if (modelId === "candle" && (child.name.toLowerCase().includes("flame") || child.name.toLowerCase().includes("fire"))) {
        const list = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of list) {
          if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
            material.emissive.set("#ff9b42");
            material.emissiveIntensity = 2.8;
          }
        }
      }
    });
  }

  async function loadTavernModels(): Promise<void> {
    const loader = new GLTFLoader();
    const status = document.getElementById("loading-status");
    let completed = 0;
    let loaded = 0;
    const jobs = TAVERN_MODELS.map(async (modelId) => {
      try {
        const gltf = await loader.loadAsync(`/models/tavern/${modelId}.glb`);
        const source = gltf.scene;
        warmGrade(source, modelId);
        source.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(source);
        const floorOffset = Number.isFinite(bounds.min.y) ? -bounds.min.y : 0;
        modelCache.set(modelId, source);
        const cachedSource = modelCache.get(modelId);
        if (!cachedSource) throw new Error("Model cache insert failed.");
        loaded += 1;
        const targets = modelTargets.get(modelId) ?? [];
        if (targets.length >= 3) {
          const sourceInverse = source.matrixWorld.clone().invert();
          const modelBasis = new THREE.Matrix4()
            .makeTranslation(0, floorOffset * PACK_SCALE, 0)
            .multiply(new THREE.Matrix4().makeScale(PACK_SCALE, PACK_SCALE, PACK_SCALE));
          const matrix = new THREE.Matrix4();
          source.traverse((part) => {
            if (!(part instanceof THREE.Mesh)) return;
            const relative = new THREE.Matrix4().multiplyMatrices(sourceInverse, part.matrixWorld);
            const instances = new THREE.InstancedMesh(part.geometry, part.material, targets.length);
            instances.name = modelId + "_instances_" + part.name;
            instances.castShadow = ["round_table","barrel","crate","lantern"].includes(modelId);
            instances.receiveShadow = true;
            for (let instanceIndex = 0; instanceIndex < targets.length; instanceIndex += 1) {
              const target = targets[instanceIndex];
              if (!target) continue;
              target.updateMatrixWorld(true);
              matrix.multiplyMatrices(target.matrixWorld, modelBasis).multiply(relative);
              instances.setMatrixAt(instanceIndex, matrix);
            }
            instances.instanceMatrix.needsUpdate = true;
            instances.computeBoundingSphere();
            scene.add(instances);
          });
          const hitMaterial = new THREE.MeshBasicMaterial({
            transparent: true, opacity: 0, colorWrite: false, depthWrite: false, side: THREE.DoubleSide
          });
          for (const target of targets) {
            for (const child of target.children.slice()) {
              if (child.userData.proceduralFallback === true) target.remove(child);
            }
            const hitProxy = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 8), hitMaterial);
            hitProxy.userData.performanceIgnore = true;
            hitProxy.position.y = 0.14;
            target.add(hitProxy);
          }
        } else {
          for (const target of targets) {
            const instance = cachedSource.clone(true);
            instance.scale.setScalar(PACK_SCALE);
            instance.position.y += floorOffset * PACK_SCALE;
            instance.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = ["round_table","barrel","crate","lantern"].includes(modelId);
                child.receiveShadow = true;
              }
            });
            for (const child of target.children.slice()) {
              if (child.userData.proceduralFallback === true) target.remove(child);
            }
            target.add(instance);
          }
        }
      } catch (error) {
        console.warn(`Tavern model ${modelId} failed to load; keeping its procedural fallback.`, error);
      } finally {
        completed += 1;
        if (status) status.textContent = `Loading tavern models · ${completed}/${TAVERN_MODELS.length}`;
      }
    });
    await Promise.all(jobs);
    updateSceneTriangleCount();
    if (status) {
      status.textContent = loaded === TAVERN_MODELS.length
        ? "The tavern is ready."
        : `Tavern ready · ${loaded}/${TAVERN_MODELS.length} models · fallbacks active`;
      status.classList.add("complete");
    }
  }
  void loadTavernModels();

  // A loose cap is a real mesh that remains on the tabletop once removed.
  // Place it close to the bottle base; its animation is deliberately simple.
  const personBodyGeometry = new THREE.CapsuleGeometry(0.075, 0.12, 3, 6);
  const personHeadGeometry = new THREE.SphereGeometry(0.07, 7, 5);
  const personBodyMaterial = new THREE.MeshStandardMaterial({ color: "#d1a278", roughness: 0.8 });
  const personHeadMaterial = new THREE.MeshStandardMaterial({ color: "#e5c8a5", roughness: 0.85 });
  const peopleCount = simulation.peopleCount();
  const peopleBodies = new THREE.InstancedMesh(personBodyGeometry, personBodyMaterial, peopleCount);
  const peopleHeads = new THREE.InstancedMesh(personHeadGeometry, personHeadMaterial, peopleCount);
  peopleBodies.castShadow = true;
  peopleHeads.castShadow = true;
  peopleBodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  peopleHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(peopleBodies, peopleHeads);
  const dummy = new THREE.Object3D();
  const bodyPalette = [new THREE.Color("#c67f59"), new THREE.Color("#778e79"), new THREE.Color("#c6a16f"), new THREE.Color("#8793a9"), new THREE.Color("#b67e82")];
  const wetBodyColor = new THREE.Color("#789fb0");
  for (let i = 0; i < peopleCount; i += 1) {
    peopleBodies.setColorAt(i, bodyPalette[i % bodyPalette.length] ?? bodyPalette[0]!);
  }

  // Dust positions are allocated once and gently moved in place.
  const dustCount = 110;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    const seed = i * 37.13;
    dustPositions[i * 3] = Math.sin(seed) * 4.6;
    dustPositions[i * 3 + 1] = 0.8 + ((i * 17) % 100) / 100 * 2.8;
    dustPositions[i * 3 + 2] = Math.cos(seed * 0.71) * 4.6;
  }
  const dustGeometry = new THREE.BufferGeometry();
  const dustAttribute = new THREE.BufferAttribute(dustPositions, 3);
  dustAttribute.setUsage(THREE.DynamicDrawUsage);
  dustGeometry.setAttribute("position", dustAttribute);
  const dustMaterial = new THREE.PointsMaterial({ color: "#ffe5b3", size: 0.035, transparent: true, opacity: 0.32, depthWrite: false, sizeAttenuation: true });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  let lowGraphics = false;
  document.addEventListener("deskbound:graphics", (event) => {
    const custom = event as CustomEvent<{ low: boolean }>;
    lowGraphics = custom.detail.low;
    renderer.shadowMap.enabled = !lowGraphics;
    keyLight.castShadow = !lowGraphics;
    lampLight.castShadow = false;
    dust.visible = !lowGraphics;
    bloomPass.enabled = !lowGraphics;
  });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.48, 0.84);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointerEvent = new THREE.Vector2();
  let hoveredRoot: THREE.Object3D | null = null;
  renderer.domElement.addEventListener("pointermove", (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerEvent.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointerEvent, camera);
    const hit = raycaster.intersectObjects(pickables, true)[0];
    let root: THREE.Object3D | null = hit?.object ?? null;
    while (root && !root.userData.label) root = root.parent;
    if (root !== hoveredRoot) {
      hoveredRoot = root;
      onHover(root ? String(root.userData.label) : "");
      if (root) {
        const kind = objectVisuals[Number(root.userData.objectIndex)]?.kind;
        if (kind === "bottle") {
          simulation.discoverAction("action.uncap");
          simulation.discoverAction("action.tip");
          simulation.discoverAction("action.upright");
          simulation.discoverAction("action.look");
        } else if (kind === "barrel") {
          simulation.discoverAction("action.tap");
          simulation.discoverAction("action.look");
        } else {
          simulation.discoverAction("action.look");
        }
      } else if (hit) {
        simulation.discoverAction("action.carve");
      }
    }
  });

  // Only the secondary mouse button orbits. The world has no direct manipulation.
  let dragging = false;
  let previousX = 0;
  let previousY = 0;
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 2) return;
    dragging = true;
    previousX = event.clientX;
    previousY = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (event.button === 2) dragging = false;
  });
  renderer.domElement.addEventListener("pointercancel", () => { dragging = false; });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - previousX;
    const dy = event.clientY - previousY;
    previousX = event.clientX;
    previousY = event.clientY;
    cameraAzimuth -= dx * 0.006;
    cameraElevation = THREE.MathUtils.clamp(cameraElevation - dy * 0.004, 0.55, 1.48);
    updateCamera();
  });
  renderer.domElement.addEventListener("wheel", (event) => {
    event.preventDefault();
    cameraDistance = THREE.MathUtils.clamp(cameraDistance + event.deltaY * 0.009, 11.5, 27);
    updateCamera();
  }, { passive: false });

  const resizeObserver = new ResizeObserver(() => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
  });
  resizeObserver.observe(container);

  const timeUniform = waterMaterial.uniforms.uTime as THREE.IUniform<number>;
  let lastPeopleTime = 0;
  const performanceLabel = document.getElementById("performance-label");
  let sceneTriangleCount = 0;
  const normalSamples = new Float32Array(120);
  const lowSamples = new Float32Array(120);
  let normalCursor = 0;
  let lowCursor = 0;
  let normalCount = 0;
  let lowCount = 0;
  let normalTotal = 0;
  let lowTotal = 0;
  let lastFrameTime = 0;
  let lastMetricsTime = 0;

  function updateSceneTriangleCount(): void {
    let triangles = 0;
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.performanceIgnore === true) return;
      const position = object.geometry.getAttribute("position");
      const available = object.geometry.index?.count ?? position?.count ?? 0;
      const rangeCount = object.geometry.drawRange.count;
      const drawCount = Number.isFinite(rangeCount) ? Math.min(available, rangeCount) : available;
      const instances = object instanceof THREE.InstancedMesh ? object.count : 1;
      triangles += Math.floor(drawCount / 3) * instances;
    });
    sceneTriangleCount = triangles;
  }

  return {
    sync(): void {
      if (memory.buffer !== boundBuffer) bindWasmViews();
      const terrainPosition = terrainGeometry.getAttribute("position") as THREE.BufferAttribute;
      const terrainNormal = terrainGeometry.getAttribute("normal") as THREE.BufferAttribute;
      const waterPosition = waterGeometry.getAttribute("position") as THREE.BufferAttribute;
      const waterNormal = waterGeometry.getAttribute("normal") as THREE.BufferAttribute;
      terrainPosition.needsUpdate = true;
      terrainNormal.needsUpdate = true;
      waterPosition.needsUpdate = true;
      waterNormal.needsUpdate = true;
      const depthAttribute = waterGeometry.getAttribute("depth") as THREE.BufferAttribute;
      depthAttribute.needsUpdate = true;

      for (let index = 0; index < objectVisuals.length; index += 1) {
        const visual = objectVisuals[index];
        if (!visual) continue;
        const colourIndex = simulation.objectColour(index);
        if (colourIndex !== appliedObjectColours[index]) applyObjectColour(index, colourIndex);

        if (visual.kind === "pencil") {
          const worldX = simulation.objectX(index);
          const worldZ = simulation.objectZ(index);
          const gridX = Math.round(worldX / DESK_SIZE * (GRID - 1));
          const gridZ = Math.round(worldZ / DESK_SIZE * (GRID - 1));
          const gridIndex = THREE.MathUtils.clamp(gridZ, 0, GRID - 1) * GRID
            + THREE.MathUtils.clamp(gridX, 0, GRID - 1);
          visual.root.position.set(worldX - 5, 0.36 + (heightView[gridIndex] ?? 0), worldZ - 5);
          visual.root.rotation.y = simulation.objectYaw(index);
        }

        if (visual.kind === "bottle") {
          visual.root.rotation.y = simulation.objectYaw(index);
          visual.root.rotation.z = simulation.objectTilt(index);
          const capped = simulation.objectCapOn(index);
          visual.cap.visible = capped;
          visual.looseCap.visible = !capped;
          if (!capped) {
            const bottleX = simulation.objectX(index);
            const bottleZ = simulation.objectZ(index);
            visual.looseCap.position.set(bottleX - 5 + 0.28, 0.41, bottleZ - 5 + 0.18);
            visual.looseCap.rotation.set(0, 0.18, Math.PI / 2);
          }
          const amount = simulation.objectVolume(index) / 0.14;
          visual.fill.scale.y = Math.max(0.002, amount);
          visual.fill.position.y = 0.08 + 0.19 * amount;
        }
      }

      const peopleTime = performance.now() * 0.001;
      const step = Math.max(0, peopleTime - lastPeopleTime);
      lastPeopleTime = peopleTime;
      for (let index = 0; index < peopleCount; index += 1) {
        const offset = index * 5;
        const x = peopleView[offset] ?? 0;
        const z = peopleView[offset + 1] ?? 0;
        const heading = peopleView[offset + 2] ?? 0;
        const wet = peopleView[offset + 3] ?? 0;
        const seated = (peopleView[offset + 4] ?? 0) > 0.5;
        const bounce = seated ? 0 : Math.sin(peopleTime * 5 + index * 1.7) * 0.018;
        const bodyY = seated ? TAVERN_SURFACE_Y + 1.8 * PACK_SCALE + 0.135 : 0.431 + 0.135;
        dummy.position.set(x - 5, bodyY + bounce, z - 5);
        dummy.rotation.set(0, -heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        peopleBodies.setMatrixAt(index, dummy.matrix);
        dummy.position.set(x - 5 + Math.cos(heading) * 0.018, bodyY + 0.205 + bounce, z - 5 + Math.sin(heading) * 0.018);
        dummy.scale.setScalar(0.82);
        dummy.updateMatrix();
        peopleHeads.setMatrixAt(index, dummy.matrix);
        if (wet > 0.1) peopleBodies.setColorAt(index, wetBodyColor);
        else peopleBodies.setColorAt(index, bodyPalette[index % bodyPalette.length] ?? bodyPalette[0]!);
      }
      peopleBodies.instanceMatrix.needsUpdate = true;
      peopleHeads.instanceMatrix.needsUpdate = true;
      if (peopleBodies.instanceColor) peopleBodies.instanceColor.needsUpdate = true;

      if (!lowGraphics) {
        for (let index = 0; index < dustCount; index += 1) {
          const base = index * 3;
          const originalY = 0.8 + ((index * 17) % 100) / 100 * 2.8;
          dustPositions[base + 1] = originalY + Math.sin(peopleTime * 0.45 + index * 0.9) * 0.19;
          dustPositions[base] += Math.sin(peopleTime * 0.12 + index) * step * 0.004;
        }
        dustAttribute.needsUpdate = true;
      }
    },
    render(time: number): void {
      timeUniform.value = time;
      for (let index = 0; index < barrelLights.length; index += 1) {
        const flicker = barrelLights[index];
        if (!flicker) continue;
        flicker.light.intensity = flicker.base
          + Math.sin(time * 7.4 + flicker.phase) * 0.07
          + Math.sin(time * 13.2 + flicker.phase * 1.4) * 0.025;
      }
      const frameMs = lastFrameTime > 0 ? Math.max(0, (time - lastFrameTime) * 1000) : 0;
      lastFrameTime = time;
      if (frameMs > 0) {
        if (lowGraphics) {
          lowTotal -= lowSamples[lowCursor] ?? 0;
          lowSamples[lowCursor] = frameMs;
          lowTotal += frameMs;
          lowCursor = (lowCursor + 1) % lowSamples.length;
          lowCount = Math.min(lowCount + 1, lowSamples.length);
        } else {
          normalTotal -= normalSamples[normalCursor] ?? 0;
          normalSamples[normalCursor] = frameMs;
          normalTotal += frameMs;
          normalCursor = (normalCursor + 1) % normalSamples.length;
          normalCount = Math.min(normalCount + 1, normalSamples.length);
        }
      }
      if (lowGraphics) renderer.render(scene, camera);
      else composer.render();

      if (performanceLabel && time - lastMetricsTime >= 0.5) {
        lastMetricsTime = time;
        const normal = normalCount ? (normalTotal / normalCount).toFixed(1) + " ms" : "—";
        const low = lowCount ? (lowTotal / lowCount).toFixed(1) + " ms" : "—";
        performanceLabel.textContent = "Scene " + sceneTriangleCount.toLocaleString() +
          " tris · Normal " + normal + " · Low " + low;
      }
    }
  };
}

export { createDeskScene };
