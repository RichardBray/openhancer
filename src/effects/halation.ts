import type { FilterResult, HalationOptions } from "../types";

export function halationFilter(input: string, options: HalationOptions): FilterResult {
  const { intensity, threshold, warmth } = options;
  let { radius } = options;

  // Enforce odd radius
  if (radius % 2 === 0) radius += 1;

  // Threshold as 0-1 range for curves
  const thresh = (threshold / 255).toFixed(4);
  const threshLow = Math.max(0, threshold / 255 - 0.05).toFixed(4);

  // Warmth: -1 (cool/blue) to 0 (neutral) to 1 (warm/red)
  // At 0: both channels at 1.0 (neutral white glow)
  // Positive: red stays 1.0, blue reduced. Negative: blue stays 1.0, red reduced.
  const w = Math.abs(warmth);
  const redLevel = warmth >= 0 ? "1.0000" : (1 - w * 0.4).toFixed(4);
  const blueLevel = warmth >= 0 ? (1 - w * 0.4).toFixed(4) : "1.0000";

  const fragment = [
    `[${input}]split=2[hal_orig][hal_glowsrc];`,
    `[hal_glowsrc]curves=r='0/0 ${threshLow}/0 ${thresh}/1 1/1':g='0/0 ${threshLow}/0 ${thresh}/1 1/1':b='0/0 ${threshLow}/0 ${thresh}/1 1/1'[hal_highlights];`,
    `[hal_highlights]curves=r='0/0 1/${redLevel}':b='0/0 1/${blueLevel}'[hal_tinted];`,
    `[hal_tinted]gblur=sigma=${radius}[hal_blurred];`,
    `[hal_orig][hal_blurred]blend=all_mode=screen:all_opacity=${intensity.toFixed(4)}[halation_out]`,
  ].join("");

  return { fragment, output: "halation_out" };
}
