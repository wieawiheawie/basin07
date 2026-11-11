import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { StaticBox } from "./table";

const STEP = 1 / 120;
const GRAVITY = 22;
/** Strongest pull the "hand" can exert, per unit of mass (a 4 kg crate has weight 88, so lifting it is possible but sluggish). */
const MAX_GRAB_FORCE_PER_MASS = 43.75;
const GRAB_STIFFNESS_PER_MASS = 190;
const GRAB_DAMPING_PER_MASS = 19.5;
const LEVEL_STIFFNESS = 26;
const LEVEL_DAMPING = 3;
const UP = new THREE.Vector3(0, 1, 0);
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

/** A dynamic box. Position and rotation are smoothed between physics steps; the objects are reused every frame. */
export interface Body {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly velocity: THREE.Vector3;
  readonly size: number;
  readonly mass: number;
}

export interface BoxOptions {
  size: number;
  mass: number;
  position: [number, number, number];
  euler: [number, number, number];
}

export interface Physics {
  step(dt: number): void;
  addBox(options: BoxOptions): Body;
  beginGrab(body: Body, localPoint: THREE.Vector3): void;
  setGrabTarget(target: THREE.Vector3): void;
  endGrab(): void;
  isGrabbed(): boolean;
  /** Put a body back at its spawn point. */
  respawn(body: Body): void;
}

interface Record {
  body: Body & { position: THREE.Vector3; quaternion: THREE.Quaternion; velocity: THREE.Vector3 };
  rigid: RAPIER.RigidBody;
  options: BoxOptions;
  prevPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  curPos: THREE.Vector3;
  curQuat: THREE.Quaternion;
}

