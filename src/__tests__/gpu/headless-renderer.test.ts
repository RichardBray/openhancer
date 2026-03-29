import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  createHeadlessRenderer,
  type HeadlessRenderer,
} from "../../gpu/headless-renderer";

describe("HeadlessRenderer", () => {
  let renderer: HeadlessRenderer;

  beforeAll(async () => {
    renderer = await createHeadlessRenderer();
  }, 30000);

  afterAll(async () => {
    await renderer.close();
  });

  it("initializes with dimensions", async () => {
    await renderer.init(100, 100);
  });

  it("renders a frame from RGBA buffer", async () => {
    await renderer.init(2, 2);
    const rgba = new Uint8Array([
      255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
    ]);
    const result = await renderer.renderFrame(rgba, 2, 2, {});
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0); // PNG bytes, not raw RGBA
  });
});
