import * as THREE from "three";
import type { Physics } from "./physics";
import type { Prop } from "./props";

const LIFT = 0.8;

/** Dragging a prop with a spring "hand". Grabbing takes priority over orbiting the camera. */
export function setupGrab(opts: { canvas: HTMLCanvasElement; camera: THREE.Camera; physics: Physics; props: Prop[]; limit: number; enabled?: () => boolean }): void {
  const { canvas, camera, physics, props, limit } = opts;
  const active = (): boolean => opts.enabled?.() ?? true;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const target = new THREE.Vector3();
  const objects = props.map((p) => p.object);

  function aim(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  function propAt(): { prop: Prop; point: THREE.Vector3 } | null {
    const first = raycaster.intersectObjects(objects, true)[0];
    if (!first) return null;
    let o: THREE.Object3D | null = first.object;
    while (o && !objects.includes(o as THREE.Group)) o = o.parent;
    const prop = props.find((p) => p.object === o);
    return prop ? { prop, point: first.point } : null;
  }

  function updateTarget(): void {
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    target.set(THREE.MathUtils.clamp(hit.x, -limit, limit), -plane.constant, THREE.MathUtils.clamp(hit.z, -limit, limit));
    physics.setGrabTarget(target);
  }

  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || !active()) return;
      aim(event);
      const found = propAt();
      if (!found) return;
      event.stopImmediatePropagation();
      canvas.setPointerCapture(event.pointerId);
      plane.constant = -(found.point.y + LIFT);
      // Grab point in the body's own frame, in metres (the mesh is scaled to the body size).
      const local = found.prop.object.worldToLocal(found.point.clone()).multiplyScalar(found.prop.body.size);
      physics.beginGrab(found.prop.body, local);
      updateTarget();
      canvas.style.cursor = "grabbing";
    },
    { capture: true }
  );

  canvas.addEventListener("pointermove", (event) => {
    aim(event);
    if (physics.isGrabbed()) updateTarget();
    else if (active()) canvas.style.cursor = propAt() ? "grab" : "default";
  });

  const release = (): void => {
    if (!physics.isGrabbed()) return;
    physics.endGrab();
    canvas.style.cursor = "default";
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
}
