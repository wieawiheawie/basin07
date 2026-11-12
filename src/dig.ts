import * as THREE from "three";
import type { Grass } from "./grass";
import type { Physics } from "./physics";
import type { Rect, Terrain } from "./terrain";

export type Tool = "move" | "dig" | "fill";

export interface DigTool {
  tool(): Tool;
  brush: { radius: number; strength: number };
  setTool(tool: Tool): void;
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

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1, 48),
    new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, depthTest: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 10;
  ring.visible = false;
  scene.add(ring);

  const colours: Record<Tool, string> = { move: "#ffffff", dig: "#ffb066", fill: "#8fe07a" };

  function setTool(next: Tool): void {
    tool = next;
    active = false;
    ring.visible = false;
    (ring.material as THREE.MeshBasicMaterial).color.set(colours[next]);
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
    else if (event.code === "BracketLeft" || event.code === "BracketRight") {
      brushState.radius = Math.min(4, Math.max(0.5, brushState.radius + (event.code === "BracketLeft" ? -0.25 : 0.25)));
      opts.onBrush?.(brushState.radius);
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space" || event.code === "Enter") keyDig = false;
  });
  window.addEventListener("blur", () => {
    keyDig = false;
  });

  return {
    tool: () => tool,
    brush: brushState,
    setTool,
    update(dt: number): boolean {
      let changed = false;
      const digging = active || keyDig;
      if (tool !== "move") {
        const rect = canvas.getBoundingClientRect();
        // With no pointer yet (keyboard only) aim at the middle of the view.
        const at = pointer ?? { x: rect.width / 2, y: rect.height / 2 };
        ndc.set((at.x / rect.width) * 2 - 1, -(at.y / rect.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = terrain.raycast(ray.ray);
        ring.visible = hit !== null && (lastType !== "touch" || active);
        if (hit) {
          ring.position.set(hit.x, hit.y + 0.06, hit.z);
          ring.scale.setScalar(brushState.radius);
          if (digging) {
            const r = terrain.brush(tool, hit.x, hit.z, brushState.radius, brushState.strength * Math.min(dt, 0.05));
            dirty.x0 = Math.min(dirty.x0, r.x0);
            dirty.x1 = Math.max(dirty.x1, r.x1);
            dirty.z0 = Math.min(dirty.z0, r.z0);
            dirty.z1 = Math.max(dirty.z1, r.z1);
            hasDirty = true;
            physicsStale = true;
            changed = true;
          }
        }
      }
      sincePhysics += dt;
      // Collider rebuilds are throttled while digging and flushed once the drag ends.
      if (physicsStale && (!(active || keyDig) || sincePhysics > 0.1)) {
        physics.updateTerrain();
        physicsStale = false;
        sincePhysics = 0;
      }
      if (hasDirty && !(active || keyDig)) {
        grass.rebuildRegion(dirty, terrain.sample, terrain.delta);
        dirty.x0 = dirty.z0 = Infinity;
        dirty.x1 = dirty.z1 = -Infinity;
        hasDirty = false;
      }
      return changed || physicsStale;
    }
  };
}
