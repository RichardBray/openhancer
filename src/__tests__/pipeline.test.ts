import { describe, it, expect } from "bun:test";
import { buildFilterGraph } from "../pipeline";
import type { FilmOptions } from "../types";

const defaults: FilmOptions = {
  input: "test.mp4",
  output: "test_openhanced.mp4",
  preset: "medium",
  crf: 18,
  grade: {
    liftBlacks: 0.05,
    crushWhites: 0.04,
    shadowTint: "warm",
    highlightTint: "cool",
    fade: 0.15,
  },
  halation: {
    intensity: 0.6,
    radius: 51,
    threshold: 180,
    warmth: 0.7,
  },
  aberration: { strength: 0.3 },
  weave: { strength: 0.3 },
};

describe("buildFilterGraph", () => {
  it("chains all four effects for video", () => {
    const { graph, finalLabel } = buildFilterGraph(defaults, false);
    expect(graph).toContain("[0:v]");
    expect(graph).toContain("[graded]");
    expect(graph).toContain("[halation_out]");
    expect(graph).toContain("[ab_out]");
    expect(graph).toContain("[weave_out]");
    expect(finalLabel).toBe("weave_out");
  });

  it("skips weave for image input", () => {
    const { graph, finalLabel } = buildFilterGraph(defaults, true);
    expect(graph).not.toContain("weave");
    expect(finalLabel).toBe("ab_out");
  });
});
