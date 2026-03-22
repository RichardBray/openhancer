# Openhancer

Single-binary CLI that applies cinematic film effects to video and images in one FFmpeg pass.

## Effects

- **Grade** — Lift blacks, crush whites, shadow/highlight tinting, fade
- **Halation** — Highlight glow with warm tint (simulates light scattering in film)
- **Chromatic Aberration** — Red/blue channel offset for lens fringing
- **Gate Weave** — Sine-based frame drift simulating projector instability

All effects compose into a single FFmpeg `-filter_complex` graph for efficient processing.

## Requirements

- [Bun](https://bun.sh) (for building)
- [FFmpeg](https://ffmpeg.org) (runtime dependency)

## Install

```bash
# Clone and build
git clone https://github.com/RichardBray/openhancer.git
cd openhancer
bun install
bun run build

# Optional: add to PATH
ln -s $(pwd)/openhancer /usr/local/bin/openhancer
```

## Usage

```bash
openhancer <input> [options]
```

### Examples

```bash
# Process video with defaults
openhancer video.mp4

# Process image
openhancer photo.png

# Custom output path
openhancer video.mp4 -o output.mp4

# Adjust effects
openhancer video.mp4 --lift 0.1 --fade 0.3 --aberration 0.5

# Fast encode, lower quality
openhancer video.mp4 --encode-preset fast --crf 28

# Use the "subtle" preset
openhancer video.mp4 --preset subtle

# Use a preset but override specific values
openhancer video.mp4 --preset heavy --aberration 0.2
```

### Options

| Flag | Range | Default | Description |
|------|-------|---------|-------------|
| `--output, -o` | | `<input>_openhanced.<ext>` | Output path |
| `--preset` | name | default | Load a preset file |
| `--encode-preset` | fast/medium/slow | medium | FFmpeg encoding preset |
| `--crf` | 0–51 | 18 | Quality (lower = better) |
| `--lift` | 0–0.15 | 0.05 | Black lift amount |
| `--crush` | 0–0.15 | 0.04 | White crush amount |
| `--fade` | 0–1 | 0.15 | Contrast fade |
| `--shadow-tint` | warm/cool/neutral | warm | Shadow colour tint |
| `--highlight-tint` | warm/cool/neutral | cool | Highlight colour tint |
| `--halation-intensity` | 0–1 | 0.6 | Glow intensity |
| `--halation-radius` | 1–999 | 51 | Glow blur radius (px) |
| `--halation-threshold` | 0–255 | 180 | Highlight threshold |
| `--halation-warmth` | -1–1 | 0.3 | Glow tint: -1=cool, 0=neutral, 1=warm |
| `--aberration` | 0–1 | 0.3 | Chromatic aberration strength |
| `--weave` | 0–1 | 0.3 | Gate weave strength |

## Presets

Openhancer ships with built-in presets that define effect defaults:

- **default** — Balanced cinematic look (loads automatically)
- **subtle** — Lighter touch for a more natural feel
- **heavy** — Aggressive film emulation

```bash
# Use a named preset
openhancer video.mp4 --preset subtle

# CLI flags always override preset values
openhancer video.mp4 --preset heavy --aberration 0.2
```

### Custom presets

Create JSON files in `~/.openhancer/presets/` to define your own. User presets override built-ins by name.

```json
{
  "lift": 0.08,
  "crush": 0.06,
  "fade": 0.2,
  "halation-intensity": 0.7,
  "aberration": 0.4,
  "weave": 0.25
}
```

Save as `~/.openhancer/presets/mypreset.json`, then use with `--preset mypreset`. Only include keys you want to override — missing keys fall back to the default preset.

## Development

```bash
# Run in dev mode
bun run src/cli.ts <input> [options]

# Run tests
bun test

# Run e2e tests only
bun test src/__tests__/e2e/

# Build binary
bun run build
```

## License

[MIT](LICENSE)
