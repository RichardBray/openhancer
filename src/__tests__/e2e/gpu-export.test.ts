import { describe, it, expect } from "bun:test";
import { createHeadlessRenderer } from "../../gpu/headless-renderer";

describe("GPU export parity", () => {
  it("renders identical output for same input and params", async () => {
    const renderer = await createHeadlessRenderer();
    await renderer.init(100, 100);

    // Create a test frame (gradient)
    const rgba = new Uint8Array(100 * 100 * 4);
    for (let i = 0; i < 100 * 100; i++) {
      rgba[i * 4] = (i % 100) * 2.55;     // R gradient
      rgba[i * 4 + 1] = Math.floor(i / 100) * 2.55; // G gradient
      rgba[i * 4 + 2] = 128;               // B constant
      rgba[i * 4 + 3] = 255;               // A
    }

    const params = { "halation-amount": 0.3, "halation-radius": 10 };

    // Render twice with same input
    const result1 = await renderer.renderFrame(rgba, 100, 100, params);
    const result2 = await renderer.renderFrame(rgba, 100, 100, params);

    expect(result1).toEqual(result2); // Deterministic output

    await renderer.close();
  }, 30000);
});
