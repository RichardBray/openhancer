# Effect Options Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename existing effects and add new effects (Grain, Vignette, Split Tone, Bloom, Global Blend) to match a cinematic grading UI, with enable/disable toggles for each effect group.

**Architecture:** Each effect remains a pure function in `src/effects/` returning `FilterResult`. The pipeline chains them in order: Color Settings → Halation → Aberration → Bloom → Grain → Vignette → Split Tone → Camera Shake → Global Blend. Each effect group gets an `enabled` boolean. Global Blend blends the final processed output with the original input using FFmpeg's `blend` filter.

**Tech Stack:** TypeScript, Bun, FFmpeg filter_complex

---

### Task 1: Create feature branch

**Step 1: Create and checkout branch**

Run: `git checkout -b feat/effect-options-overhaul`

**Step 2: Commit placeholder**

No commit needed yet — branch is ready.

---

### Task 2: Update types — rename and expand all option interfaces

**Files:**
- Modify: `src/types.ts`

**Step 1: Write the new types file content**

Replace the entire contents of `src/types.ts` with:

```typescript
export interface FilterResult {
  fragment: string;
  output: string;
}

export interface ColorSettingsOptions {
  enabled: boolean;
  exposure: number;
  contrast: number;
  highlights: number;
  fade: number;
  whiteBalance: number;
  tint: number;
  subtractiveSat: number;
  richness: number;
  bleachBypass: number;
}

export interface HalationOptions {
  enabled: boolean;
  amount: number;
  radius: number;
  saturation: number;
  hue: number;
  highlightsOnly: boolean;
}

export interface AberrationOptions {
  enabled: boolean;
  amount: number;
}

export interface CameraShakeOptions {
  enabled: boolean;
  amount: number;
  rate: number;
}

export interface GrainOptions {
  enabled: boolean;
  amount: number;
  size: number;
  softness: number;
  saturation: number;
  imageDefocus: number;
}

export interface VignetteOptions {
  enabled: boolean;
  amount: number;
  size: number;
}

export interface SplitToneOptions {
  enabled: boolean;
  mode: "natural" | "complementary";
  protectNeutrals: boolean;
  amount: number;
  hueAngle: number;
  pivot: number;
}

export interface BloomOptions {
  enabled: boolean;
  amount: number;
  radius: number;
}

export interface FilmOptions {
  input: string;
  output: string;
  preset: "fast" | "medium" | "slow";
  crf: number;
  blend: number;
  colorSettings: ColorSettingsOptions;
  halation: HalationOptions;
  aberration: AberrationOptions;
  bloom: BloomOptions;
  grain: GrainOptions;
  vignette: VignetteOptions;
  splitTone: SplitToneOptions;
  cameraShake: CameraShakeOptions;
}

export interface ProbeResult {
  duration: number | null;
  isImage: boolean;
}
```

**Step 2: Run tests to confirm they fail (expected — downstream code not updated yet)**

Run: `bun test src/__tests__/effects/grade.test.ts`
Expected: FAIL (GradeOptions no longer exists)

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "refactor(types): replace old option interfaces with new effect options"
```

---

### Task 3: Rewrite Color Settings effect (replaces grade)

**Files:**
- Create: `src/effects/colorSettings.ts`
- Delete: `src/effects/grade.ts`
- Test: `src/__tests__/effects/colorSettings.test.ts`
- Delete: `src/__tests__/effects/grade.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/effects/colorSettings.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { colorSettingsFilter } from "../../effects/colorSettings";
import type { ColorSettingsOptions } from "../../types";

const defaults: ColorSettingsOptions = {
  enabled: true,
  exposure: 0,
  contrast: 1,
  highlights: 0,
  fade: 0,
  whiteBalance: 6500,
  tint: 0,
  subtractiveSat: 1,
  richness: 1,
  bleachBypass: 0,
};

