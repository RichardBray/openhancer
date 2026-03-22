import { existsSync } from "fs";
import { probe } from "./probe";
import { runPipeline } from "./pipeline";
import { applyPreset } from "./presets";
import type { FilmOptions } from "./types";
import type { PresetData } from "./presets";
import path from "path";

const HELP_TEXT = `
openhancer <input> [options]

  Input/Output:
  --output, -o <path>       Output path (default: <input>_openhanced.<ext>)
  --encode-preset <string>  FFmpeg preset: fast/medium/slow (default: medium)
  --crf        <0-51>       Quality — lower is better (default: 18)

  Preset:
  --preset     <name>       Load a preset file (default: "default")

  Colour Grade:
  --lift          <0-0.15>  Black lift amount (default: 0.05)
  --crush         <0-0.15>  White crush amount (default: 0.04)
  --fade          <0-1>     Overall contrast fade (default: 0.15)
  --shadow-tint   <warm|cool|neutral>   (default: warm)
  --highlight-tint <warm|cool|neutral>  (default: cool)

  Halation:
  --halation-intensity  <0-1>    (default: 0.6)
  --halation-radius     <px>     (default: 51)
  --halation-threshold  <0-255>  (default: 180)
  --halation-warmth     <-1–1>   (default: 0.3)  -1=cool, 0=neutral, 1=warm

  Chromatic Aberration:
  --aberration  <0-1>   (default: 0.3)

  Gate Weave:
  --weave  <0-1>   (default: 0.3)

  General:
  --help, -h     Show this help
`.trim();

const KNOWN_FLAGS = new Set([
  "--output", "-o", "--encode-preset", "--crf", "--preset",
  "--lift", "--crush", "--fade", "--shadow-tint", "--highlight-tint",
  "--halation-intensity", "--halation-radius", "--halation-threshold", "--halation-warmth",
  "--aberration", "--weave",
  "--help", "-h",
]);

// Flags that take a value (all except --help/-h)
const VALUE_FLAGS = new Set([...KNOWN_FLAGS].filter(f => f !== "--help" && f !== "-h"));

export function getDefaultOutput(inputPath: string): string {
  const ext = path.extname(inputPath);
  const base = inputPath.slice(0, -ext.length);
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `${base}_openhanced_${stamp}${ext}`;
}

function parseNum(value: string, flag: string, min: number, max: number): number {
  const n = parseFloat(value);
  if (isNaN(n) || n < min || n > max) {
    throw new Error(`${flag} must be between ${min} and ${max}, got ${value}`);
  }
  return n;
}

function parseTint(value: string, flag: string): "warm" | "cool" | "neutral" {
  if (value !== "warm" && value !== "cool" && value !== "neutral") {
    throw new Error(`${flag} must be warm, cool, or neutral, got ${value}`);
  }
  return value;
}

interface ParsedArgs extends FilmOptions {
  help: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  let input = "";
  let output = "";
  let help = false;
  let presetName = "default";
  const overrides: PresetData = {};

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      help = true;
      i++;
      continue;
    }

    if (arg.startsWith("-")) {
      if (!KNOWN_FLAGS.has(arg)) {
        throw new Error(`Unknown flag: ${arg}. Use --help for usage.`);
      }

      if (VALUE_FLAGS.has(arg)) {
        const val = argv[i + 1];
        if (val === undefined) throw new Error(`${arg} requires a value`);

        switch (arg) {
          case "--output": case "-o": output = val; break;
          case "--preset": presetName = val; break;
          case "--encode-preset":
            if (val !== "fast" && val !== "medium" && val !== "slow") {
              throw new Error(`--encode-preset must be fast, medium, or slow, got ${val}`);
            }
            overrides["encode-preset"] = val; break;
          case "--crf": overrides["crf"] = parseNum(val, "--crf", 0, 51); break;
          case "--lift": overrides["lift"] = parseNum(val, "--lift", 0, 0.15); break;
          case "--crush": overrides["crush"] = parseNum(val, "--crush", 0, 0.15); break;
          case "--fade": overrides["fade"] = parseNum(val, "--fade", 0, 1); break;
          case "--shadow-tint": overrides["shadow-tint"] = parseTint(val, "--shadow-tint"); break;
          case "--highlight-tint": overrides["highlight-tint"] = parseTint(val, "--highlight-tint"); break;
          case "--halation-intensity": overrides["halation-intensity"] = parseNum(val, "--halation-intensity", 0, 1); break;
          case "--halation-radius": overrides["halation-radius"] = parseNum(val, "--halation-radius", 1, 999); break;
          case "--halation-threshold": overrides["halation-threshold"] = parseNum(val, "--halation-threshold", 0, 255); break;
          case "--halation-warmth": overrides["halation-warmth"] = parseNum(val, "--halation-warmth", -1, 1); break;
          case "--aberration": overrides["aberration"] = parseNum(val, "--aberration", 0, 1); break;
          case "--weave": overrides["weave"] = parseNum(val, "--weave", 0, 1); break;
        }
        i += 2;
        continue;
      }
    } else {
      // Positional argument = input file
      if (!input) {
        input = arg;
      }
      i++;
      continue;
    }

    i++;
  }

  if (!help && !input) {
    throw new Error("No input file provided. Usage: openhancer <input> [options]");
  }

  if (!output && input) {
    output = getDefaultOutput(input);
  }

  const effectOpts = applyPreset(presetName, overrides);

  return {
    input,
    output,
    encodePreset: effectOpts.preset,
    crf: effectOpts.crf,
    grade: effectOpts.grade,
    halation: effectOpts.halation,
    aberration: effectOpts.aberration,
    weave: effectOpts.weave,
    help,
  };
}

async function checkDependency(name: string): Promise<void> {
  const proc = Bun.spawn(["which", name], { stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error(`${name} not found. Install with: brew install ffmpeg`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(args);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  if (parsed.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  await checkDependency("ffmpeg");
  await checkDependency("ffprobe");

  if (!existsSync(parsed.input)) {
    console.error(`Input file not found: ${parsed.input}`);
    process.exit(1);
  }

  const probeResult = await probe(parsed.input);

  console.log(`Input:  ${parsed.input}${probeResult.isImage ? " (image)" : ""}`);
  console.log(`Output: ${parsed.output}`);

  await runPipeline(parsed, probeResult);
}

if (import.meta.main) {
  main();
}
