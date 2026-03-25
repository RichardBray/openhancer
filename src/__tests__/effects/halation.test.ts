import { describe, it, expect } from "bun:test";
import { halationFilter } from "../../effects/halation";
import type { HalationOptions } from "../../types";

const defaults: HalationOptions = {
  enabled: true,
  amount: 0.25,
  radius: 4,
  saturation: 1,
  hue: 0.5,
  highlightsOnly: true,
};

describe("halationFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = halationFilter("graded", { ...defaults, enabled: false });
    expect(result.output).toBe("halation_out");
    expect(result.fragment).toContain("null");
  });

  it("returns fragment with split, gblur, and blend", () => {
    const result = halationFilter("color_out", defaults);
    expect(result.output).toBe("halation_out");
    expect(result.fragment).toContain("[color_out]");
    expect(result.fragment).toContain("gblur=");
    expect(result.fragment).toContain("blend=");
  });

  it("applies highlight threshold when highlightsOnly is true", () => {
    const result = halationFilter("color_out", { ...defaults, highlightsOnly: true });
    expect(result.fragment).toContain("geq=");
  });

  it("skips highlight threshold when highlightsOnly is false", () => {
    const result = halationFilter("color_out", { ...defaults, highlightsOnly: false });
    expect(result.fragment).not.toContain("curves=");
  });

  it("applies hue rotation via hue filter", () => {
    const result = halationFilter("color_out", { ...defaults, hue: 0.7 });
    expect(result.fragment).toContain("hue=");
  });

  it("applies saturation control", () => {
    const result = halationFilter("color_out", { ...defaults, saturation: 1.5 });
    expect(result.fragment).toContain("hue=");
  });
});
