import * as THREE from "three";
import { createAtmosphere } from "./atmosphere";
import { createCameraRig } from "./camera";
import "./style.css";
import { createDigTool } from "./dig";
import { createFpsCounter } from "./fps";
import { createGrass, type Interactor } from "./grass";
import { setupGrab } from "./input";
import { createPerfOverlay } from "./perf";
import { createPhysics } from "./physics";
import { createProps, syncProps } from "./props";
import { PRESET_ORDER, presets, type PresetName } from "./quality";
import { createTable } from "./table";
import { createTerrain, HALF } from "./terrain";
import { createUi, type Ui } from "./ui";

const params = new URLSearchParams(location.search);
const MAX_BLADES = 440000;
const LIMIT = HALF - 0.75;
const SUN_OFFSET = new THREE.Vector3(14, 22, 10);

async function start(): Promise<void> {
  const canvas = document.getElementById("view") as HTMLCanvasElement;
  const loading = document.getElementById("loading");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: params.get("q") === "high", powerPreference: "high-performance" });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 800);
  camera.position.set(0, 27, 33);
  const rig = createCameraRig(camera, canvas, HALF - 1);

  const sun = new THREE.DirectionalLight("#fff0d6", 3.4);
  sun.position.copy(SUN_OFFSET);
  sun.castShadow = true;
  sun.shadow.camera.left = -11;
  sun.shadow.camera.right = 11;
  sun.shadow.camera.top = 11;
  sun.shadow.camera.bottom = -11;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  // The shadow map is redrawn only when something moves (see the loop below).
  sun.shadow.autoUpdate = false;
  const hemi = new THREE.HemisphereLight("#bcd4ff", "#4a3a28", 0.3);
  scene.add(sun, sun.target, hemi);
  const sunDir = SUN_OFFSET.clone().normalize();
  const atmosphere = createAtmosphere({ renderer, scene, sun, hemi, sunDir });

  const table = createTable();
  const terrain = createTerrain();
  scene.add(table.group, terrain.mesh);

  const grass = await createGrass(MAX_BLADES, sunDir, (done, total) => {
    if (loading) loading.textContent = `Growing grass ${Math.round((done / total) * 100)}%`;
  });
  scene.add(grass.group);

  const physics = await createPhysics(terrain, table.boxes);
  const props = createProps(scene, physics, Number(params.get("props") ?? 1));
  let dig: ReturnType<typeof createDigTool> | null = null;
  setupGrab({ canvas, camera, physics, props, limit: LIMIT, enabled: () => (dig?.tool() ?? "move") === "move" });
  let ui: Ui | null = null;
  dig = createDigTool({
    canvas, camera, scene, terrain, physics, grass,
    onChange: (tool) => ui?.setTool(tool),
    onBrush: (radius) => ui?.setRadius(radius)
  });
  loading?.remove();

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);

  // Quality presets: G cycles Low / Medium / High. The adaptive step below only ever trims from the chosen preset.
  const all = presets(window.devicePixelRatio);
  const fixedBlades = params.has("blades");
  let preset = all[(params.get("q") as PresetName) in all ? (params.get("q") as PresetName) : "medium"];
  // Adaptive quality (see the end of the loop): current resolution scale and grass amount, never above the preset.
  let resScale = preset.pixelRatio;
  let grassScale = preset.grass;
  const frameTimes: number[] = [];
  let lastChange = 0;
  let calmChecks = 0;
  let shrinkResolution = true;
  let shadowFrames = 3;
  function applyPreset(next: PresetName): void {
    preset = all[next];
    resScale = preset.pixelRatio;
    grassScale = preset.grass;
    frameTimes.length = 0;
    calmChecks = 0;
    renderer.setPixelRatio(resScale);
    sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    atmosphere.setShafts(preset.shafts);
    grass.setQuality(fixedBlades ? Number(params.get("blades")) / MAX_BLADES : preset.grass);
    shadowFrames = 3;
    resize();
  }
  applyPreset(preset.name);

  const perf = createPerfOverlay(renderer, () => `preset ${preset.name}  blades ${(grass.drawn() / 1000).toFixed(0)}k  quality ${grass.quality().toFixed(2)}  pixel ratio ${renderer.getPixelRatio().toFixed(2)}`);
  const toggleNight = (): void => {
    atmosphere.toggle();
    ui?.setNight(atmosphere.isNight());
    ui?.toast(atmosphere.isNight() ? "Night" : "Day");
  };
  const choosePreset = (name: PresetName): void => {
    applyPreset(name);
    ui?.setPreset(name);
    ui?.toast(`Quality: ${name}`);
  };
  ui = createUi(
    {
      setTool: (tool) => dig?.setTool(tool),
      setRadius: (v) => {
        if (dig) dig.brush.radius = v;
      },
      setStrength: (v) => {
        if (dig) dig.brush.strength = v;
      },
      setPreset: choosePreset,
      toggleNight,
      toggleStats: () => perf.toggle(),
      resetView: () => rig.reset(),
      undo: () => dig?.undo(),
      resetGround: () => dig?.resetGround(),
      press: (code, down) => rig.press(code, down)
    },
    { tool: "move", radius: dig.brush.radius, strength: dig.brush.strength, preset: preset.name }
  );
  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement) return;
    if (event.code === "KeyN") toggleNight();
    else if (event.code === "F3" || event.code === "KeyP") {
      event.preventDefault();
      perf.toggle();
    } else if (event.code === "KeyG") choosePreset(PRESET_ORDER[(PRESET_ORDER.indexOf(preset.name) + 1) % PRESET_ORDER.length]!);
  });


  // Double-click or double-tap the ground (in Move) to glide the camera there.
  const aimRay = new THREE.Raycaster();
  let lastTap = { t: 0, x: 0, y: 0 };
  let downAt = { t: 0, x: 0, y: 0 };
  canvas.addEventListener("pointerdown", (event) => {
    downAt = { t: performance.now(), x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointerup", (event) => {
    if (dig?.tool() !== "move" || physics.isGrabbed()) return;
    const now = performance.now();
    if (now - downAt.t > 300 || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 10) return;
    if (now - lastTap.t < 350 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 30) {
      const box = canvas.getBoundingClientRect();
      aimRay.setFromCamera(new THREE.Vector2(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1), camera);
      const point = terrain.raycast(aimRay.ray);
      if (point) rig.focus(point);
      lastTap = { t: 0, x: 0, y: 0 };
    } else lastTap = { t: now, x: event.clientX, y: event.clientY };
  });

  // Debug and test hooks.
  const first = props[0]!;
  (window as unknown as Record<string, unknown>).__deskbound = {
    crate: () => ({ p: first.body.position.toArray(), v: first.body.velocity.toArray() }),
    screen: () => {
      const p = first.body.position.clone().project(camera);
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    },
    edit: (kind: "dig" | "fill", x: number, z: number, r: number, n: number) => {
      let rect = { x0: 0, x1: 0, z0: 0, z1: 0 };
      for (let i = 0; i < n; i += 1) rect = terrain.brush(kind, x, z, r, 0.05);
      physics.updateTerrain();
      grass.rebuildRegion(rect, terrain.sample, terrain.delta);
      sun.shadow.needsUpdate = true;
    },
    ground: (x: number, z: number) => terrain.sample(x, z),
    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geoms: renderer.info.memory.geometries, tex: renderer.info.memory.textures }),
    blades: () => grass.drawn(),
    view: () => ({ p: camera.position.toArray(), t: rig.controls.target.toArray() }),
    grabbed: () => physics.isGrabbed(),
    props: () => props.length,
    cam: (p: number[], t: number[]) => {
      camera.position.set(p[0]!, p[1]!, p[2]!);
      rig.controls.target.set(t[0]!, t[1]!, t[2]!);
    }
  };

  const interactors: Interactor[] = props.map((prop) => ({ object: prop.object, push: 0 }));
  const sunView = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const lastPos = props.map((p) => p.body.position.clone());
  const lastQuat = props.map((p) => p.body.quaternion.clone());
  const clock = new THREE.Clock();
  let lastFrame = 0;

  const fps = createFpsCounter();
  renderer.setAnimationLoop((now) => {
    fps.frame(now);
    const dt = clock.getDelta();
    physics.step(dt);
    syncProps(props);

    let moved = shadowFrames > 0 || (dig?.update(dt) ?? false);
    props.forEach((prop, i) => {
      if (prop.body.position.distanceToSquared(lastPos[i]!) > 1e-8 || prop.body.quaternion.angleTo(lastQuat[i]!) > 1e-4) moved = true;
      lastPos[i]!.copy(prop.body.position);
      lastQuat[i]!.copy(prop.body.quaternion);
    });
    if (moved) sun.shadow.needsUpdate = true;
    shadowFrames = Math.max(0, shadowFrames - 1);

    // Keep the shadow map centred on the props so shadows stay sharp on a big table.
    centroid.set(0, 0, 0);
    props.forEach((prop, i) => {
      centroid.add(prop.body.position);
      const clearance = prop.body.position.y - prop.body.size / 2 - terrain.sample(prop.body.position.x, prop.body.position.z);
      interactors[i]!.push = THREE.MathUtils.clamp(1 - clearance / (0.45 * prop.body.size), 0, 1);
    });
    centroid.multiplyScalar(1 / props.length);
    sun.target.position.set(centroid.x, 0, centroid.z);
    sun.position.set(centroid.x + SUN_OFFSET.x, SUN_OFFSET.y, centroid.z + SUN_OFFSET.z);

    atmosphere.update(dt, clock.elapsedTime);
    rig.update(dt);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    sunView.copy(sunDir).transformDirection(camera.matrixWorldInverse);
    grass.update(clock.elapsedTime, interactors, sunView, camera.position);

    renderer.render(scene, camera);
    perf.frame(dt);

    // Adaptive quality, driven by real frame intervals. When frames take too long it lowers the render resolution and the
    // grass amount in turn, in small steps; it only raises them again after several calm seconds, so it doesn't flap.
    if (!fixedBlades) {
      if (lastFrame > 0 && now - lastFrame < 6000) frameTimes.push(now - lastFrame);
      lastFrame = now;
      // Judge after 24 frames, or sooner when frames are so slow that 24 would take seconds.
      if (frameTimes.length >= 24 || (frameTimes.length >= 3 && frameTimes.reduce((s, v) => s + v, 0) > 1500)) {
        const sorted = frameTimes.slice().sort((x, y) => x - y);
        const median = sorted[sorted.length >> 1]!;
        frameTimes.length = 0;
        const since = now - lastChange;
        if (median > 19 && since > 500) {
          calmChecks = 0;
          lastChange = now;
          if (shrinkResolution && resScale > 0.5) resScale = Math.max(0.5, resScale * 0.9);
          else grassScale = Math.max(0.12, grassScale * 0.85);
          shrinkResolution = !shrinkResolution;
          if (Math.abs(renderer.getPixelRatio() - resScale) > 0.02) {
            renderer.setPixelRatio(resScale);
            resize();
          }
          grass.setQuality(grassScale);
        } else if (median < 14.5 && since > 4000) {
          calmChecks += 1;
          if (calmChecks >= 3 && (resScale < preset.pixelRatio || grassScale < preset.grass)) {
            calmChecks = 0;
            lastChange = now;
            if (grassScale < preset.grass) grassScale = Math.min(preset.grass, grassScale * 1.1);
            else resScale = Math.min(preset.pixelRatio, resScale * 1.05);
            if (Math.abs(renderer.getPixelRatio() - resScale) > 0.02) {
              renderer.setPixelRatio(resScale);
              resize();
            }
            grass.setQuality(grassScale);
          }
        } else if (median >= 14.5) calmChecks = 0;
      }
    }
  });
}

void start();
