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

  const fragment = `[${input}]vignette=angle=${angle}:aspect=${aspect}[vignette_out]`;
  return { fragment, output: "vignette_out" };
}
