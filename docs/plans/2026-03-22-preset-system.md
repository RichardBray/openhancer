# Preset System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a JSON preset system so users can customize and share effect defaults without CLI flags.

**Architecture:** Ship built-in presets in `presets/` at repo root. User presets in `~/.openhancer/presets/` override built-ins by name. `default.json` loads automatically; `--preset <name>` loads an alternative. CLI flags always override preset values. Rename `--preset` (FFmpeg encode preset) to `--encode-preset` to free the flag.

**Tech Stack:** Bun (fs, path, os), JSON files, existing CLI/types infrastructure.

---

### Task 1: Create built-in preset JSON files

**Files:**
- Create: `presets/default.json`
- Create: `presets/subtle.json`
- Create: `presets/heavy.json`

**Step 1: Create `presets/default.json`**

```json
{
  "encode-preset": "medium",
  "crf": 18,
  "lift": 0.05,
  "crush": 0.04,
  "fade": 0.15,
  "shadow-tint": "warm",
  "highlight-tint": "cool",
  "halation-intensity": 0.6,
  "halation-radius": 51,
  "halation-threshold": 180,
  "halation-warmth": 0.7,
  "aberration": 0.3,
  "weave": 0.3
}
```

**Step 2: Create `presets/subtle.json`**

```json
{
  "lift": 0.02,
  "crush": 0.02,
  "fade": 0.08,
  "halation-intensity": 0.3,
  "halation-radius": 31,
  "aberration": 0.1,
  "weave": 0.15
}
```

**Step 3: Create `presets/heavy.json`**

```json
{
  "lift": 0.1,
  "crush": 0.08,
  "fade": 0.25,
  "shadow-tint": "warm",
  "highlight-tint": "warm",
  "halation-intensity": 0.9,
  "halation-radius": 71,
  "halation-threshold": 150,
  "halation-warmth": 0.9,
  "aberration": 0.6,
  "weave": 0.5
}
```

**Step 4: Commit**

```bash
git add presets/
git commit -m "feat(presets): add default, subtle, and heavy preset JSON files"
```

---

### Task 2: Add `PresetData` type and `loadPreset` module

**Files:**
- Create: `src/presets.ts`
- Modify: `src/types.ts`

**Step 1: Write the failing test**

Create `src/__tests__/presets.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { loadPreset, applyPreset } from "../presets";

describe("loadPreset", () => {
  it("loads the built-in default preset", () => {
    const data = loadPreset("default");
    expect(data).toBeDefined();
    expect(data["lift"]).toBe(0.05);
    expect(data["aberration"]).toBe(0.3);
  });

  it("loads a named built-in preset", () => {
    const data = loadPreset("subtle");
    expect(data).toBeDefined();
    expect(data["lift"]).toBe(0.02);
  });

  it("throws for unknown preset", () => {
    expect(() => loadPreset("nonexistent")).toThrow(/not found/i);
  });

  it("merges named preset over default", () => {
    const data = loadPreset("subtle");
    // subtle only overrides some keys — missing keys should be undefined
    // (merging with default happens at applyPreset level)
    expect(data["lift"]).toBe(0.02);
  });
});

describe("applyPreset", () => {
  it("returns full FilmOptions from default preset with no overrides", () => {
    const opts = applyPreset("default", {});
    expect(opts.grade.liftBlacks).toBe(0.05);
    expect(opts.grade.fade).toBe(0.15);
    expect(opts.halation.intensity).toBe(0.6);
    expect(opts.aberration.strength).toBe(0.3);
    expect(opts.weave.strength).toBe(0.3);
    expect(opts.preset).toBe("medium");
    expect(opts.crf).toBe(18);
  });

  it("applies CLI overrides on top of preset", () => {
    const opts = applyPreset("default", { "lift": 0.1, "aberration": 0.8 });
    expect(opts.grade.liftBlacks).toBe(0.1);
    expect(opts.aberration.strength).toBe(0.8);
    // Non-overridden values stay at preset defaults
    expect(opts.grade.fade).toBe(0.15);
  });

  it("merges named preset over default then applies overrides", () => {
    const opts = applyPreset("subtle", { "fade": 0.5 });
    expect(opts.grade.liftBlacks).toBe(0.02); // from subtle
    expect(opts.grade.fade).toBe(0.5); // from CLI override
    expect(opts.grade.shadowTint).toBe("warm"); // from default (subtle doesn't set it)
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/presets.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `src/presets.ts`**

```typescript
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { GradeOptions, HalationOptions, AberrationOptions, WeaveOptions } from "./types";