describe("colorSettingsFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = colorSettingsFilter("0:v", { ...defaults, enabled: false });
    expect(result.output).toBe("color_out");
    expect(result.fragment).toContain("null");
  });

  it("returns fragment with eq filter for exposure and contrast", () => {
    const result = colorSettingsFilter("0:v", { ...defaults, exposure: 0.12, contrast: 1.2 });
    expect(result.output).toBe("color_out");
    expect(result.fragment).toContain("[0:v]");
    expect(result.fragment).toContain("eq=");
    expect(result.fragment).toContain("[color_out]");
  });

  it("applies white balance via colortemperature filter", () => {
    const result = colorSettingsFilter("0:v", { ...defaults, whiteBalance: 5000 });
    expect(result.fragment).toContain("colortemperature=");
    expect(result.fragment).toContain("5000");
  });

  it("applies saturation via eq filter", () => {
    const result = colorSettingsFilter("0:v", { ...defaults, subtractiveSat: 1.2 });
    expect(result.fragment).toContain("saturation=");
  });

  it("applies fade as brightness boost and contrast reduction", () => {
    const result = colorSettingsFilter("0:v", { ...defaults, fade: 0.3 });
    expect(result.fragment).toContain("contrast=");
    expect(result.fragment).toContain("brightness=");
  });

  it("applies bleach bypass as desaturation blended with contrast", () => {
    const result = colorSettingsFilter("0:v", { ...defaults, bleachBypass: 0.5 });
    expect(result.fragment).toContain("blend=");
  });

  it("accepts custom input label", () => {
    const result = colorSettingsFilter("prev_out", defaults);
    expect(result.fragment).toContain("[prev_out]");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/effects/colorSettings.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/effects/colorSettings.ts`:

```typescript
import type { FilterResult, ColorSettingsOptions } from "../types";

export function colorSettingsFilter(input: string, options: ColorSettingsOptions): FilterResult {
  if (!options.enabled) {
    return { fragment: `[${input}]null[color_out]`, output: "color_out" };
  }

  const filters: string[] = [];

  // Exposure: map to eq brightness (-1 to 1 range, exposure is typically -2 to +2)
  // Contrast: direct mapping to eq contrast
  // Fade: reduces contrast and lifts blacks (brightness boost)
  const contrast = (options.contrast * (1 - options.fade)).toFixed(4);
  const brightness = (options.exposure * 0.1 + options.fade * 0.05).toFixed(4);
  const saturation = (options.subtractiveSat * options.richness).toFixed(4);

  // Highlights: compress highlights by adjusting gamma
  const gamma = (1 - options.highlights * 0.5).toFixed(4);

  filters.push(`eq=contrast=${contrast}:brightness=${brightness}:saturation=${saturation}:gamma=${gamma}`);

  // White balance via colortemperature
  if (options.whiteBalance !== 6500) {
    filters.push(`colortemperature=temperature=${options.whiteBalance}`);
  }

  // Tint: green-magenta shift via colorbalance
  if (options.tint !== 0) {
    const tintVal = (options.tint / 100).toFixed(4);
    filters.push(`colorbalance=gm=${tintVal}:gh=${tintVal}:gs=${tintVal}`);
  }

  // Bleach bypass: blend with desaturated high-contrast version
  if (options.bleachBypass > 0) {
    const bp = options.bleachBypass.toFixed(4);
    const mainChain = filters.join(",");
    const fragment = [
      `[${input}]split=2[clr_main][clr_bp];`,
      `[clr_main]${mainChain}[clr_graded];`,
      `[clr_bp]${mainChain},hue=s=0,eq=contrast=1.3[clr_desat];`,
      `[clr_graded][clr_desat]blend=all_mode=normal:all_opacity=${bp}[color_out]`,
    ].join("");
    return { fragment, output: "color_out" };
  }

  const fragment = `[${input}]${filters.join(",")}[color_out]`;
  return { fragment, output: "color_out" };
}
```

**Step 4: Run tests**

Run: `bun test src/__tests__/effects/colorSettings.test.ts`
Expected: PASS

**Step 5: Delete old grade files**

```bash
rm src/effects/grade.ts src/__tests__/effects/grade.test.ts
```

**Step 6: Commit**

```bash
git add src/effects/colorSettings.ts src/__tests__/effects/colorSettings.test.ts
git add -u
git commit -m "feat(colorSettings): replace grade with expanded color settings effect"
```

---

### Task 4: Update Halation effect — rename params, add saturation/hue/highlightsOnly

**Files:**
- Modify: `src/effects/halation.ts`
- Modify: `src/__tests__/effects/halation.test.ts`

**Step 1: Rewrite the halation test**

Replace `src/__tests__/effects/halation.test.ts` with:

```typescript
import { describe, it, expect } from "bun:test";
import { halationFilter } from "../../effects/halation";
import type { HalationOptions } from "../../types";

const defaults: HalationOptions = {
  enabled: true,
  amount: 0.25,
  radius: 4,
  saturation: 1,
  hue: 0.5,
  highlightsOnly: true,
};

describe("halationFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = halationFilter("graded", { ...defaults, enabled: false });
    expect(result.output).toBe("halation_out");
    expect(result.fragment).toContain("null");
  });

  it("returns fragment with split, gblur, and blend", () => {
    const result = halationFilter("color_out", defaults);
    expect(result.output).toBe("halation_out");
    expect(result.fragment).toContain("[color_out]");
    expect(result.fragment).toContain("gblur=");
    expect(result.fragment).toContain("blend=");
  });

  it("applies highlight threshold when highlightsOnly is true", () => {
    const result = halationFilter("color_out", { ...defaults, highlightsOnly: true });
    expect(result.fragment).toContain("curves=");
  });

  it("skips highlight threshold when highlightsOnly is false", () => {
    const result = halationFilter("color_out", { ...defaults, highlightsOnly: false });
    expect(result.fragment).not.toContain("curves=");
  });

  it("applies hue rotation via hue filter", () => {
    const result = halationFilter("color_out", { ...defaults, hue: 0.7 });
    expect(result.fragment).toContain("hue=");
  });

  it("applies saturation control", () => {
    const result = halationFilter("color_out", { ...defaults, saturation: 1.5 });
    expect(result.fragment).toContain("hue=");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/effects/halation.test.ts`
Expected: FAIL

**Step 3: Rewrite halation implementation**

Replace `src/effects/halation.ts` with:

```typescript
import type { FilterResult, HalationOptions } from "../types";

export function halationFilter(input: string, options: HalationOptions): FilterResult {
  if (!options.enabled) {
    return { fragment: `[${input}]null[halation_out]`, output: "halation_out" };
  }

  const { amount, radius, saturation, hue, highlightsOnly } = options;

  // Radius maps to gblur sigma
  const sigma = Math.max(1, radius).toFixed(2);

  // Hue maps to hue rotation in degrees (0-1 → 0-360)
  const hueDeg = (hue * 360).toFixed(2);

  const steps: string[] = [];

  steps.push(`[${input}]split=2[hal_orig][hal_glowsrc]`);

  if (highlightsOnly) {
    // Extract highlights via curves threshold
    steps.push(`[hal_glowsrc]curves=r='0/0 0.65/0 0.75/1 1/1':g='0/0 0.65/0 0.75/1 1/1':b='0/0 0.65/0 0.75/1 1/1'[hal_highlights]`);
    steps.push(`[hal_highlights]hue=h=${hueDeg}:s=${saturation.toFixed(4)},gblur=sigma=${sigma}[hal_blurred]`);
  } else {
    steps.push(`[hal_glowsrc]hue=h=${hueDeg}:s=${saturation.toFixed(4)},gblur=sigma=${sigma}[hal_blurred]`);
  }

  steps.push(`[hal_orig][hal_blurred]blend=all_mode=screen:all_opacity=${amount.toFixed(4)}[halation_out]`);

  return { fragment: steps.join(";"), output: "halation_out" };
}
```

**Step 4: Run tests**

Run: `bun test src/__tests__/effects/halation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/effects/halation.ts src/__tests__/effects/halation.test.ts
git commit -m "refactor(halation): rename params to amount/radius/saturation/hue/highlightsOnly"
```

---

### Task 5: Update Aberration — rename strength to amount, add enabled

**Files:**
- Modify: `src/effects/aberration.ts`
- Modify: `src/__tests__/effects/aberration.test.ts`

**Step 1: Update test**

Replace `src/__tests__/effects/aberration.test.ts` with:

```typescript
import { describe, it, expect } from "bun:test";
import { aberrationFilter } from "../../effects/aberration";

describe("aberrationFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = aberrationFilter("halation_out", { enabled: false, amount: 0.3 });
    expect(result.output).toBe("ab_out");
    expect(result.fragment).toContain("null");
  });

  it("returns fragment with extractplanes and mergeplanes", () => {
    const result = aberrationFilter("halation_out", { enabled: true, amount: 0.3 });
    expect(result.output).toBe("ab_out");
    expect(result.fragment).toContain("[halation_out]");
    expect(result.fragment).toContain("extractplanes=");
    expect(result.fragment).toContain("mergeplanes=");
  });

  it("handles zero amount gracefully", () => {
    const result = aberrationFilter("halation_out", { enabled: true, amount: 0 });
    expect(result.output).toBe("ab_out");
    expect(result.fragment).toContain("format=");
  });
});
```

**Step 2: Run test — should fail**

Run: `bun test src/__tests__/effects/aberration.test.ts`

**Step 3: Update implementation**

In `src/effects/aberration.ts`, change the function signature and body to use `options.amount` instead of `options.strength`, and add disabled passthrough:

```typescript
import type { FilterResult, AberrationOptions } from "../types";

