import type { FilmOptions, FilterResult, ProbeResult } from "./types";
import { colorSettingsFilter } from "./effects/colorSettings";
import { halationFilter } from "./effects/halation";
import { aberrationFilter } from "./effects/aberration";
import { bloomFilter } from "./effects/bloom";
import { grainFilter } from "./effects/grain";
import { vignetteFilter } from "./effects/vignette";
import { splitToneFilter } from "./effects/splitTone";
import { cameraShakeFilter } from "./effects/cameraShake";
import { parseProgress, renderProgressBar } from "./progress";
import { createHeadlessRenderer } from "./gpu/headless-renderer";

function applyEffect(
  fragments: string[],
  currentLabel: string,
  fn: (input: string, opts: never) => FilterResult,
  opts: unknown,
): string {
  const result = fn(currentLabel, opts as never);
  fragments.push(result.fragment);
  return result.output;
}

export function buildFilterGraph(
  options: FilmOptions,
  isImage: boolean
): { graph: string; finalLabel: string } {
  const fragments: string[] = [];
  let label = "0:v";

  const needsBlend = options.blend < 1;
  if (needsBlend) {
    fragments.push(`[0:v]split=2[gb_orig][gb_proc]`);
    label = "gb_proc";
  }

  label = applyEffect(fragments, label, colorSettingsFilter, options.colorSettings);
  label = applyEffect(fragments, label, halationFilter, options.halation);
  label = applyEffect(fragments, label, aberrationFilter, options.aberration);
  label = applyEffect(fragments, label, bloomFilter, options.bloom);
  label = applyEffect(fragments, label, grainFilter, options.grain);
  label = applyEffect(fragments, label, vignetteFilter, options.vignette);
  label = applyEffect(fragments, label, splitToneFilter, options.splitTone);

  if (!isImage) {
    label = applyEffect(fragments, label, cameraShakeFilter, options.cameraShake);
  }

  if (needsBlend) {
    const opacity = options.blend.toFixed(4);
    fragments.push(`[gb_orig][${label}]blend=all_mode=normal:all_opacity=${opacity}[blend_out]`);
    label = "blend_out";
  }

  return { graph: fragments.join(";"), finalLabel: label };
}

function buildFFmpegArgs(options: FilmOptions, probeResult: ProbeResult): string[] {
  const { graph, finalLabel } = buildFilterGraph(options, probeResult.isImage);

  const args = [
    "ffmpeg", "-y",
    "-i", options.input,
    "-filter_complex", graph,
    "-map", `[${finalLabel}]`,
  ];

  if (!probeResult.isImage) {
    args.push("-map", "0:a?", "-c:a", "copy");
  }

  if (probeResult.isImage) {
    args.push(options.output);
  } else {
    args.push(
      "-c:v", "libx264",
      "-preset", options.encodePreset,
      "-crf", String(options.crf),
      "-progress", "pipe:1",
      "-nostats",
      options.output
    );
  }

  return args;
}

export async function runPipelineWithProgress(
  options: FilmOptions,
  probeResult: ProbeResult,
  onProgress: (ratio: number) => void,
): Promise<void> {
  const args = buildFFmpegArgs(options, probeResult);

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (!probeResult.isImage && probeResult.duration) {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const ratio = parseProgress(buffer, probeResult.duration);
      if (ratio !== null) {
        onProgress(ratio);
        buffer = "";
      }
    }
  }

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`FFmpeg failed (exit ${exitCode}):\n${stderr.trim()}`);
  }

  onProgress(1);
}

export async function runGpuExport(
  input: string,
  output: string,
  params: Record<string, unknown>,
  probeResult: ProbeResult,
  onProgress: (ratio: number) => void,
): Promise<void> {
  const { width, height, fps, duration } = probeResult;
  if (!width || !height || !fps || !duration) {
    throw new Error("Video metadata incomplete — need width, height, fps, duration");
  }

  const totalFrames = Math.ceil(fps * duration);
  const frameSize = width * height * 4;

  // Spawn FFmpeg decoder: raw RGBA output to stdout
  const decoder = Bun.spawn([
    "ffmpeg", "-i", input,
    "-f", "rawvideo", "-pix_fmt", "rgba",
    "-v", "quiet",
    "pipe:1",
  ], { stdout: "pipe", stderr: "pipe" });

  // Spawn FFmpeg encoder: PNG frames from stdin, copy audio from original
  const encoder = Bun.spawn([
    "ffmpeg", "-y",
    "-f", "image2pipe", "-framerate", `${fps}`,
    "-i", "pipe:0",
    "-i", input,
    "-map", "0:v", "-map", "1:a?",
    "-c:a", "copy",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p",
    output,
  ], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });

  // Create headless renderer
  const renderer = await createHeadlessRenderer();
  await renderer.init(width, height);

  // Process frames
  const reader = decoder.stdout.getReader();
  let buffer = new Uint8Array(0);
  let frameCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const combined = new Uint8Array(buffer.length + value.length);
      combined.set(buffer);
      combined.set(value, buffer.length);
      buffer = combined;

      while (buffer.length >= frameSize) {
        const frame = buffer.slice(0, frameSize);
        buffer = buffer.slice(frameSize);

        const rendered = await renderer.renderFrame(frame, width, height, params);
        encoder.stdin.write(rendered);

        frameCount++;
        onProgress(Math.min(frameCount / totalFrames, 1));
      }
    }

    encoder.stdin.end();
    const exitCode = await encoder.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(encoder.stderr).text();
      throw new Error(`FFmpeg encoder failed: ${stderr.trim()}`);
    }
    onProgress(1);
  } finally {
    await renderer.close();
  }
}

export async function runPipeline(
  options: FilmOptions,
  probeResult: ProbeResult
): Promise<void> {
  if (probeResult.isImage) {
    process.stdout.write("Processing...\n");
  }

  try {
    await runPipelineWithProgress(options, probeResult, (ratio) => {
      if (!probeResult.isImage) {
        process.stdout.write("\r" + renderProgressBar(ratio));
      }
    });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  if (!probeResult.isImage) {
    process.stdout.write("\n");
  }

  if (probeResult.isImage) {
    console.log("Done.");
  }
}
