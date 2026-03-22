import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, unlinkSync, readdirSync } from "fs";
import path from "path";

const FIXTURES_DIR = path.join(import.meta.dir, "fixtures");
const CLI_PATH = path.join(import.meta.dir, "../../../src/cli.ts");

// Helper to run openhancer via bun
async function runOpenhancer(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", CLI_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: FIXTURES_DIR,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

// Clean up output files matching a pattern
function cleanup(patterns: string[]) {
  for (const pattern of patterns) {
    const p = path.join(FIXTURES_DIR, pattern);
    if (existsSync(p)) unlinkSync(p);
  }
}

// Clean up files matching a prefix glob in fixtures dir
function cleanupGlob(prefix: string, ext: string) {
  for (const f of readdirSync(FIXTURES_DIR)) {
    if (f.startsWith(prefix) && f.endsWith(ext)) {
      unlinkSync(path.join(FIXTURES_DIR, f));
    }
  }
}

describe("e2e: openhancer", () => {
  beforeAll(async () => {
    // Generate fixtures if missing
    if (!existsSync(path.join(FIXTURES_DIR, "test.mp4"))) {
      const proc = Bun.spawn(["bash", path.join(FIXTURES_DIR, "generate-fixtures.sh")], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
    }
  });

  afterAll(() => {
    cleanupGlob("test_openhanced", ".mp4");
    cleanupGlob("test_openhanced", ".png");
    cleanupGlob("test_openhanced", ".mov");
    cleanup(["custom_output.mp4"]);
  });

  it("prints help with --help", async () => {
    const { exitCode, stdout } = await runOpenhancer(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("openhancer <input>");
    expect(stdout).toContain("--output");
  });

  it("exits with error on no input", async () => {
    const { exitCode, stderr } = await runOpenhancer([]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("No input file");
  });

  it("exits with error on unknown flag", async () => {
    const { exitCode, stderr } = await runOpenhancer(["test.mp4", "--bogus"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Unknown flag");
  });

  it("exits with error on out-of-range flag", async () => {
    const { exitCode, stderr } = await runOpenhancer(["test.mp4", "--lift", "0.9"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("must be between");
  });

  it("exits with error on missing input file", async () => {
    const { exitCode, stderr } = await runOpenhancer(["nonexistent.mp4"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("not found");
  });

  it("processes an image (png) with defaults", async () => {
    cleanupGlob("test_openhanced", ".png");
    const { exitCode, stdout, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.png"),
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("(image)");
    expect(stdout).toContain("Done.");
    const outputFiles = readdirSync(FIXTURES_DIR).filter(f => f.startsWith("test_openhanced") && f.endsWith(".png"));
    expect(outputFiles.length).toBeGreaterThan(0);
  });

  it("processes a video (mp4) with defaults", async () => {
    cleanupGlob("test_openhanced", ".mp4");
    const { exitCode, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.mp4"),
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    const outputFiles = readdirSync(FIXTURES_DIR).filter(f => f.startsWith("test_openhanced") && f.endsWith(".mp4"));
    expect(outputFiles.length).toBeGreaterThan(0);
  });

  it("processes a .mov file", async () => {
    cleanupGlob("test_openhanced", ".mov");
    const { exitCode, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.mov"),
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    const outputFiles = readdirSync(FIXTURES_DIR).filter(f => f.startsWith("test_openhanced") && f.endsWith(".mov"));
    expect(outputFiles.length).toBeGreaterThan(0);
  });

  it("respects --output flag", async () => {
    cleanup(["custom_output.mp4"]);
    const outPath = path.join(FIXTURES_DIR, "custom_output.mp4");
    const { exitCode, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.mp4"),
      "-o", outPath,
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(existsSync(outPath)).toBe(true);
  });

  it("processes video with custom effect parameters", async () => {
    cleanupGlob("test_openhanced", ".mp4");
    const { exitCode, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.mp4"),
      "--lift", "0.1",
      "--crush", "0.08",
      "--fade", "0.3",
      "--halation-intensity", "0.8",
      "--aberration", "0.5",
      "--weave", "0.5",
      "--encode-preset", "fast",
      "--crf", "28",
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    const outputFiles = readdirSync(FIXTURES_DIR).filter(f => f.startsWith("test_openhanced") && f.endsWith(".mp4"));
    expect(outputFiles.length).toBeGreaterThan(0);
  });
});
