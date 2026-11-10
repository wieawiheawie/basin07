import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { CRATE_SIZE } from "./crate";
import type { StaticBox } from "./table";

const STEP = 1 / 120;
const GRAVITY = 22;
const CRATE_MASS = 4;
/** Strongest pull the "hand" can exert. Crate weight is CRATE_MASS * GRAVITY = 88, so lifting it is possible but sluggish. */
const MAX_GRAB_FORCE = 175;
const GRAB_STIFFNESS = 760;
const GRAB_DAMPING = 78;

export interface CrateState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  velocity: THREE.Vector3;
}

export interface Physics {
  step(dt: number): void;
  crate(): CrateState;
  beginGrab(localPoint: THREE.Vector3): void;
  setGrabTarget(target: THREE.Vector3): void;
  endGrab(): void;
  isGrabbed(): boolean;
  reset(): void;
}

export async function createPhysics(
  terrain: { positions: Float32Array; indices: Uint32Array },
  boxes: StaticBox[]
): Promise<Physics> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = STEP;

  world.createCollider(
    RAPIER.ColliderDesc.trimesh(terrain.positions, terrain.indices).setFriction(0.9).setRestitution(0.05)
  );
  for (const box of boxes) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(box.hx, box.hy, box.hz).setTranslation(box.x, box.y, box.z).setFriction(0.7)
    );
  }

  const spawn = (): void => {
    body.setTranslation({ x: -0.6, y: 3.2, z: 0.4 }, true);
    body.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.7, 0.25)), true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  };

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.12).setAngularDamping(0.9).setCcdEnabled(true)
  );
  const half = CRATE_SIZE / 2;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(half, half, half)
      .setDensity(CRATE_MASS / (CRATE_SIZE ** 3))
      .setFriction(0.85)
      .setRestitution(0.12),
    body
  );
  spawn();

  let accumulator = 0;
  let grabbed = false;
  const localPoint = new THREE.Vector3();
  const target = new THREE.Vector3();
  const scratchQuat = new THREE.Quaternion();
  const scratchPoint = new THREE.Vector3();
  const scratchForce = new THREE.Vector3();
  const scratchVel = new THREE.Vector3();
  const scratchAng = new THREE.Vector3();

  function applyGrab(dt: number): void {
    const t = body.translation();
    const q = body.rotation();
    scratchQuat.set(q.x, q.y, q.z, q.w);
    scratchPoint.copy(localPoint).applyQuaternion(scratchQuat);
    const offset = scratchPoint.clone();
    scratchPoint.add(new THREE.Vector3(t.x, t.y, t.z));

    const lv = body.linvel();
    const av = body.angvel();
    scratchAng.set(av.x, av.y, av.z);
    scratchVel.set(lv.x, lv.y, lv.z).add(scratchAng.cross(offset));

    scratchForce.copy(target).sub(scratchPoint).multiplyScalar(GRAB_STIFFNESS).addScaledVector(scratchVel, -GRAB_DAMPING);
    if (scratchForce.length() > MAX_GRAB_FORCE) scratchForce.setLength(MAX_GRAB_FORCE);
    scratchForce.multiplyScalar(dt);
    body.applyImpulseAtPoint(
      { x: scratchForce.x, y: scratchForce.y, z: scratchForce.z },
      { x: scratchPoint.x, y: scratchPoint.y, z: scratchPoint.z },
      true
    );
  }

  return {
    step(dt: number): void {
      accumulator += Math.min(dt, 0.05);
      while (accumulator >= STEP) {
        if (grabbed) applyGrab(STEP);
        world.step();
        accumulator -= STEP;
      }
      if (body.translation().y < -8) spawn();
    },
    crate(): CrateState {
      const t = body.translation();
      const q = body.rotation();
      const v = body.linvel();
      return {
        position: new THREE.Vector3(t.x, t.y, t.z),
        quaternion: new THREE.Quaternion(q.x, q.y, q.z, q.w),
        velocity: new THREE.Vector3(v.x, v.y, v.z)
      };
    },
    beginGrab(point: THREE.Vector3): void {
      localPoint.copy(point);
      grabbed = true;
      body.setAngularDamping(5);
    },
    setGrabTarget(point: THREE.Vector3): void {
      target.copy(point);
    },
    endGrab(): void {
      grabbed = false;
      body.setAngularDamping(0.9);
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > 12) body.setLinvel({ x: (v.x / speed) * 12, y: (v.y / speed) * 12, z: (v.z / speed) * 12 }, true);
    },
    isGrabbed: () => grabbed,
    reset: spawn
  };
}
