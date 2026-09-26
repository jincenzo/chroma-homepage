// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../src/server/app";
import { parseConfig, type ChromaConfig } from "../src/shared/config";
import { createEmptyHomepage, profileIdSchema } from "../src/shared/profiles";

describe("homepage profiles", () => {
  let dataPath: string;
  let app: Awaited<ReturnType<typeof createApp>>;
  const defaultConfigPath = path.resolve("config/default-config.json");
  beforeEach(async () => {
    dataPath = await mkdtemp(path.join(tmpdir(), "chroma-profiles-test-"));
    app = await createApp({ dataPath, defaultConfigPath });
  });
  afterEach(async () => {
    await app.close();
    await rm(dataPath, { recursive: true, force: true });
  });

  it("keeps the existing JSON byte-for-byte and exposes it as the default profile", async () => {
    const before = await readFile(path.join(dataPath, "config.json"), "utf8");
    await app.close();
    app = await createApp({ dataPath, defaultConfigPath });
    expect(await readFile(path.join(dataPath, "config.json"), "utf8")).toBe(before);
    const profiles = await app.inject("/api/profiles");
    expect(profiles.json()).toEqual([{ id: "default", name: JSON.parse(before).homepage.title }]);
    expect((await app.inject("/api/profiles/default/config")).json()).toEqual((await app.inject("/api/config")).json());
  });

  it("creates blank profiles with valid UUID entities and no inherited content", async () => {
    const response = await app.inject({ method: "POST", url: "/api/profiles", payload: { name: "  History import  " } });
    expect(response.statusCode).toBe(201);
    const { profile, config } = response.json();
    expect(profileIdSchema.parse(profile.id)).not.toBe("default");
    expect(parseConfig(config).homepage.title).toBe("History import");
    expect(config.tabs[0].sections[0].cards).toEqual([]);
    expect(config.tabs[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await readFile(path.join(dataPath, "profiles", `${profile.id}.json`), "utf8")).toBe(`${JSON.stringify(config, null, 2)}\n`);
    expect(createEmptyHomepage("Another").tabs[0].id).not.toBe(config.tabs[0].id);
  });

  it("isolates copied profiles, saves, imports, backups, and survives restart", async () => {
    const original = await readFile(path.join(dataPath, "config.json"), "utf8");
    const created = await app.inject({ method: "POST", url: "/api/profiles", payload: { name: "Copy", sourceProfileId: "default" } });
    const { profile, config } = created.json<{ profile: { id: string }; config: ChromaConfig }>();
    expect(config.tabs).toEqual(JSON.parse(original).tabs);
    const replacement = createEmptyHomepage("Imported homepage");
    const saved = await app.inject({ method: "PUT", url: `/api/profiles/${profile.id}/config`, payload: replacement });
    expect(saved.statusCode).toBe(200);
    const backupDir = path.join(dataPath, "backups", profile.id);
    const backups = await readdir(backupDir);
    expect(backups).toHaveLength(1);
    expect(JSON.parse(await readFile(path.join(backupDir, backups[0]), "utf8"))).toEqual(config);
    expect(await readFile(path.join(dataPath, "config.json"), "utf8")).toBe(original);
    expect((await readdir(path.join(dataPath, "profiles"))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    await app.close();
    app = await createApp({ dataPath, defaultConfigPath });
    expect((await app.inject(`/api/profiles/${profile.id}/config`)).json()).toEqual(replacement);
    expect((await app.inject("/api/profiles")).json()).toContainEqual({ id: profile.id, name: "Imported homepage" });
  });

  it("rejects invalid configuration, unknown IDs, and unsafe paths without creating files", async () => {
    const before = await readFile(path.join(dataPath, "config.json"), "utf8");
    for (const payload of [{ name: " " }, { name: "x", sourceProfileId: "../config" }]) {
      expect((await app.inject({ method: "POST", url: "/api/profiles", payload })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: "PUT", url: "/api/profiles/default/config", payload: { schemaVersion: 99 } })).statusCode).toBe(400);
    const missing = crypto.randomUUID();
    expect((await app.inject(`/api/profiles/${missing}/config`)).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: `/api/profiles/${missing}/config`, payload: createEmptyHomepage("Missing") })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/profiles", payload: { name: "Missing", sourceProfileId: missing } })).statusCode).toBe(404);
    expect((await app.inject("/api/profiles/not-an-id/config")).statusCode).toBe(400);
    expect(() => profileIdSchema.parse("../../config")).toThrow();
    expect(await readFile(path.join(dataPath, "config.json"), "utf8")).toBe(before);
    expect((await app.inject("/api/profiles")).json()).toHaveLength(1);
  });

  it("persists Iconify and asset avatars in profile documents, lists, and copies", async () => {
    const icon = { type: "iconify", value: "lucide:server" };
    const created = await app.inject({ method: "POST", url: "/api/profiles", payload: { name: "Servers", icon } });
    expect(created.statusCode).toBe(201);
    const { profile, config } = created.json();
    expect(profile.icon).toEqual(icon);
    expect(config.homepage.icon).toEqual(icon);
    const image = { type: "asset", assetId: crypto.randomUUID() };
    config.homepage.icon = image;
    expect((await app.inject({ method: "PUT", url: `/api/profiles/${profile.id}/config`, payload: config })).statusCode).toBe(200);
    expect((await app.inject("/api/profiles")).json()).toContainEqual({ id: profile.id, name: "Servers", icon: image });
    const copy = await app.inject({ method: "POST", url: "/api/profiles", payload: { name: "Copy", sourceProfileId: profile.id } });
    expect(copy.json().profile.icon).toEqual(image);
    const override = await app.inject({ method: "POST", url: "/api/profiles", payload: { name: "Override", sourceProfileId: profile.id, icon } });
    expect(override.json().config.homepage.icon).toEqual(icon);
    await app.close();
    app = await createApp({ dataPath, defaultConfigPath });
    expect((await app.inject(`/api/profiles/${profile.id}/config`)).json().homepage.icon).toEqual(image);
    delete config.homepage.icon;
    await app.inject({ method: "PUT", url: `/api/profiles/${profile.id}/config`, payload: config });
    expect((await app.inject(`/api/profiles/${profile.id}/config`)).json().homepage.icon).toBeUndefined();
  });

  it("rejects invalid profile avatars without overwriting the document", async () => {
    const before = await readFile(path.join(dataPath, "config.json"), "utf8");
    for (const icon of [{ type: "asset", assetId: "../../file" }, { type: "base64", value: "data:image/png;base64,abc" }]) {
      expect((await app.inject({ method: "POST", url: "/api/profiles", payload: { name: "Invalid", icon } })).statusCode).toBe(400);
      const config = JSON.parse(before);
      config.homepage.icon = icon;
      expect((await app.inject({ method: "PUT", url: "/api/profiles/default/config", payload: config })).statusCode).toBe(400);
    }
    expect(await readFile(path.join(dataPath, "config.json"), "utf8")).toBe(before);
  });
});
