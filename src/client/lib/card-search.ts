import type { ChromaConfig, LinkCard } from "../../shared/config";
import { DEFAULT_SEARCH_SHORTCUTS } from "../../shared/search-defaults";

export interface CardSearchResult {
  card: LinkCard;
  tabLabel: string;
  sectionTitle: string;
  score: number;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Small Damerau-Levenshtein distance, including adjacent-key transpositions. */
function distance(left: string, right: string): number {
  const rows = Array.from({ length: left.length + 1 }, (_, i) =>
    Array.from({ length: right.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + Number(left[i - 1] !== right[j - 1]));
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[left.length][right.length];
}

function fuzzyMatches(query: string, words: string[]): boolean {
  return query.split(/\s+/).every((token) => words.some((word) => {
    if (word.startsWith(token)) return true;
    if (token.length < 3 || token.length > 80 || word.length > 120) return false;
    const tolerance = token.length >= 7 ? 2 : 1;
    return Math.abs(word.length - token.length) <= tolerance && distance(token, word) <= tolerance;
  }));
}

export function searchCards(config: ChromaConfig, query: string, limit = 8): CardSearchResult[] {
  const normalized = normalize(query).slice(0, 240);
  const tagOnly = normalized.startsWith("#");
  const term = tagOnly ? normalized.slice(1) : normalized;

  return config.tabs
    .flatMap((tab) => tab.sections.flatMap((section) => section.cards.filter((card): card is LinkCard => card.type === "link").map((card) => {
      const label = normalize(card.label);
      const description = normalize(card.description ?? "");
      const location = normalize(`${tab.label} ${section.title}`);
      const aliases = (card.aliases ?? []).map(normalize);
      const tags = (card.tags ?? []).map(normalize);
      let score = 0;
      if (!normalized) score = 1;
      else if (tagOnly) score = term && tags.some((tag) => tag.includes(term)) ? 90 : 0;
      else if (label === term || aliases.includes(term)) score = 100;
      else if (label.startsWith(term) || aliases.some((alias) => alias.startsWith(term))) score = 80;
      else if (label.includes(term)) score = 60;
      else if (tags.some((tag) => tag.includes(term))) score = 55;
      else if (description.includes(term)) score = 35;
      else if (location.includes(term)) score = 20;
      else if (card.url.toLowerCase().includes(term)) score = 10;
      else if (fuzzyMatches(term, [label, ...aliases, ...tags].flatMap((value) => value.split(/\s+/)))) score = 30;
      return { card, tabLabel: tab.label, sectionTitle: section.title, score };
    })))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.card.label.localeCompare(right.card.label))
    .slice(0, limit);
}

export function resolveSearchShortcut(config: ChromaConfig, query: string) {
  const match = query.trimStart().match(/^([a-z0-9]+)\s+(.+)$/i);
  if (!match || !match[2].trim()) return undefined;
  const shortcut = (config.homepage.searchShortcuts ?? DEFAULT_SEARCH_SHORTCUTS)
    .find((item) => item.keyword === match[1].toLowerCase());
  if (!shortcut) return undefined;
  const terms = match[2].trim();
  const url = shortcut.urlTemplate.replaceAll("{query}", encodeURIComponent(terms));
  return { ...shortcut, terms, url };
}
