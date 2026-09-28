import { z } from "zod";
import { gamingImageSchema, gamingItemSchema, gamingPriceSchema, gamingShopsSchema, gamingUrlSchema, gamingWidgetSchema, type GamingQuery, type GamingShop, type GamingWidget } from "../shared/gaming";
import type { SecretRepository } from "./secrets";

const giveawaySchema = z.object({
  id: z.number().int(), title: z.string(), platforms: z.string(),
  type: z.literal("Game"), status: z.literal("Active"), gamerpower_url: gamingUrlSchema,
  thumbnail: gamingImageSchema.optional().catch(undefined)
});
const dealSchema = z.object({
  id: z.string(), title: z.string(), type: z.string().nullable().optional(),
  assets: z.object({
    banner300: gamingImageSchema.optional().catch(undefined),
    banner145: gamingImageSchema.optional().catch(undefined),
    boxart: gamingImageSchema.optional().catch(undefined)
  }).optional().catch(undefined),
  deal: z.object({
    shop: z.object({ id: z.number().int().positive().optional(), name: z.string() }), price: gamingPriceSchema, regular: gamingPriceSchema,
    cut: z.number().min(0).max(100), url: gamingUrlSchema,
    expiry: z.string().datetime({ offset: true }).nullable().optional(),
    voucher: z.string().max(100).nullable().optional()
  })
});
const SECRET = "isthereanydeal";
const TTL = 30 * 60_000;

export class GamingError extends Error {
  constructor(message: string, public statusCode = 502) { super(message); }
}

export class GamingService {
  private cache = new Map<string, { expires: number; result: Promise<GamingWidget> }>();
  private shopCache = new Map<string, { expires: number; result: Promise<GamingShop[]> }>();
  private pending = 0;
  private revision = 0;

  constructor(private secrets: SecretRepository, private fetcher: typeof fetch = fetch) {}
  configured() { return this.secrets.has(SECRET); }
  async setApiKey(key: string) { await this.secrets.set(SECRET, key); this.revision++; this.cache.clear(); }
  async deleteApiKey() { await this.secrets.delete(SECRET); this.revision++; this.cache.clear(); }

