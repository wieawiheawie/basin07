import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./style.css";
import { createCrate, CRATE_SIZE } from "./crate";
import { createGrass } from "./grass";
import { createPhysics } from "./physics";
import { createTable } from "./table";
import { createTerrain, groundHeight, HALF } from "./terrain";

const params = new URLSearchParams(location.search);
const MAX_BLADES = 320000;
const START_BLADES = 120000;
const fixedBlades = params.has("blades");
const LIFT = 0.8;
const LIMIT = HALF - 0.75;

async function start(): Promise<void> {
  const canvas = document.getElementById("view") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#b8c8d6", 0.003);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
  camera.position.set(0, 27, 33);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.3, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3;
  controls.maxDistance = 90;
  controls.maxPolarAngle = 1.5;
  controls.mouseButtons = { LEFT: -1 as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

  const sun = new THREE.DirectionalLight("#fff0d6", 3.4);
  sun.position.copy(new THREE.Vector3(14, 22, 10));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -11;
  sun.shadow.camera.right = 11;
  sun.shadow.camera.top = 11;
  sun.shadow.camera.bottom = -11;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target, new THREE.HemisphereLight("#bcd4ff", "#4a3a28", 0.3));

  // Procedural sky: visible backdrop plus an image-based environment so lighting matches the sky.
  const sunDir = new THREE.Vector3(14, 22, 10).normalize();
  const makeSky = (scale: number): Sky => {
    const sky = new Sky();
    sky.scale.setScalar(scale);
    const u = sky.material.uniforms;
    u.turbidity!.value = 2.5;
    u.rayleigh!.value = 2.2;
    u.mieCoefficient!.value = 0.004;
    u.mieDirectionalG!.value = 0.8;
    u.sunPosition!.value.copy(sunDir);
    return sky;
  };
  const envScene = new THREE.Scene();
  envScene.add(makeSky(50));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  scene.add(makeSky(250));

  const table = createTable();
  const terrain = createTerrain();
  const grass = createGrass(MAX_BLADES);
  const crate = createCrate();
  scene.add(table.group, terrain.mesh, grass.mesh, crate);
  grass.setCount(fixedBlades ? Number(params.get("blades")) : START_BLADES);

  const physics = await createPhysics(terrain, table.boxes);
  document.getElementById("loading")?.remove();

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Dragging: a spring "hand" pulls the grabbed point of the crate toward the cursor, lifted above the ground.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const target = new THREE.Vector3();

  function aim(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  function updateTarget(): void {
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    target.set(THREE.MathUtils.clamp(hit.x, -LIMIT, LIMIT), plane.constant * -1, THREE.MathUtils.clamp(hit.z, -LIMIT, LIMIT));
    physics.setGrabTarget(target);
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    aim(event);
    const hits = raycaster.intersectObject(crate, true);
    const first = hits[0];
    if (!first) return;
    canvas.setPointerCapture(event.pointerId);
    plane.constant = -(first.point.y + LIFT);
    physics.beginGrab(crate.worldToLocal(first.point.clone()));
    updateTarget();
    canvas.style.cursor = "grabbing";
  });

  canvas.addEventListener("pointermove", (event) => {
    aim(event);
    if (physics.isGrabbed()) {
      updateTarget();
    } else {
      canvas.style.cursor = raycaster.intersectObject(crate, true).length > 0 ? "grab" : "default";
    }
  });

  const release = (): void => {
    if (!physics.isGrabbed()) return;
    physics.endGrab();
    canvas.style.cursor = "default";
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  // Debug and test hooks.
  const project = (): { x: number; y: number } => {
    const p = crate.position.clone().project(camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  };
  (window as unknown as Record<string, unknown>).__deskbound = {
    crate: () => { const c = physics.crate(); return { p: c.position.toArray(), v: c.velocity.toArray() }; },
    screen: project,
    blades: () => grass.mesh.count,
    grabbed: () => physics.isGrabbed(),
    cam: (p: number[], t: number[]) => { camera.position.set(p[0]!, p[1]!, p[2]!); controls.target.set(t[0]!, t[1]!, t[2]!); }
  };

  const sunView = new THREE.Vector3();
  const clock = new THREE.Clock();
  let frames = 0;
  let accum = 0;
  let slowSeen = false;

  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    physics.step(dt);

    const state = physics.crate();
    crate.position.copy(state.position);
    crate.quaternion.copy(state.quaternion);

    // Keep the shadow map centred on the crate so shadows stay sharp on a big table.
    sun.target.position.set(state.position.x, 0, state.position.z);
    sun.position.set(state.position.x + 14, 22, state.position.z + 10);

    const clearance = state.position.y - CRATE_SIZE / 2 - groundHeight(state.position.x, state.position.z);
    controls.update();
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    sunView.copy(sunDir).transformDirection(camera.matrixWorldInverse);
    grass.update(clock.elapsedTime, crate, THREE.MathUtils.clamp(1 - clearance / 0.45, 0, 1), sunView);

    renderer.render(scene, camera);

    // Adaptive quality: shed blades fast when slow, then drop resolution; grow back only if it was never slow.
    if (!fixedBlades) {
      frames += 1;
      accum += dt;
      if (frames === 30) {
        const avg = accum / frames;
        if (avg > 1 / 45) {
          slowSeen = true;
          if (grass.mesh.count > 25000) grass.setCount(grass.mesh.count * 0.65);
          else if (renderer.getPixelRatio() > 0.7) renderer.setPixelRatio(0.7), resize();
        } else if (!slowSeen && avg < 1 / 58 && grass.mesh.count < MAX_BLADES) {
          grass.setCount(grass.mesh.count * 1.3);
        }
        frames = 0;
        accum = 0;
      }
    }
  });
}

void start();
