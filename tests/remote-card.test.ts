// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { remoteCardPayloadSchema, remoteHouseExample, remoteRequestSchema, type RemoteSettings } from "../src/shared/remote-card";
import { createRemoteCard, duplicateCard } from "../src/shared/operations";
import { parseConfig } from "../src/shared/config";
import { createApp } from "../src/server/app";
import { RemoteCardService } from "../src/server/remote-card";
import { SecretRepository } from "../src/server/secrets";
import { fetchRemotePage } from "../src/server/remote-page";
import { fixtureConfig } from "./fixtures";

describe("custom card protocol", () => {
  it("validates the documented JSON and demo against the actual schema", async () => {
    const guide = await readFile(path.resolve("docs/custom-card-protocol.md"), "utf8");
    const json = guide.match(/```json\n([\s\S]*?)\n```/)![1];
    expect(remoteCardPayloadSchema.parse(JSON.parse(json)).blocks).toHaveLength(4);
    expect(remoteCardPayloadSchema.parse(remoteHouseExample()).actions[0].label).toBe("Open Home Assistant");
  });
  it("rejects unsafe links, active fields, invalid versions, excess items and invalid progress", () => {
    const example = remoteHouseExample();
    for (const payload of [
      { ...example, protocol: "chroma-card/v2" }, { ...example, html: "<script>bad()</script>" },
      { ...example, actions: [{ label: "Unsafe", url: "javascript:alert(1)" }] },
      { ...example, actions: [{ label: "Unsafe", url: "https://user:password@example.com" }] },
      { ...example, blocks: [{ type: "progress", label: "Battery", value: 110, max: 100 }] },
      { ...example, blocks: [{ type: "progress", label: "Battery", value: 1, max: 0 }] },
      { ...example, blocks: [{ type: "metrics", items: Array.from({ length: 12 }, () => ({ label: "A", value: 1 })) }, { type: "metrics", items: [{ label: "B", value: 2 }] }] },
      { ...example, blocks: Array.from({ length: 7 }, () => ({ type: "text", text: "A" })) }
    ]) expect(remoteCardPayloadSchema.safeParse(payload).success).toBe(false);
    expect(remoteCardPayloadSchema.parse({ protocol: "chroma-card/v1", blocks: [{ type: "text", text: "<script>literal()</script>" }] }).blocks).toHaveLength(1);
  });
  it("persists, copies and validates custom cards, strips accidental secrets, and enforces URL/refresh limits", () => {
    const config = fixtureConfig(); config.tabs[0].sections[0].cards.push(createRemoteCard());
    expect(parseConfig(duplicateCard(config, config.tabs[0].sections[0].cards.at(-1)!.id)).tabs[0].sections[0].cards).toHaveLength(3);
    const parsed = parseConfig({ ...config, apiKey: "test-only-placeholder" });
    expect(parsed).not.toHaveProperty("apiKey");
    for (const endpoint of ["file:///etc/passwd", "https://u:p@example.com", "https://example.com/#fragment"]) expect(remoteRequestSchema.safeParse({ endpoint }).success).toBe(false);
    expect(remoteRequestSchema.safeParse({ endpoint: "demo:house", refreshSeconds: 1 }).success).toBe(false);
  });
});

