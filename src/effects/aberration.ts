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
