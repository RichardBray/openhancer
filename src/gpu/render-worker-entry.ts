import { createRenderer } from "../ui/app/gpu/renderer.js";
import type { Renderer, PreviewParams } from "../ui/app/gpu/renderer.js";

let renderer: Renderer | null = null;
let canvas: HTMLCanvasElement | null = null;

window.__initRenderer = async function (width: number, height: number): Promise<void> {
  canvas = document.getElementById("c") as HTMLCanvasElement;
  canvas.width = width;
  canvas.height = height;
  renderer = await createRenderer(canvas, {
    sourceWidth: width,
    sourceHeight: height,
    previewWidth: width,
    previewHeight: height,
  });
};

window.__renderFrame = async function (
  rgbaArray: Uint8Array,
  width: number,
  height: number,
  params: PreviewParams
): Promise<void> {
  if (!renderer) throw new Error("Renderer not initialized");
  renderer.setSourceFromBuffer(rgbaArray, width, height);
  renderer.setParams(params);
  renderer.renderFrame();
};

window.__readPixels = async function (): Promise<Uint8Array> {
  if (!canvas) throw new Error("Canvas not initialized");
  return new Promise((resolve, reject) => {
    canvas!.toBlob(async (blob) => {
      if (!blob) return reject(new Error("toBlob returned null"));
      const buf = await blob.arrayBuffer();
      resolve(new Uint8Array(buf));
    }, "image/png");
  });
};

window.__destroy = function (): void {
  renderer?.destroy();
  renderer = null;
  canvas = null;
};

declare global {
  interface Window {
    __initRenderer: (width: number, height: number) => Promise<void>;
    __renderFrame: (rgbaArray: Uint8Array, width: number, height: number, params: PreviewParams) => Promise<void>;
    __readPixels: () => Promise<Uint8Array>;
    __destroy: () => void;
  }
}
