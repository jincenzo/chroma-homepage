// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync, zipSync } from "fflate";
import { createApp } from "../src/server/app";
import { exportDashboard, importDashboard } from "../src/server/dashboard-bundle";
import { fixtureConfig } from "./fixtures";

const id = "c585ac70-2176-4c7a-b4d5-1f62c601e799";
const unusedId = "e19cae16-963f-4c6c-91dd-97f1d0c87d38";
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6KZsAAAAASUVORK5CYII=", "base64");
function configWithImages() {
  const config = fixtureConfig();
  config.homepage.icon = { type: "asset", assetId: id };
  config.tabs[0].sections[0].cards[0].icon = { type: "asset", assetId: id };
  config.tabs[1].sections[0].cards = [{ ...config.tabs[0].sections[0].cards[0], id: "other-tab-card" }];
  return config;
}
function upload(bytes: Buffer, filename = "dashboard.zip") {
  const boundary = "chroma-bundle-test-boundary";
  return { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)
  ]) };
}

describe("portable dashboard bundles", () => {
  let source: string, target: string;
  let app: Awaited<ReturnType<typeof createApp>>, destination: Awaited<ReturnType<typeof createApp>>;
  const options = (dataPath: string) => ({ dataPath, defaultConfigPath: path.resolve("config/default-config.json") });
  beforeEach(async () => {
    source = await mkdtemp(path.join(tmpdir(), "chroma-bundle-source-"));
    target = await mkdtemp(path.join(tmpdir(), "chroma-bundle-target-"));
    app = await createApp(options(source)); destination = await createApp(options(target));
    await writeFile(path.join(source, "assets", `${id}.png`), image);
    await writeFile(path.join(source, "assets", `${unusedId}.png`), "unreferenced-private-data");
  });
  afterEach(async () => { await app.close(); await destination.close(); await rm(source, { recursive: true, force: true }); await rm(target, { recursive: true, force: true }); });

  it("exports the draft and exactly its referenced images, never integration keys or unrelated files", async () => {
    await app.inject({ method: "PUT", url: "/api/integrations/isthereanydeal", payload: { apiKey: "test-placeholder-secret" } });
    const config = configWithImages(); config.homepage.title = "Unsaved draft";
    const response = await app.inject({ method: "POST", url: "/api/dashboard/export", payload: { ...config, apiKey: "accidental-key-field" } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/zip");
    const files = unzipSync(response.rawPayload);
    expect(Object.keys(files).sort()).toEqual([`assets/${id}.png`, "config.json", "manifest.json"]);
    expect(Buffer.from(files[`assets/${id}.png`])).toEqual(image);
    expect(JSON.parse(Buffer.from(files["config.json"]).toString()).homepage.title).toBe("Unsaved draft");
    expect(response.rawPayload.includes(Buffer.from("test-placeholder-secret"))).toBe(false);
    expect(response.rawPayload.includes(Buffer.from("accidental-key-field"))).toBe(false);
    expect(response.rawPayload.includes(Buffer.from("unreferenced-private-data"))).toBe(false);
    expect((await app.inject("/api/config")).json().homepage.title).not.toBe("Unsaved draft");
  });

  it("imports onto an empty instance, remaps shared avatar/card assets and leaves saved configuration untouched", async () => {
    const zip = await exportDashboard(configWithImages(), path.join(source, "assets"));
    const before = (await destination.inject("/api/config")).json();
    const response = await destination.inject({ method: "POST", url: "/api/dashboard/import", ...upload(zip) });
    expect(response.statusCode).toBe(200);
    const { config, assetCount } = response.json();
    expect(assetCount).toBe(1);
    const newId = config.homepage.icon.assetId;
    expect(newId).not.toBe(id);
    expect(config.tabs[0].sections[0].cards[0].icon.assetId).toBe(newId);
    expect(config.tabs[1].sections[0].cards[0].icon.assetId).toBe(newId);
    expect((await destination.inject(`/api/assets/${newId}`)).rawPayload).toEqual(image);
    expect((await destination.inject("/api/config")).json()).toEqual(before);
    expect(await readdir(path.join(target, "assets"))).toEqual([`${newId}.png`]);
  });

  it("never overwrites an asset with a colliding original ID", async () => {
    await writeFile(path.join(target, "assets", `${id}.png`), "existing image");
    const zip = await exportDashboard(configWithImages(), path.join(source, "assets"));
    const result = await importDashboard(zip, path.join(target, "assets"));
    expect(result.config.homepage.icon).not.toEqual({ type: "asset", assetId: id });
    expect(await readFile(path.join(target, "assets", `${id}.png`), "utf8")).toBe("existing image");
  });

  it("still accepts legacy JSON and fails clearly if its images are absent", async () => {
    const legacy = Buffer.from(JSON.stringify(configWithImages()));
    expect((await app.inject({ method: "POST", url: "/api/dashboard/import", ...upload(legacy, "dashboard.json") })).statusCode).toBe(200);
    const missing = await destination.inject({ method: "POST", url: "/api/dashboard/import", ...upload(legacy, "dashboard.json") });
    expect(missing.statusCode).toBe(409);
    expect(missing.json().error).toContain("JSON-only export does not contain image files");
    expect((await destination.inject({ method: "POST", url: "/api/dashboard/import", ...upload(Buffer.from(JSON.stringify(fixtureConfig())), "no-images.json") })).statusCode).toBe(200);
  });

  it("does not quietly export a dashboard with missing images", async () => {
    const response = await destination.inject({ method: "POST", url: "/api/dashboard/export", payload: configWithImages() });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain("missing");
  });

  it("rejects additional multipart files before restoring any images", async () => {
    const zip = await exportDashboard(configWithImages(), path.join(source, "assets"));
    const first = upload(zip);
    const second = upload(zip);
    const endLength = Buffer.byteLength("--chroma-bundle-test-boundary--\r\n");
    const response = await destination.inject({ method: "POST", url: "/api/dashboard/import", headers: first.headers,
      payload: Buffer.concat([first.payload.subarray(0, -endLength), second.payload]) });
    expect(response.statusCode).toBe(413);
    expect(await readdir(path.join(target, "assets"))).toEqual([]);
  });

  it("rejects traversal paths, unexpected files, damaged assets and incomplete bundles before writing", async () => {
    const zip = await exportDashboard(configWithImages(), path.join(source, "assets"));
    for (const patch of [
      (files: Record<string, Uint8Array>) => { files["../outside.png"] = image; },
      (files: Record<string, Uint8Array>) => { files["secrets.json"] = Buffer.from("private"); },
      (files: Record<string, Uint8Array>) => { files[`assets/${id}.png`] = Buffer.from("tampered"); },
      (files: Record<string, Uint8Array>) => { delete files[`assets/${id}.png`]; },
      (files: Record<string, Uint8Array>) => { files["config.json"] = Buffer.from("{}"); },
      (files: Record<string, Uint8Array>) => { files["manifest.json"] = Buffer.from('{"format":"chroma-dashboard","version":99}'); }
    ]) {
      const files = unzipSync(zip); patch(files);
      await expect(importDashboard(Buffer.from(zipSync(files)), path.join(target, "assets"))).rejects.toThrow();
      expect(await readdir(path.join(target, "assets"))).toEqual([]);
    }
    await expect(importDashboard(zip.subarray(0, zip.length - 8), path.join(target, "assets"))).rejects.toThrow("incomplete");
  });

  it("rejects oversized compressed entries and symlink exports", async () => {
    const bomb = Buffer.from(zipSync({ "config.json": Buffer.alloc(2 * 1024 * 1024, 65) }));
    await expect(importDashboard(bomb, path.join(target, "assets"))).rejects.toThrow("too large");
    // A lying local-header size must not bypass the streaming output limit.
    bomb.writeUInt32LE(10, 22);
    await expect(importDashboard(bomb, path.join(target, "assets"))).rejects.toThrow(/exceeds|corrupt/);
    expect(await readdir(path.join(target, "assets"))).toEqual([]);
    await symlink(path.join(source, "secrets.key"), path.join(target, "assets", `${id}.png`));
    await expect(exportDashboard(configWithImages(), path.join(target, "assets"))).rejects.toThrow();
  });

  it("round-trips a compressed ZIP as well as the uncompressed export format", async () => {
    const zip = await exportDashboard(configWithImages(), path.join(source, "assets"));
    const compressed = Buffer.from(zipSync(unzipSync(zip), { level: 6 }));
    expect((await importDashboard(compressed, path.join(target, "assets"))).assetCount).toBe(1);
  });
});
