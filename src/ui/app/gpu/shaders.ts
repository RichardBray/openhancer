// Shared fullscreen quad vertex shader — used by all fragment passes
export const FULLSCREEN_VERT = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VertexOutput {
  // Fullscreen triangle trick: 3 vertices, no vertex buffer
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var out: VertexOutput;
  out.position = vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
  out.uv = vec2f(uv.x, 1.0 - uv.y); // flip Y for texture coords
  return out;
}
`;

// --- Color Settings ---
export const COLOR_SETTINGS_FRAG = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct ColorParams {
  contrast: f32,
  brightness: f32,
  saturation: f32,
  gamma: f32,
  whiteBalance: f32,
  tint: f32,
  bleachBypass: f32,
  _pad: f32,
};
@group(0) @binding(2) var<uniform> params: ColorParams;

fn rgb2luma(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

fn ln(x: f32) -> f32 { return log2(x) / log2(2.718281828); }

fn applyWhiteBalance(color: vec3f, kelvin: f32) -> vec3f {
  if (abs(kelvin - 6500.0) < 1.0) { return color; }
  let t = kelvin / 100.0;
  var r: f32; var g: f32; var b: f32;
  if (t <= 66.0) {
    r = 1.0;
    g = clamp((0.39008 * ln(t) - 0.63184), 0.0, 1.0);
  } else {
    r = clamp(1.292936 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
    g = clamp(1.129891 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
  }
  if (t >= 66.0) {
    b = 1.0;
  } else if (t <= 19.0) {
    b = 0.0;
  } else {
    b = clamp(0.54320 * ln(t - 10.0) - 1.19625, 0.0, 1.0);
  }
  let d65 = vec3f(1.0, 0.9468, 0.9228);
  let wb = vec3f(r, g, b) / d65;
  return color * wb;
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSample(src, samp, uv).rgb;
  var c = pow(color, vec3f(params.gamma));
  c = (c - 0.5) * params.contrast + 0.5 + params.brightness;
  c = clamp(c, vec3f(0.0), vec3f(1.0));
  let luma = rgb2luma(c);
  c = mix(vec3f(luma), c, params.saturation);
  c = applyWhiteBalance(c, params.whiteBalance);
  c.g = c.g + params.tint * 0.1;
  c = clamp(c, vec3f(0.0), vec3f(1.0));
  if (params.bleachBypass > 0.0) {
    let desat = vec3f(rgb2luma(c));
    let highContrast = (desat - 0.5) * 1.3 + 0.5;
    c = mix(c, clamp(highContrast, vec3f(0.0), vec3f(1.0)), params.bleachBypass);
  }
  return vec4f(c, 1.0);
}
`;

// --- Highlight threshold (for halation) ---
export const THRESHOLD_FRAG = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct ThresholdParams {
  low: f32,
  high: f32,
  _pad1: f32,
  _pad2: f32,
};
@group(0) @binding(2) var<uniform> params: ThresholdParams;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let c = textureSample(src, samp, uv).rgb;
  let luma = max(max(c.r, c.g), c.b);
  let t = smoothstep(params.low, params.high, luma);
  return vec4f(c * t, 1.0);
}
`;

// --- Gaussian blur (separable, used for halation + bloom) ---
export const BLUR_FRAG = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct BlurParams {
  direction: vec2f,
  sigma: f32,
  _pad: f32,
};
@group(0) @binding(2) var<uniform> params: BlurParams;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let sigma = max(params.sigma, 0.001);
  let radius = i32(ceil(sigma * 3.0));
  var color = vec3f(0.0);
  var weight_sum = 0.0;

  for (var i = -radius; i <= radius; i = i + 1) {
    let offset = params.direction * f32(i);
    let w = exp(-f32(i * i) / (2.0 * sigma * sigma));
    color += textureSample(src, samp, uv + offset).rgb * w;
    weight_sum += w;
  }

  return vec4f(color / weight_sum, 1.0);
}
`;

// --- Screen blend (halation + bloom compositing) ---
export const SCREEN_BLEND_FRAG = /* wgsl */ `
@group(0) @binding(0) var base_tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var overlay_tex: texture_2d<f32>;

struct BlendParams {
  opacity: f32,
  hueShift: f32,
  saturation: f32,
  _pad: f32,
};
@group(0) @binding(3) var<uniform> params: BlendParams;

fn rgb2hsv(c: vec3f) -> vec3f {
  let cmax = max(max(c.r, c.g), c.b);
  let cmin = min(min(c.r, c.g), c.b);
  let delta = cmax - cmin;
  var h: f32 = 0.0;
  if (delta > 0.001) {
    if (cmax == c.r) { h = ((c.g - c.b) / delta) % 6.0; }
    else if (cmax == c.g) { h = (c.b - c.r) / delta + 2.0; }
    else { h = (c.r - c.g) / delta + 4.0; }
    h = h / 6.0;
    if (h < 0.0) { h += 1.0; }
  }
  let s = select(0.0, delta / cmax, cmax > 0.0);
  return vec3f(h, s, cmax);
}

fn hsv2rgb(c: vec3f) -> vec3f {
  let h = c.x * 6.0;
  let s = c.y;
  let v = c.z;
  let i = floor(h);
  let f = h - i;
  let p = v * (1.0 - s);
  let q = v * (1.0 - s * f);
  let t = v * (1.0 - s * (1.0 - f));
  let idx = i32(i) % 6;
  if (idx == 0) { return vec3f(v, t, p); }
  if (idx == 1) { return vec3f(q, v, p); }
  if (idx == 2) { return vec3f(p, v, t); }
  if (idx == 3) { return vec3f(p, q, v); }
  if (idx == 4) { return vec3f(t, p, v); }
  return vec3f(v, p, q);
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let base = textureSample(base_tex, samp, uv).rgb;
  var overlay = textureSample(overlay_tex, samp, uv).rgb;
  if (params.hueShift != 0.0 || params.saturation != 1.0) {
    var hsv = rgb2hsv(overlay);
    hsv.x = fract(hsv.x + params.hueShift / 360.0);
    hsv.y = clamp(hsv.y * params.saturation, 0.0, 1.0);
    overlay = hsv2rgb(hsv);
  }
  let blended = 1.0 - (1.0 - base) * (1.0 - overlay);
  return vec4f(mix(base, blended, params.opacity), 1.0);
}
`;

