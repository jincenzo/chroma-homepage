// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../src/server/app";
import { extractPageMetadata } from "../src/server/link-preview";
import { fetchRemotePage, validateRemoteAddress, validateRemoteUrl } from "../src/server/remote-page";

describe("metadata extraction", () => {
  it("prefers Open Graph, decodes entities, and resolves relative icons against the document base", () => {
    const result = extractPageMetadata('<html><head><base href="/assets/"><title>Fallback</title><meta property="og:title" content="A &amp; B"><meta name="description" content="A useful site"><link rel="icon" href="favicon.png"><link rel="apple-touch-icon" href="/touch.png"></head></html>', "https://example.com/app/");
    expect(result.title).toBe("A & B");
    expect(result.description).toBe("A useful site");
    expect(result.icons).toEqual(["https://example.com/touch.png", "https://example.com/assets/favicon.png", "https://example.com/favicon.ico"]);
  });

  it("falls back to title or hostname and rejects non-HTTP icon references", () => {
    expect(extractPageMetadata("<title> Hello   world </title>", "https://example.com").title).toBe("Hello world");
    const result = extractPageMetadata('<link rel="icon" href="data:image/png;base64,xyz">', "https://example.com");
    expect(result.title).toBe("example.com");
    expect(result.icons).toEqual(["https://example.com/favicon.ico"]);
  });

  it("requires explicit LAN access and always excludes special destinations and credentials", () => {
    expect(() => validateRemoteAddress("127.0.0.1", false)).toThrow("Allow local network");
    expect(() => validateRemoteAddress("192.168.1.10", true)).not.toThrow();
    expect(() => validateRemoteAddress("::ffff:127.0.0.1", false)).toThrow("Allow local network");
    for (const ip of ["169.254.169.254", "0.0.0.0", "::", "fe80::1", "224.0.0.1", "fd00:ec2::254"]) {
      expect(() => validateRemoteAddress(ip, true)).toThrow("not allowed");
    }
    expect(() => validateRemoteUrl("file:///etc/passwd")).toThrow();
    expect(() => validateRemoteUrl("https://user:secret@example.com")).toThrow();
  });
});

describe("link preview API with an isolated HTTP fixture", () => {
  let baseUrl: string;
  let dataPath: string;
  let app: Awaited<ReturnType<typeof createApp>>;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4xkAAAAASUVORK5CYII=", "base64");
  const remote = createServer((request, response) => {
    if (request.url === "/redirect") { response.writeHead(302, { location: "/app/page" }).end(); return; }
    if (request.url === "/blocked-redirect") { response.writeHead(302, { location: "http://169.254.169.254/" }).end(); return; }
    if (request.url === "/icon.png") { response.writeHead(200, { "content-type": "image/png" }).end(png); return; }
    if (request.url === "/app/page") {
      response.writeHead(200, { "content-type": "text/html" }).end('<title>Example Console</title><meta name="description" content="A private service"><link rel="icon" href="../icon.png">');
      return;
    }
    if (request.url === "/no-icon") { response.writeHead(200, { "content-type": "text/html" }).end("<title>No icon here</title>"); return; }
    if (request.url === "/large") { response.writeHead(200, { "content-type": "text/html" }).end("x".repeat(1024 * 1024 + 1)); return; }
    if (request.url === "/slow") return;
    response.writeHead(404).end();
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => remote.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(remote.address() as AddressInfo).port}`;
    dataPath = await mkdtemp(path.join(tmpdir(), "chroma-preview-test-"));
    app = await createApp({ dataPath, defaultConfigPath: path.resolve("config/default-config.json") });
  });
  afterAll(async () => {
    await app?.close();
    remote.closeAllConnections();
    await new Promise<void>((resolve, reject) => remote.close((error) => error ? reject(error) : resolve()));
    if (dataPath) await rm(dataPath, { recursive: true, force: true });
  });

  it("imports title and favicon through redirects without saving configuration", async () => {
    const before = await readFile(path.join(dataPath, "config.json"), "utf8");
    const result = await app.inject({ method: "POST", url: "/api/link-preview", payload: { url: `${baseUrl}/redirect`, allowLocalNetwork: true } });
    expect(result.statusCode).toBe(200);
    const preview = result.json();
    expect(preview).toMatchObject({ title: "Example Console", description: "A private service", icon: { type: "asset" } });
    const image = await app.inject({ method: "GET", url: `/api/assets/${preview.icon.assetId}` });
    expect(image.headers["content-type"]).toBe("image/png");
    expect(image.rawPayload.equals(png)).toBe(true);
    expect(await readdir(path.join(dataPath, "assets"))).toHaveLength(1);
    expect(await readFile(path.join(dataPath, "config.json"), "utf8")).toBe(before);
  });

  it("blocks LAN by default and validates every redirect", async () => {
    const denied = await app.inject({ method: "POST", url: "/api/link-preview", payload: { url: `${baseUrl}/app/page` } });
    expect(denied.statusCode).toBe(400);
    const redirect = await app.inject({ method: "POST", url: "/api/link-preview", payload: { url: `${baseUrl}/blocked-redirect`, allowLocalNetwork: true } });
    expect(redirect.statusCode).toBe(400);
  });

  it("keeps titles when icons are unavailable and reports page failures", async () => {
    const result = await app.inject({ method: "POST", url: "/api/link-preview", payload: { url: `${baseUrl}/no-icon`, allowLocalNetwork: true } });
    expect(result.json()).toMatchObject({ title: "No icon here", warning: expect.stringContaining("favicon") });
    for (const url of ["/missing", "/large", "/icon.png"]) {
      const failure = await app.inject({ method: "POST", url: "/api/link-preview", payload: { url: baseUrl + url, allowLocalNetwork: true } });
      expect(failure.statusCode).toBe(422);
    }
  });

  it("aborts slow requests", async () => {
    await expect(fetchRemotePage(`${baseUrl}/slow`, { allowLocalNetwork: true, maxBytes: 1000, signal: AbortSignal.timeout(100) })).rejects.toThrow();
  });
});
