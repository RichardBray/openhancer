# Openhancer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-binary CLI that applies four cinematic film effects to video/images in one FFmpeg pass.

**Architecture:** Pure-function effect modules return FFmpeg filter fragments. `pipeline.ts` chains them into one `-filter_complex` graph. `cli.ts` parses args, `probe.ts` detects input type, `progress.ts` renders a progress bar.

**Tech Stack:** Bun, TypeScript, FFmpeg (via `Bun.spawn`)

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/types.ts`

**Step 1: Create `package.json`**

```json
{
  "name": "openhancer",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "bun run src/cli.ts",
    "build": "bun build src/cli.ts --compile --outfile openhancer",
    "test": "bun test"
  }
}
```

**Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["bun-types"]
  },
  "include": ["src"]
}
```

**Step 3: Install bun types**

Run: `bun add -d @types/bun`

**Step 4: Create shared types in `src/types.ts`**

```typescript
export interface FilterResult {
  fragment: string;
  output: string;
}

export interface GradeOptions {
  liftBlacks: number;
  crushWhites: number;
  shadowTint: "warm" | "cool" | "neutral";
  highlightTint: "warm" | "cool" | "neutral";
  fade: number;
}

export interface HalationOptions {
  intensity: number;
  radius: number;
  threshold: number;
  warmth: number;
}

export interface AberrationOptions {
  strength: number;
}

export interface WeaveOptions {
  strength: number;
}

export interface FilmOptions {
  input: string;
  output: string;
  preset: "fast" | "medium" | "slow";
  crf: number;
  grade: GradeOptions;
  halation: HalationOptions;
  aberration: AberrationOptions;
  weave: WeaveOptions;
}

export interface ProbeResult {
  duration: number | null;
  isImage: boolean;
}
```

**Step 5: Commit**

```bash
git add package.json tsconfig.json bun.lockb src/types.ts
git commit -m "feat: scaffold project with package.json, tsconfig, and shared types"
```

---

### Task 2: Probe module

**Files:**
- Create: `src/probe.ts`
- Create: `src/__tests__/probe.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from "bun:test";
import { parseProbeOutput } from "../probe";

describe("parseProbeOutput", () => {
  it("parses video duration", () => {
    const output = "duration=123.456\ncodec_name=h264";
    const result = parseProbeOutput(output);
    expect(result.duration).toBeCloseTo(123.456);
    expect(result.isImage).toBe(false);
  });

  it("detects image input from codec", () => {
    const output = "duration=N/A\ncodec_name=mjpeg";
    const result = parseProbeOutput(output);
    expect(result.duration).toBeNull();
    expect(result.isImage).toBe(true);
  });

  it("detects image input from png codec", () => {
    const output = "duration=N/A\ncodec_name=png";
    const result = parseProbeOutput(output);
    expect(result.duration).toBeNull();
    expect(result.isImage).toBe(true);
  });

  it("returns null duration on missing data", () => {
    const result = parseProbeOutput("");
    expect(result.duration).toBeNull();
    expect(result.isImage).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/probe.test.ts`
Expected: FAIL — `parseProbeOutput` not found

**Step 3: Implement `src/probe.ts`**

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/probe.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/probe.ts src/__tests__/probe.test.ts
git commit -m "feat: add probe module for input detection"
```

---

### Task 3: Grade effect

**Files:**
- Create: `src/effects/grade.ts`
- Create: `src/__tests__/effects/grade.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from "bun:test";
import { gradeFilter } from "../../effects/grade";

