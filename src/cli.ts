import { existsSync } from "node:fs";
import { probe } from "./probe";
import { applyPreset } from "./presets";
import type { PresetData } from "./presets";
import type { FilmOptions } from "./types";
import path from "node:path";

const HELP_TEXT = `
openhancer <input> [options]

  Input/Output:
  --output, -o <path>       Output path (default: <input>_openhanced.<ext>)
  --encode-preset <string>  FFmpeg preset: fast/medium/slow (default: medium)
  --crf        <0-51>       Quality — lower is better (default: 18)
  --blend      <0-1>        Global blend with original (default: 1)

  Preset:
  --preset     <name>       Load a preset file (default: "default")

  Color Settings:
  --exposure          <-2 to 2>     Exposure adjustment (default: 0)
  --contrast          <0-3>         Contrast multiplier (default: 1)
  --highlights        <-1 to 1>     Highlight compression (default: 0)
  --fade              <0-1>         Fade / lift blacks (default: 0)
  --white-balance     <1000-15000>  Color temperature in Kelvin (default: 6500)
  --tint              <-100 to 100> Green-magenta tint (default: 0)
  --subtractive-sat   <0-3>         Subtractive saturation (default: 1)
  --richness          <0-3>         Color richness (default: 1)
  --bleach-bypass     <0-1>         Bleach bypass amount (default: 0)
  --no-color-settings               Disable color settings

  Halation:
  --halation-amount         <0-1>   Halation strength (default: 0.25)
  --halation-radius         <1-100> Blur radius (default: 4)
  --halation-saturation     <0-3>   Glow saturation (default: 1)
  --halation-hue            <0-1>   Hue rotation 0-1 (default: 0.5)
  --halation-highlights-only        Restrict to highlights (default: true)
  --no-halation                     Disable halation

  Chromatic Aberration:
  --aberration  <0-1>       Aberration amount (default: 0.3)
  --no-aberration           Disable aberration

  Bloom:
  --bloom-amount   <0-1>    Bloom strength (default: 0.25)
  --bloom-radius   <1-100>  Bloom blur radius (default: 10)
  --no-bloom                Disable bloom

  Grain:
  --grain-amount     <0-1>    Grain intensity (default: 0.125)
  --grain-size       <0-5>    Grain particle size (default: 0)
  --grain-softness   <0-1>    Grain softness (default: 0.1)
  --grain-saturation <0-1>    Grain color saturation (default: 0.3)
  --grain-defocus    <0-5>    Image defocus amount (default: 1)
  --no-grain                  Disable grain

  Vignette:
  --vignette-amount  <0-1>   Vignette strength (default: 0.25)
  --vignette-size    <0-1>   Vignette size (default: 0.25)
  --no-vignette              Disable vignette

  Split Tone:
  --split-tone-mode      <natural|complementary>  (default: natural)
  --split-tone-protect-neutrals                   Protect neutral colors
  --split-tone-amount    <0-1>    Toning amount (default: 0)
  --split-tone-hue       <0-360>  Hue angle in degrees (default: 20)
  --split-tone-pivot     <0-1>    Shadow/highlight pivot (default: 0.3)
  --no-split-tone                 Disable split tone

  Camera Shake:
  --camera-shake-amount  <0-1>   Shake intensity (default: 0.25)
  --camera-shake-rate    <0-2>   Shake speed (default: 0.5)
  --no-camera-shake              Disable camera shake

  General:
  --help, -h     Show this help
`.trim();

const KNOWN_FLAGS = new Set([
  "--output", "-o", "--preset", "--encode-preset", "--crf", "--blend",
  "--exposure", "--contrast", "--highlights", "--fade",
  "--white-balance", "--tint", "--subtractive-sat", "--richness", "--bleach-bypass",
  "--no-color-settings",
  "--halation-amount", "--halation-radius", "--halation-saturation", "--halation-hue",
  "--halation-highlights-only", "--no-halation",
  "--aberration", "--no-aberration",
  "--bloom-amount", "--bloom-radius", "--no-bloom",
  "--grain-amount", "--grain-size", "--grain-softness", "--grain-saturation", "--grain-defocus",
  "--no-grain",
  "--vignette-amount", "--vignette-size", "--no-vignette",
  "--split-tone-mode", "--split-tone-protect-neutrals", "--split-tone-amount",
  "--split-tone-hue", "--split-tone-pivot", "--no-split-tone",
  "--camera-shake-amount", "--camera-shake-rate", "--no-camera-shake",
  "--help", "-h",
]);

const BOOLEAN_FLAGS = new Set([
  "--help", "-h",
  "--no-color-settings", "--no-halation", "--no-aberration", "--no-bloom",
  "--no-grain", "--no-vignette", "--no-split-tone", "--no-camera-shake",
  "--halation-highlights-only", "--split-tone-protect-neutrals",
]);

export function isSubcommand(args: string[]): boolean {
  return args[0] === "ui";
}

export function getDefaultOutput(inputPath: string): string {
  const ext = path.extname(inputPath);
  const base = inputPath.slice(0, -ext.length);
  return `${base}_openhanced${ext}`;
}

