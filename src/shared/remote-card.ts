import { z } from "zod";

export const remoteUrlSchema = z.string().max(2048).url().refine((value) => {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.hash; }
  catch { return false; }
}, "Use an absolute HTTP(S) URL without credentials or fragments");
const label = z.string().trim().min(1).max(120);
const value = z.union([z.string().max(160), z.number().finite()]);
export const toneSchema = z.enum(["neutral", "success", "warning", "danger", "info"]);
const tone = toneSchema.default("neutral");
const title = label.optional();
export const remoteBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), title, text: z.string().min(1).max(1000) }).strict(),
  z.object({ type: z.literal("metrics"), title, items: z.array(z.object({ label, value, unit: z.string().max(24).optional(), tone }).strict()).min(1).max(12) }).strict(),
  z.object({ type: z.literal("progress"), title, label, value: z.number().finite().min(0), max: z.number().finite().positive(), unit: z.string().max(24).optional(), tone }).strict().refine((block) => block.value <= block.max, "Progress value cannot exceed max"),
  z.object({ type: z.literal("list"), title, items: z.array(z.object({ label, value, description: z.string().max(240).optional(), tone }).strict()).min(1).max(20) }).strict()
]);

/** Remote data is inert, bounded and versioned. Dashboard identity/style never comes from a service. */
export const remoteCardPayloadSchema = z.object({
  protocol: z.literal("chroma-card/v1"),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  ttlSeconds: z.number().int().min(30).max(3600).optional(),
  status: z.object({ label, tone }).strict().optional(),
  blocks: z.array(remoteBlockSchema).min(1).max(6),
  actions: z.array(z.object({ label: z.string().min(1).max(80), url: remoteUrlSchema }).strict()).max(2).default([])
}).strict().superRefine((payload, context) => {
  const metrics = payload.blocks.reduce((sum, block) => sum + (block.type === "metrics" ? block.items.length : 0), 0);
  const rows = payload.blocks.reduce((sum, block) => sum + (block.type === "list" ? block.items.length : 0), 0);
  if (metrics > 12 || rows > 20) context.addIssue({ code: "custom", message: "Use at most 12 metrics and 20 list rows across all blocks" });
});

export const remoteSettingsSchema = z.object({
  endpoint: z.union([z.literal("demo:house"), remoteUrlSchema]),
  allowLocalNetwork: z.boolean().default(false),
  authMode: z.enum(["none", "bearer", "api-key"]).default("none"),
  credentialId: z.string().uuid().optional(),
  refreshSeconds: z.number().int().min(30).max(86400).default(60)
});
export const remoteRequestSchema = remoteSettingsSchema.strict();
export const remoteCredentialInputSchema = z.object({
  endpoint: remoteUrlSchema,
  authMode: z.enum(["bearer", "api-key"]),
  secret: z.string().min(8).max(4096).regex(/^[\x21-\x7e]+$/, "Use a token without spaces or control characters")
}).strict();
export const remoteCredentialStatusSchema = z.object({ configured: z.boolean() });
export const remoteCredentialCreatedSchema = remoteCredentialStatusSchema.extend({ credentialId: z.string().uuid() });
export const remoteWidgetSchema = z.object({
  data: remoteCardPayloadSchema,
  fetchedAt: z.string().datetime(),
  stale: z.boolean(),
  cache: z.enum(["fresh", "cached", "revalidated", "stale"]),
  nextRefreshSeconds: z.number().int().min(30).max(86400),
  error: z.string().optional()
});
export type RemotePayload = z.infer<typeof remoteCardPayloadSchema>;
export type RemoteBlock = z.infer<typeof remoteBlockSchema>;
export type RemoteSettings = z.infer<typeof remoteSettingsSchema>;
export type RemoteWidget = z.infer<typeof remoteWidgetSchema>;
export type RemoteCredentialInput = z.infer<typeof remoteCredentialInputSchema>;

/** Also served as a real JSON endpoint; never presented as live house data. */
export function remoteHouseExample(updatedAt = new Date().toISOString()): RemotePayload {
  return remoteCardPayloadSchema.parse({
    protocol: "chroma-card/v1", updatedAt, ttlSeconds: 60,
    status: { label: "Demo · Home secure", tone: "success" },
    blocks: [
      { type: "text", title: "House overview", text: "Mock data: everyone is home. Windows are closed and the alarm is armed." },
      { type: "metrics", title: "Comfort & energy", items: [
        { label: "Living room", value: 22.4, unit: "°C" },
        { label: "Humidity", value: 48, unit: "%" },
        { label: "Power now", value: 0.82, unit: "kW", tone: "info" },
        { label: "Solar today", value: 9.6, unit: "kWh", tone: "success" }
      ] },
      { type: "progress", title: "Storage", label: "Home battery", value: 76, max: 100, unit: "%", tone: "success" },
      { type: "list", title: "Around the house", items: [
        { label: "Front door", value: "Locked", tone: "success" },
        { label: "Windows", value: "All closed", tone: "success" },
        { label: "Lights", value: "3 on", description: "Kitchen and living room" },
        { label: "Robot vacuum", value: "Docked", description: "Last clean completed at 10:30" }
      ] }
    ],
    actions: [{ label: "Open Home Assistant", url: "http://homeassistant.local:8123/" }]
  });
}