export function aberrationFilter(input: string, options: AberrationOptions): FilterResult {
  if (!options.enabled) {
    return { fragment: `[${input}]null[ab_out]`, output: "ab_out" };
  }

  const offset = options.amount * 0.02;

  if (offset === 0) {
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
    `[ab_r]scale=iw*${scaleFactor}:ih*${scaleFactor},crop=iw/${scaleFactor}:ih/${scaleFactor}[ab_r_crop];`,
    `[ab_g]scale=iw:ih[ab_g_ref];`,
    `[ab_r_crop][ab_g_ref]scale2ref[ab_r_shift][ab_g_sized];`,
    `[ab_b]scale=iw*${scaleFactorInv}:ih*${scaleFactorInv},pad=iw/${scaleFactorInv}:ih/${scaleFactorInv}:(ow-iw)/2:(oh-ih)/2[ab_b_pad];`,
    `[ab_b_pad][ab_g_sized]scale2ref[ab_b_shift][ab_g_final];`,
    `[ab_g_final][ab_b_shift][ab_r_shift]mergeplanes=0x001020:gbrp,format=yuv444p[ab_out]`,
  ].join("");

  return { fragment, output: "ab_out" };
}
```

**Step 4: Run tests**

Run: `bun test src/__tests__/effects/aberration.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/effects/aberration.ts src/__tests__/effects/aberration.test.ts
git commit -m "refactor(aberration): rename strength to amount, add enabled toggle"
```

---

### Task 6: Rename Weave → Camera Shake, update params to amount/rate

**Files:**
- Create: `src/effects/cameraShake.ts`
- Delete: `src/effects/weave.ts`
- Create: `src/__tests__/effects/cameraShake.test.ts`
- Delete: `src/__tests__/effects/weave.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/effects/cameraShake.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { cameraShakeFilter } from "../../effects/cameraShake";
import type { CameraShakeOptions } from "../../types";

const defaults: CameraShakeOptions = {
  enabled: true,
  amount: 0.25,
  rate: 0.5,
};

