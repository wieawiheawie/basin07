import * as THREE from "three";
import type { Grass } from "./grass";
import type { Physics } from "./physics";
import type { Rect, Terrain } from "./terrain";

export type Tool = "move" | "dig" | "fill";

export interface DigTool {
  tool(): Tool;
  brush: { radius: number; strength: number };
  setTool(tool: Tool): void;
  /** Undo the last dig or fill stroke. */
  undo(): void;
  /** Put the ground back the way it was generated (can be undone). */
  resetGround(): void;
  /** Call every frame. Returns true when the ground changed this frame. */
  update(dt: number): boolean;
}


export function createDigTool(opts: {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  scene: THREE.Scene;
  terrain: Terrain;
  physics: Physics;
  grass: Grass;
  onChange?: (tool: Tool) => void;
  onBrush?: (radius: number) => void;
}): DigTool {
  const { canvas, camera, scene, terrain, physics, grass } = opts;
  let tool: Tool = "move";
  const brushState = { radius: 1.2, strength: 1.6 };
  let keyDig = false;
  let activeId = -1;
  let lastType = "mouse";
  let active = false;
  let pointer: { x: number; y: number } | null = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // Brush ring that hugs the ground, so you can see exactly where and how big the edit is.
  const SEG = 72;
  const ringPositions = new Float32Array(SEG * 2 * 3);
  const ringGeometry = new THREE.BufferGeometry();
  ringGeometry.setAttribute("position", new THREE.BufferAttribute(ringPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const ringIndex: number[] = [];
  for (let i = 0; i < SEG; i += 1) {
    const n = (i + 1) % SEG;
    ringIndex.push(i * 2, i * 2 + 1, n * 2, n * 2, i * 2 + 1, n * 2 + 1);
  }
  ringGeometry.setIndex(ringIndex);
  const ring = new THREE.Mesh(
    ringGeometry,
    new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, depthTest: false, side: THREE.DoubleSide })
  );
  ring.frustumCulled = false;
  ring.renderOrder = 10;
  ring.visible = false;
  scene.add(ring);
  function placeRing(cx: number, cz: number, r: number, pulse: number): void {
    const inner = r * (0.975 - pulse * 0.01);
    for (let i = 0; i < SEG; i += 1) {
      const a = (i / SEG) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const set = (k: number, rad: number): void => {
        const px = cx + c * rad;
        const pz = cz + s * rad;
        ringPositions[k] = px;
        ringPositions[k + 1] = terrain.sample(px, pz) + 0.07;
        ringPositions[k + 2] = pz;
      };
      set(i * 6, inner);
      set(i * 6 + 3, r);
    }
    (ringGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }

  // Flying soil while editing.
  const MAX_SOIL = 220;
  const soil = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.045, 0.045), new THREE.MeshStandardMaterial({ roughness: 1 }), MAX_SOIL);
  soil.frustumCulled = false;
  soil.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(soil);
  const soilPos = new Float32Array(MAX_SOIL * 3);
  const soilVel = new Float32Array(MAX_SOIL * 3);
  const soilLife = new Float32Array(MAX_SOIL);
  const soilColour = new THREE.Color();
  const dummy = new THREE.Object3D();
  let soilNext = 0;
  function emitSoil(x: number, y: number, z: number, r: number, kind: Tool, count: number): void {
    for (let n = 0; n < count; n += 1) {
      const i = soilNext;
      soilNext = (soilNext + 1) % MAX_SOIL;
      const a = Math.random() * Math.PI * 2;
      const rad = Math.random() * r * 0.7;
      const out = 0.3 + Math.random() * 1.1;
      if (kind === "dig") {
        soilPos.set([x + Math.cos(a) * rad, y + 0.05, z + Math.sin(a) * rad], i * 3);
        soilVel.set([Math.cos(a) * out * 0.7, 1.2 + Math.random() * 1.6, Math.sin(a) * out * 0.7], i * 3);
        soilLife[i] = 0.8 + Math.random() * 0.5;
      } else {
        // Fill: soil is tipped in from above.
        soilPos.set([x + Math.cos(a) * rad, y + 1.1 + Math.random() * 0.4, z + Math.sin(a) * rad], i * 3);
        soilVel.set([Math.cos(a) * out * 0.3, -0.5 - Math.random(), Math.sin(a) * out * 0.3], i * 3);
        soilLife[i] = 1.6;
      }
      soilColour.set(kind === "dig" ? "#4a3322" : "#7a5e3c").multiplyScalar(0.75 + Math.random() * 0.5);
      soil.setColorAt(i, soilColour);
    }
    if (soil.instanceColor) soil.instanceColor.needsUpdate = true;
    soilAlive = 1;
  }
  let soilAlive = 0;
  function stepSoil(dt: number): void {
    if (soilAlive === 0) return;
    soilAlive = 0;
    for (let i = 0; i < MAX_SOIL; i += 1) {
      if (soilLife[i]! > 0) {
        soilLife[i] = soilLife[i]! - dt;
        soilAlive += 1;
        soilVel[i * 3 + 1] = soilVel[i * 3 + 1]! - 9 * dt;
        for (let k = 0; k < 3; k += 1) soilPos[i * 3 + k] = soilPos[i * 3 + k]! + soilVel[i * 3 + k]! * dt;
        if (soilPos[i * 3 + 1]! < terrain.sample(soilPos[i * 3]!, soilPos[i * 3 + 2]!)) soilLife[i] = 0;
        dummy.position.set(soilPos[i * 3]!, soilPos[i * 3 + 1]!, soilPos[i * 3 + 2]!);
        dummy.scale.setScalar(Math.min(1, soilLife[i]! * 3));
        dummy.rotation.set(soilLife[i]! * 9, soilLife[i]! * 7, 0);
      } else {
        dummy.position.set(0, -50, 0);
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      soil.setMatrixAt(i, dummy.matrix);
    }
    soil.instanceMatrix.needsUpdate = true;
  }

  const history: Float32Array[] = [];
  const everything = { x0: -100, x1: 100, z0: -100, z1: 100 };
  let pendingChange = false;
  function applyWhole(): void {
    physics.updateTerrain();
    grass.rebuildRegion(everything, terrain.sample, terrain.delta);
    pendingChange = true;
  }
  function undo(): void {
    const previous = history.pop();
    if (!previous) return;
    terrain.restore(previous);
    applyWhole();
  }
  function resetGround(): void {
    history.push(terrain.snapshot());
    terrain.reset();
    applyWhole();
  }

  let lastHit: THREE.Vector3 | null = null;
  let emitCarry = 0;
  let inverted = false;
  let ringKind: Tool = "move";

  const colours: Record<Tool, string> = { move: "#ffffff", dig: "#ffb066", fill: "#9be37e" };

  /** Hold Alt to flip between digging and filling. */
  const effective = (): Tool => (tool === "move" ? "move" : inverted ? (tool === "dig" ? "fill" : "dig") : tool);

  function setTool(next: Tool): void {
    tool = next;
    active = false;
    ring.visible = false;
    ringKind = "move";
    if (next === "dig" || next === "fill") soil.visible = true;
    canvas.classList.toggle("dig", next === "dig");
    canvas.classList.toggle("fill", next === "fill");
    opts.onChange?.(next);
  }

  function aim(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  const dirty: Rect = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  let hasDirty = false;
  let sincePhysics = 0;
  let physicsStale = false;

  canvas.addEventListener(
    "pointerdown",
    (event) => {
      // A second finger means the player wants to look around: stop digging and let the camera take over.
      if (active && event.pointerId !== activeId) {
        active = false;
        return;
      }
      if (tool === "move" || event.button !== 0 || event.shiftKey) return;
      event.stopImmediatePropagation();
      canvas.setPointerCapture(event.pointerId);
      lastType = event.pointerType;
      inverted = event.altKey;
      activeId = event.pointerId;
      aim(event);
      active = true;
    },
    true
  );
  canvas.addEventListener("pointermove", (event) => {
    if (tool !== "move") {
      lastType = event.pointerType;
      aim(event);
    }
  });
  const stop = (): void => {
    active = false;
  };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("pointerleave", () => {
    if (!active) ring.visible = false;
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Alt") inverted = true;
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ" && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      undo();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement) return;
    if (event.code === "Space" || event.code === "Enter") {
      // Hold Space to dig at the pointer, so no click is needed (trackpads, keyboards).
      if (tool !== "move" && !(target instanceof HTMLButtonElement)) {
        keyDig = true;
        event.preventDefault();
      }
    } else if (event.code === "Digit1") setTool("move");
    else if (event.code === "Digit2") setTool(tool === "dig" ? "move" : "dig");
    else if (event.code === "Digit3") setTool(tool === "fill" ? "move" : "fill");
    else if (event.code === "KeyT") setTool(tool === "move" ? "dig" : tool === "dig" ? "fill" : "move");
    else if (event.code === "BracketLeft" || event.code === "BracketRight") {
      brushState.radius = Math.min(4, Math.max(0.5, brushState.radius + (event.code === "BracketLeft" ? -0.25 : 0.25)));
      opts.onBrush?.(brushState.radius);
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.key === "Alt") inverted = false;
    if (event.code === "Space" || event.code === "Enter") keyDig = false;
  });
  window.addEventListener("blur", () => {
    keyDig = false;
    inverted = false;
  });

  return {
    tool: () => tool,
    brush: brushState,
    setTool,
    undo,
    resetGround,
    update(dt: number): boolean {
      let changed = pendingChange;
      pendingChange = false;
      const digging = active || keyDig;
      const kind = effective();
      if (!digging) lastHit = null;
      if (kind !== "move") {
        if (kind !== ringKind) {
          ringKind = kind;
          (ring.material as THREE.MeshBasicMaterial).color.set(colours[kind]);
        }
        const rect = canvas.getBoundingClientRect();
        // With no pointer yet (keyboard only) aim at the middle of the view.
        const at = pointer ?? { x: rect.width / 2, y: rect.height / 2 };
        ndc.set((at.x / rect.width) * 2 - 1, -(at.y / rect.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = terrain.raycast(ray.ray);
        ring.visible = hit !== null && (lastType !== "touch" || active);
        if (hit) {
          placeRing(hit.x, hit.z, brushState.radius, digging ? 1 : 0);
          if (digging) {
            if (!lastHit) {
              history.push(terrain.snapshot());
              if (history.length > 24) history.shift();
            }
            // Stamp along the path since last frame so a fast drag cuts a smooth trench, not a row of dots.
            // The same amount of digging is spread over the stamps, so moving quickly cuts shallower than lingering.
            const from = lastHit ?? hit;
            const n = Math.min(6, Math.max(1, Math.ceil(Math.hypot(hit.x - from.x, hit.z - from.z) / (brushState.radius * 0.3))));
            const amount = (brushState.strength * Math.min(dt, 0.05)) / n;
            const r = terrain.stroke(kind, from.x, from.z, hit.x, hit.z, n, brushState.radius, amount);
            dirty.x0 = Math.min(dirty.x0, r.x0);
            dirty.x1 = Math.max(dirty.x1, r.x1);
            dirty.z0 = Math.min(dirty.z0, r.z0);
            dirty.z1 = Math.max(dirty.z1, r.z1);
            hasDirty = true;
            physicsStale = true;
            changed = true;
            lastHit = hit;
            emitCarry += dt * 26 * Math.min(2, brushState.radius);
            const count = Math.floor(emitCarry);
            emitCarry -= count;
            emitSoil(hit.x, terrain.sample(hit.x, hit.z), hit.z, brushState.radius, kind, count);
          }
        }
      }
      stepSoil(dt);
      sincePhysics += dt;
      // Collider and grass updates are throttled while editing and flushed once the stroke ends.
      if ((physicsStale || hasDirty) && (!(active || keyDig) || sincePhysics > 0.1)) {
        if (physicsStale) physics.updateTerrain();
        if (hasDirty) grass.rebuildRegion(dirty, terrain.sample, terrain.delta);
        physicsStale = false;
        hasDirty = false;
        dirty.x0 = dirty.z0 = Infinity;
        dirty.x1 = dirty.z1 = -Infinity;
        sincePhysics = 0;
      }
      return changed || physicsStale;
    }
  };
}