describe("gradeFilter", () => {
  it("returns a filter fragment with correct input/output labels", () => {
    const result = gradeFilter("0:v", {
      liftBlacks: 0.05,
      crushWhites: 0.04,
      shadowTint: "warm",
      highlightTint: "cool",
      fade: 0.15,
    });
    expect(result.output).toBe("graded");
    expect(result.fragment).toContain("[0:v]");
    expect(result.fragment).toContain("[graded]");
    expect(result.fragment).toContain("curves=");
  });

  it("includes eq filter for fade/contrast", () => {
    const result = gradeFilter("0:v", {
      liftBlacks: 0.05,
      crushWhites: 0.04,
      shadowTint: "neutral",
      highlightTint: "neutral",
      fade: 0.3,
    });
    expect(result.fragment).toContain("eq=");
    expect(result.fragment).toContain("contrast=");
  });

  it("accepts custom input label", () => {
    const result = gradeFilter("prev_out", {
      liftBlacks: 0.1,
      crushWhites: 0.1,
      shadowTint: "cool",
      highlightTint: "warm",
      fade: 0.0,
    });
    expect(result.fragment).toContain("[prev_out]");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/effects/grade.test.ts`
Expected: FAIL

**Step 3: Implement `src/effects/grade.ts`**

The grade effect uses the `curves` filter to lift blacks and crush whites with per-channel tint adjustments, followed by `eq` for contrast reduction (fade).

Tint mapping:
- **warm shadows:** boost red +0.02, green +0.01 in shadow range
- **cool shadows:** boost blue +0.02 in shadow range
- **warm highlights:** boost red +0.02 in highlight range
- **cool highlights:** boost blue +0.02, reduce red -0.01 in highlight range
- **neutral:** no per-channel offset

```typescript
import type { FilterResult, GradeOptions } from "../types";

function tintOffsets(
  tint: "warm" | "cool" | "neutral",
  region: "shadow" | "highlight"
): { r: number; g: number; b: number } {
  if (tint === "neutral") return { r: 0, g: 0, b: 0 };
  if (tint === "warm") {
    return region === "shadow"
      ? { r: 0.02, g: 0.01, b: 0 }
      : { r: 0.02, g: 0, b: -0.01 };
  }
  // cool
  return region === "shadow"
    ? { r: 0, g: 0, b: 0.02 }
    : { r: -0.01, g: 0, b: 0.02 };
}

export function gradeFilter(input: string, options: GradeOptions): FilterResult {
  const { liftBlacks, crushWhites, shadowTint, highlightTint, fade } = options;

  const shadow = tintOffsets(shadowTint, "shadow");
  const highlight = tintOffsets(highlightTint, "highlight");

  const rLift = (liftBlacks + shadow.r).toFixed(4);
  const gLift = (liftBlacks + shadow.g).toFixed(4);
  const bLift = (liftBlacks + shadow.b).toFixed(4);

  const rCrush = (1 - crushWhites + highlight.r).toFixed(4);
  const gCrush = (1 - crushWhites + highlight.g).toFixed(4);
  const bCrush = (1 - crushWhites + highlight.b).toFixed(4);

  const contrast = (1 - fade).toFixed(4);
  const brightness = (fade * 0.05).toFixed(4);

  const fragment = [
    `[${input}]curves=r='0/${rLift} 1/${rCrush}':g='0/${gLift} 1/${gCrush}':b='0/${bLift} 1/${bCrush}',eq=contrast=${contrast}:brightness=${brightness}[graded]`,
  ].join("");

  return { fragment, output: "graded" };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/effects/grade.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/effects/grade.ts src/__tests__/effects/grade.test.ts
git commit -m "feat: add grade effect (curves + eq for film colour grade)"
```

---

### Task 4: Halation effect

**Files:**
- Create: `src/effects/halation.ts`
- Create: `src/__tests__/effects/halation.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from "bun:test";
import { halationFilter } from "../../effects/halation";

describe("halationFilter", () => {
  it("returns fragment with split, gblur, and blend", () => {
    const result = halationFilter("graded", {
      intensity: 0.6,
      radius: 51,
      threshold: 180,
      warmth: 0.7,
    });
    expect(result.output).toBe("halation_out");
    expect(result.fragment).toContain("[graded]");
    expect(result.fragment).toContain("split=2");
    expect(result.fragment).toContain("gblur=");
    expect(result.fragment).toContain("blend=");
  });

  it("enforces odd radius", () => {
    const result = halationFilter("graded", {
      intensity: 0.6,
      radius: 50,
      threshold: 180,
      warmth: 0.7,
    });
    expect(result.fragment).toContain("gblur=sigma=51");
  });

  it("uses warmth for tinting curves", () => {
    const result = halationFilter("graded", {
      intensity: 0.6,
      radius: 51,
      threshold: 180,
      warmth: 1.0,
    });
    expect(result.fragment).toContain("curves=");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/effects/halation.test.ts`
Expected: FAIL

**Step 3: Implement `src/effects/halation.ts`**

```typescript
import type { FilterResult, HalationOptions } from "../types";

export function halationFilter(input: string, options: HalationOptions): FilterResult {
  const { intensity, threshold, warmth } = options;
  let { radius } = options;

  // Enforce odd radius
  if (radius % 2 === 0) radius += 1;

  // Threshold as 0-1 range for curves
  const thresh = (threshold / 255).toFixed(4);
  const threshLow = Math.max(0, threshold / 255 - 0.05).toFixed(4);

  // Warmth controls red boost and blue reduction in tint
  const redBoost = (warmth * 0.3 + 0.7).toFixed(4);
  const blueCut = (1 - warmth * 0.5).toFixed(4);

  const fragment = [
    `[${input}]split=2[hal_orig][hal_glowsrc];`,
    `[hal_glowsrc]curves=r='0/0 ${threshLow}/0 ${thresh}/1 1/1':g='0/0 ${threshLow}/0 ${thresh}/1 1/1':b='0/0 ${threshLow}/0 ${thresh}/1 1/1'[hal_highlights];`,
    `[hal_highlights]curves=r='0/0 1/${redBoost}':b='0/0 1/${blueCut}'[hal_tinted];`,
    `[hal_tinted]gblur=sigma=${radius}[hal_blurred];`,
    `[hal_orig][hal_blurred]blend=all_mode=screen:all_opacity=${intensity.toFixed(4)}[halation_out]`,
  ].join("");

  return { fragment, output: "halation_out" };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/effects/halation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/effects/halation.ts src/__tests__/effects/halation.test.ts
git commit -m "feat: add halation effect (highlight glow with warm tint)"
```

---

### Task 5: Chromatic aberration effect

**Files:**
- Create: `src/effects/aberration.ts`
- Create: `src/__tests__/effects/aberration.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from "bun:test";
import { aberrationFilter } from "../../effects/aberration";

describe("aberrationFilter", () => {
  it("returns fragment with extractplanes and mergeplanes", () => {
    const result = aberrationFilter("halation_out", { strength: 0.3 });
    expect(result.output).toBe("ab_out");
    expect(result.fragment).toContain("[halation_out]");
    expect(result.fragment).toContain("extractplanes=");
    expect(result.fragment).toContain("mergeplanes=");
  });

  it("scales red larger and blue smaller", () => {
    const result = aberrationFilter("halation_out", { strength: 0.5 });
    // offset = 0.5 * 0.02 = 0.01
    // red scale factor > 1, blue scale factor < 1
    expect(result.fragment).toContain("scale=");
    expect(result.fragment).toContain("crop=");
  });

  it("handles zero strength gracefully", () => {
    const result = aberrationFilter("halation_out", { strength: 0.0 });
    expect(result.output).toBe("ab_out");
    expect(result.fragment).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/effects/aberration.test.ts`
Expected: FAIL

**Step 3: Implement `src/effects/aberration.ts`**

```typescript
import type { FilterResult, AberrationOptions } from "../types";

export function aberrationFilter(input: string, options: AberrationOptions): FilterResult {
  const offset = options.strength * 0.02;

  if (offset === 0) {
    // No aberration — pass through with format conversion round-trip
    const fragment = `[${input}]format=gbrp,format=yuv444p[ab_out]`;
    return { fragment, output: "ab_out" };
  }

  const scaleFactor = (1 + offset).toFixed(6);
  const scaleFactorInv = (1 - offset).toFixed(6);

  const fragment = [
    `[${input}]format=gbrp,split=3[ab_r_src][ab_g_src][ab_b_src];`,
    `[ab_r_src]extractplanes=r[ab_r];`,
    `[ab_g_src]extractplanes=g[ab_g];`,
    `[ab_b_src]extractplanes=b[ab_b];`,
    `[ab_r]scale=iw*${scaleFactor}:ih*${scaleFactor},crop=iw/${scaleFactor}:ih/${scaleFactor}[ab_r_shift];`,
    `[ab_b]scale=iw*${scaleFactorInv}:ih*${scaleFactorInv},pad=iw/${scaleFactorInv}:ih/${scaleFactorInv}:(ow-iw)/2:(oh-ih)/2[ab_b_shift];`,
    `[ab_r_shift][ab_g][ab_b_shift]mergeplanes=0x001020:yuv444p[ab_out]`,
  ].join("");

  return { fragment, output: "ab_out" };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/effects/aberration.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/effects/aberration.ts src/__tests__/effects/aberration.test.ts
git commit -m "feat: add chromatic aberration effect (R/B channel offset)"
```

---

### Task 6: Gate weave effect

**Files:**
- Create: `src/effects/weave.ts`
- Create: `src/__tests__/effects/weave.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from "bun:test";
import { weaveFilter } from "../../effects/weave";

describe("weaveFilter", () => {
  it("returns fragment with crop and scale for drift", () => {
    const result = weaveFilter("ab_out", { strength: 0.3 });
    expect(result.output).toBe("weave_out");
    expect(result.fragment).toContain("[ab_out]");
    expect(result.fragment).toContain("crop=");
    expect(result.fragment).toContain("scale=");
  });

  it("uses sine-based expressions with prime periods", () => {
    const result = weaveFilter("ab_out", { strength: 0.5 });
    expect(result.fragment).toContain("sin(");
    expect(result.fragment).toContain("37");
    expect(result.fragment).toContain("53");
  });

  it("handles zero strength", () => {
    const result = weaveFilter("ab_out", { strength: 0.0 });
    expect(result.output).toBe("weave_out");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/effects/weave.test.ts`
Expected: FAIL

**Step 3: Implement `src/effects/weave.ts`**

```typescript
import type { FilterResult, WeaveOptions } from "../types";

export function weaveFilter(input: string, options: WeaveOptions): FilterResult {
  const { strength } = options;

  if (strength === 0) {
    const fragment = `[${input}]null[weave_out]`;
    return { fragment, output: "weave_out" };
  }

  const pad = Math.ceil(strength * 6);
  const amp = (strength * 3).toFixed(4);
  const period1 = 37;
  const period2 = 53;

  const fragment = [
    `[${input}]crop=`,
    `w=iw-${pad}:`,
    `h=ih-${pad}:`,
    `x=${pad}/2+${amp}*sin(n/${period1}):`,
    `y=${pad}/2+${amp}*sin(n/${period2}+1.3),`,
    `scale=iw+${pad}:ih+${pad}[weave_out]`,
  ].join("");

  return { fragment, output: "weave_out" };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/effects/weave.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/effects/weave.ts src/__tests__/effects/weave.test.ts
git commit -m "feat: add gate weave effect (sine-based frame drift)"
```

---

### Task 7: Progress bar

**Files:**
- Create: `src/progress.ts`
- Create: `src/__tests__/progress.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from "bun:test";
import { renderProgressBar, parseProgress } from "../progress";

describe("renderProgressBar", () => {
  it("renders 0% progress", () => {
    const bar = renderProgressBar(0, 20);
    expect(bar).toContain("0.0%");
    expect(bar).toContain("░");
  });

  it("renders 50% progress", () => {
    const bar = renderProgressBar(0.5, 20);
    expect(bar).toContain("50.0%");
    expect(bar).toContain("█");
  });

  it("renders 100% progress", () => {
    const bar = renderProgressBar(1.0, 20);
    expect(bar).toContain("100.0%");
  });

  it("clamps above 1.0", () => {
    const bar = renderProgressBar(1.5, 20);
    expect(bar).toContain("100.0%");
  });
});

describe("parseProgress", () => {
  it("extracts out_time_ms and computes ratio", () => {
    const chunk = "frame=100\nout_time_ms=5000000\nprogress=continue\n";
    const ratio = parseProgress(chunk, 10);
    expect(ratio).toBeCloseTo(0.5);
  });

  it("returns null on missing out_time_ms", () => {
    const ratio = parseProgress("frame=100\n", 10);
    expect(ratio).toBeNull();
  });

  it("returns null when duration is null", () => {
    const ratio = parseProgress("out_time_ms=5000000\n", null);
    expect(ratio).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/progress.test.ts`
Expected: FAIL

**Step 3: Implement `src/progress.ts`**

```typescript
export function renderProgressBar(progress: number, width = 40): string {
  const clamped = Math.min(1, Math.max(0, progress));
  const filled = Math.round(clamped * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const pct = (clamped * 100).toFixed(1);
  return `[${bar}] ${pct}%`;
}

export function parseProgress(chunk: string, duration: number | null): number | null {
  if (duration === null || duration <= 0) return null;

  const match = chunk.match(/out_time_ms=(\d+)/);
  if (!match) return null;

  const timeMs = parseInt(match[1], 10);
  return timeMs / (duration * 1_000_000);
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/progress.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/progress.ts src/__tests__/progress.test.ts
git commit -m "feat: add progress bar rendering and FFmpeg progress parsing"
```

---

### Task 8: Pipeline — filter graph assembly

**Files:**
- Create: `src/pipeline.ts`
- Create: `src/__tests__/pipeline.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from "bun:test";
import { buildFilterGraph } from "../pipeline";
import type { FilmOptions } from "../types";

const defaults: FilmOptions = {
  input: "test.mp4",
  output: "test_openhanced.mp4",
  preset: "medium",
  crf: 18,
  grade: {
    liftBlacks: 0.05,
    crushWhites: 0.04,
    shadowTint: "warm",
    highlightTint: "cool",
    fade: 0.15,
  },
  halation: {
    intensity: 0.6,
    radius: 51,
    threshold: 180,
    warmth: 0.7,
  },
  aberration: { strength: 0.3 },
  weave: { strength: 0.3 },
};

describe("buildFilterGraph", () => {
  it("chains all four effects for video", () => {
    const { graph, finalLabel } = buildFilterGraph(defaults, false);
    expect(graph).toContain("[0:v]");
    expect(graph).toContain("[graded]");
    expect(graph).toContain("[halation_out]");
    expect(graph).toContain("[ab_out]");
    expect(graph).toContain("[weave_out]");
    expect(finalLabel).toBe("weave_out");
  });

  it("skips weave for image input", () => {
    const { graph, finalLabel } = buildFilterGraph(defaults, true);
    expect(graph).not.toContain("weave");
    expect(finalLabel).toBe("ab_out");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/pipeline.test.ts`
Expected: FAIL

**Step 3: Implement `src/pipeline.ts`**

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/pipeline.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pipeline.ts src/__tests__/pipeline.test.ts
git commit -m "feat: add pipeline module (filter graph assembly + FFmpeg execution)"
```

---

### Task 9: CLI — argument parsing and validation

**Files:**
- Create: `src/cli.ts`
- Create: `src/__tests__/cli.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from "bun:test";
import { parseArgs, getDefaultOutput } from "../cli";

describe("parseArgs", () => {
  it("parses input file as first positional arg", () => {
    const result = parseArgs(["input.mp4"]);
    expect(result.input).toBe("input.mp4");
  });

  it("parses --output flag", () => {
    const result = parseArgs(["input.mp4", "--output", "out.mp4"]);
    expect(result.output).toBe("out.mp4");
  });

  it("parses -o shorthand", () => {
    const result = parseArgs(["input.mp4", "-o", "out.mp4"]);
    expect(result.output).toBe("out.mp4");
  });

  it("parses numeric flags with validation", () => {
    const result = parseArgs(["input.mp4", "--lift", "0.1", "--crf", "23"]);
    expect(result.grade.liftBlacks).toBe(0.1);
    expect(result.crf).toBe(23);
  });

  it("parses tint flags", () => {
    const result = parseArgs(["input.mp4", "--shadow-tint", "cool"]);
    expect(result.grade.shadowTint).toBe("cool");
  });

  it("throws on unknown flag", () => {
    expect(() => parseArgs(["input.mp4", "--unknown"])).toThrow();
  });

  it("throws on out-of-range value", () => {
    expect(() => parseArgs(["input.mp4", "--lift", "0.5"])).toThrow();
  });

  it("throws with no input", () => {
    expect(() => parseArgs([])).toThrow();
  });

  it("detects --help flag", () => {
    const result = parseArgs(["--help"]);
    expect(result.help).toBe(true);
  });
});

describe("getDefaultOutput", () => {
  it("appends _openhanced before extension", () => {
    expect(getDefaultOutput("video.mp4")).toBe("video_openhanced.mp4");
  });

  it("handles .mov files", () => {
    expect(getDefaultOutput("clip.mov")).toBe("clip_openhanced.mov");
  });

  it("handles paths with directories", () => {
    expect(getDefaultOutput("/path/to/video.mp4")).toBe("/path/to/video_openhanced.mp4");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/cli.test.ts`
Expected: FAIL

**Step 3: Implement `src/cli.ts`**

```typescript
import { existsSync } from "fs";
import { probe } from "./probe";
import { runPipeline } from "./pipeline";
import type { FilmOptions, GradeOptions, HalationOptions, AberrationOptions, WeaveOptions } from "./types";
import path from "path";

const HELP_TEXT = `
openhancer <input> [options]

  Input/Output:
  --output, -o <path>       Output path (default: <input>_openhanced.<ext>)
  --preset     <string>     FFmpeg preset: fast/medium/slow (default: medium)
  --crf        <0-51>       Quality — lower is better (default: 18)

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
  --halation-warmth     <0-1>    (default: 0.7)

  Chromatic Aberration:
  --aberration  <0-1>   (default: 0.3)

  Gate Weave:
  --weave  <0-1>   (default: 0.3)

  General:
  --help, -h     Show this help
`.trim();

const KNOWN_FLAGS = new Set([
  "--output", "-o", "--preset", "--crf",
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
  return `${base}_openhanced${ext}`;
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
  const grade: GradeOptions = {
    liftBlacks: 0.05,
    crushWhites: 0.04,
    shadowTint: "warm",
    highlightTint: "cool",
    fade: 0.15,
  };
  const halation: HalationOptions = {
    intensity: 0.6,
    radius: 51,
    threshold: 180,
    warmth: 0.7,
  };
  const aberration: AberrationOptions = { strength: 0.3 };
  const weave: WeaveOptions = { strength: 0.3 };

  let input = "";
  let output = "";
  let preset: "fast" | "medium" | "slow" = "medium";
  let crf = 18;
  let help = false;

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
          case "--preset":
            if (val !== "fast" && val !== "medium" && val !== "slow") {
              throw new Error(`--preset must be fast, medium, or slow, got ${val}`);
            }
            preset = val; break;
          case "--crf": crf = parseNum(val, "--crf", 0, 51); break;
          case "--lift": grade.liftBlacks = parseNum(val, "--lift", 0, 0.15); break;
          case "--crush": grade.crushWhites = parseNum(val, "--crush", 0, 0.15); break;
          case "--fade": grade.fade = parseNum(val, "--fade", 0, 1); break;
          case "--shadow-tint": grade.shadowTint = parseTint(val, "--shadow-tint"); break;
          case "--highlight-tint": grade.highlightTint = parseTint(val, "--highlight-tint"); break;
          case "--halation-intensity": halation.intensity = parseNum(val, "--halation-intensity", 0, 1); break;
          case "--halation-radius": halation.radius = parseNum(val, "--halation-radius", 1, 999); break;
          case "--halation-threshold": halation.threshold = parseNum(val, "--halation-threshold", 0, 255); break;
          case "--halation-warmth": halation.warmth = parseNum(val, "--halation-warmth", 0, 1); break;
          case "--aberration": aberration.strength = parseNum(val, "--aberration", 0, 1); break;
          case "--weave": weave.strength = parseNum(val, "--weave", 0, 1); break;
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

  return { input, output, preset, crf, grade, halation, aberration, weave, help };
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

main();
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/cli.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli.ts src/__tests__/cli.test.ts
git commit -m "feat: add CLI with argument parsing, validation, and main entrypoint"
```

---

### Task 10: E2E tests — real FFmpeg execution

**Files:**
- Create: `src/__tests__/e2e/fixtures/generate-fixtures.sh`
- Create: `src/__tests__/e2e/openhancer.e2e.test.ts`

**Step 1: Create test fixture generator**

Generate minimal test media files using FFmpeg (no binary fixtures in git):

```bash
#!/bin/bash
# src/__tests__/e2e/fixtures/generate-fixtures.sh
# Generates tiny test fixtures for e2e tests
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

# 1-second 64x64 red-to-blue gradient video (tiny, fast to process)
ffmpeg -y -f lavfi -i "color=c=red:s=64x64:d=1,format=yuv420p" \
  -c:v libx264 -preset ultrafast -crf 28 \
  "$DIR/test.mp4"

# 64x64 solid red PNG image
ffmpeg -y -f lavfi -i "color=c=red:s=64x64:d=1,format=rgb24" \
  -frames:v 1 \
  "$DIR/test.png"

# 1-second 64x64 video as .mov
ffmpeg -y -f lavfi -i "color=c=blue:s=64x64:d=1,format=yuv420p" \
  -c:v libx264 -preset ultrafast -crf 28 \
  "$DIR/test.mov"

echo "Fixtures generated."
```

**Step 2: Write the e2e tests**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, unlinkSync } from "fs";
import path from "path";

const FIXTURES_DIR = path.join(import.meta.dir, "fixtures");
const CLI_PATH = path.join(import.meta.dir, "../../../src/cli.ts");

// Helper to run openhancer via bun
async function runOpenhancer(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", CLI_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: FIXTURES_DIR,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

// Clean up output files after tests
function cleanup(files: string[]) {
  for (const f of files) {
    const p = path.join(FIXTURES_DIR, f);
    if (existsSync(p)) unlinkSync(p);
  }
}

describe("e2e: openhancer", () => {
  beforeAll(async () => {
    // Generate fixtures if missing
    if (!existsSync(path.join(FIXTURES_DIR, "test.mp4"))) {
      const proc = Bun.spawn(["bash", path.join(FIXTURES_DIR, "generate-fixtures.sh")], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
    }
  });

  afterAll(() => {
    cleanup([
      "test_openhanced.mp4",
      "test_openhanced.png",
      "test_openhanced.mov",
      "custom_output.mp4",
    ]);
  });

  it("prints help with --help", async () => {
    const { exitCode, stdout } = await runOpenhancer(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("openhancer <input>");
    expect(stdout).toContain("--output");
  });

  it("exits with error on no input", async () => {
    const { exitCode, stderr } = await runOpenhancer([]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("No input file");
  });

  it("exits with error on unknown flag", async () => {
    const { exitCode, stderr } = await runOpenhancer(["test.mp4", "--bogus"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Unknown flag");
  });

  it("exits with error on out-of-range flag", async () => {
    const { exitCode, stderr } = await runOpenhancer(["test.mp4", "--lift", "0.9"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("must be between");
  });

  it("exits with error on missing input file", async () => {
    const { exitCode, stderr } = await runOpenhancer(["nonexistent.mp4"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("not found");
  });

  it("processes an image (png) with defaults", async () => {
    cleanup(["test_openhanced.png"]);
    const { exitCode, stdout, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.png"),
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("(image)");
    expect(stdout).toContain("Done.");
    expect(existsSync(path.join(FIXTURES_DIR, "test_openhanced.png"))).toBe(true);
  });

  it("processes a video (mp4) with defaults", async () => {
    cleanup(["test_openhanced.mp4"]);
    const { exitCode, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.mp4"),
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(existsSync(path.join(FIXTURES_DIR, "test_openhanced.mp4"))).toBe(true);
  });

  it("processes a .mov file", async () => {
    cleanup(["test_openhanced.mov"]);
    const { exitCode, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.mov"),
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(existsSync(path.join(FIXTURES_DIR, "test_openhanced.mov"))).toBe(true);
  });

  it("respects --output flag", async () => {
    cleanup(["custom_output.mp4"]);
    const outPath = path.join(FIXTURES_DIR, "custom_output.mp4");
    const { exitCode, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.mp4"),
      "-o", outPath,
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(existsSync(outPath)).toBe(true);
  });

  it("processes video with custom effect parameters", async () => {
    cleanup(["test_openhanced.mp4"]);
    const { exitCode, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.mp4"),
      "--lift", "0.1",
      "--crush", "0.08",
      "--fade", "0.3",
      "--halation-intensity", "0.8",
      "--aberration", "0.5",
      "--weave", "0.5",
      "--preset", "fast",
      "--crf", "28",
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(existsSync(path.join(FIXTURES_DIR, "test_openhanced.mp4"))).toBe(true);
  });
});
```

**Step 3: Run e2e tests**

Run: `bun test src/__tests__/e2e/`
Expected: All PASS (requires FFmpeg installed)

**Step 4: Add `.gitignore` entry for fixture outputs**

Add to project `.gitignore`:
```
# E2E test fixtures (generated, not committed)
src/__tests__/e2e/fixtures/test.mp4
src/__tests__/e2e/fixtures/test.png
src/__tests__/e2e/fixtures/test.mov
*_openhanced.*
```

**Step 5: Commit**

```bash
git add src/__tests__/e2e/ .gitignore
git commit -m "test: add e2e tests with FFmpeg fixture generation"
```

---

### Task 11: Build, symlink, and final smoke test

**Files:**
- No new files

**Step 1: Run all tests (unit + e2e)**

Run: `bun test`
Expected: All tests PASS

**Step 2: Build the binary**

Run: `bun run build`
Expected: Produces `openhancer` binary in project root

**Step 3: Verify help output**

Run: `./openhancer --help`
Expected: Prints the full flag reference

**Step 4: Create oph symlink**

```bash
ln -sf openhancer oph
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: complete v1 build — all tests passing, binary compiles"
```

---

## Dependency graph

```
Task 1 (scaffold)
  ├→ Task 2 (probe)
  ├→ Task 3 (grade)
  ├→ Task 4 (halation)
  ├→ Task 5 (aberration)
  ├→ Task 6 (weave)
  └→ Task 7 (progress)
       ↓
  Task 8 (pipeline) — depends on Tasks 2-7
       ↓
  Task 9 (cli) — depends on Task 8
       ↓
  Task 10 (e2e tests) — depends on Task 9
       ↓
  Task 11 (build + smoke test) — depends on Task 10
```

Tasks 2–7 can be executed in parallel after Task 1. Tasks 8–11 are sequential.
