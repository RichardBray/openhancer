import { describe, expect, test, afterAll } from "bun:test";
import { createServer } from "../../ui/server";

describe("API server", () => {
  const server = createServer(0);
  const base = `http://localhost:${server.port}`;

  afterAll(() => server.stop());

  test("GET /api/schema returns effect schema", async () => {
    const res = await fetch(`${base}/api/schema`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].key).toBe("colorSettings");
  });

  test("GET /api/presets lists available presets", async () => {
    const res = await fetch(`${base}/api/presets`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toContain("default");
  });

  test("GET /api/preset?name=default returns preset data", async () => {
    const res = await fetch(`${base}/api/preset?name=default`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data["exposure"]).toBe(0);
  });
});