export async function createPhysics(
  terrain: { heightfield: { segments: number; extent: number; heights: Float32Array } },
  boxes: StaticBox[]
): Promise<Physics> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = STEP;
  world.integrationParameters.normalizedAllowedLinearError = 0.0004;

  const hf = terrain.heightfield;
  world.createCollider(
    RAPIER.ColliderDesc.heightfield(hf.segments, hf.segments, hf.heights, { x: hf.extent, y: 1, z: hf.extent })
      .setFriction(0.9)
      .setRestitution(0.05)
  );
  for (const box of boxes) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(box.hx, box.hy, box.hz).setTranslation(box.x, box.y, box.z).setFriction(0.7)
    );
  }

  const records: Record[] = [];
  let accumulator = 0;
  let held: Record | null = null;
  const localPoint = new THREE.Vector3();
  const target = new THREE.Vector3();

  // Scratch objects, reused so stepping never allocates.
  const q = new THREE.Quaternion();
  const offset = new THREE.Vector3();
  const point = new THREE.Vector3();
  const velocityAtPoint = new THREE.Vector3();
  const angular = new THREE.Vector3();
  const force = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const bestAxis = new THREE.Vector3();
  const torque = new THREE.Vector3();
  const euler = new THREE.Euler();

  function spawn(record: Record): void {
    const { position, euler: e } = record.options;
    record.rigid.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
    record.rigid.setRotation(q.setFromEuler(euler.set(e[0], e[1], e[2])), true);
    record.rigid.setLinvel({ x: 0, y: 0, z: 0 }, true);
    record.rigid.setAngvel({ x: 0, y: 0, z: 0 }, true);
    read(record);
    record.prevPos.copy(record.curPos);
    record.prevQuat.copy(record.curQuat);
  }

  function read(record: Record): void {
    const t = record.rigid.translation();
    const r = record.rigid.rotation();
    record.curPos.set(t.x, t.y, t.z);
    record.curQuat.set(r.x, r.y, r.z, r.w);
  }

  function applyGrab(record: Record, dt: number): void {
    const mass = record.body.mass;
    q.copy(record.curQuat);
    offset.copy(localPoint).applyQuaternion(q);
    point.copy(offset).add(record.curPos);

    const lv = record.rigid.linvel();
    const av = record.rigid.angvel();
    angular.set(av.x, av.y, av.z);
    velocityAtPoint.set(lv.x, lv.y, lv.z).add(angular.cross(offset));

    // Hold the body roughly level: torque its nearest face toward world-up, like a hand steadying it.
    let bestDot = -2;
    let bestSign = 1;
    for (const a of AXES) {
      axis.copy(a).applyQuaternion(q);
      for (const sign of [1, -1]) {
        const d = axis.y * sign;
        if (d > bestDot) {
          bestDot = d;
          bestSign = sign;
          bestAxis.copy(axis);
        }
      }
    }
    angular.set(av.x, av.y, av.z);
    torque.copy(bestAxis).multiplyScalar(bestSign).cross(UP).multiplyScalar(LEVEL_STIFFNESS * mass / 4);
    torque.addScaledVector(angular, (-LEVEL_DAMPING * mass) / 4).multiplyScalar(dt);
    record.rigid.applyTorqueImpulse({ x: torque.x, y: torque.y, z: torque.z }, true);

    force.copy(target).sub(point).multiplyScalar(GRAB_STIFFNESS_PER_MASS * mass).addScaledVector(velocityAtPoint, -GRAB_DAMPING_PER_MASS * mass);
    const maxForce = MAX_GRAB_FORCE_PER_MASS * mass;
    if (force.length() > maxForce) force.setLength(maxForce);
    force.multiplyScalar(dt);
    record.rigid.applyImpulseAtPoint(
      { x: force.x, y: force.y, z: force.z },
      { x: point.x, y: point.y, z: point.z },
      true
    );
  }

  return {
    step(dt: number): void {
      accumulator += Math.min(dt, 0.05);
      while (accumulator >= STEP) {
        for (const r of records) {
          r.prevPos.copy(r.curPos);
          r.prevQuat.copy(r.curQuat);
        }
        if (held) applyGrab(held, STEP);
        world.step();
        for (const r of records) read(r);
        accumulator -= STEP;
      }
      // Smooth between the last two physics states so motion stays even on any refresh rate.
      const alpha = accumulator / STEP;
      for (const r of records) {
        if (r.curPos.y < -8) spawn(r);
        r.body.position.lerpVectors(r.prevPos, r.curPos, alpha);
        r.body.quaternion.slerpQuaternions(r.prevQuat, r.curQuat, alpha);
        const v = r.rigid.linvel();
        r.body.velocity.set(v.x, v.y, v.z);
      }
    },
    addBox(options: BoxOptions): Body {
      const rigid = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.12).setAngularDamping(0.9).setCcdEnabled(true)
      );
      const half = options.size / 2;
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(half, half, half)
          .setDensity(options.mass / options.size ** 3)
          .setFriction(0.85)
          .setRestitution(0.12),
        rigid
      );
      const record: Record = {
        body: {
          position: new THREE.Vector3(),
          quaternion: new THREE.Quaternion(),
          velocity: new THREE.Vector3(),
          size: options.size,
          mass: options.mass
        },
        rigid,
        options,
        prevPos: new THREE.Vector3(),
        prevQuat: new THREE.Quaternion(),
        curPos: new THREE.Vector3(),
        curQuat: new THREE.Quaternion()
      };
      spawn(record);
      record.body.position.copy(record.curPos);
      record.body.quaternion.copy(record.curQuat);
      records.push(record);
      return record.body;
    },
    beginGrab(body: Body, point3: THREE.Vector3): void {
      const record = records.find((r) => r.body === body);
      if (!record) return;
      held = record;
      localPoint.copy(point3);
      record.rigid.setAngularDamping(5);
    },
    setGrabTarget(point3: THREE.Vector3): void {
      target.copy(point3);
    },
    endGrab(): void {
      if (!held) return;
      held.rigid.setAngularDamping(0.9);
      const v = held.rigid.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > 12) held.rigid.setLinvel({ x: (v.x / speed) * 12, y: (v.y / speed) * 12, z: (v.z / speed) * 12 }, true);
      held = null;
    },
    isGrabbed: () => held !== null,
    respawn(body: Body): void {
      const record = records.find((r) => r.body === body);
      if (record) spawn(record);
    }
  };
}
