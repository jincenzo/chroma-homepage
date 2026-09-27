import { z } from "zod";
import { createId } from "./id";
import { changeLayout } from "./bento";
import { parseConfig, type ChromaConfig, type IconReference, type Layout, type Section } from "./config";

export const HISTORY_FILE_LIMIT = 20 * 1024 * 1024;
export const HISTORY_ROW_LIMIT = 100_000;
export const HISTORY_SELECTION_LIMIT = 100;
const rowSchema = z.object({
  url: z.string().min(1).max(16_384),
  title: z.string().max(16_384).nullish(),
  visitCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(1)
});

export interface HistorySite { url: string; label: string; score: number; pages: number }
export interface HistoryAnalysis {
  sites: HistorySite[]; total: number; invalid: number; unsupported: number; duplicates: number;
}
export interface HistoryLink { url: string; label: string; icon?: IconReference; description?: string }
export interface HistoryDestination { tabId?: string; newTabLabel: string; layout: Layout["type"]; makeDefault?: boolean }

/** Deliberately keep scheme, subdomain and port; discard private paths and queries. */
export function siteHomepage(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return;
    return `${url.origin}/`;
  } catch { return; }
}

const cleanTitle = (value: string) => value.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120);

/** Only sanitized site summaries leave this function/worker; never the raw history. */
export function analyzeHistoryOut(input: unknown): HistoryAnalysis {
  if (!Array.isArray(input)) throw new Error("Expected a HistoryOut JSON array of history records.");
  if (input.length > HISTORY_ROW_LIMIT) throw new Error("This export contains more than 100,000 records. Export a shorter period.");
  const groups = new Map<string, { label: string; titleScore: number; pages: Map<string, number> }>();
  const result: HistoryAnalysis = { sites: [], total: input.length, invalid: 0, unsupported: 0, duplicates: 0 };
  for (const value of input) {
    const parsed = rowSchema.safeParse(value);
    if (!parsed.success) { result.invalid++; continue; }
    let url: URL;
    try { url = new URL(parsed.data.url); } catch { result.invalid++; continue; }
    const homepage = siteHomepage(url.href);
    if (!homepage) { result.unsupported++; continue; }
    let group = groups.get(homepage);
    if (!group) {
      group = { label: url.host.replace(/^www\./, "").slice(0, 120), titleScore: -1, pages: new Map() };
      groups.set(homepage, group);
    }
    // Page-specific titles can contain personal information: only use a clean root title.
    const title = cleanTitle(parsed.data.title ?? "");
    if (url.pathname === "/" && !url.search && !url.hash && title && parsed.data.visitCount > group.titleScore) {
      group.label = title; group.titleScore = parsed.data.visitCount;
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ["gclid", "fbclid", "msclkid"].includes(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    const existing = group.pages.get(url.href);
    if (existing !== undefined) result.duplicates++;
    // visitCount is cumulative per URL, not one more visit for each exported row.
    group.pages.set(url.href, Math.max(existing ?? 0, parsed.data.visitCount));
  }
  result.sites = [...groups].map(([url, group]) => ({
    url, label: group.label, pages: group.pages.size,
    score: Math.min(Number.MAX_SAFE_INTEGER, [...group.pages.values()].reduce((sum, count) => sum + count, 0))
  })).sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  return result;
}

export function existingHistorySites(config: ChromaConfig): Set<string> {
  return new Set(config.tabs.flatMap((tab) => tab.sections.flatMap((section) => section.cards.flatMap((card) => {
    if (card.type !== "link") return [];
    const homepage = siteHomepage(card.url);
    return homepage ? [homepage] : [];
  }))));
}

/** Append only; a history import never replaces the current document or its identity. */
export function appendHistorySites(config: ChromaConfig, links: HistoryLink[], destination: HistoryDestination) {
  if (!links.length || links.length > HISTORY_SELECTION_LIMIT) throw new Error("Select between 1 and 100 sites.");
  const next = structuredClone(config);
  const existing = existingHistorySites(next);
  const accepted: HistoryLink[] = [];
  for (const link of links) {
    const url = siteHomepage(link.url);
    if (!url) throw new Error("Only HTTP and HTTPS site homepages can be imported.");
    if (existing.has(url)) continue;
    existing.add(url);
    accepted.push({ ...link, url, label: cleanTitle(link.label) || new URL(url).host.slice(0, 120) });
  }
  if (!accepted.length) throw new Error("All selected sites are already linked in this homepage.");
  let tab = destination.tabId ? next.tabs.find((item) => item.id === destination.tabId) : undefined;
  if (destination.tabId && !tab) throw new Error("The destination tab no longer exists.");
  if (!tab) {
    tab = { id: createId(), label: destination.newTabLabel.trim(), icon: "lucide:history", sections: [] };
    next.tabs.push(tab);
  }
  if (destination.makeDefault) next.homepage.defaultTabId = tab.id;
  for (let index = 0; index < accepted.length; index += 12) {
    const section: Section = {
      id: createId(), title: index === 0 ? "Most visited" : `More sites${index > 12 ? ` ${index / 12}` : ""}`,
      layout: changeLayout({ type: "grid", minCardWidth: 180, gap: 16 }, destination.layout),
      cards: accepted.slice(index, index + 12).map((link) => ({
        id: createId(), type: "link", label: link.label, url: link.url, openInNewTab: true,
        icon: link.icon ?? { type: "iconify", value: "lucide:globe" },
        ...(link.description ? { description: link.description } : {})
      }))
    };
    tab.sections.push(section);
  }
  return { config: parseConfig(next), tabId: tab.id, added: accepted.length, skipped: links.length - accepted.length };
}
