import { describe, it, expect } from "bun:test";
import { parseArgs, getDefaultOutput } from "../cli";

describe("parseArgs", () => {
  it("parses input file as first positional arg", () => {
    const result = parseArgs(["input.mp4"]);
    expect(result.input).toBe("input.mp4");
  });

  it("parses --output flag", () => {
    const result = parseArgs(["input.mp4", "--output", "out.mp4"]);
    expect(result.output).toBe("out.mp4");
  });

  it("parses -o shorthand", () => {
    const result = parseArgs(["input.mp4", "-o", "out.mp4"]);
    expect(result.output).toBe("out.mp4");
  });

  it("parses numeric flags with validation", () => {
    const result = parseArgs(["input.mp4", "--lift", "0.1", "--crf", "23"]);
    expect(result.grade.liftBlacks).toBe(0.1);
    expect(result.crf).toBe(23);
  });

  it("parses tint flags", () => {
    const result = parseArgs(["input.mp4", "--shadow-tint", "cool"]);
    expect(result.grade.shadowTint).toBe("cool");
  });

  it("throws on unknown flag", () => {
    expect(() => parseArgs(["input.mp4", "--unknown"])).toThrow();
  });

  it("throws on out-of-range value", () => {
    expect(() => parseArgs(["input.mp4", "--lift", "0.5"])).toThrow();
  });

  it("throws with no input", () => {
    expect(() => parseArgs([])).toThrow();
  });

  it("detects --help flag", () => {
    const result = parseArgs(["--help"]);
    expect(result.help).toBe(true);
  });
});

describe("getDefaultOutput", () => {
  it("appends _openhanced with timestamp before extension", () => {
    const result = getDefaultOutput("video.mp4");
    expect(result).toMatch(/^video_openhanced_\d{14}\.mp4$/);
  });

  it("handles .mov files", () => {
    const result = getDefaultOutput("clip.mov");
    expect(result).toMatch(/^clip_openhanced_\d{14}\.mov$/);
  });

  it("handles paths with directories", () => {
    const result = getDefaultOutput("/path/to/video.mp4");
    expect(result).toMatch(/^\/path\/to\/video_openhanced_\d{14}\.mp4$/);
  });
});
