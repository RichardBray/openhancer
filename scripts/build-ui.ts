import { join } from "node:path";

// Build main UI
const result = await Bun.build({
  entrypoints: [join(import.meta.dir, "..", "src", "ui", "app", "index.tsx")],
  outdir: join(import.meta.dir, "..", "src", "ui", "dist"),
  minify: true,
  target: "browser",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const html = await Bun.file(join(import.meta.dir, "..", "src", "ui", "app", "index.html")).text();
const jsFile = result.outputs.find(o => o.path.endsWith(".js"));
const jsName = jsFile ? jsFile.path.split("/").pop() : "index.js";
const injected = html.replace("<!-- SCRIPT -->", `<script type="module" src="/${jsName}"></script>`);
await Bun.write(join(import.meta.dir, "..", "src", "ui", "dist", "index.html"), injected);

console.log("UI built successfully");

// Build render worker
const workerResult = await Bun.build({
  entrypoints: [join(import.meta.dir, "..", "src", "gpu", "render-worker-entry.ts")],
  outdir: join(import.meta.dir, "..", "src", "gpu", "dist"),
  minify: true,
  target: "browser",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

if (!workerResult.success) {
  console.error("Render worker build failed:");
  for (const log of workerResult.logs) console.error(log);
  process.exit(1);
}

const workerHtml = await Bun.file(join(import.meta.dir, "..", "src", "gpu", "render-worker.html")).text();
const workerJsFile = workerResult.outputs.find(o => o.path.endsWith(".js"));
const workerJsName = workerJsFile ? workerJsFile.path.split("/").pop() : "render-worker-entry.js";
const injectedWorker = workerHtml.replace("<!-- SCRIPT -->", `<script type="module" src="${workerJsName}"></script>`);
await Bun.write(join(import.meta.dir, "..", "src", "gpu", "dist", "render-worker.html"), injectedWorker);

console.log("Render worker built successfully");