describe("cameraShakeFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = cameraShakeFilter("ab_out", { ...defaults, enabled: false });
    expect(result.output).toBe("shake_out");
    expect(result.fragment).toContain("null");
  });

  it("returns fragment with crop and scale for drift", () => {
    const result = cameraShakeFilter("ab_out", defaults);
    expect(result.output).toBe("shake_out");
    expect(result.fragment).toContain("[ab_out]");
    expect(result.fragment).toContain("crop=");
    expect(result.fragment).toContain("scale=");
  });

  it("uses sine-based expressions", () => {
    const result = cameraShakeFilter("ab_out", defaults);
    expect(result.fragment).toContain("sin(");
  });

  it("rate controls the frequency of shake", () => {
    const slow = cameraShakeFilter("ab_out", { ...defaults, rate: 0.1 });
    const fast = cameraShakeFilter("ab_out", { ...defaults, rate: 1.0 });
    // Higher rate = smaller period divisor = faster oscillation
    expect(slow.fragment).not.toBe(fast.fragment);
  });

  it("handles zero amount", () => {
    const result = cameraShakeFilter("ab_out", { ...defaults, amount: 0 });
    expect(result.output).toBe("shake_out");
    expect(result.fragment).toContain("null");
  });
});
```

**Step 2: Run test — should fail**

Run: `bun test src/__tests__/effects/cameraShake.test.ts`

**Step 3: Write implementation**

Create `src/effects/cameraShake.ts`:

```typescript
import type { FilterResult, CameraShakeOptions } from "../types";

export function cameraShakeFilter(input: string, options: CameraShakeOptions): FilterResult {
  if (!options.enabled || options.amount === 0) {
    return { fragment: `[${input}]null[shake_out]`, output: "shake_out" };
  }

  const { amount, rate } = options;
  const pad = Math.ceil(amount * 6);
  const amp = (amount * 3).toFixed(4);

  // Rate controls oscillation speed: higher rate = smaller period = faster shake
  // Base periods are primes; rate scales them inversely
  const rateScale = Math.max(0.1, rate);
  const period1 = Math.round(37 / rateScale);
  const period2 = Math.round(53 / rateScale);

  const fragment = [
    `[${input}]crop=`,
    `w=iw-${pad}:`,
    `h=ih-${pad}:`,
    `x=${pad}/2+${amp}*sin(n/${period1}):`,
    `y=${pad}/2+${amp}*sin(n/${period2}+1.3),`,
    `scale=iw+${pad}:ih+${pad}[shake_out]`,
  ].join("");

  return { fragment, output: "shake_out" };
}
```

**Step 4: Run tests**

Run: `bun test src/__tests__/effects/cameraShake.test.ts`
Expected: PASS

**Step 5: Delete old weave files**

```bash
rm src/effects/weave.ts src/__tests__/effects/weave.test.ts
```

**Step 6: Commit**

```bash
git add src/effects/cameraShake.ts src/__tests__/effects/cameraShake.test.ts
git add -u
git commit -m "refactor(cameraShake): rename weave to camera shake with amount/rate params"
```

---

### Task 7: New effect — Bloom

**Files:**
- Create: `src/effects/bloom.ts`
- Create: `src/__tests__/effects/bloom.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/effects/bloom.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { bloomFilter } from "../../effects/bloom";
import type { BloomOptions } from "../../types";

const defaults: BloomOptions = {
  enabled: true,
  amount: 0.25,
  radius: 10,
};

describe("bloomFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = bloomFilter("ab_out", { ...defaults, enabled: false });
    expect(result.output).toBe("bloom_out");
    expect(result.fragment).toContain("null");
  });

  it("returns fragment with split, gblur, and blend", () => {
    const result = bloomFilter("ab_out", defaults);
    expect(result.output).toBe("bloom_out");
    expect(result.fragment).toContain("[ab_out]");
    expect(result.fragment).toContain("split=2");
    expect(result.fragment).toContain("gblur=");
    expect(result.fragment).toContain("blend=");
  });

  it("uses radius as gblur sigma", () => {
    const result = bloomFilter("ab_out", { ...defaults, radius: 20 });
    expect(result.fragment).toContain("gblur=sigma=20");
  });

  it("uses amount as blend opacity", () => {
    const result = bloomFilter("ab_out", { ...defaults, amount: 0.5 });
    expect(result.fragment).toContain("0.5000");
  });
});
```

**Step 2: Run test — should fail**

Run: `bun test src/__tests__/effects/bloom.test.ts`

**Step 3: Write implementation**

Create `src/effects/bloom.ts`:

```typescript
import type { FilterResult, BloomOptions } from "../types";

export function bloomFilter(input: string, options: BloomOptions): FilterResult {
  if (!options.enabled) {
    return { fragment: `[${input}]null[bloom_out]`, output: "bloom_out" };
  }

  const { amount, radius } = options;

  const fragment = [
    `[${input}]split=2[bloom_orig][bloom_src];`,
    `[bloom_src]gblur=sigma=${radius}[bloom_blur];`,
    `[bloom_orig][bloom_blur]blend=all_mode=screen:all_opacity=${amount.toFixed(4)}[bloom_out]`,
  ].join("");

  return { fragment, output: "bloom_out" };
}
```

**Step 4: Run tests**

Run: `bun test src/__tests__/effects/bloom.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/effects/bloom.ts src/__tests__/effects/bloom.test.ts
git commit -m "feat(bloom): add bloom effect with amount and radius"
```

---

### Task 8: New effect — Grain

**Files:**
- Create: `src/effects/grain.ts`
- Create: `src/__tests__/effects/grain.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/effects/grain.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { grainFilter } from "../../effects/grain";
import type { GrainOptions } from "../../types";