describe("remote custom card service", () => {
  let base: string, dataPath: string, secrets: SecretRepository, app: Awaited<ReturnType<typeof createApp>>;
  const requests = new Map<string, number>();
  const headers = new Map<string, { authorization?: string; key?: string; etag?: string }>();
  let broken = false;
  const remote = createServer((request, response) => {
    const url = request.url!;
    requests.set(url, (requests.get(url) ?? 0) + 1);
    headers.set(url, { authorization: request.headers.authorization, key: request.headers["x-api-key"] as string | undefined, etag: request.headers["if-none-match"] });
    if (url === "/redirect") { response.writeHead(302, { location: "/redirect-target" }).end(); return; }
    if (url === "/metadata") { response.writeHead(302, { location: "http://169.254.169.254/" }).end(); return; }
    if (url === "/huge") { response.writeHead(200, { "content-type": "application/json" }).end(" ".repeat(65537)); return; }
    if (url === "/html") { response.writeHead(200, { "content-type": "text/html" }).end("<h1>Not JSON</h1>"); return; }
    if (url === "/broken-json") { response.writeHead(200, { "content-type": "application/json" }).end("{"); return; }
    if (url === "/slow") return;
    if (url === "/echo") { response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ...remoteHouseExample(), blocks: [{ type: "text", text: request.headers.authorization }] })); return; }
    if (url === "/flaky" && broken) { response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ protocol: "invalid", secret: "test-placeholder-not-for-display" })); return; }
    if (url === "/cache" && request.headers["if-none-match"] === '"house-v1"') { response.writeHead(304, { etag: '"house-v1"', "cache-control": "max-age=120" }).end(); return; }
    const cacheControl = url === "/no-store" ? "no-store" : url === "/no-cache" ? "no-cache" : url === "/ttl" ? "max-age=1" : "max-age=60";
    response.writeHead(200, { "content-type": "application/json", etag: '"house-v1"', "cache-control": cacheControl }).end(JSON.stringify(remoteHouseExample("2026-09-28T00:00:00.000Z")));
  });
  beforeAll(async () => {
    await new Promise<void>((resolve) => remote.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(remote.address() as AddressInfo).port}`;
    dataPath = await mkdtemp(path.join(tmpdir(), "chroma-remote-test-"));
    secrets = new SecretRepository(dataPath); await secrets.initialize();
    app = await createApp({ dataPath, defaultConfigPath: path.resolve("config/default-config.json") });
  });
  afterAll(async () => {
    await app?.close(); remote.closeAllConnections();
    await new Promise<void>((resolve, reject) => remote.close((error) => error ? reject(error) : resolve()));
    await rm(dataPath, { recursive: true, force: true });
  });
  const settings = (url: string, patch: Partial<RemoteSettings> = {}) => remoteRequestSchema.parse({ endpoint: base + url, allowLocalNetwork: true, ...patch });
  it("serves the demo and real mock endpoint without writing a dashboard", async () => {
    const before = await readFile(path.join(dataPath, "config.json"), "utf8");
    const demo = await app.inject({ method: "POST", url: "/api/widgets/remote-data", payload: { endpoint: "demo:house" } });
    expect(demo.statusCode).toBe(200); expect(demo.json().data.status.label).toContain("Demo");
    expect(remoteCardPayloadSchema.safeParse((await app.inject("/api/examples/house")).json()).success).toBe(true);
    expect(await readFile(path.join(dataPath, "config.json"), "utf8")).toBe(before);
  });
  it("requires explicit local access and blocks metadata redirects even with it", async () => {
    const service = new RemoteCardService(secrets);
    await expect(service.load(settings("/local-blocked", { allowLocalNetwork: false }))).rejects.toThrow("Allow local network");
    expect(requests.get("/local-blocked")).toBeUndefined();
    await expect(service.load(settings("/metadata"))).rejects.toThrow("not allowed");
    expect((await service.load(settings("/redirect"))).data.protocol).toBe("chroma-card/v1");
  });
  it("encrypts secrets, returns only a reference/status, binds exact endpoint/mode and deletes credentials", async () => {
    const secret = "test-only-bearer-placeholder";
    const result = await app.inject({ method: "POST", url: "/api/integrations/remote-data", payload: { endpoint: base + "/auth", authMode: "bearer", secret } });
    expect(result.statusCode).toBe(201);
    const credentialId = result.json().credentialId;
    expect(result.body).not.toContain(secret);
    expect((await app.inject(`/api/integrations/remote-data/${credentialId}`)).json()).toEqual({ configured: true });
    expect(await readFile(path.join(dataPath, "secrets.json"), "utf8")).not.toContain(secret);
    const service = new RemoteCardService(secrets);
    const response = await service.load(settings("/auth", { credentialId, authMode: "bearer" }));
    expect(headers.get("/auth")?.authorization).toBe(`Bearer ${secret}`);
    expect(JSON.stringify(response)).not.toContain(secret);
    await expect(service.load(settings("/auth-other", { credentialId, authMode: "bearer" }))).rejects.toThrow("different endpoint");
    await expect(service.load(settings("/auth", { credentialId, authMode: "api-key" }))).rejects.toThrow("different endpoint");
    expect(requests.get("/auth-other")).toBeUndefined();
    expect((await app.inject({ method: "DELETE", url: `/api/integrations/remote-data/${credentialId}` })).json()).toEqual({ configured: false });
    await expect(service.load(settings("/auth", { credentialId, authMode: "bearer" }))).rejects.toThrow("Save a credential");
  });
  it("sends X-API-Key only to its bound endpoint, refuses authenticated redirects and credential echoes", async () => {
    const service = new RemoteCardService(secrets);
    const token = "test-only-api-key-placeholder";
    for (const url of ["/api-key", "/redirect", "/echo"]) {
      const authMode = url === "/api-key" ? "api-key" : "bearer";
      const { credentialId } = await service.createCredential({ endpoint: base + url, authMode, secret: token });
      if (url === "/api-key") { await service.load(settings(url, { authMode, credentialId })); expect(headers.get(url)?.key).toBe(token); }
      else if (url === "/echo") await expect(service.load(settings(url, { authMode, credentialId }))).rejects.toThrow("echoed");
      else { const before = requests.get("/redirect-target") ?? 0; await expect(service.load(settings(url, { authMode, credentialId }))).rejects.toThrow("must not redirect"); expect(requests.get("/redirect-target") ?? 0).toBe(before); }
    }
  });
  it("deduplicates, shares cached data and revalidates with ETag/304", async () => {
    let now = Date.now(); const service = new RemoteCardService(secrets, undefined, () => now);
    const before = requests.get("/cache") ?? 0;
    const [first, duplicate] = await Promise.all([service.load(settings("/cache")), service.load(settings("/cache"))]);
    expect(duplicate.data).toEqual(first.data); expect(requests.get("/cache")).toBe(before + 1);
    expect((await service.load(settings("/cache"))).cache).toBe("cached");
    now += 61000;
    const next = await service.load(settings("/cache"));
    expect(next.cache).toBe("revalidated"); expect(headers.get("/cache")?.etag).toBe('"house-v1"');
    expect(next.data.updatedAt).toBe(first.data.updatedAt); expect(next.fetchedAt).not.toBe(first.fetchedAt);
    expect(next.nextRefreshSeconds).toBe(120);
  });
  it("clamps HTTP TTL and honors no-store/no-cache", async () => {
    const service = new RemoteCardService(secrets);
    expect((await service.load(settings("/ttl", { refreshSeconds: 30 }))).nextRefreshSeconds).toBe(30);
    for (const url of ["/no-store", "/no-cache"]) {
      const before = requests.get(url) ?? 0;
      await service.load(settings(url)); await service.load(settings(url));
      expect(requests.get(url)).toBe(before + 2);
    }
  });
  it("retains no-cache and TTL metadata on a 304 without replacement headers", async () => {
    let calls = 0;
    const fetcher: typeof fetchRemotePage = async () => {
      calls++;
      return { url: new URL(base), body: calls === 1 ? Buffer.from(JSON.stringify(remoteHouseExample())) : Buffer.alloc(0), contentType: "application/json", status: calls === 1 ? 200 : 304,
        ...(calls === 1 ? { cacheControl: "no-cache, max-age=120", etag: '"one"' } : {}) };
    };
    const service = new RemoteCardService(secrets, fetcher);
    await service.load(settings("/no-cache-fixture"));
    expect((await service.load(settings("/no-cache-fixture"))).cache).toBe("revalidated");
    await service.load(settings("/no-cache-fixture"));
    expect(calls).toBe(3);
  });
  it("bounds concurrent fetches and evicts the oldest of 100 cache entries", async () => {
    const release: (() => void)[] = [];
    const fetcher: typeof fetchRemotePage = (input) => new Promise((resolve) => release.push(() => resolve({ url: new URL(input), status: 200, contentType: "application/json", body: Buffer.from(JSON.stringify(remoteHouseExample())) })));
    const service = new RemoteCardService(secrets, fetcher);
    const pending = [0, 1, 2].map((i) => service.load(settings(`/concurrent-${i}`)));
    await expect(service.load(settings("/concurrent-3"))).rejects.toThrow("Too many");
    release.forEach((done) => done()); await Promise.all(pending);
    let calls = 0;
    const instant: typeof fetchRemotePage = async (input) => { calls++; return { url: new URL(input), status: 200, contentType: "application/json", body: Buffer.from(JSON.stringify(remoteHouseExample())) }; };
    const bounded = new RemoteCardService(secrets, instant);
    for (let index = 0; index < 101; index++) await bounded.load(settings(`/entry-${index}`));
    await bounded.load(settings("/entry-100")); expect(calls).toBe(101);
    await bounded.load(settings("/entry-0")); expect(calls).toBe(102);
  });
  it("retains last valid data, sanitizes validation errors, backs off then recovers", async () => {
    let now = Date.now(); const service = new RemoteCardService(secrets, undefined, () => now);
    const first = await service.load(settings("/flaky")); broken = true; now += 61000;
    const stale = await service.load(settings("/flaky"));
    expect(stale.stale).toBe(true); expect(stale.data).toEqual(first.data); expect(stale.fetchedAt).toBe(first.fetchedAt);
    expect(stale.error).toContain("Invalid chroma-card/v1"); expect(stale.error).not.toContain("test-placeholder-not-for-display");
    const before = requests.get("/flaky");
    await service.load(settings("/flaky")); expect(requests.get("/flaky")).toBe(before);
    now += 31000; broken = false;
    expect((await service.load(settings("/flaky"))).stale).toBe(false);
  });
  it("rejects content-type errors, malformed JSON, oversized bodies and invalid request bodies", async () => {
    const service = new RemoteCardService(secrets);
    for (const url of ["/huge", "/html", "/broken-json"]) await expect(service.load(settings(url))).rejects.toThrow();
    const response = await app.inject({ method: "POST", url: "/api/widgets/remote-data", payload: { endpoint: "file:///etc/passwd" } });
    expect(response.statusCode).toBe(400);
    const key = await app.inject({ method: "POST", url: "/api/integrations/remote-data", payload: { endpoint: base, authMode: "bearer", secret: "test\r\nunsafe" } });
    expect(key.statusCode).toBe(400); expect(key.body).not.toContain("unsafe");
  });
  it("enforces a total five-second request timeout", async () => {
    const service = new RemoteCardService(secrets);
    await expect(service.load(settings("/slow"))).rejects.toThrow("timeout");
  }, 10000);
});
