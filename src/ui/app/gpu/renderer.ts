import {
  FULLSCREEN_VERT, COLOR_SETTINGS_FRAG, THRESHOLD_FRAG, BLUR_FRAG,
  SCREEN_BLEND_FRAG, ABERRATION_FRAG, GRAIN_FRAG, VIGNETTE_FRAG,
  SPLIT_TONE_FRAG, CAMERA_SHAKE_FRAG,
} from "./shaders";
import { createFullscreenPipeline, createTexture, runPass } from "./passes";

export interface PreviewParams {
  [key: string]: string | number | boolean;
}

interface PassState {
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  uniformSize: number;
}

export interface Renderer {
  setSource(source: HTMLVideoElement | HTMLImageElement): void;
  setParams(params: PreviewParams): void;
  renderFrame(): void;
  destroy(): void;
}

// Standard bind group layout: texture + sampler + uniform
function createStandardLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
    ],
  });
}

// Screen blend layout: 2 textures + sampler + uniform
function createBlendLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
    ],
  });
}

function alignTo16(n: number): number {
  return Math.ceil(n / 16) * 16;
}

function createUniformBuffer(device: GPUDevice, size: number): GPUBuffer {
  return device.createBuffer({
    size: alignTo16(size),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

export async function createRenderer(canvas: HTMLCanvasElement, width: number, height: number): Promise<Renderer> {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter found");
  const device = await adapter.requestDevice();
  const format = navigator.gpu.getPreferredCanvasFormat();

  const ctx = canvas.getContext("webgpu")!;
  ctx.configure({ device, format, alphaMode: "opaque" });

  canvas.width = width;
  canvas.height = height;

  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  const stdLayout = createStandardLayout(device);
  const blendLayout = createBlendLayout(device);

  // Textures: ping-pong at full res, half-res pair for blurs
  const halfW = Math.max(1, Math.floor(width / 2));
  const halfH = Math.max(1, Math.floor(height / 2));

  const texA = createTexture(device, width, height, format);
  const texB = createTexture(device, width, height, format);
  const halfA = createTexture(device, halfW, halfH, format);
  const halfB = createTexture(device, halfW, halfH, format);

  // Source texture for video/image frames
  const srcTex = device.createTexture({
    size: { width, height },
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // Create all pipelines
  const colorPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, COLOR_SETTINGS_FRAG, stdLayout, format);
  const thresholdPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, THRESHOLD_FRAG, stdLayout, format);
  const blurPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, BLUR_FRAG, stdLayout, format);
  const blendPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, SCREEN_BLEND_FRAG, blendLayout, format);
  const aberrationPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, ABERRATION_FRAG, stdLayout, format);
  const grainPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, GRAIN_FRAG, stdLayout, format);
  const vignettePipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, VIGNETTE_FRAG, stdLayout, format);
  const splitTonePipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, SPLIT_TONE_FRAG, stdLayout, format);
  const shakePipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, CAMERA_SHAKE_FRAG, stdLayout, format);

  // Uniform buffers (pre-allocated, rewritten each frame)
  const colorUB = createUniformBuffer(device, 32); // 8 floats
  const thresholdUB = createUniformBuffer(device, 16);
  const blurUB1 = createUniformBuffer(device, 16);
  const blurUB2 = createUniformBuffer(device, 16);
  const blendUB = createUniformBuffer(device, 16);
  const aberrationUB = createUniformBuffer(device, 16);
  const grainUB = createUniformBuffer(device, 32); // 8 floats
  const vignetteUB = createUniformBuffer(device, 16);
  const splitToneUB = createUniformBuffer(device, 32);
  const shakeUB = createUniformBuffer(device, 16);
  // Bloom reuses blur pipeline with separate UBs
  const bloomBlurUB1 = createUniformBuffer(device, 16);
  const bloomBlurUB2 = createUniformBuffer(device, 16);
  const bloomBlendUB = createUniformBuffer(device, 16);

  let source: HTMLVideoElement | HTMLImageElement | null = null;
  let params: PreviewParams = {};
  let frameCount = 0;

  function makeStdBindGroup(inputTex: GPUTexture, ub: GPUBuffer): GPUBindGroup {
    return device.createBindGroup({
      layout: stdLayout,
      entries: [
        { binding: 0, resource: inputTex.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: ub } },
      ],
    });
  }

  function makeBlendBindGroup(baseTex: GPUTexture, overlayTex: GPUTexture, ub: GPUBuffer): GPUBindGroup {
    return device.createBindGroup({
      layout: blendLayout,
      entries: [
        { binding: 0, resource: baseTex.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: overlayTex.createView() },
        { binding: 3, resource: { buffer: ub } },
      ],
    });
  }

  function copySourceToTexture() {
    if (!source) return;
    device.queue.copyExternalImageToTexture(
      { source: source as HTMLVideoElement | HTMLImageElement },
      { texture: srcTex },
      { width, height },
    );
  }

  function num(key: string, fallback: number): number {
    const v = params[key];
    return typeof v === "number" ? v : fallback;
  }

  function bool(key: string, fallback: boolean): boolean {
    const v = params[key];
    return typeof v === "boolean" ? v : fallback;
  }

  function renderFrame() {
    if (!source) return;
    copySourceToTexture();
    frameCount++;

    const encoder = device.createCommandEncoder();
    // We'll track which texture holds the current result
    // Start: srcTex → colorSettings → texA, then alternate A/B
    let current = texA;
    let other = texB;

    function swap() {
      const tmp = current;
      current = other;
      other = tmp;
    }

    // --- Color Settings ---
    if (params["no-color-settings"] !== true) {
      const fade = num("fade", 0);
      const contrast = num("contrast", 1) * (1 - fade);
      const brightness = num("exposure", 0) * 0.1 + fade * 0.05;
      const saturation = num("subtractive-sat", 1) * num("richness", 1);
      const gamma = 1 - num("highlights", 0) * 0.5;
      const wb = num("white-balance", 6500);
      const tint = num("tint", 0) / 100;
      const bleach = num("bleach-bypass", 0);
      device.queue.writeBuffer(colorUB, 0, new Float32Array([contrast, brightness, saturation, gamma, wb, tint, bleach, 0]));
      const bg = makeStdBindGroup(srcTex, colorUB);
      runPass(encoder, colorPipeline, bg, current.createView());
    } else {
      // Copy source through
      const bg = makeStdBindGroup(srcTex, colorUB);
      device.queue.writeBuffer(colorUB, 0, new Float32Array([1, 0, 1, 1, 6500, 0, 0, 0]));
      runPass(encoder, colorPipeline, bg, current.createView());
    }

    // --- Halation ---
    if (params["no-halation"] !== true) {
      const amount = num("halation-amount", 0.25);
      if (amount > 0) {
        const radius = num("halation-radius", 4);
        const highlightsOnly = bool("halation-highlights-only", true);

        // Save pre-halation result for blend
        const preHalation = current;

        if (highlightsOnly) {
          // Threshold pass → halfA
          device.queue.writeBuffer(thresholdUB, 0, new Float32Array([0.65, 0.75, 0, 0]));
          const threshBG = makeStdBindGroup(current, thresholdUB);
          runPass(encoder, thresholdPipeline, threshBG, halfA.createView());
        } else {
          // Downsample directly (use blur with sigma=0.001 as passthrough-ish)
          device.queue.writeBuffer(blurUB1, 0, new Float32Array([0, 0, 0.001, 0]));
          const bg = makeStdBindGroup(current, blurUB1);
          runPass(encoder, blurPipeline, bg, halfA.createView());
        }

        // Horizontal blur → halfB
        const sigma = radius * 0.5;
        device.queue.writeBuffer(blurUB1, 0, new Float32Array([1.0 / halfW, 0, sigma, 0]));
        const hBG = makeStdBindGroup(halfA, blurUB1);
        runPass(encoder, blurPipeline, hBG, halfB.createView());

        // Vertical blur → halfA
        device.queue.writeBuffer(blurUB2, 0, new Float32Array([0, 1.0 / halfH, sigma, 0]));
        const vBG = makeStdBindGroup(halfB, blurUB2);
        runPass(encoder, blurPipeline, vBG, halfA.createView());

        // Screen blend halation with pre-halation → other
        const hue = num("halation-hue", 0.5) * 360;
        const sat = num("halation-saturation", 1);
        device.queue.writeBuffer(blendUB, 0, new Float32Array([amount, hue, sat, 0]));
        const blendBG = makeBlendBindGroup(preHalation, halfA, blendUB);
        runPass(encoder, blendPipeline, blendBG, other.createView());
        swap();
      }
    }

    // --- Chromatic Aberration ---
    if (params["no-aberration"] !== true) {
      const amount = num("aberration", 0.3);
      if (amount > 0) {
        device.queue.writeBuffer(aberrationUB, 0, new Float32Array([amount * 0.02, 0, 0, 0]));
        const bg = makeStdBindGroup(current, aberrationUB);
        runPass(encoder, aberrationPipeline, bg, other.createView());
        swap();
      }
    }

    // --- Bloom ---
    if (params["no-bloom"] !== true) {
      const amount = num("bloom-amount", 0.25);
      if (amount > 0) {
        const radius = num("bloom-radius", 10);
        const preBloom = current;

        // Threshold → halfA
        device.queue.writeBuffer(thresholdUB, 0, new Float32Array([0.5, 0.7, 0, 0]));
        const threshBG = makeStdBindGroup(current, thresholdUB);
        runPass(encoder, thresholdPipeline, threshBG, halfA.createView());

        // H-blur → halfB
        const sigma = radius * 0.5;
        device.queue.writeBuffer(bloomBlurUB1, 0, new Float32Array([1.0 / halfW, 0, sigma, 0]));
        const hBG = makeStdBindGroup(halfA, bloomBlurUB1);
        runPass(encoder, blurPipeline, hBG, halfB.createView());

        // V-blur → halfA
        device.queue.writeBuffer(bloomBlurUB2, 0, new Float32Array([0, 1.0 / halfH, sigma, 0]));
        const vBG = makeStdBindGroup(halfB, bloomBlurUB2);
        runPass(encoder, blurPipeline, vBG, halfA.createView());

        // Screen blend → other
        device.queue.writeBuffer(bloomBlendUB, 0, new Float32Array([amount, 0, 1, 0]));
        const blendBG = makeBlendBindGroup(preBloom, halfA, bloomBlendUB);
        runPass(encoder, blendPipeline, blendBG, other.createView());
        swap();
      }
    }

    // --- Grain ---
    if (params["no-grain"] !== true) {
      const amount = num("grain-amount", 0.125);
      if (amount > 0) {
        device.queue.writeBuffer(grainUB, 0, new Float32Array([
          amount,
          num("grain-size", 0),
          num("grain-softness", 0.1),
          num("grain-saturation", 0.3),
          num("grain-defocus", 1),
          frameCount,
          1.0 / width,
          1.0 / height,
        ]));
        const bg = makeStdBindGroup(current, grainUB);
        runPass(encoder, grainPipeline, bg, other.createView());
        swap();
      }
    }

    // --- Vignette ---
    if (params["no-vignette"] !== true) {
      const amount = num("vignette-amount", 0.25);
      if (amount > 0) {
        const angle = amount * Math.PI / 2;
        const aspect = 1 - num("vignette-size", 0.25) * 0.5;
        device.queue.writeBuffer(vignetteUB, 0, new Float32Array([angle, aspect, 0, 0]));
        const bg = makeStdBindGroup(current, vignetteUB);
        runPass(encoder, vignettePipeline, bg, other.createView());
        swap();
      }
    }

    // --- Split Tone ---
    if (params["no-split-tone"] !== true) {
      const amount = num("split-tone-amount", 0);
      if (amount > 0) {
        const hue = num("split-tone-hue", 20);
        const pivot = num("split-tone-pivot", 0.3);
        const mode = params["split-tone-mode"] || "natural";
        const protect = params["split-tone-protect-neutrals"] === true ? 1 : 0;

        // Convert hue angle to RGB tint values (simplified)
        const hueRad = (hue * Math.PI) / 180;
        const shadowR = Math.cos(hueRad) * amount * 0.1;
        const shadowB = Math.sin(hueRad) * amount * 0.1;
        const highlightR = mode === "complementary" ? -shadowR : shadowR * 0.5;
        const highlightB = mode === "complementary" ? -shadowB : shadowB * 0.3;
        const midR = (pivot - 0.3) * amount * 0.05;

        device.queue.writeBuffer(splitToneUB, 0, new Float32Array([
          shadowR, shadowB, highlightR, highlightB, midR, amount, protect, 0,
        ]));
        const bg = makeStdBindGroup(current, splitToneUB);
        runPass(encoder, splitTonePipeline, bg, other.createView());
        swap();
      }
    }

    // --- Camera Shake ---
    if (params["no-camera-shake"] !== true) {
      const amount = num("camera-shake-amount", 0.25);
      if (amount > 0) {
        const rate = num("camera-shake-rate", 0.5);
        const amplitude = (amount * 3) / width; // normalize to UV space
        const period1 = Math.max(1, 30 / (rate + 0.01));
        const period2 = period1 * 1.3;
        device.queue.writeBuffer(shakeUB, 0, new Float32Array([amplitude, period1, period2, frameCount]));
        const bg = makeStdBindGroup(current, shakeUB);
        runPass(encoder, shakePipeline, bg, other.createView());
        swap();
      }
    }

    // Final: copy current to canvas
    // We need one more pass to output to the canvas texture
    // Use a simple passthrough via color settings with neutral params
    device.queue.writeBuffer(colorUB, 0, new Float32Array([1, 0, 1, 1, 6500, 0, 0, 0]));
    const finalBG = makeStdBindGroup(current, colorUB);
    runPass(encoder, colorPipeline, finalBG, ctx.getCurrentTexture().createView());

    device.queue.submit([encoder.finish()]);
  }

  return {
    setSource(s: HTMLVideoElement | HTMLImageElement) {
      source = s;
    },
    setParams(p: PreviewParams) {
      params = p;
    },
    renderFrame,
    destroy() {
      texA.destroy();
      texB.destroy();
      halfA.destroy();
      halfB.destroy();
      srcTex.destroy();
      device.destroy();
    },
  };
}
