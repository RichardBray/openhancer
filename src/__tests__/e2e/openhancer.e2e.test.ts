import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, unlinkSync } from "fs";
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

// Clean up output files after tests
function cleanup(files: string[]) {
  for (const f of files) {
    const p = path.join(FIXTURES_DIR, f);
    if (existsSync(p)) unlinkSync(p);
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
    cleanup([
      "test_openhanced.mp4",
      "test_openhanced.png",
      "test_openhanced.mov",
      "custom_output.mp4",
    ]);
  });

  it("prints help with --help", async () => {
    const { exitCode, stdout } = await runOpenhancer(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("openhancer <input>");
    expect(stdout).toContain("--output");
    expect(stdout).toContain("--bloom-amount");
    expect(stdout).toContain("--grain-amount");
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
    const { exitCode, stderr } = await runOpenhancer(["test.mp4", "--exposure", "10"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("must be between");
  });

  it("exits with error on missing input file", async () => {
    const { exitCode, stderr } = await runOpenhancer(["nonexistent.mp4"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("not found");
  });

  it("processes an image (png) with defaults", async () => {
    cleanup(["test_openhanced.png"]);
    const { exitCode, stdout, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.png"),
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("(image)");
    expect(stdout).toContain("Done.");
    expect(existsSync(path.join(FIXTURES_DIR, "test_openhanced.png"))).toBe(true);
  });

  it("processes a video (mp4) with defaults", async () => {
    cleanup(["test_openhanced.mp4"]);
    const { exitCode, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.mp4"),
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(existsSync(path.join(FIXTURES_DIR, "test_openhanced.mp4"))).toBe(true);
  });

  it("processes a .mov file", async () => {
    cleanup(["test_openhanced.mov"]);
    const { exitCode, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.mov"),
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(existsSync(path.join(FIXTURES_DIR, "test_openhanced.mov"))).toBe(true);
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
    cleanup(["test_openhanced.mp4"]);
    const { exitCode, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.mp4"),
      "--exposure", "0.1",
      "--contrast", "1.2",
      "--fade", "0.3",
      "--halation-amount", "0.5",
      "--aberration", "0.5",
      "--bloom-amount", "0.3",
      "--grain-amount", "0.2",
      "--vignette-amount", "0.4",
      "--camera-shake-amount", "0.3",
      "--preset", "fast",
      "--crf", "28",
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(existsSync(path.join(FIXTURES_DIR, "test_openhanced.mp4"))).toBe(true);
  });

  it("processes with disabled effects via --no flags", async () => {
    cleanup(["test_openhanced.png"]);
    const { exitCode, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.png"),
      "--no-halation",
      "--no-bloom",
      "--no-grain",
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(existsSync(path.join(FIXTURES_DIR, "test_openhanced.png"))).toBe(true);
  });

  it("processes with global blend", async () => {
    cleanup(["test_openhanced.png"]);
    const { exitCode, stderr } = await runOpenhancer([
      path.join(FIXTURES_DIR, "test.png"),
      "--blend", "0.5",
    ]);
    if (exitCode !== 0) console.error("FFmpeg stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(existsSync(path.join(FIXTURES_DIR, "test_openhanced.png"))).toBe(true);
  });
});
