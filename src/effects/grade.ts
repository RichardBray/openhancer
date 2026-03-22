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
