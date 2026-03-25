export interface RangeOption {
  key: string;
  label: string;
  type: "range";
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface SelectOption {
  key: string;
  label: string;
  type: "select";
  choices: string[];
  default: string;
}

export interface BooleanOption {
  key: string;
  label: string;
  type: "boolean";
  default: boolean;
}

export type OptionDef = RangeOption | SelectOption | BooleanOption;

export interface EffectGroup {
  key: string;
  label: string;
  enableKey: string;
  options: OptionDef[];
}

export const EFFECT_SCHEMA: EffectGroup[] = [
  {
    key: "colorSettings",
    label: "Color Settings",
    enableKey: "no-color-settings",
    options: [
      { key: "exposure", label: "Exposure", type: "range", min: -2, max: 2, step: 0.01, default: 0 },
      { key: "contrast", label: "Contrast", type: "range", min: 0, max: 3, step: 0.01, default: 1 },
      { key: "highlights", label: "Highlights", type: "range", min: -1, max: 1, step: 0.01, default: 0 },
      { key: "fade", label: "Fade", type: "range", min: 0, max: 1, step: 0.01, default: 0 },
      { key: "white-balance", label: "White Balance", type: "range", min: 1000, max: 15000, step: 100, default: 6500 },
      { key: "tint", label: "Tint", type: "range", min: -100, max: 100, step: 1, default: 0 },
      { key: "subtractive-sat", label: "Subtractive Saturation", type: "range", min: 0, max: 3, step: 0.01, default: 1 },
      { key: "richness", label: "Richness", type: "range", min: 0, max: 3, step: 0.01, default: 1 },
      { key: "bleach-bypass", label: "Bleach Bypass", type: "range", min: 0, max: 1, step: 0.01, default: 0 },
    ],
  },
  {
    key: "halation",
    label: "Halation",
    enableKey: "no-halation",
    options: [
      { key: "halation-amount", label: "Amount", type: "range", min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: "halation-radius", label: "Radius", type: "range", min: 1, max: 100, step: 1, default: 4 },
      { key: "halation-saturation", label: "Saturation", type: "range", min: 0, max: 3, step: 0.01, default: 1 },
      { key: "halation-hue", label: "Hue", type: "range", min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: "halation-highlights-only", label: "Highlights Only", type: "boolean", default: true },
    ],
  },
  {
    key: "aberration",
    label: "Chromatic Aberration",
    enableKey: "no-aberration",
    options: [
      { key: "aberration", label: "Amount", type: "range", min: 0, max: 1, step: 0.01, default: 0.3 },
    ],
  },
  {
    key: "bloom",
    label: "Bloom",
    enableKey: "no-bloom",
    options: [
      { key: "bloom-amount", label: "Amount", type: "range", min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: "bloom-radius", label: "Radius", type: "range", min: 1, max: 100, step: 1, default: 10 },
    ],
  },
  {
    key: "grain",
    label: "Grain",
    enableKey: "no-grain",
    options: [
      { key: "grain-amount", label: "Amount", type: "range", min: 0, max: 1, step: 0.001, default: 0.125 },
      { key: "grain-size", label: "Size", type: "range", min: 0, max: 5, step: 0.1, default: 0 },
      { key: "grain-softness", label: "Softness", type: "range", min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: "grain-saturation", label: "Saturation", type: "range", min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: "grain-defocus", label: "Image Defocus", type: "range", min: 0, max: 5, step: 0.1, default: 1 },
    ],
  },
  {
    key: "vignette",
    label: "Vignette",
    enableKey: "no-vignette",
    options: [
      { key: "vignette-amount", label: "Amount", type: "range", min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: "vignette-size", label: "Size", type: "range", min: 0, max: 1, step: 0.01, default: 0.25 },
    ],
  },
  {
    key: "splitTone",
    label: "Split Tone",
    enableKey: "no-split-tone",
    options: [
      { key: "split-tone-mode", label: "Mode", type: "select", choices: ["natural", "complementary"], default: "natural" },
      { key: "split-tone-protect-neutrals", label: "Protect Neutrals", type: "boolean", default: false },
      { key: "split-tone-amount", label: "Amount", type: "range", min: 0, max: 1, step: 0.01, default: 0 },
      { key: "split-tone-hue", label: "Hue", type: "range", min: 0, max: 360, step: 1, default: 20 },
      { key: "split-tone-pivot", label: "Pivot", type: "range", min: 0, max: 1, step: 0.01, default: 0.3 },
    ],
  },
  {
    key: "cameraShake",
    label: "Camera Shake",
    enableKey: "no-camera-shake",
    options: [
      { key: "camera-shake-amount", label: "Amount", type: "range", min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: "camera-shake-rate", label: "Rate", type: "range", min: 0, max: 2, step: 0.01, default: 0.5 },
    ],
  },
];

export function getDefaults(): Record<string, string | number | boolean> {
  const defaults: Record<string, string | number | boolean> = {};
  for (const group of EFFECT_SCHEMA) {
    for (const opt of group.options) {
      defaults[opt.key] = opt.default;
    }
  }
  return defaults;
}
