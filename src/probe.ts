import type { ProbeResult } from "./types";

const IMAGE_CODECS = new Set([
  "mjpeg", "png", "bmp", "tiff", "webp", "gif",
  "jpeg2000", "jpegls", "pam", "pbm", "pgm", "ppm",
]);

export function parseProbeOutput(output: string): ProbeResult {
  const lines = output.trim().split("\n");
  let duration: number | null = null;
  let codec: string | null = null;

  for (const line of lines) {
    const [key, value] = line.split("=");
    if (key === "duration" && value && value !== "N/A") {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) duration = parsed;
    }
    if (key === "codec_name" && value) {
      codec = value.trim();
    }
  }

  const isImage = duration === null || (codec !== null && IMAGE_CODECS.has(codec));

  return { duration, isImage };
}

export async function probe(inputPath: string): Promise<ProbeResult> {
  const proc = Bun.spawn([
    "ffprobe",
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "format=duration:stream=codec_name",
    "-of", "default=noprint_wrappers=1:nokey=0",
    inputPath,
  ], { stdout: "pipe", stderr: "pipe" });

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`ffprobe failed: ${stderr.trim()}`);
  }

  return parseProbeOutput(stdout);
}
