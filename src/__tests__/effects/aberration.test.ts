import { describe, it, expect } from "bun:test";
import { aberrationFilter } from "../../effects/aberration";

describe("aberrationFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = aberrationFilter("halation_out", { enabled: false, amount: 0.3 });
    expect(result.output).toBe("ab_out");
    expect(result.fragment).toContain("null");
  });

  it("returns fragment with extractplanes and mergeplanes", () => {
    const result = aberrationFilter("halation_out", { enabled: true, amount: 0.3 });
    expect(result.output).toBe("ab_out");
    expect(result.fragment).toContain("[halation_out]");
    expect(result.fragment).toContain("extractplanes=");
    expect(result.fragment).toContain("mergeplanes=");
  });

  it("handles zero amount gracefully", () => {
    const result = aberrationFilter("halation_out", { enabled: true, amount: 0 });
    expect(result.output).toBe("ab_out");
    expect(result.fragment).toContain("format=");
  });
});
