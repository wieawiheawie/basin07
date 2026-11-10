import * as THREE from "three";
import { createWoodTexture, scaleBoxUV } from "./wood";

export interface StaticBox {
  x: number; y: number; z: number;
  hx: number; hy: number; hz: number;
}

export interface Table {
  group: THREE.Group;
  boxes: StaticBox[];
}

/**
 * The tabletop surface is y = 0. A raised rim keeps everything on the table;
 * the ground (see terrain.ts) fills the inside of the rim.
 */
export function createTable(): Table {
  const group = new THREE.Group();
  const boxes: StaticBox[] = [];
  const texture = createWoodTexture(11, [118, 78, 44], 9);
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.72, metalness: 0 });

  const add = (width: number, height: number, depth: number, x: number, y: number, z: number, collide: boolean): void => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    scaleBoxUV(geometry, 4);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) boxes.push({ x, y, z, hx: width / 2, hy: height / 2, hz: depth / 2 });
  };

  add(11, 0.4, 11, 0, -0.2, 0, true);          // top slab
  add(11, 0.7, 0.5, 0, 0.35, -5.25, true);     // rim, back
  add(11, 0.7, 0.5, 0, 0.35, 5.25, true);      // rim, front
  add(0.5, 0.7, 10, -5.25, 0.35, 0, true);     // rim, left
  add(0.5, 0.7, 10, 5.25, 0.35, 0, true);      // rim, right
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) add(0.55, 4, 0.55, sx * 4.8, -2.4, sz * 4.8, false); // legs
  }
  return { group, boxes };
}
