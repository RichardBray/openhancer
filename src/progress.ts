export function renderProgressBar(progress: number, width = 40): string {
  const clamped = Math.min(1, Math.max(0, progress));
  const filled = Math.round(clamped * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const pct = (clamped * 100).toFixed(1);
  return `[${bar}] ${pct}%`;
}

export function parseProgress(chunk: string, duration: number | null): number | null {
  if (duration === null || duration <= 0) return null;

  const match = chunk.match(/out_time_ms=(\d+)/);
  if (!match) return null;

  const timeMs = parseInt(match[1], 10);
  return timeMs / (duration * 1_000_000);
}
