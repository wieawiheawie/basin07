import * as THREE from "three";
import type { Grass } from "./grass";
import type { Physics } from "./physics";
import type { Rect, Terrain } from "./terrain";

export type Tool = "move" | "dig" | "fill";

export interface DigTool {
  tool(): Tool;
  setTool(tool: Tool): void;
  /** Call every frame. Returns true when the ground changed this frame. */
  update(dt: number): boolean;
}

const RATE = 1.6; // height change per second at the brush centre

export function createDigTool(opts: {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  scene: THREE.Scene;
  terrain: Terrain;
  physics: Physics;
  grass: Grass;
  onChange?: (tool: Tool) => void;
}): DigTool {
  const { canvas, camera, scene, terrain, physics, grass } = opts;
  let tool: Tool = "move";
  let radius = 1.2;
  let spaceHeld = false;
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
    canvas.style.cursor = next === "move" ? "default" : "none";
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
      if (tool === "move" || event.button !== 0 || spaceHeld) return;
      event.stopImmediatePropagation();
      canvas.setPointerCapture(event.pointerId);
      aim(event);
      active = true;
    },
    true
  );
  canvas.addEventListener("pointermove", (event) => {
    if (tool !== "move") aim(event);
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
    if (event.code === "Space") {
      spaceHeld = true;
      event.preventDefault();
    } else if (event.code === "Digit1") setTool("move");
    else if (event.code === "Digit2") setTool(tool === "dig" ? "move" : "dig");
    else if (event.code === "Digit3") setTool(tool === "fill" ? "move" : "fill");
    else if (event.code === "BracketLeft") radius = Math.max(0.5, radius - 0.25);
    else if (event.code === "BracketRight") radius = Math.min(4, radius + 0.25);
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") spaceHeld = false;
  });

  return {
    tool: () => tool,
    setTool,
    update(dt: number): boolean {
      let changed = false;
      if (tool !== "move" && pointer) {
        const rect = canvas.getBoundingClientRect();
        ndc.set((pointer.x / rect.width) * 2 - 1, -(pointer.y / rect.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = spaceHeld ? null : terrain.raycast(ray.ray);
        ring.visible = hit !== null;
        if (hit) {
          ring.position.set(hit.x, hit.y + 0.06, hit.z);
          ring.scale.setScalar(radius);
          if (active) {
            const r = terrain.brush(tool, hit.x, hit.z, radius, RATE * Math.min(dt, 0.05));
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
      if (physicsStale && (!active || sincePhysics > 0.1)) {
        physics.updateTerrain();
        physicsStale = false;
        sincePhysics = 0;
      }
      if (hasDirty && !active) {
        grass.rebuildRegion(dirty, terrain.sample, terrain.delta);
        dirty.x0 = dirty.z0 = Infinity;
        dirty.x1 = dirty.z1 = -Infinity;
        hasDirty = false;
      }
      return changed || physicsStale;
    }
  };
}