const defaults: GrainOptions = {
  enabled: true,
  amount: 0.125,
  size: 0,
  softness: 0.1,
  saturation: 0.3,
  imageDefocus: 1,
};

describe("grainFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = grainFilter("ab_out", { ...defaults, enabled: false });
    expect(result.output).toBe("grain_out");
    expect(result.fragment).toContain("null");
  });

  it("generates noise overlay with blend", () => {
    const result = grainFilter("ab_out", defaults);
    expect(result.output).toBe("grain_out");
    expect(result.fragment).toContain("[ab_out]");
    expect(result.fragment).toContain("noise=");
    expect(result.fragment).toContain("blend=");
  });

  it("applies image defocus via gblur when > 0", () => {
    const result = grainFilter("ab_out", { ...defaults, imageDefocus: 1.5 });
    expect(result.fragment).toContain("gblur=");
  });

  it("skips defocus blur when imageDefocus is 0", () => {
    const result = grainFilter("ab_out", { ...defaults, imageDefocus: 0 });
    expect(result.fragment).not.toContain("gblur=");
  });
});
```

**Step 2: Run test — should fail**

Run: `bun test src/__tests__/effects/grain.test.ts`

**Step 3: Write implementation**

Create `src/effects/grain.ts`:

```typescript
import type { FilterResult, GrainOptions } from "../types";

export function grainFilter(input: string, options: GrainOptions): FilterResult {
  if (!options.enabled) {
    return { fragment: `[${input}]null[grain_out]`, output: "grain_out" };
  }

  const { amount, size, softness, saturation, imageDefocus } = options;

  // Noise intensity mapped from 0-1 to FFmpeg noise alls range (0-100)
  const noiseIntensity = Math.round(amount * 100);

  // Size controls the scale of grain particles (blur the noise to make it coarser)
  const grainBlur = size > 0 ? `,gblur=sigma=${(size * 2).toFixed(2)}` : "";

  // Softness blurs the grain slightly for a softer look
  const softnessBlur = softness > 0 ? `,gblur=sigma=${(softness * 1.5).toFixed(2)}` : "";

  // Build noise generation: use allf for all frames, temporal noise
  const noiseFilter = `noise=alls=${noiseIntensity}:allf=t`;

  // Optional image defocus (blur applied to the base image, not the grain)
  const defocusChain = imageDefocus > 0 ? `gblur=sigma=${(imageDefocus * 0.5).toFixed(2)},` : "";

  // Saturation of grain: 0 = monochrome grain, 1 = full color grain
  // Use hue=s to desaturate the noise layer
  const grainSat = `,hue=s=${saturation.toFixed(4)}`;

  const fragment = [
    `[${input}]split=2[grain_orig][grain_base];`,
    `[grain_base]${defocusChain}${noiseFilter}${grainBlur}${softnessBlur}${grainSat}[grain_noisy];`,
    `[grain_orig][grain_noisy]blend=all_mode=overlay:all_opacity=${amount.toFixed(4)}[grain_out]`,
  ].join("");

  return { fragment, output: "grain_out" };
}
```

**Step 4: Run tests**

Run: `bun test src/__tests__/effects/grain.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/effects/grain.ts src/__tests__/effects/grain.test.ts
git commit -m "feat(grain): add grain effect with amount, size, softness, saturation, imageDefocus"
```

---

### Task 9: New effect — Vignette

**Files:**
- Create: `src/effects/vignette.ts`
- Create: `src/__tests__/effects/vignette.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/effects/vignette.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { vignetteFilter } from "../../effects/vignette";
import type { VignetteOptions } from "../../types";

const defaults: VignetteOptions = {
  enabled: true,
  amount: 0.25,
  size: 0.25,
};

describe("vignetteFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = vignetteFilter("ab_out", { ...defaults, enabled: false });
    expect(result.output).toBe("vignette_out");
    expect(result.fragment).toContain("null");
  });

  it("returns fragment with vignette filter", () => {
    const result = vignetteFilter("ab_out", defaults);
    expect(result.output).toBe("vignette_out");
    expect(result.fragment).toContain("[ab_out]");
    expect(result.fragment).toContain("vignette=");
    expect(result.fragment).toContain("[vignette_out]");
  });

  it("maps amount to vignette angle", () => {
    const result = vignetteFilter("ab_out", { ...defaults, amount: 0.5 });
    expect(result.fragment).toContain("angle=");
  });
});
```

**Step 2: Run test — should fail**

Run: `bun test src/__tests__/effects/vignette.test.ts`

**Step 3: Write implementation**

Create `src/effects/vignette.ts`:

```typescript
import type { FilterResult, VignetteOptions } from "../types";

