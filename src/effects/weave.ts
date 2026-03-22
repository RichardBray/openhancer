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
