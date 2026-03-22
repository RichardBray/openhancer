import { describe, it, expect } from "bun:test";
import { parseProbeOutput } from "../probe";

describe("parseProbeOutput", () => {
  it("parses video duration", () => {
    const output = "duration=123.456\ncodec_name=h264";
    const result = parseProbeOutput(output);
    expect(result.duration).toBeCloseTo(123.456);
    expect(result.isImage).toBe(false);
  });

  it("detects image input from codec", () => {
    const output = "duration=N/A\ncodec_name=mjpeg";
    const result = parseProbeOutput(output);
    expect(result.duration).toBeNull();
    expect(result.isImage).toBe(true);
  });

  it("detects image input from png codec", () => {
    const output = "duration=N/A\ncodec_name=png";
    const result = parseProbeOutput(output);
    expect(result.duration).toBeNull();
    expect(result.isImage).toBe(true);
  });

  it("returns null duration on missing data", () => {
    const result = parseProbeOutput("");
    expect(result.duration).toBeNull();
    expect(result.isImage).toBe(true);
  });
});
