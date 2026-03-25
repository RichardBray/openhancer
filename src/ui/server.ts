import { EFFECT_SCHEMA } from "../schema";
import { loadPreset } from "../presets";
import { join } from "path";
import { existsSync, readdirSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";

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
        return new Response("Not implemented", { status: 501 });
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
