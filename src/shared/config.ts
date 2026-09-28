import { z } from "zod";
import { gamingQuerySchema } from "./gaming";
import { remoteSettingsSchema } from "./remote-card";

export const appearanceSchema = z.object({
  accent: z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color").optional(),
  surface: z.enum(["glass", "flat", "minimal"]).optional(),
  density: z.enum(["compact", "comfortable", "spacious"]).optional(),
  iconSize: z.number().int().min(20).max(48).optional(),
  showDescription: z.boolean().optional()
});

export const accentAppearanceSchema = appearanceSchema.pick({ accent: true });

export const searchShortcutSchema = z.object({
  id: z.string().min(1),
  keyword: z.string().regex(/^[a-z0-9]+$/, "Use lowercase letters and digits"),
  label: z.string().min(1).max(80),
  urlTemplate: z.string().refine((value) => {
    try {
      return value.includes("{query}") && ["http:", "https:"].includes(new URL(value.replaceAll("{query}", "test")).protocol);
    } catch { return false; }
  }, "Use an HTTP(S) URL containing {query}"),
  openInNewTab: z.boolean().default(true)
});

export const iconReferenceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("iconify"), value: z.string().min(2) }),
  z.object({ type: z.literal("asset"), assetId: z.string().uuid() })
]);

const cardAppearanceFields = {
  id: z.string().min(1),
  label: z.string().min(1).max(120),
  icon: iconReferenceSchema,
  bento: z.object({
    width: z.number().int().min(1).max(12),
    height: z.number().int().min(1).max(4)
  }).optional(),
  appearance: appearanceSchema.optional()
};

export const linkCardSchema = z.object({
  ...cardAppearanceFields,
  type: z.literal("link"),
  description: z.string().max(240).optional(),
  url: z.string().url().refine((value) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    } catch { return false; }
  }, "Use an HTTP(S) URL without embedded credentials"),
  openInNewTab: z.boolean().default(true),
  aliases: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional()
});

export const formulaOneCardSchema = z.object({
  ...cardAppearanceFields,
  type: z.literal("formula-one"),
  view: z.enum(["next-race", "driver-standings", "favorite-driver"]).default("next-race"),
  driverId: z.string().trim().regex(/^[a-z0-9_-]+$/i).max(80).optional(),
  driverCount: z.number().int().min(1).max(30).default(3),
  refreshMinutes: z.number().int().min(30).max(1440).default(60)
});

export const gamingCardSchema = gamingQuerySchema.extend({
  ...cardAppearanceFields,
  type: z.literal("gaming"),
  gameCount: z.number().int().min(1).max(20).default(5),
  refreshMinutes: z.number().int().min(30).max(1440).default(60)
});

export const motoGpCardSchema = z.object({
  ...cardAppearanceFields,
  type: z.literal("motogp"),
  view: z.enum(["next-race", "rider-standings", "favorite-rider"]).default("next-race"),
  riderId: z.string().trim().min(1).max(128).optional(),
  riderCount: z.number().int().min(1).max(30).default(3),
  refreshMinutes: z.number().int().min(30).max(1440).default(60)
});

export const remoteCardSchema = remoteSettingsSchema.extend({ ...cardAppearanceFields, type: z.literal("remote-data") });

export const cardSchema = z.discriminatedUnion("type", [linkCardSchema, formulaOneCardSchema, gamingCardSchema, motoGpCardSchema, remoteCardSchema]);

export const gridLayoutSchema = z.object({
  type: z.literal("grid"),
  minCardWidth: z.number().int().min(120).max(600).default(180),
  gap: z.number().int().min(4).max(64).default(16),
  maxColumns: z.number().int().min(1).max(12).optional()
});

export const layoutSchema = z.discriminatedUnion("type", [
  gridLayoutSchema,
  gridLayoutSchema.extend({ type: z.literal("tiles") }),
  gridLayoutSchema.extend({ type: z.literal("list") }),
  gridLayoutSchema.extend({
    type: z.literal("bento"),
    columns: z.number().int().min(1).max(12).default(4),
    rowHeight: z.number().int().min(120).max(320).default(160)
  })
]);

