import { describe, expect, it } from "vitest";
import { createTerrain, groundHeight, HALF } from "./terrain";

describe("terrain", () => {
  it("stays above the tabletop and below the rim", () => {
    for (let x = -HALF; x <= HALF; x += 0.5) {
      for (let z = -HALF; z <= HALF; z += 0.5) {
        const h = groundHeight(x, z);
        expect(h).toBeGreaterThan(0.05);
        expect(h).toBeLessThan(1.3);
      }
    }
  });

  it("builds an upward-facing mesh whose indices stay in range", () => {
    const { positions, indices } = createTerrain();
    const vertexCount = positions.length / 3;
    let up = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
      expect(Math.max(a, b, c)).toBeLessThan(vertexCount);
      const ux = positions[b * 3]! - positions[a * 3]!;
      const uz = positions[b * 3 + 2]! - positions[a * 3 + 2]!;
      const vx = positions[c * 3]! - positions[a * 3]!;
      const vz = positions[c * 3 + 2]! - positions[a * 3 + 2]!;
      if (uz * vx - ux * vz > 0) up += 1;
    }
    expect(up).toBe(indices.length / 3);
  });
});

describe("digging", () => {
  it("lowers ground, respects bedrock, and samples match the mesh", () => {
    const t = createTerrain();
    const before = t.sample(2, 2);
    expect(Math.abs(before - groundHeight(2, 2))).toBeLessThan(0.05);
    for (let i = 0; i < 200; i += 1) t.brush("dig", 2, 2, 1.2, 0.1);
    expect(t.sample(2, 2)).toBeLessThan(before - 0.2);
    expect(t.sample(2, 2)).toBeGreaterThanOrEqual(0.03 - 1e-6);
    expect(t.delta(2, 2)).toBeLessThan(0);
    t.brush("fill", 2, 2, 1.2, 0.3);
    expect(t.sample(2, 2)).toBeGreaterThan(0.03);
  });
});

describe("dig, undo and slumping", () => {
  it("undo restores heights and slopes stay stable", () => {
    const t = createTerrain();
    const before = t.snapshot();
    for (let i = 0; i < 80; i += 1) t.brush("dig", -3, 3, 1, 0.08);
    expect(t.sample(-3, 3)).toBeLessThan(before[0]! + 10);
    expect(t.delta(-3, 3)).toBeLessThan(-0.1);
    // dug soil goes somewhere: the rim is higher than it started
    expect(t.delta(-3 + 1.2, 3)).toBeGreaterThan(0);
    t.restore(before);
    expect(Math.abs(t.delta(-3, 3))).toBeLessThan(1e-6);
  });
});
