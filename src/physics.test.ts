import { describe, expect, it } from "vitest";
import { createPhysics } from "./physics";
import { createTerrain, groundHeight } from "./terrain";

describe("physics", () => {
  it("settles the crate flush on the heightfield", async () => {
    const physics = await createPhysics(createTerrain(), []);
    for (let i = 0; i < 600; i += 1) physics.step(1 / 60);
    const { position, velocity } = physics.crate();
    expect(velocity.length()).toBeLessThan(0.05);
    // Resting height of a tilted-then-settled cube depends on which face it lies on, so allow for that.
    const clearance = position.y - 0.5 - groundHeight(position.x, position.z);
    expect(clearance).toBeGreaterThan(-0.05);
    expect(clearance).toBeLessThan(0.12);
  });
});