// --- Chromatic aberration ---
export const ABERRATION_FRAG = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct AberrationParams {
  offset: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
};
@group(0) @binding(2) var<uniform> params: AberrationParams;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let center = vec2f(0.5);
  let dir = uv - center;
  let uv_r = center + dir * (1.0 + params.offset);
  let uv_b = center + dir * (1.0 - params.offset);
  let r = textureSample(src, samp, uv_r).r;
  let g = textureSample(src, samp, uv).g;
  let b = textureSample(src, samp, uv_b).b;
  return vec4f(r, g, b, 1.0);
}
`;

// --- Grain ---
export const GRAIN_FRAG = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct GrainParams {
  amount: f32,
  size: f32,
  softness: f32,
  saturation: f32,
  imageDefocus: f32,
  time: f32,
  texelSize: vec2f,
};
@group(0) @binding(2) var<uniform> params: GrainParams;

fn hash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn grain_noise(uv: vec2f, t: f32) -> vec3f {
  let scale = max(1.0, params.size * 2.0 + 1.0);
  let coord = floor(uv * scale) + t;
  let r = hash(coord + vec2f(0.0, 0.0)) * 2.0 - 1.0;
  let g = hash(coord + vec2f(1.7, 3.1)) * 2.0 - 1.0;
  let b = hash(coord + vec2f(5.3, 2.9)) * 2.0 - 1.0;
  let mono = (r + g + b) / 3.0;
  return mix(vec3f(mono), vec3f(r, g, b), params.saturation);
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  var color = vec3f(0.0);
  if (params.imageDefocus > 0.0) {
    let r = params.imageDefocus * 0.5;
    var total = 0.0;
    for (var x = -1; x <= 1; x++) {
      for (var y = -1; y <= 1; y++) {
        let off = vec2f(f32(x), f32(y)) * params.texelSize * r;
        color += textureSample(src, samp, uv + off).rgb;
        total += 1.0;
      }
    }
    color /= total;
  } else {
    color = textureSample(src, samp, uv).rgb;
  }
  let dims = vec2f(textureDimensions(src));
  let n = grain_noise(uv * dims, params.time);
  let overlay = select(
    2.0 * color * (0.5 + n * 0.5),
    1.0 - 2.0 * (1.0 - color) * (0.5 - n * 0.5),
    color > vec3f(0.5)
  );
  return vec4f(mix(color, overlay, params.amount), 1.0);
}
`;

// --- Vignette ---
export const VIGNETTE_FRAG = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct VignetteParams {
  angle: f32,
  aspect: f32,
  _pad1: f32,
  _pad2: f32,
};
@group(0) @binding(2) var<uniform> params: VignetteParams;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSample(src, samp, uv).rgb;
  let center = uv - 0.5;
  let adjusted = vec2f(center.x, center.y * params.aspect);
  let dist = length(adjusted) * 2.0;
  let vig = cos(min(dist * params.angle, 3.14159265 * 0.5));
  return vec4f(color * vig * vig, 1.0);
}
`;

// --- Split Tone ---
export const SPLIT_TONE_FRAG = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct SplitToneParams {
  shadowR: f32,
  shadowB: f32,
  highlightR: f32,
  highlightB: f32,
  midR: f32,
  amount: f32,
  protectNeutrals: f32,
  _pad: f32,
};
@group(0) @binding(2) var<uniform> params: SplitToneParams;

fn rgb2luma(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSample(src, samp, uv).rgb;
  let luma = rgb2luma(color);
  let shadow_weight = 1.0 - smoothstep(0.0, 0.5, luma);
  let highlight_weight = smoothstep(0.5, 1.0, luma);
  var toned = color;
  toned.r = toned.r + params.shadowR * shadow_weight + params.highlightR * highlight_weight + params.midR;
  toned.b = toned.b + params.shadowB * shadow_weight + params.highlightB * highlight_weight;
  toned = clamp(toned, vec3f(0.0), vec3f(1.0));
  if (params.protectNeutrals > 0.5) {
    toned = mix(color, toned, params.amount);
  }
  return vec4f(toned, 1.0);
}
`;

// --- Camera Shake ---
export const CAMERA_SHAKE_FRAG = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct ShakeParams {
  amplitude: f32,
  period1: f32,
  period2: f32,
  frame: f32,
};
@group(0) @binding(2) var<uniform> params: ShakeParams;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dx = params.amplitude * sin(params.frame / params.period1);
  let dy = params.amplitude * sin(params.frame / params.period2 + 1.3);
  let shifted = uv + vec2f(dx, dy);
  return textureSample(src, samp, clamp(shifted, vec2f(0.0), vec2f(1.0)));
}
`;
