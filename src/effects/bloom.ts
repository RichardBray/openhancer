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
