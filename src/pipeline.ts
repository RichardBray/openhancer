import type { FilmOptions, ProbeResult } from "./types";
import { gradeFilter } from "./effects/grade";
import { halationFilter } from "./effects/halation";
import { aberrationFilter } from "./effects/aberration";
import { weaveFilter } from "./effects/weave";
import { parseProgress, renderProgressBar } from "./progress";

export function buildFilterGraph(
  options: FilmOptions,
  isImage: boolean
): { graph: string; finalLabel: string } {
  const fragments: string[] = [];
  let currentLabel = "0:v";

  // Grade
  const grade = gradeFilter(currentLabel, options.grade);
  fragments.push(grade.fragment);
  currentLabel = grade.output;

  // Halation
  const halation = halationFilter(currentLabel, options.halation);
  fragments.push(halation.fragment);
  currentLabel = halation.output;

  // Aberration
  const aberration = aberrationFilter(currentLabel, options.aberration);
  fragments.push(aberration.fragment);
  currentLabel = aberration.output;

  // Weave (skip for images)
  if (!isImage) {
    const weave = weaveFilter(currentLabel, options.weave);
    fragments.push(weave.fragment);
    currentLabel = weave.output;
  }

  return { graph: fragments.join(";"), finalLabel: currentLabel };
}

export async function runPipeline(
  options: FilmOptions,
  probeResult: ProbeResult
): Promise<void> {
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
    // Output as image — no video codec needed for png/jpg
    args.push(options.output);
  } else {
    args.push(
      "-c:v", "libx264",
      "-preset", options.preset,
      "-crf", String(options.crf),
      "-progress", "pipe:1",
      "-nostats",
      options.output
    );
  }

  if (probeResult.isImage) {
    process.stdout.write("Processing...\n");
  }

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
        process.stdout.write("\r" + renderProgressBar(ratio));
        buffer = "";
      }
    }
    process.stdout.write("\n");
  }

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    console.error(`FFmpeg failed (exit ${exitCode}):\n${stderr.trim()}`);
    process.exit(1);
  }

  if (probeResult.isImage) {
    console.log("Done.");
  }
}