function parseNum(value: string, flag: string, min: number, max: number): number {
  const n = parseFloat(value);
  if (isNaN(n) || n < min || n > max) {
    throw new Error(`${flag} must be between ${min} and ${max}, got ${value}`);
  }
  return n;
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

      if (BOOLEAN_FLAGS.has(arg)) {
        switch (arg) {
          case "--no-color-settings": overrides["no-color-settings"] = true; break;
          case "--no-halation": overrides["no-halation"] = true; break;
          case "--no-aberration": overrides["no-aberration"] = true; break;
          case "--no-bloom": overrides["no-bloom"] = true; break;
          case "--no-grain": overrides["no-grain"] = true; break;
          case "--no-vignette": overrides["no-vignette"] = true; break;
          case "--no-split-tone": overrides["no-split-tone"] = true; break;
          case "--no-camera-shake": overrides["no-camera-shake"] = true; break;
          case "--halation-highlights-only": overrides["halation-highlights-only"] = true; break;
          case "--split-tone-protect-neutrals": overrides["split-tone-protect-neutrals"] = true; break;
        }
        i++;
        continue;
      }

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
        case "--blend": overrides["blend"] = parseNum(val, "--blend", 0, 1); break;
        case "--exposure": overrides["exposure"] = parseNum(val, "--exposure", -2, 2); break;
        case "--contrast": overrides["contrast"] = parseNum(val, "--contrast", 0, 3); break;
        case "--highlights": overrides["highlights"] = parseNum(val, "--highlights", -1, 1); break;
        case "--fade": overrides["fade"] = parseNum(val, "--fade", 0, 1); break;
        case "--white-balance": overrides["white-balance"] = parseNum(val, "--white-balance", 1000, 15000); break;
        case "--tint": overrides["tint"] = parseNum(val, "--tint", -100, 100); break;
        case "--subtractive-sat": overrides["subtractive-sat"] = parseNum(val, "--subtractive-sat", 0, 3); break;
        case "--richness": overrides["richness"] = parseNum(val, "--richness", 0, 3); break;
        case "--bleach-bypass": overrides["bleach-bypass"] = parseNum(val, "--bleach-bypass", 0, 1); break;
        case "--halation-amount": overrides["halation-amount"] = parseNum(val, "--halation-amount", 0, 1); break;
        case "--halation-radius": overrides["halation-radius"] = parseNum(val, "--halation-radius", 1, 100); break;
        case "--halation-saturation": overrides["halation-saturation"] = parseNum(val, "--halation-saturation", 0, 3); break;
        case "--halation-hue": overrides["halation-hue"] = parseNum(val, "--halation-hue", 0, 1); break;
        case "--aberration": overrides["aberration"] = parseNum(val, "--aberration", 0, 1); break;
        case "--bloom-amount": overrides["bloom-amount"] = parseNum(val, "--bloom-amount", 0, 1); break;
        case "--bloom-radius": overrides["bloom-radius"] = parseNum(val, "--bloom-radius", 1, 100); break;
        case "--grain-amount": overrides["grain-amount"] = parseNum(val, "--grain-amount", 0, 1); break;
        case "--grain-size": overrides["grain-size"] = parseNum(val, "--grain-size", 0, 5); break;
        case "--grain-softness": overrides["grain-softness"] = parseNum(val, "--grain-softness", 0, 1); break;
        case "--grain-saturation": overrides["grain-saturation"] = parseNum(val, "--grain-saturation", 0, 1); break;
        case "--grain-defocus": overrides["grain-defocus"] = parseNum(val, "--grain-defocus", 0, 5); break;
        case "--vignette-amount": overrides["vignette-amount"] = parseNum(val, "--vignette-amount", 0, 1); break;
        case "--vignette-size": overrides["vignette-size"] = parseNum(val, "--vignette-size", 0, 1); break;
        case "--split-tone-mode":
          if (val !== "natural" && val !== "complementary") {
            throw new Error(`--split-tone-mode must be natural or complementary, got ${val}`);
          }
          overrides["split-tone-mode"] = val; break;
        case "--split-tone-amount": overrides["split-tone-amount"] = parseNum(val, "--split-tone-amount", 0, 1); break;
        case "--split-tone-hue": overrides["split-tone-hue"] = parseNum(val, "--split-tone-hue", 0, 360); break;
        case "--split-tone-pivot": overrides["split-tone-pivot"] = parseNum(val, "--split-tone-pivot", 0, 1); break;
        case "--camera-shake-amount": overrides["camera-shake-amount"] = parseNum(val, "--camera-shake-amount", 0, 1); break;
        case "--camera-shake-rate": overrides["camera-shake-rate"] = parseNum(val, "--camera-shake-rate", 0, 2); break;
      }
      i += 2;
      continue;
    } else {
      // Positional argument = input file
      if (!input) {
        input = arg;
      }
      i++;
      continue;
    }
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
    encodePreset: effectOpts.encodePreset,
    crf: effectOpts.crf,
    blend: effectOpts.blend,
    colorSettings: effectOpts.colorSettings,
    halation: effectOpts.halation,
    aberration: effectOpts.aberration,
    bloom: effectOpts.bloom,
    grain: effectOpts.grain,
    vignette: effectOpts.vignette,
    splitTone: effectOpts.splitTone,
    cameraShake: effectOpts.cameraShake,
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

  if (isSubcommand(args)) {
    const { startUI } = await import("./ui/server");
    const portIdx = args.indexOf("--port");
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 4800;
    await startUI(port);
    return;
  }

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

  await Promise.all([checkDependency("ffmpeg"), checkDependency("ffprobe")]);

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
