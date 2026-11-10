import * as THREE from "three";
import { createWoodTexture, scaleBoxUV } from "./wood";

/** Edge length of the crate (and of its physics cuboid). */
export const CRATE_SIZE = 1;

export function createCrate(): THREE.Group {
  const group = new THREE.Group();
  const planks = new THREE.MeshStandardMaterial({
    map: createWoodTexture(5, [176, 130, 80], 5), roughness: 0.8, metalness: 0
  });
  const frame = new THREE.MeshStandardMaterial({
    map: createWoodTexture(9, [128, 88, 50], 3), roughness: 0.78, metalness: 0
  });

  const box = (w: number, h: number, d: number, material: THREE.Material): THREE.Mesh => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    scaleBoxUV(geometry, 1.2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const s = CRATE_SIZE;
  const t = 0.1;
  group.add(box(s - 0.04, s - 0.04, s - 0.04, planks));

  // Twelve edge boards.
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      const o = (s - t) / 2;
      const x = box(s, t, t, frame); x.position.set(0, a * o, b * o); group.add(x);
      const y = box(t, s, t, frame); y.position.set(a * o, 0, b * o); group.add(y);
      const z = box(t, t, s, frame); z.position.set(a * o, b * o, 0); group.add(z);
    }
  }

  // Diagonal braces on all six faces.
  const brace = Math.SQRT2 * (s - 2 * t) * 0.98;
  for (const sign of [-1, 1]) {
    const front = box(0.09, brace, 0.04, frame);
    front.position.set(0, 0, sign * (s / 2 - 0.01));
    front.rotation.z = Math.PI / 4;
    group.add(front);
    const side = box(0.04, brace, 0.09, frame);
    side.position.set(sign * (s / 2 - 0.01), 0, 0);
    side.rotation.x = Math.PI / 4;
    group.add(side);
    const top = box(0.09, 0.04, brace, frame);
    top.position.set(0, sign * (s / 2 - 0.01), 0);
    top.rotation.y = Math.PI / 4;
    group.add(top);
  }
  return group;
}
