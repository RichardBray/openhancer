import { describe, it, expect } from "bun:test";
import { weaveFilter } from "../../effects/weave";

describe("weaveFilter", () => {
  it("returns fragment with crop and scale for drift", () => {
    const result = weaveFilter("ab_out", { strength: 0.3 });
    expect(result.output).toBe("weave_out");
    expect(result.fragment).toContain("[ab_out]");
    expect(result.fragment).toContain("crop=");
    expect(result.fragment).toContain("scale=");
  });

  it("uses sine-based expressions with prime periods", () => {
    const result = weaveFilter("ab_out", { strength: 0.5 });
    expect(result.fragment).toContain("sin(");
    expect(result.fragment).toContain("37");
    expect(result.fragment).toContain("53");
  });

  it("handles zero strength", () => {
    const result = weaveFilter("ab_out", { strength: 0.0 });
    expect(result.output).toBe("weave_out");
  });
});
