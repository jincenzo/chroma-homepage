// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../src/server/app";
import { gamingCardSchema } from "../src/shared/config";
import { createGamingCard } from "../src/shared/operations";

const giveaway = { id: 1, title: "Test Game Giveaway", platforms: "PC, Steam", type: "Game", status: "Active", gamerpower_url: "https://www.gamerpower.com/test-game", thumbnail: "https://www.gamerpower.com/offers/test.jpg" };
const offer = { id: "game-1", title: "Test RPG", type: "game", assets: { banner300: "https://assets.isthereanydeal.com/test/banner300.jpg" }, deal: {
  shop: { id: 35, name: "GOG" }, price: { amount: 9.99, currency: "EUR" }, regular: { amount: 39.99, currency: "EUR" },
  cut: 75, url: "https://itad.link/test-game/", voucher: "SALE", expiry: null
} };
const credentialUrl = "/api/integrations/isthereanydeal";
const widgetUrl = "/api/widgets/gaming";

describe("Gaming integration", () => {
  let dataPath: string;
  let app: Awaited<ReturnType<typeof createApp>>;
  const defaultConfigPath = path.resolve("config/default-config.json");
  const upstream = vi.fn<typeof fetch>();
  const saveKey = (apiKey = "test-placeholder-gaming-key") => app.inject({ method: "PUT", url: credentialUrl, payload: { apiKey } });

  beforeEach(async () => {
    upstream.mockReset();
    upstream.mockImplementation(async (input) => Response.json(String(input).includes("isthereanydeal") ? { list: [offer] } : [giveaway]));
    dataPath = await mkdtemp(path.join(tmpdir(), "chroma-gaming-test-"));
    app = await createApp({ dataPath, defaultConfigPath, fetchGaming: upstream });
  });
  afterEach(async () => { await app.close(); await rm(dataPath, { recursive: true, force: true }); });

  it("provides free games without a key, caches requests, and separates platform filters", async () => {
    const [first, second] = await Promise.all([app.inject(widgetUrl), app.inject(widgetUrl)]);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ source: "GamerPower", sourceUrl: "https://www.gamerpower.com/", items: [{ id: "1", title: giveaway.title, detail: "PC, Steam", url: giveaway.gamerpower_url }] });
    expect(second.json()).toEqual(first.json());
    expect(first.json().items[0].imageUrl).toBe(giveaway.thumbnail);
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("type")).toBe("game");
    expect(new Headers(init?.headers).has("ITAD-API-Key")).toBe(false);
    await app.inject(`${widgetUrl}?platform=steam`);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("returns regional store lists without credentials and caches them separately", async () => {
    upstream.mockImplementation(async () => Response.json([{ id: 61, title: "Steam", deals: 500 }, { id: 35, title: "GOG" }]));
    const [first, second] = await Promise.all([app.inject(`${widgetUrl}/shops?country=IT`), app.inject(`${widgetUrl}/shops?country=IT`)]);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual([{ id: 35, title: "GOG" }, { id: 61, title: "Steam" }]);
    expect(second.json()).toEqual(first.json());
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(String(upstream.mock.calls[0][0])).toBe("https://api.isthereanydeal.com/service/shops/v1?country=IT");
    expect(new Headers(upstream.mock.calls[0][1]?.headers).has("ITAD-API-Key")).toBe(false);
    await app.inject(`${widgetUrl}/shops?country=US`);
    expect(upstream).toHaveBeenCalledTimes(2);
    expect((await app.inject(`${widgetUrl}/shops?country=ZZ`)).statusCode).toBe(400);
  });

  it("sends multi-store filters upstream, normalizes cache keys and excludes unselected stores", async () => {
    await saveKey();
    const first = await app.inject(`${widgetUrl}?view=deals&shops=61,35,61`);
    expect(first.statusCode).toBe(200);
    expect(first.json().items[0].imageUrl).toBe(offer.assets.banner300);
    expect(new URL(String(upstream.mock.calls[0][0])).searchParams.get("shops")).toBe("35,61");
    await app.inject(`${widgetUrl}?view=deals&shops=35,61`);
    expect(upstream).toHaveBeenCalledTimes(1);
    const steamOnly = await app.inject(`${widgetUrl}?view=deals&shops=61`);
    expect(steamOnly.json().items).toEqual([]);
    expect(upstream).toHaveBeenCalledTimes(2);
    await app.inject(`${widgetUrl}?view=deals`);
    expect(new URL(String(upstream.mock.calls[2][0])).searchParams.has("shops")).toBe(false);
  });

  it("keeps games when artwork is missing or unsafe and falls back to another trusted asset", async () => {
    await saveKey();
    upstream.mockResolvedValueOnce(Response.json({ list: [
      { ...offer, assets: { banner300: "https://localhost/private", boxart: "https://assets.isthereanydeal.com/test/boxart.jpg" } },
      { ...offer, id: "invalid-art", assets: { banner300: "not a URL", boxart: "javascript:alert(1)" } },
      { ...offer, id: "no-art", assets: null }
    ] }));
    const result = await app.inject(`${widgetUrl}?view=deals`);
    expect(result.json().items).toHaveLength(3);
    expect(result.json().items[0].imageUrl).toBe("https://assets.isthereanydeal.com/test/boxart.jpg");
    expect(result.json().items[1]).not.toHaveProperty("imageUrl");
    expect(result.json().items[2]).not.toHaveProperty("imageUrl");
  });

  it("encrypts keys, sends them only in headers to ITAD, and preserves them across restarts", async () => {
    expect((await app.inject(credentialUrl)).json()).toEqual({ configured: false });
    expect((await app.inject(`${widgetUrl}?view=deals`)).statusCode).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
    const apiKey = "test-placeholder-gaming-key";
    expect((await saveKey(apiKey)).json()).toEqual({ configured: true });
    for (const filename of ["secrets.json", "config.json"]) expect(await readFile(path.join(dataPath, filename), "utf8")).not.toContain(apiKey);
    for (const filename of ["secrets.json", "secrets.key"]) expect((await stat(path.join(dataPath, filename))).mode & 0o777).toBe(0o600);
    await app.close();
    app = await createApp({ dataPath, defaultConfigPath, fetchGaming: upstream });
    const status = await app.inject(credentialUrl);
    expect(status.json()).toEqual({ configured: true });
    expect(status.headers["cache-control"]).toBe("no-store");
    const result = await app.inject(`${widgetUrl}?view=deals&country=IT`);
    expect(result.json()).toMatchObject({ source: "IsThereAnyDeal", items: [{ title: "Test RPG", price: { amount: 9.99, currency: "EUR" }, discount: 75, voucher: "SALE" }] });
    expect(result.body).not.toContain(apiKey);
    const [url, init] = upstream.mock.calls[0];
    expect(String(url)).not.toContain(apiKey);
    expect(new URL(String(url)).origin).toBe("https://api.isthereanydeal.com");
    expect(new URL(String(url)).searchParams.get("country")).toBe("IT");
    expect(new Headers(init?.headers).get("ITAD-API-Key")).toBe(apiKey);
    expect(init?.redirect).toBe("error");
    await app.inject(`${widgetUrl}?view=deals&country=IT`);
    expect(upstream).toHaveBeenCalledTimes(1);
    await app.inject(`${widgetUrl}?view=deals&country=US`);
    expect(upstream).toHaveBeenCalledTimes(2);
    await app.inject(widgetUrl);
    expect(new Headers(upstream.mock.calls[2][1]?.headers).has("ITAD-API-Key")).toBe(false);
  });

  it("invalidates cached offers on key replacement/removal without touching F1 credentials", async () => {
    await app.inject({ method: "PUT", url: "/api/integrations/api-sports-formula-one", payload: { apiKey: "test-placeholder-f1-key" } });
    await saveKey();
    await app.inject(`${widgetUrl}?view=deals`);
    await saveKey("replacement-placeholder-key");
    await app.inject(`${widgetUrl}?view=deals`);
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(new Headers(upstream.mock.calls[1][1]?.headers).get("ITAD-API-Key")).toBe("replacement-placeholder-key");
    expect((await app.inject({ method: "DELETE", url: credentialUrl })).json()).toEqual({ configured: false });
    expect((await app.inject(`${widgetUrl}?view=deals`)).statusCode).toBe(503);
    expect((await app.inject("/api/integrations/api-sports-formula-one")).json()).toEqual({ configured: true });
  });

  it("validates configuration, bounds counts, and strips credentials from card JSON", () => {
    const card = createGamingCard();
    expect(gamingCardSchema.parse({ ...card, apiKey: "never-export-me" })).toEqual(card);
    for (const gameCount of [0, 21, 1.5]) expect(gamingCardSchema.safeParse({ ...card, gameCount }).success).toBe(false);
    expect(gamingCardSchema.safeParse({ ...card, country: "ZZ" }).success).toBe(false);
    expect(gamingCardSchema.parse({ ...card, shops: undefined }).shops).toEqual([]);
    expect(gamingCardSchema.parse({ ...card, shops: [61, 35, 61] }).shops).toEqual([35, 61]);
    expect(gamingCardSchema.safeParse({ ...card, shops: [-1] }).success).toBe(false);
  });

  it("rejects invalid filters and credentials without echoing secrets", async () => {
    for (const query of ["view=nope", "country=ZZ", "platform=http://localhost", "platform[]=pc", "shops=0", "shops=-1", "shops=35,", "shops=steam", "shops=3.5", "shops=1000001", "shops=35&shops=61", `shops=${Array(101).fill(35).join(",")}`]) expect((await app.inject(`${widgetUrl}?${query}`)).statusCode).toBe(400);
    const secret = "invalid key with spaces";
    const response = await saveKey(secret);
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(secret);
  });

  it("handles no giveaways and skips invalid, duplicate, and unsafe rows", async () => {
    upstream.mockResolvedValueOnce(new Response('{"status":0,"status_message":"No active giveaways"}', { status: 201 }));
    expect((await app.inject(widgetUrl)).json().items).toEqual([]);
    upstream.mockResolvedValueOnce(Response.json([giveaway, giveaway, { ...giveaway, id: 2, type: "Loot" }, { ...giveaway, id: 3, gamerpower_url: "javascript:alert(1)" }, { ...giveaway, id: 4, gamerpower_url: "https://user:password@example.com/" }, { ...giveaway, id: 5, gamerpower_url: "not a URL" }]));
    expect((await app.inject(`${widgetUrl}?platform=gog`)).json().items).toHaveLength(1);
    await saveKey();
    upstream.mockResolvedValueOnce(Response.json({ list: [offer, { ...offer, id: "expired", deal: { ...offer.deal, expiry: "2000-01-01T00:00:00Z" } }] }));
    expect((await app.inject(`${widgetUrl}?view=deals`)).json().items).toHaveLength(1);
  });

  it.each([401, 403, 429, 500])("sanitizes provider HTTP %s errors and backs off repeated failures", async (status) => {
    await saveKey();
    upstream.mockResolvedValueOnce(new Response("provider-body-with-secret", { status }));
    const response = await app.inject(`${widgetUrl}?view=deals`);
    expect(response.statusCode).toBe(status === 429 ? 429 : 502);
    expect(response.body).not.toContain("provider-body-with-secret");
    if (status === 401 || status === 403) expect(response.json().error).toContain("rejected the API key");
    await app.inject(`${widgetUrl}?view=deals`);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("sanitizes network failures, malformed JSON and oversized responses", async () => {
    upstream.mockRejectedValueOnce(new Error("request contains a secret"));
    const network = await app.inject(widgetUrl);
    expect(network.statusCode).toBe(502);
    expect(network.body).not.toContain("request contains a secret");
    upstream.mockResolvedValueOnce(new Response("invalid json"));
    expect((await app.inject(`${widgetUrl}?platform=steam`)).statusCode).toBe(502);
    upstream.mockResolvedValueOnce(new Response("x".repeat(1024 * 1024 + 1)));
    expect((await app.inject(`${widgetUrl}?platform=gog`)).json().error).toContain("too much data");
  });
});
