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

  it("parses video metadata including dimensions and fps", () => {
    const output = `codec_name=h264
width=1920
height=1080
r_frame_rate=30/1
duration=60.000000`;
    const result = parseProbeOutput(output);
    expect(result.isImage).toBe(false);
    expect(result.duration).toBe(60);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.fps).toBe(30);
  });

  it("parses fractional fps", () => {
    const output = `codec_name=h264
width=1280
height=720
r_frame_rate=24000/1001
duration=120.5`;
    const result = parseProbeOutput(output);
    expect(result.fps).toBeCloseTo(23.976, 2);
  });

  it("returns null fps for images", () => {
    const output = `codec_name=png
width=2728
height=1534`;
    const result = parseProbeOutput(output);
    expect(result.isImage).toBe(true);
    expect(result.width).toBe(2728);
    expect(result.height).toBe(1534);
    expect(result.fps).toBeNull();
  });
});
