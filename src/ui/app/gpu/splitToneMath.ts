export interface SplitToneTintValues {
  shadowR: number;
  shadowB: number;
  highlightR: number;
  highlightB: number;
  midR: number;
}

export function getSplitToneTintValues(options: {
  mode: string;
  amount: number;
  hueAngle: number;
  pivot: number;
}): SplitToneTintValues {
  const hueRad = (options.hueAngle * Math.PI) / 180;
  const cosHue = Math.cos(hueRad);
  const sinHue = Math.sin(hueRad);
  const shadowR = cosHue * options.amount * 0.3;
  const shadowB = sinHue * options.amount * 0.3;

  const highlightScale = options.mode === "complementary" ? 0.3 : 0.15;
  const cosHL = options.mode === "complementary" ? -cosHue : cosHue;
  const sinHL = options.mode === "complementary" ? -sinHue : sinHue;
  const highlightR = cosHL * options.amount * highlightScale;
  const highlightB = sinHL * options.amount * highlightScale;

  const midR = options.pivot * -0.1;

  return { shadowR, shadowB, highlightR, highlightB, midR };
}