export function vignetteFilter(input: string, options: VignetteOptions): FilterResult {
  if (!options.enabled) {
    return { fragment: `[${input}]null[vignette_out]`, output: "vignette_out" };
  }

  const { amount, size } = options;

  // FFmpeg vignette: angle controls strength (PI/5 default), x0/y0 control center
  // amount maps to angle: 0 = no vignette, 1 = strong vignette
  const angle = (amount * Math.PI / 2).toFixed(4);

  // size controls the falloff radius: smaller size = tighter vignette
  // Map to aspect ratio of the vignette ellipse
  const aspect = (1 - size * 0.5).toFixed(4);

  const fragment = `[${input}]vignette=angle=${angle}:x0=iw/2:y0=ih/2:aspect=${aspect}[vignette_out]`;
  return { fragment, output: "vignette_out" };
}
```

**Step 4: Run tests**

Run: `bun test src/__tests__/effects/vignette.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/effects/vignette.ts src/__tests__/effects/vignette.test.ts
git commit -m "feat(vignette): add vignette effect with amount and size"
```

---

### Task 10: New effect — Split Tone

**Files:**
- Create: `src/effects/splitTone.ts`
- Create: `src/__tests__/effects/splitTone.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/effects/splitTone.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { splitToneFilter } from "../../effects/splitTone";
import type { SplitToneOptions } from "../../types";

const defaults: SplitToneOptions = {
  enabled: true,
  mode: "natural",
  protectNeutrals: false,
  amount: 0.5,
  hueAngle: 20,
  pivot: 0.3,
};

describe("splitToneFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = splitToneFilter("ab_out", { ...defaults, enabled: false });
    expect(result.output).toBe("splittone_out");
    expect(result.fragment).toContain("null");
  });

  it("returns fragment with colorbalance for split toning", () => {
    const result = splitToneFilter("ab_out", defaults);
    expect(result.output).toBe("splittone_out");
    expect(result.fragment).toContain("[ab_out]");
    expect(result.fragment).toContain("colorbalance=");
    expect(result.fragment).toContain("[splittone_out]");
  });

  it("applies hue angle to shadow/highlight color channels", () => {
    const result = splitToneFilter("ab_out", { ...defaults, hueAngle: 180 });
    expect(result.fragment).toContain("colorbalance=");
  });

  it("blends with original when protectNeutrals is true", () => {
    const result = splitToneFilter("ab_out", { ...defaults, protectNeutrals: true });
    expect(result.fragment).toContain("blend=");
  });
});
```

**Step 2: Run test — should fail**

Run: `bun test src/__tests__/effects/splitTone.test.ts`

**Step 3: Write implementation**

Create `src/effects/splitTone.ts`:

```typescript
import type { FilterResult, SplitToneOptions } from "../types";

export function splitToneFilter(input: string, options: SplitToneOptions): FilterResult {
  if (!options.enabled) {
    return { fragment: `[${input}]null[splittone_out]`, output: "splittone_out" };
  }

  const { mode, protectNeutrals, amount, hueAngle, pivot } = options;

  // Convert hue angle (0-360) to RGB shadow/highlight offsets
  const hueRad = (hueAngle * Math.PI) / 180;
  const shadowR = (Math.cos(hueRad) * amount * 0.3).toFixed(4);
  const shadowB = (Math.sin(hueRad) * amount * 0.3).toFixed(4);

  // Complementary mode: highlights get opposite hue; natural: same direction, weaker
  const highlightHueRad = mode === "complementary" ? hueRad + Math.PI : hueRad;
  const highlightScale = mode === "complementary" ? 0.3 : 0.15;
  const highlightR = (Math.cos(highlightHueRad) * amount * highlightScale).toFixed(4);
  const highlightB = (Math.sin(highlightHueRad) * amount * highlightScale).toFixed(4);

  // Pivot controls shadow/highlight split point via midtones
  const midR = (pivot * -0.1).toFixed(4);

  const colorbalance = `colorbalance=rs=${shadowR}:bs=${shadowB}:rh=${highlightR}:bh=${highlightB}:rm=${midR}`;

  if (protectNeutrals) {
    const fragment = [
      `[${input}]split=2[st_orig][st_src];`,
      `[st_src]${colorbalance}[st_toned];`,
      `[st_orig][st_toned]blend=all_mode=normal:all_opacity=${amount.toFixed(4)}[splittone_out]`,
    ].join("");
    return { fragment, output: "splittone_out" };
  }

  const fragment = `[${input}]${colorbalance}[splittone_out]`;
  return { fragment, output: "splittone_out" };
}
```

**Step 4: Run tests**

Run: `bun test src/__tests__/effects/splitTone.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/effects/splitTone.ts src/__tests__/effects/splitTone.test.ts
git commit -m "feat(splitTone): add split tone effect with mode, hueAngle, pivot, protectNeutrals"
```

---

### Task 11: Update pipeline — wire all effects in new order

**Files:**
- Modify: `src/pipeline.ts`
- Modify: `src/__tests__/pipeline.test.ts`

**Step 1: Rewrite the pipeline test**

Replace `src/__tests__/pipeline.test.ts` with:

```typescript
import { describe, it, expect } from "bun:test";
import { buildFilterGraph } from "../pipeline";
import type { FilmOptions } from "../types";

