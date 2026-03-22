import { describe, it, expect } from "bun:test";
import { gradeFilter } from "../../effects/grade";

describe("gradeFilter", () => {
  it("returns a filter fragment with correct input/output labels", () => {
    const result = gradeFilter("0:v", {
      liftBlacks: 0.05,
      crushWhites: 0.04,
      shadowTint: "warm",
      highlightTint: "cool",
      fade: 0.15,
    });
    expect(result.output).toBe("graded");
    expect(result.fragment).toContain("[0:v]");
    expect(result.fragment).toContain("[graded]");
    expect(result.fragment).toContain("curves=");
  });

  it("includes eq filter for fade/contrast", () => {
    const result = gradeFilter("0:v", {
      liftBlacks: 0.05,
      crushWhites: 0.04,
      shadowTint: "neutral",
      highlightTint: "neutral",
      fade: 0.3,
    });
    expect(result.fragment).toContain("eq=");
    expect(result.fragment).toContain("contrast=");
  });

  it("accepts custom input label", () => {
    const result = gradeFilter("prev_out", {
      liftBlacks: 0.1,
      crushWhites: 0.1,
      shadowTint: "cool",
      highlightTint: "warm",
      fade: 0.0,
    });
    expect(result.fragment).toContain("[prev_out]");
  });
});