export const sectionBoxSchema = z.object({
  column: z.number().int().min(1).max(12),
  row: z.number().int().min(1).max(10000),
  width: z.number().int().min(1).max(12),
  height: z.number().int().min(1).max(24)
});

export const sectionGridSchema = z.object({
  type: z.literal("bento"),
  columns: z.number().int().min(1).max(12).default(6),
  rowHeight: z.number().int().min(40).max(240).default(80),
  gap: z.number().int().min(4).max(64).default(24)
});

export const sectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  layout: layoutSchema,
  width: z.enum(["full", "two-thirds", "half", "third"]).optional(),
  dashboardBox: sectionBoxSchema.optional(),
  appearance: appearanceSchema.optional(),
  cards: z.array(cardSchema)
});

export const tabSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(80),
  icon: z.string().min(2),
  appearance: accentAppearanceSchema.optional(),
  sectionLayout: sectionGridSchema.optional(),
  sections: z.array(sectionSchema)
});

export const configSchema = z.object({
  schemaVersion: z.literal(1),
  homepage: z.object({
    title: z.string().min(1).max(120),
    icon: iconReferenceSchema.optional(),
    appearance: accentAppearanceSchema.optional(),
    defaultTabId: z.string().min(1),
    tabPosition: z.enum(["top", "left", "right"]).default("top"),
    searchShortcuts: z.array(searchShortcutSchema).max(30).optional()
  }),
  theme: z.object({
    mode: z.enum(["dark", "light"]).default("dark"),
    background: z.object({ type: z.literal("gradient") }),
    glass: z.object({
      opacity: z.number().min(0).max(1),
      blur: z.number().min(0).max(40),
      borderOpacity: z.number().min(0).max(1)
    })
  }),
  tabs: z.array(tabSchema).min(1)
}).superRefine((config, ctx) => {
  const ids = new Set<string>();
  const record = (id: string, path: (string | number)[]) => {
    if (ids.has(id)) ctx.addIssue({ code: "custom", message: `Duplicate id: ${id}`, path });
    ids.add(id);
  };
  const keywords = new Set<string>();
  config.homepage.searchShortcuts?.forEach((shortcut, index) => {
    record(shortcut.id, ["homepage", "searchShortcuts", index, "id"]);
    if (keywords.has(shortcut.keyword)) ctx.addIssue({ code: "custom", message: "Shortcut keywords must be unique", path: ["homepage", "searchShortcuts", index, "keyword"] });
    keywords.add(shortcut.keyword);
  });
  config.tabs.forEach((tab, tabIndex) => {
    record(tab.id, ["tabs", tabIndex, "id"]);
    tab.sections.forEach((section, sectionIndex) => {
      record(section.id, ["tabs", tabIndex, "sections", sectionIndex, "id"]);
      section.cards.forEach((card, cardIndex) => record(card.id, ["tabs", tabIndex, "sections", sectionIndex, "cards", cardIndex, "id"]));
    });
  });
  if (!config.tabs.some((tab) => tab.id === config.homepage.defaultTabId)) {
    ctx.addIssue({ code: "custom", message: "defaultTabId must reference an existing tab", path: ["homepage", "defaultTabId"] });
  }
});

export type IconReference = z.infer<typeof iconReferenceSchema>;
export type Appearance = z.infer<typeof appearanceSchema>;
export type SearchShortcut = z.infer<typeof searchShortcutSchema>;
export type LinkCard = z.infer<typeof linkCardSchema>;
export type FormulaOneCard = z.infer<typeof formulaOneCardSchema>;
export type GamingCard = z.infer<typeof gamingCardSchema>;
export type MotoGpCard = z.infer<typeof motoGpCardSchema>;
export type RemoteCard = z.infer<typeof remoteCardSchema>;
export type Card = z.infer<typeof cardSchema>;
export type GridLayout = z.infer<typeof gridLayoutSchema>;
export type Layout = z.infer<typeof layoutSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type SectionBox = z.infer<typeof sectionBoxSchema>;
export type SectionGrid = z.infer<typeof sectionGridSchema>;
export type Tab = z.infer<typeof tabSchema>;
export type ChromaConfig = z.infer<typeof configSchema>;

export function parseConfig(input: unknown): ChromaConfig {
  return configSchema.parse(input);
}
