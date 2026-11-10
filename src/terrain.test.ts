import { describe, expect, it } from "vitest";
import { createTerrain, groundHeight, HALF } from "./terrain";

describe("terrain", () => {
  it("stays above the tabletop and below the rim", () => {
    for (let x = -HALF; x <= HALF; x += 0.25) {
      for (let z = -HALF; z <= HALF; z += 0.25) {
        const h = groundHeight(x, z);
        expect(h).toBeGreaterThan(0.05);
        expect(h).toBeLessThan(0.6);
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
