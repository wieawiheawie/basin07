import * as THREE from "three";
import { createCrate } from "./crate";
import type { Body, Physics } from "./physics";

export interface Prop {
  object: THREE.Group;
  body: Body;
}

const SPECS = [
  { size: 1, position: [-0.6, 3.2, 0.4], euler: [0.5, 0.7, 0.25] },
  { size: 0.7, position: [1.4, 4.6, -0.9], euler: [0.2, 1.1, 0.6] },
  { size: 1.35, position: [-3, 5.4, 1.8], euler: [0.9, 0.1, 0.3] },
  { size: 0.85, position: [2.6, 6.4, 2.2], euler: [0.4, 0.4, 0.9] }
] as const;

export const MAX_PROPS = SPECS.length;

/** Spawn up to MAX_PROPS crates. Each is a mesh plus a physics box; add new kinds here. */
export function createProps(scene: THREE.Scene, physics: Physics, count: number): Prop[] {
  const props: Prop[] = [];
  for (const spec of SPECS.slice(0, Math.max(1, Math.min(count, MAX_PROPS)))) {
    const object = createCrate();
    object.scale.setScalar(spec.size);
    const body = physics.addBox({
      size: spec.size,
      mass: 4 * spec.size ** 3,
      position: [...spec.position],
      euler: [...spec.euler]
    });
    scene.add(object);
    props.push({ object, body });
  }
  return props;
}

/** Copy each body's smoothed pose onto its mesh. */
export function syncProps(props: Prop[]): void {
  for (const { object, body } of props) {
    object.position.copy(body.position);
    object.quaternion.copy(body.quaternion);
  }
}
