import * as THREE from "three";
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
  mesh.castShadow = true;
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
    peopleView = new Float32Array(memory.buffer, simulation.peoplePtr(), simulation.peopleCount() * 4);

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
  lampLight.castShadow = true;
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

  for (let index = 0; index < simulation.objectCount(); index += 1) {
    const kind = simulation.objectKind(index);
    let visual: ObjectVisual;
    if (kind === "bottle") visual = makeBottle(index);
    else if (kind === "book") visual = makeBook(index);
    else if (kind === "pencil") visual = makePencil(index);
    else visual = makeGarden();

    visual.root.position.set(simulation.objectX(index) - 5, 0.36, simulation.objectZ(index) - 5);
    visual.root.rotation.y = simulation.objectYaw(index);
    visual.root.userData.label = simulation.objectName(index);
    visual.root.userData.objectIndex = index;
    scene.add(visual.root);
    pickables.push(visual.root);
    objectVisuals.push(visual);
  }

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
    lampLight.castShadow = !lowGraphics;
    dust.visible = !lowGraphics;
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointerEvent = new THREE.Vector2();
  let hoveredRoot: THREE.Object3D | null = null;
  renderer.domElement.addEventListener("pointermove", (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerEvent.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointerEvent, camera);
    const hit = raycaster.intersectObjects(pickables, true)[0];
    const root = hit?.object.parent?.userData.label ? hit.object.parent :
      hit?.object.parent?.parent?.userData.label ? hit.object.parent.parent : null;
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
  });
  resizeObserver.observe(container);

  const timeUniform = waterMaterial.uniforms.uTime as THREE.IUniform<number>;
  let lastPeopleTime = 0;

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
        if (!visual || visual.kind !== "bottle") continue;
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

      const peopleTime = performance.now() * 0.001;
      const step = Math.max(0, peopleTime - lastPeopleTime);
      lastPeopleTime = peopleTime;
      for (let index = 0; index < peopleCount; index += 1) {
        const offset = index * 4;
        const x = peopleView[offset] ?? 0;
        const z = peopleView[offset + 1] ?? 0;
        const heading = peopleView[offset + 2] ?? 0;
        const wet = peopleView[offset + 3] ?? 0;
        const bounce = Math.sin(peopleTime * 5 + index * 1.7) * 0.018;
        dummy.position.set(x - 5, 0.47 + bounce, z - 5);
        dummy.rotation.set(0, -heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        peopleBodies.setMatrixAt(index, dummy.matrix);
        dummy.position.set(x - 5 + Math.cos(heading) * 0.018, 0.62 + bounce, z - 5 + Math.sin(heading) * 0.018);
        dummy.scale.setScalar(0.82);
        dummy.updateMatrix();
        peopleHeads.setMatrixAt(index, dummy.matrix);
        if (wet > 0.1) peopleBodies.setColorAt(index, new THREE.Color("#789fb0"));
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
      renderer.render(scene, camera);
    }
  };
}

export { createDeskScene };