const defaults: FilmOptions = {
  input: "test.mp4",
  output: "test_openhanced.mp4",
  preset: "medium",
  crf: 18,
  blend: 1,
  colorSettings: {
    enabled: true, exposure: 0, contrast: 1, highlights: 0, fade: 0,
    whiteBalance: 6500, tint: 0, subtractiveSat: 1, richness: 1, bleachBypass: 0,
  },
  halation: { enabled: true, amount: 0.25, radius: 4, saturation: 1, hue: 0.5, highlightsOnly: true },
  aberration: { enabled: true, amount: 0.3 },
  bloom: { enabled: true, amount: 0.25, radius: 10 },
  grain: { enabled: true, amount: 0.125, size: 0, softness: 0.1, saturation: 0.3, imageDefocus: 1 },
  vignette: { enabled: true, amount: 0.25, size: 0.25 },
  splitTone: { enabled: true, mode: "natural", protectNeutrals: false, amount: 0.5, hueAngle: 20, pivot: 0.3 },
  cameraShake: { enabled: true, amount: 0.25, rate: 0.5 },
};

describe("buildFilterGraph", () => {
  it("chains all effects for video", () => {
    const { graph, finalLabel } = buildFilterGraph(defaults, false);
    expect(graph).toContain("[0:v]");
    expect(graph).toContain("[color_out]");
    expect(graph).toContain("[halation_out]");
    expect(graph).toContain("[ab_out]");
    expect(graph).toContain("[bloom_out]");
    expect(graph).toContain("[grain_out]");
    expect(graph).toContain("[vignette_out]");
    expect(graph).toContain("[splittone_out]");
    expect(graph).toContain("[shake_out]");
    expect(finalLabel).toBe("shake_out");
  });

  it("skips camera shake for image input", () => {
    const { graph, finalLabel } = buildFilterGraph(defaults, true);
    expect(graph).not.toContain("shake_out");
    expect(finalLabel).toBe("splittone_out");
  });

  it("applies global blend when blend < 1", () => {
    const opts = { ...defaults, blend: 0.5 };
    const { graph, finalLabel } = buildFilterGraph(opts, true);
    expect(graph).toContain("blend=");
    expect(finalLabel).toBe("blend_out");
  });

  it("skips global blend when blend is 1", () => {
    const { graph } = buildFilterGraph(defaults, true);
    expect(graph).not.toContain("blend_out");
  });

  it("skips disabled effects", () => {
    const opts = { ...defaults, halation: { ...defaults.halation, enabled: false } };
    const { graph } = buildFilterGraph(opts, false);
    expect(graph).toContain("[halation_out]"); // still labeled but passthrough
  });
});
```

**Step 2: Run test — should fail**

Run: `bun test src/__tests__/pipeline.test.ts`

**Step 3: Rewrite pipeline**

Replace `src/pipeline.ts` with:

```typescript
import type { FilmOptions, ProbeResult } from "./types";
import { colorSettingsFilter } from "./effects/colorSettings";
import { halationFilter } from "./effects/halation";
import { aberrationFilter } from "./effects/aberration";
import { bloomFilter } from "./effects/bloom";
import { grainFilter } from "./effects/grain";
import { vignetteFilter } from "./effects/vignette";
import { splitToneFilter } from "./effects/splitTone";
import { cameraShakeFilter } from "./effects/cameraShake";
import { parseProgress, renderProgressBar } from "./progress";

