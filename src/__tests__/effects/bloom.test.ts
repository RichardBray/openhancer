import { describe, it, expect } from "bun:test";
import { bloomFilter } from "../../effects/bloom";
import type { BloomOptions } from "../../types";

const defaults: BloomOptions = {
  enabled: true,
  amount: 0.25,
  radius: 10,
};

describe("bloomFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = bloomFilter("ab_out", { ...defaults, enabled: false });
    expect(result.output).toBe("bloom_out");
    expect(result.fragment).toContain("null");
  });

  it("returns fragment with split, gblur, and blend", () => {
    const result = bloomFilter("ab_out", defaults);
    expect(result.output).toBe("bloom_out");
    expect(result.fragment).toContain("[ab_out]");
    expect(result.fragment).toContain("split=2");
    expect(result.fragment).toContain("gblur=");
    expect(result.fragment).toContain("blend=");
  });

  it("uses radius as gblur sigma", () => {
    const result = bloomFilter("ab_out", { ...defaults, radius: 20 });
    expect(result.fragment).toContain("gblur=sigma=20");
  });

  it("uses amount as blend opacity", () => {
    const result = bloomFilter("ab_out", { ...defaults, amount: 0.5 });
    expect(result.fragment).toContain("0.5000");
  });
});
