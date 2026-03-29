import { EFFECT_SCHEMA } from "../schema";
import { loadPreset } from "../presets";
import type { PresetData } from "../presets";
import { runGpuExport } from "../pipeline";
import { probe } from "../probe";
import { join } from "node:path";
import { existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";

function builtinPresetsDir(): string {
  return join(import.meta.dir, "..", "..", "presets");
}

function userPresetsDir(): string {
  return join(homedir(), ".openhancer", "presets");
}

function listPresets(): string[] {
  const names: string[] = [];
  for (const dir of [builtinPresetsDir(), userPresetsDir()]) {
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (f.endsWith(".json")) names.push(f.replace(".json", ""));
      }
    }
  }
  return [...new Set(names)];
}

export function createServer(port: number) {
  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/api/schema") {
        return Response.json(EFFECT_SCHEMA);
      }

      if (url.pathname === "/api/presets" && req.method === "GET") {
        return Response.json(listPresets());
      }

      if (url.pathname === "/api/preset" && req.method === "GET") {
        const name = url.searchParams.get("name") || "default";
        try {
          return Response.json(loadPreset(name));
        } catch {
          return new Response("Preset not found", { status: 404 });
        }
      }

      if (url.pathname === "/api/presets" && req.method === "POST") {
        const body = await req.json();
        const { name, data } = body;
        if (!name || !data) return new Response("name and data required", { status: 400 });
        const dir = userPresetsDir();
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${name}.json`), JSON.stringify(data, null, 2));
        return Response.json({ ok: true });
      }

      if (url.pathname === "/api/export" && req.method === "POST") {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const paramsJson = formData.get("params") as string | null;
        if (!file || !paramsJson) {
          return new Response("file and params required", { status: 400 });
        }

        const params: PresetData = JSON.parse(paramsJson);
        const tempDir = join(tmpdir(), "openhancer-export");
        if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
        const inputPath = join(tempDir, file.name);
        await Bun.write(inputPath, file);

        const probeResult = await probe(inputPath);

        if (probeResult.isImage) {
          return new Response("Image export is handled client-side", { status: 400 });
        }

        const outputPath = join(tempDir, `export_${Date.now()}.mp4`);

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            try {
              await runGpuExport(
                inputPath,
                outputPath,
                params as Record<string, unknown>,
                probeResult,
                (ratio) => {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ progress: ratio })}\n\n`));
                },
              );
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, downloadUrl: `/api/download?path=${encodeURIComponent(outputPath)}` })}\n\n`));
            } catch (err) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`));
            }
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      }

      if (url.pathname === "/api/download" && req.method === "GET") {
        const filePath = url.searchParams.get("path");
        if (!filePath || !existsSync(filePath)) {
          return new Response("File not found", { status: 404 });
        }
        return new Response(Bun.file(filePath), {
          headers: { "Content-Disposition": `attachment; filename="${filePath.split("/").pop()}"` },
        });
      }

      // Static file serving (SPA)
      const staticDir = join(import.meta.dir, "dist");
      const filePath = join(staticDir, url.pathname === "/" ? "index.html" : url.pathname);
      if (existsSync(filePath)) {
        return new Response(Bun.file(filePath));
      }
      const indexPath = join(staticDir, "index.html");
      if (existsSync(indexPath)) {
        return new Response(Bun.file(indexPath));
      }
      return new Response("Not found", { status: 404 });
    },
  });
}

export async function startUI(port: number): Promise<void> {
  const server = createServer(port);
  console.log(`openhancer UI running at http://localhost:${server.port}`);
  const open = process.platform === "darwin" ? "open" : "xdg-open";
  Bun.spawn([open, `http://localhost:${server.port}`], { stdout: "ignore", stderr: "ignore" });
}
