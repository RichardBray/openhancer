import { describe, it, expect } from "bun:test";
import { renderProgressBar, parseProgress } from "../progress";

describe("renderProgressBar", () => {
  it("renders 0% progress", () => {
    const bar = renderProgressBar(0, 20);
    expect(bar).toContain("0.0%");
    expect(bar).toContain("░");
  });

  it("renders 50% progress", () => {
    const bar = renderProgressBar(0.5, 20);
    expect(bar).toContain("50.0%");
    expect(bar).toContain("█");
  });

  it("renders 100% progress", () => {
    const bar = renderProgressBar(1.0, 20);
    expect(bar).toContain("100.0%");
  });

  it("clamps above 1.0", () => {
    const bar = renderProgressBar(1.5, 20);
    expect(bar).toContain("100.0%");
  });
});

describe("parseProgress", () => {
  it("extracts out_time_ms and computes ratio", () => {
    const chunk = "frame=100\nout_time_ms=5000000\nprogress=continue\n";
    const ratio = parseProgress(chunk, 10);
    expect(ratio).toBeCloseTo(0.5);
  });

  it("returns null on missing out_time_ms", () => {
    const ratio = parseProgress("frame=100\n", 10);
    expect(ratio).toBeNull();
  });

  it("returns null when duration is null", () => {
    const ratio = parseProgress("out_time_ms=5000000\n", null);
    expect(ratio).toBeNull();
  });
});
