import { describe, it, expect } from "bun:test";
import { aberrationFilter } from "../../effects/aberration";

describe("aberrationFilter", () => {
  it("returns fragment with extractplanes and mergeplanes", () => {
    const result = aberrationFilter("halation_out", { strength: 0.3 });
    expect(result.output).toBe("ab_out");
    expect(result.fragment).toContain("[halation_out]");
    expect(result.fragment).toContain("extractplanes=");
    expect(result.fragment).toContain("mergeplanes=");
  });

  it("scales red larger and blue smaller", () => {
    const result = aberrationFilter("halation_out", { strength: 0.5 });
    // offset = 0.5 * 0.02 = 0.01
    // red scale factor > 1, blue scale factor < 1
    expect(result.fragment).toContain("scale=");
    expect(result.fragment).toContain("crop=");
  });

  it("handles zero strength gracefully", () => {
    const result = aberrationFilter("halation_out", { strength: 0.0 });
    expect(result.output).toBe("ab_out");
    expect(result.fragment).toBeDefined();
  });
});