export function buildFilterGraph(
  options: FilmOptions,
  isImage: boolean
): { graph: string; finalLabel: string } {
  const fragments: string[] = [];
  let currentLabel = "0:v";

  // For global blend: save original input reference
  const needsBlend = options.blend < 1;
  if (needsBlend) {
    fragments.push(`[0:v]split=2[gb_orig][gb_proc]`);
    currentLabel = "gb_proc";
  }

  // Color Settings
  const color = colorSettingsFilter(currentLabel, options.colorSettings);
  fragments.push(color.fragment);
  currentLabel = color.output;

  // Halation
  const halation = halationFilter(currentLabel, options.halation);
  fragments.push(halation.fragment);
  currentLabel = halation.output;

  // Aberration
  const aberration = aberrationFilter(currentLabel, options.aberration);
  fragments.push(aberration.fragment);
  currentLabel = aberration.output;

  // Bloom
  const bloom = bloomFilter(currentLabel, options.bloom);
  fragments.push(bloom.fragment);
  currentLabel = bloom.output;

  // Grain
  const grain = grainFilter(currentLabel, options.grain);
  fragments.push(grain.fragment);
  currentLabel = grain.output;

  // Vignette
  const vignette = vignetteFilter(currentLabel, options.vignette);
  fragments.push(vignette.fragment);
  currentLabel = vignette.output;

  // Split Tone
  const splitTone = splitToneFilter(currentLabel, options.splitTone);
  fragments.push(splitTone.fragment);
  currentLabel = splitTone.output;

  // Camera Shake (skip for images)
  if (!isImage) {
    const shake = cameraShakeFilter(currentLabel, options.cameraShake);
    fragments.push(shake.fragment);
    currentLabel = shake.output;
  }

  // Global Blend
  if (needsBlend) {
    const opacity = options.blend.toFixed(4);
    fragments.push(`[gb_orig][${currentLabel}]blend=all_mode=normal:all_opacity=${opacity}[blend_out]`);
    currentLabel = "blend_out";
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

**Step 4: Run tests**

Run: `bun test src/__tests__/pipeline.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pipeline.ts src/__tests__/pipeline.test.ts
git commit -m "refactor(pipeline): wire all new effects in correct chain order with global blend"
```

---

### Task 12: Update CLI — new flags, defaults, help text

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/__tests__/cli.test.ts`

**Step 1: Rewrite CLI test**

Replace `src/__tests__/cli.test.ts` with:

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

  it("parses color settings flags", () => {
    const result = parseArgs(["input.mp4", "--exposure", "0.12", "--contrast", "1.2"]);
    expect(result.colorSettings.exposure).toBe(0.12);
    expect(result.colorSettings.contrast).toBe(1.2);
  });

  it("parses halation flags with new names", () => {
    const result = parseArgs(["input.mp4", "--halation-amount", "0.5"]);
    expect(result.halation.amount).toBe(0.5);
  });

  it("parses --no-halation to disable", () => {
    const result = parseArgs(["input.mp4", "--no-halation"]);
    expect(result.halation.enabled).toBe(false);
  });

  it("parses --blend for global blend", () => {
    const result = parseArgs(["input.mp4", "--blend", "0.5"]);
    expect(result.blend).toBe(0.5);
  });

  it("parses new effect flags", () => {
    const result = parseArgs([
      "input.mp4",
      "--bloom-amount", "0.3",
      "--grain-amount", "0.2",
      "--vignette-amount", "0.4",
    ]);
    expect(result.bloom.amount).toBe(0.3);
    expect(result.grain.amount).toBe(0.2);
    expect(result.vignette.amount).toBe(0.4);
  });

  it("throws on unknown flag", () => {
    expect(() => parseArgs(["input.mp4", "--unknown"])).toThrow();
  });

  it("throws on out-of-range value", () => {
    expect(() => parseArgs(["input.mp4", "--exposure", "10"])).toThrow();
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

**Step 2: Run test — should fail**

Run: `bun test src/__tests__/cli.test.ts`

**Step 3: Rewrite cli.ts**

Replace `src/cli.ts` with the full updated CLI that includes all new flags, defaults, help text, and `--no-<effect>` disable toggles. The CLI should:

- Add all new flags for every effect parameter
- Add `--no-halation`, `--no-aberration`, `--no-bloom`, `--no-grain`, `--no-vignette`, `--no-split-tone`, `--no-camera-shake` toggles
- Add `--blend` flag (0-1, default 1)
- Add `--halation-highlights-only` and `--split-tone-protect-neutrals` boolean flags
- Add `--split-tone-mode` with "natural" | "complementary" validation
- Update HELP_TEXT with all new options organized by section
- Update KNOWN_FLAGS and switch cases
- Import new types

The full implementation code for this file is extensive — it follows the same pattern as the existing CLI but with all the new flags added to the switch statement and defaults object. Key defaults:

| Flag | Default |
|---|---|
| `--exposure` | 0 |
| `--contrast` | 1 |
| `--highlights` | 0 |
| `--fade` | 0 |
| `--white-balance` | 6500 |
| `--tint` | 0 |
| `--subtractive-sat` | 1 |
| `--richness` | 1 |
| `--bleach-bypass` | 0 |
| `--halation-amount` | 0.25 |
| `--halation-radius` | 4 |
| `--halation-saturation` | 1 |
| `--halation-hue` | 0.5 |
| `--halation-highlights-only` | true |
| `--aberration` | 0.3 |
| `--bloom-amount` | 0.25 |
| `--bloom-radius` | 10 |
| `--grain-amount` | 0.125 |
| `--grain-size` | 0 |
| `--grain-softness` | 0.1 |
| `--grain-saturation` | 0.3 |
| `--grain-defocus` | 1 |
| `--vignette-amount` | 0.25 |
| `--vignette-size` | 0.25 |
| `--split-tone-mode` | "natural" |
| `--split-tone-protect-neutrals` | false |
| `--split-tone-amount` | 0 |
| `--split-tone-hue` | 20 |
| `--split-tone-pivot` | 0.3 |
| `--camera-shake-amount` | 0.25 |
| `--camera-shake-rate` | 0.5 |
| `--blend` | 1 |

**Step 4: Run tests**

Run: `bun test src/__tests__/cli.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli.ts src/__tests__/cli.test.ts
git commit -m "refactor(cli): update flags and help text for all new/renamed effects"
```

---

### Task 13: Update E2E tests

**Files:**
- Modify: `src/__tests__/e2e/openhancer.e2e.test.ts`

**Step 1: Update the e2e test to use new flag names**

Key changes:
- Replace `--lift`, `--crush`, `--halation-intensity`, `--halation-warmth`, `--halation-threshold`, `--weave` with new flag names
- Add a test that uses new effects: `--bloom-amount`, `--grain-amount`, `--vignette-amount`
- Add a test with `--no-halation` to verify disabled effects work end-to-end
- Add a test with `--blend 0.5`

**Step 2: Run E2E tests**

Run: `bun test src/__tests__/e2e/`
Expected: PASS

**Step 3: Commit**

```bash
git add src/__tests__/e2e/openhancer.e2e.test.ts
git commit -m "test(e2e): update e2e tests for new effect flags and options"
```

---

### Task 14: Final verification — run all tests

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests PASS

**Step 2: Manual smoke test**

Run: `bun run src/cli.ts --help`
Expected: Updated help text with all new sections

**Step 3: Test with actual file**

Run: `bun run src/cli.ts src/__tests__/e2e/fixtures/test.png --bloom-amount 0.3 --grain-amount 0.2`
Expected: Processes successfully

---
