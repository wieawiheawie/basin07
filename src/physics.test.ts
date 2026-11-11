import { describe, expect, it } from "vitest";
import { createPhysics } from "./physics";
import { createTerrain, groundHeight } from "./terrain";

describe("physics", () => {
  it("settles boxes flush on the heightfield without sinking through each other", async () => {
    const physics = await createPhysics(createTerrain(), []);
    const a = physics.addBox({ size: 1, mass: 4, position: [-0.6, 3.2, 0.4], euler: [0.5, 0.7, 0.25] });
    const b = physics.addBox({ size: 0.7, mass: 1.4, position: [-0.5, 5.6, 0.5], euler: [0.2, 1.1, 0.6] });
    for (let i = 0; i < 900; i += 1) physics.step(1 / 60);
    for (const body of [a, b]) {
      expect(body.velocity.length()).toBeLessThan(0.08);
      const clearance = body.position.y - body.size / 2 - groundHeight(body.position.x, body.position.z);
      expect(clearance).toBeGreaterThan(-0.05);
    }
    // Two solid boxes never overlap on all three axes at once (loose check on centres).
    expect(a.position.distanceTo(b.position)).toBeGreaterThan(0.5);
  });

  it("holds a grabbed box near the target", async () => {
    const physics = await createPhysics(createTerrain(), []);
    const box = physics.addBox({ size: 1, mass: 4, position: [0, 2, 0], euler: [0, 0, 0] });
    for (let i = 0; i < 300; i += 1) physics.step(1 / 60);
    physics.beginGrab(box, box.position.clone().sub(box.position));
    physics.setGrabTarget(box.position.clone().add({ x: 0, y: 1, z: 0 } as never));
    const startY = box.position.y;
    for (let i = 0; i < 120; i += 1) physics.step(1 / 60);
    expect(physics.isGrabbed()).toBe(true);
    expect(box.position.y).toBeGreaterThan(startY + 0.5);
    physics.endGrab();
    expect(physics.isGrabbed()).toBe(false);
  });
});