export interface PresetData {
  [key: string]: string | number | undefined;
}

interface EffectOptions {
  grade: GradeOptions;
  halation: HalationOptions;
  aberration: AberrationOptions;
  weave: WeaveOptions;
  preset: "fast" | "medium" | "slow";
  crf: number;
}

function builtinPresetsDir(): string {
  return join(import.meta.dir, "..", "presets");
}

function userPresetsDir(): string {
  return join(homedir(), ".openhancer", "presets");
}

export function loadPreset(name: string): PresetData {
  const userPath = join(userPresetsDir(), `${name}.json`);
  if (existsSync(userPath)) {
    return JSON.parse(readFileSync(userPath, "utf-8"));
  }

  const builtinPath = join(builtinPresetsDir(), `${name}.json`);
  if (existsSync(builtinPath)) {
    return JSON.parse(readFileSync(builtinPath, "utf-8"));
  }

  throw new Error(`Preset "${name}" not found. Looked in:\n  ${userPresetsDir()}\n  ${builtinPresetsDir()}`);
}

export function applyPreset(
  name: string,
  overrides: PresetData
): EffectOptions {
  const defaults = loadPreset("default");
  const named = name === "default" ? {} : loadPreset(name);
  const merged = { ...defaults, ...named, ...overrides };

  const grade: GradeOptions = {
    liftBlacks: Number(merged["lift"] ?? 0.05),
    crushWhites: Number(merged["crush"] ?? 0.04),
    shadowTint: (merged["shadow-tint"] as GradeOptions["shadowTint"]) ?? "warm",
    highlightTint: (merged["highlight-tint"] as GradeOptions["highlightTint"]) ?? "cool",
    fade: Number(merged["fade"] ?? 0.15),
  };

  const halation: HalationOptions = {
    intensity: Number(merged["halation-intensity"] ?? 0.6),
    radius: Number(merged["halation-radius"] ?? 51),
    threshold: Number(merged["halation-threshold"] ?? 180),
    warmth: Number(merged["halation-warmth"] ?? 0.7),
  };

  const aberration: AberrationOptions = {
    strength: Number(merged["aberration"] ?? 0.3),
  };

  const weave: WeaveOptions = {
    strength: Number(merged["weave"] ?? 0.3),
  };

  const preset = (merged["encode-preset"] as EffectOptions["preset"]) ?? "medium";
  const crf = Number(merged["crf"] ?? 18);

  return { grade, halation, aberration, weave, preset, crf };
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test src/__tests__/presets.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/presets.ts src/__tests__/presets.test.ts
git commit -m "feat(presets): add loadPreset and applyPreset with tests"
```

---

### Task 3: Refactor CLI to use preset system

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/types.ts`

**Step 1: Update `src/types.ts`** — rename `preset` to `encodePreset` in `FilmOptions`

Change `FilmOptions.preset` to `FilmOptions.encodePreset` and update the type.

**Step 2: Update `src/cli.ts`**

- Rename `--preset` flag to `--encode-preset` in HELP_TEXT, KNOWN_FLAGS, VALUE_FLAGS, and the switch statement
- Add `--preset <name>` flag for selecting preset files (default: "default")
- Replace hardcoded defaults: collect CLI overrides into a `PresetData` map, then call `applyPreset(presetName, overrides)` to produce the final `FilmOptions`
- The parseArgs function should: (1) first pass to collect raw CLI values and preset name, (2) call `applyPreset` to merge preset + overrides

**Step 3: Update `src/pipeline.ts`** — rename `options.preset` to `options.encodePreset`

**Step 4: Update existing CLI tests** — change `--preset` references to `--encode-preset`

**Step 5: Run all tests**

Run: `bun test`
Expected: All pass

**Step 6: Commit**

```bash
git add src/cli.ts src/types.ts src/pipeline.ts src/__tests__/cli.test.ts
git commit -m "refactor(cli): integrate preset system, rename --preset to --encode-preset"
```

---

### Task 4: Update README

**Files:**
- Modify: `README.md`

**Step 1: Add Presets section after Usage, update Options table**

Add documentation for:
- How presets work (built-in vs user `~/.openhancer/presets/`)
- Preset JSON structure with example
- Creating custom presets
- `--preset` flag usage
- Rename `--preset` to `--encode-preset` in the options table
- Development section: how to run from source, run tests, run e2e tests, build binary

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add preset system and development guide to README"
```
