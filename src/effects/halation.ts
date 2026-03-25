import type { FilterResult, HalationOptions } from "../types";
import { passthrough } from "./utils";

export function halationFilter(input: string, options: HalationOptions): FilterResult {
  if (!options.enabled) return passthrough(input, "halation_out");

  const { amount, radius, saturation, hue, highlightsOnly } = options;

  // WebGPU blurs at half-res with sigma = radius * 0.5 (in half-res pixels)
  const sigma = Math.max(0.5, radius * 0.5).toFixed(2);
  const hueDeg = (hue * 360).toFixed(2);

  const steps: string[] = [];

  steps.push(`[${input}]split=2[hal_orig][hal_glowsrc]`);

  // WebGPU blends the half-res glow directly (GPU sampler upscales during blend).
  // In FFmpeg we must upscale before blend, but skip upscaling to keep the glow soft.
  // Instead, do everything at half-res and upscale only for the final blend.
  if (highlightsOnly) {
    // Downsample first (matches WebGPU: threshold renders into half-res target)
    // then threshold at half-res, then blur at half-res
    const thresh =
      `geq=` +
      `r='st(0, clip((max(max(r(X,Y),g(X,Y)),b(X,Y))/255-0.65)*10, 0, 1)); r(X,Y) * ld(0)*ld(0)*(3-2*ld(0))':` +
      `g='st(0, clip((max(max(r(X,Y),g(X,Y)),b(X,Y))/255-0.65)*10, 0, 1)); g(X,Y) * ld(0)*ld(0)*(3-2*ld(0))':` +
      `b='st(0, clip((max(max(r(X,Y),g(X,Y)),b(X,Y))/255-0.65)*10, 0, 1)); b(X,Y) * ld(0)*ld(0)*(3-2*ld(0))'`;
    steps.push(`[hal_glowsrc]scale=iw/2:ih/2,${thresh},gblur=sigma=${sigma},scale=iw*2:ih*2:flags=bilinear,hue=h=${hueDeg}:s=${saturation.toFixed(4)}[hal_blurred]`);
  } else {
    steps.push(`[hal_glowsrc]scale=iw/2:ih/2,gblur=sigma=${sigma},scale=iw*2:ih*2:flags=bilinear,hue=h=${hueDeg}:s=${saturation.toFixed(4)}[hal_blurred]`);
  }

  // WebGPU's half-res pipeline loses ~4x energy vs FFmpeg's full-res processing.
  // Scale opacity to match the preview's visual intensity.
  const effectiveOpacity = (amount * amount * 0.55).toFixed(4);
  steps.push(`[hal_orig][hal_blurred]blend=all_mode=screen:all_opacity=${effectiveOpacity}[halation_out]`);

  return { fragment: steps.join(";"), output: "halation_out" };
}
