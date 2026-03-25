import { describe, expect, test } from "bun:test";
import { EFFECT_SCHEMA, getDefaults } from "../schema";

describe("EFFECT_SCHEMA", () => {
  test("every option has required fields", () => {
    for (const group of EFFECT_SCHEMA) {
      expect(group.key).toBeDefined();
      expect(group.label).toBeDefined();
      for (const opt of group.options) {
        expect(opt.key).toBeDefined();
        expect(opt.label).toBeDefined();
        expect(opt.type).toBeDefined();
        if (opt.type === "range") {
          expect(opt.min).toBeDefined();
          expect(opt.max).toBeDefined();
          expect(opt.step).toBeDefined();
        }
      }
    }
  });

  test("getDefaults returns flat PresetData matching default.json keys", () => {
    const defaults = getDefaults();
    expect(defaults["exposure"]).toBe(0);
    expect(defaults["halation-amount"]).toBe(0.25);
    expect(defaults["split-tone-mode"]).toBe("natural");
  });
});