  async games(query: GamingQuery): Promise<GamingWidget> {
    const revision = this.revision;
    const apiKey = query.view === "deals" ? await this.secrets.get(SECRET) : undefined;
    if (revision !== this.revision) return this.games(query);
    if (query.view === "deals" && !apiKey) throw new GamingError("Add your IsThereAnyDeal API key in this card’s settings, or choose Free games (no key required).", 503);
    const shops = [...new Set(query.shops)].sort((a, b) => a - b);
    const key = query.view === "deals" ? `deals:${query.country}:${shops.join(",")}:${revision}` : `free:${query.platform}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.result;
    if (this.pending >= 4) throw new GamingError("Gaming requests are busy. Please try again shortly.", 429);
    if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value!);
    this.pending++;
    const entry: { expires: number; result: Promise<GamingWidget> } = {
      expires: Date.now() + TTL,
      result: this.load({ ...query, shops }, apiKey).catch((error: unknown) => {
        entry.expires = Date.now() + 60_000;
        // Never forward provider bodies, URLs, headers, or exceptions containing credentials.
        throw error instanceof GamingError ? error : new GamingError("Could not load gaming data. Please try again later.");
      }).finally(() => { this.pending--; })
    };
    this.cache.set(key, entry);
    return entry.result;
  }

  async shops(country: GamingQuery["country"]): Promise<GamingShop[]> {
    const cached = this.shopCache.get(country);
    if (cached && cached.expires > Date.now()) return cached.result;
    if (this.pending >= 4) throw new GamingError("Gaming requests are busy. Please try again shortly.", 429);
    this.pending++;
    const url = new URL("https://api.isthereanydeal.com/service/shops/v1");
    url.searchParams.set("country", country);
    const entry: { expires: number; result: Promise<GamingShop[]> } = {
      expires: Date.now() + TTL,
      result: this.requestJson(url).then((raw) => gamingShopsSchema.parse(raw).sort((a, b) => a.title.localeCompare(b.title)))
        .catch((error: unknown) => {
          entry.expires = Date.now() + 60_000;
          throw error instanceof GamingError ? error : new GamingError("Could not load the store list. Please try again later.");
        }).finally(() => { this.pending--; })
    };
    this.shopCache.set(country, entry);
    return entry.result;
  }

  private async load(query: GamingQuery, apiKey?: string): Promise<GamingWidget> {
    const deals = query.view === "deals";
    const url = deals ? new URL("https://api.isthereanydeal.com/deals/v2") : new URL("https://www.gamerpower.com/api/giveaways");
    if (deals) {
      url.search = new URLSearchParams({ country: query.country, limit: "20", sort: "-cut", nondeals: "false", mature: "false" }).toString();
      if (query.shops.length) url.searchParams.set("shops", query.shops.join(","));
    } else {
      url.search = new URLSearchParams({ platform: query.platform, type: "game", "sort-by": "date" }).toString();
    }
    const raw = await this.requestJson(url, apiKey, !deals);
    const rows = deals ? z.object({ list: z.array(z.unknown()) }).parse(raw).list : z.array(z.unknown()).parse(raw);
    const items: GamingWidget["items"] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      let item: unknown;
      if (deals) {
        const parsed = dealSchema.safeParse(row);
        if (!parsed.success) continue;
        const { id, title, type, deal, assets } = parsed.data;
        if (query.shops.length && (!deal.shop.id || !query.shops.includes(deal.shop.id))) continue;
        if (deal.expiry && Date.parse(deal.expiry) <= Date.now()) continue;
        item = { id, title, detail: [deal.shop.name, type && type !== "game" ? type.toUpperCase() : null].filter(Boolean).join(" · "),
          url: deal.url, imageUrl: assets?.banner300 ?? assets?.banner145 ?? assets?.boxart, price: deal.price, regular: deal.regular, discount: deal.cut, voucher: deal.voucher ?? undefined };
      } else {
        const parsed = giveawaySchema.safeParse(row);
        if (!parsed.success) continue;
        const game = parsed.data;
        item = { id: String(game.id), title: game.title, detail: game.platforms, url: game.gamerpower_url, imageUrl: game.thumbnail };
      }
      const parsed = gamingItemSchema.safeParse(item);
      if (parsed.success && !seen.has(parsed.data.id)) { items.push(parsed.data); seen.add(parsed.data.id); }
      if (items.length === 20) break;
    }
    return gamingWidgetSchema.parse({ source: deals ? "IsThereAnyDeal" : "GamerPower", sourceUrl: deals ? "https://isthereanydeal.com/" : "https://www.gamerpower.com/", updatedAt: new Date().toISOString(), items });
  }

  private async requestJson(url: URL, apiKey?: string, allowEmpty = false): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await this.fetcher(url, {
        signal: controller.signal, redirect: "error",
        headers: { Accept: "application/json", ...(apiKey ? { "ITAD-API-Key": apiKey } : {}) }
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (apiKey && [401, 403].includes(response.status)) throw new GamingError("IsThereAnyDeal rejected the API key. Check or replace it in this card’s settings.", 502);
        if (response.status === 429) throw new GamingError("The gaming provider’s rate limit was reached. Please try again later.", 429);
        throw new GamingError("The gaming provider is temporarily unavailable.");
      }
      if (allowEmpty && response.status === 201) { await response.body?.cancel(); return []; }
      return await this.readJson(response);
    } finally { clearTimeout(timeout); }
  }

  private async readJson(response: Response): Promise<unknown> {
    if (!response.body) throw new GamingError("The gaming provider returned an empty response.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024 * 1024) throw new GamingError("The gaming provider returned too much data.");
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally { await reader.cancel().catch(() => {}); }
  }
}
