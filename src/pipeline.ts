import type { ProbeResult } from "./types";
import { createHeadlessRenderer } from "./gpu/headless-renderer";

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

