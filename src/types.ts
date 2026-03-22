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
  encodePreset: "fast" | "medium" | "slow";
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
