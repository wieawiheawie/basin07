import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./style.css";
import { createCrate, CRATE_SIZE } from "./crate";
import { createGrass } from "./grass";
import { createPhysics } from "./physics";
import { createTable } from "./table";
import { createTerrain, groundHeight } from "./terrain";

const params = new URLSearchParams(location.search);
const MAX_BLADES = 70000;
const fixedBlades = params.has("blades");
const LIFT = 0.8;
const LIMIT = 4.25;

async function start(): Promise<void> {
  const canvas = document.getElementById("view") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1d2328");

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
  camera.position.set(0, 9.5, 11.5);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.3, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3;
  controls.maxDistance = 24;
  controls.maxPolarAngle = 1.5;
  controls.mouseButtons = { LEFT: -1 as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

  const sun = new THREE.DirectionalLight("#fff0d6", 3.4);
  sun.position.set(7, 11, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun, new THREE.HemisphereLight("#bcd4ff", "#4a3a28", 0.85));

  const table = createTable();
  const terrain = createTerrain();
  const grass = createGrass(MAX_BLADES);
  const crate = createCrate();
  scene.add(table.group, terrain.mesh, grass.mesh, crate);
  if (fixedBlades) grass.setCount(Number(params.get("blades")));

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
    grabbed: () => physics.isGrabbed()
  };

  const clock = new THREE.Clock();
  let frames = 0;
  let accum = 0;
  let adjustments = 0;

  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    physics.step(dt);

    const state = physics.crate();
    crate.position.copy(state.position);
    crate.quaternion.copy(state.quaternion);

    const clearance = state.position.y - CRATE_SIZE / 2 - groundHeight(state.position.x, state.position.z);
    grass.update(clock.elapsedTime, {
      x: state.position.x, y: state.position.y, z: state.position.z,
      radius: CRATE_SIZE * 0.75,
      push: THREE.MathUtils.clamp(1 - clearance / 0.45, 0, 1)
    });

    controls.update();
    renderer.render(scene, camera);

    // Keep it smooth on weak GPUs: trim blade count if the frame rate stays low.
    if (!fixedBlades && adjustments < 8) {
      frames += 1;
      accum += dt;
      if (frames === 90) {
        if (accum / frames > 1 / 28 && grass.mesh.count > 20000) {
          grass.setCount(grass.mesh.count * 0.75);
          adjustments += 1;
        }
        frames = 0;
        accum = 0;
      }
    }
  });
}

void start();
