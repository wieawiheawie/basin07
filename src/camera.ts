import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface CameraRig {
  controls: OrbitControls;
  update(dt: number): void;
  reset(): void;
  /** Press or release a virtual key (used by the on-screen camera pad). */
  press(code: string, down: boolean): void;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Orbit camera that works with a mouse, a trackpad, a touch screen or just a keyboard.
 *  - Drag the ground: orbit. Shift+drag, right-drag or two-finger drag: move. Scroll or pinch: zoom to cursor.
 *  - W A S D / arrows: move. Q E: orbit. R F: tilt. Z X (or + -): zoom. Shift: faster. V or Home: reset view.
 */
export function createCameraRig(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, limit: number): CameraRig {
  const home = { position: camera.position.clone(), target: new THREE.Vector3(0, 0.3, 0) };
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(home.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;
  controls.rotateSpeed = 0.8;
  controls.minDistance = 3;
  controls.maxDistance = 90;
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = 1.45;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  const keys = new Set<string>();
  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement) return;
    if (event.code === "KeyV" || event.code === "Home") {
      reset();
      return;
    }
    keys.add(event.code);
    if (event.code.startsWith("Arrow")) event.preventDefault();
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("blur", () => keys.clear());

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const spherical = new THREE.Spherical();
  const down = (...codes: string[]): number => (codes.some((c) => keys.has(c)) ? 1 : 0);

  function clampTarget(): void {
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -limit, limit);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -limit, limit);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, 4);
  }

  function reset(): void {
    camera.position.copy(home.position);
    controls.target.copy(home.target);
    controls.update();
  }

  return {
    controls,
    reset,
    press(code: string, down: boolean): void {
      if (down) keys.add(code);
      else keys.delete(code);
    },
    update(rawDt: number): void {
      const dt = Math.min(rawDt, 0.1);
      offset.copy(camera.position).sub(controls.target);
      const dist = offset.length();
      const fast = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 2.2 : 1;

      const moveForward = down("KeyW", "ArrowUp") - down("KeyS", "ArrowDown");
      const moveRight = down("KeyD", "ArrowRight") - down("KeyA", "ArrowLeft");
      if (moveForward !== 0 || moveRight !== 0) {
        forward.copy(offset).multiplyScalar(-1).setY(0).normalize();
        right.crossVectors(forward, UP);
        const step = Math.max(5, dist * 0.9) * fast * dt;
        const before = controls.target.clone();
        controls.target.addScaledVector(forward, moveForward * step).addScaledVector(right, moveRight * step);
        clampTarget();
        camera.position.add(controls.target.clone().sub(before));
      }

      const orbit = down("KeyE") - down("KeyQ");
      const tilt = down("KeyF") - down("KeyR");
      const zoom = down("KeyX", "Minus", "NumpadSubtract") - down("KeyZ", "Equal", "NumpadAdd");
      if (orbit !== 0 || tilt !== 0 || zoom !== 0) {
        offset.copy(camera.position).sub(controls.target);
        spherical.setFromVector3(offset);
        spherical.theta -= orbit * 1.5 * dt * fast;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi + tilt * 0.9 * dt, controls.minPolarAngle, controls.maxPolarAngle);
        spherical.radius = THREE.MathUtils.clamp(spherical.radius * (1 + zoom * 1.1 * dt * fast), controls.minDistance, controls.maxDistance);
        offset.setFromSpherical(spherical);
        camera.position.copy(controls.target).add(offset);
      }

      controls.update();
      clampTarget();
    }
  };
}
