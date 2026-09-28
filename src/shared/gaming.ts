import { z } from "zod";

export const gamingPlatformSchema = z.enum(["pc", "steam", "epic-games-store", "gog", "drm-free", "itchio", "ps5", "xbox-series-xs", "switch", "android", "ios"]);
export const gamingCountrySchema = z.enum(["IT", "US", "GB", "DE", "FR", "ES", "NL", "CA", "AU"]);
export const gamingShopIdsSchema = z.array(z.number().int().positive().max(1_000_000)).max(100).transform((ids) => [...new Set(ids)].sort((a, b) => a - b));
export const gamingShopsSchema = z.array(z.object({ id: z.number().int().positive().max(1_000_000), title: z.string().min(1).max(200) })).max(1000);
export const gamingQuerySchema = z.object({
  view: z.enum(["free-games", "deals"]).default("free-games"),
  platform: gamingPlatformSchema.default("pc"),
  country: gamingCountrySchema.default("IT"),
  shops: gamingShopIdsSchema.default([])
});
export const gamingHttpQuerySchema = gamingQuerySchema.extend({
  shops: z.string().max(1000).regex(/^$|^[1-9][0-9]*(,[1-9][0-9]*)*$/).default("").transform((value) => value ? value.split(",").map(Number) : []).pipe(gamingShopIdsSchema)
}).strict();
export const gamingCredentialSchema = z.object({ apiKey: z.string().trim().min(8).max(256).regex(/^[a-z0-9_-]+$/i) });
export const gamingCredentialStatusSchema = z.object({ configured: z.boolean() });
export const gamingUrlSchema = z.string().url().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
});
export const gamingPriceSchema = z.object({ amount: z.number().finite().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/) });
export const gamingImageSchema = gamingUrlSchema.refine((value) => {
  try { return ["assets.isthereanydeal.com", "www.gamerpower.com", "gamerpower.com"].includes(new URL(value).hostname); }
  catch { return false; }
});
export const gamingItemSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(500),
  detail: z.string().max(500),
  url: gamingUrlSchema,
  imageUrl: gamingImageSchema.optional(),
  price: gamingPriceSchema.optional(),
  regular: gamingPriceSchema.optional(),
  discount: z.number().min(0).max(100).optional(),
  voucher: z.string().max(100).optional()
});
export const gamingWidgetSchema = z.object({
  source: z.enum(["GamerPower", "IsThereAnyDeal"]),
  sourceUrl: gamingUrlSchema,
  updatedAt: z.string().datetime(),
  items: z.array(gamingItemSchema).max(20)
});
export type GamingQuery = z.infer<typeof gamingQuerySchema>;
export type GamingWidget = z.infer<typeof gamingWidgetSchema>;
export type GamingShop = z.infer<typeof gamingShopsSchema>[number];
