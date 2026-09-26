import type { Appearance, Card, ChromaConfig, Section, Tab } from "./config";

export const DEFAULT_APPEARANCE: Required<Appearance> = {
  accent: "#a78bfa", surface: "glass", density: "comfortable", iconSize: 25, showDescription: true
};

export function resolveTabAppearance(tab?: Tab, homepage?: ChromaConfig["homepage"]): Required<Appearance> {
  return { ...DEFAULT_APPEARANCE, accent: tab?.appearance?.accent ?? homepage?.appearance?.accent ?? DEFAULT_APPEARANCE.accent };
}

export function resolveSectionAppearance(section?: Section, tab?: Tab, homepage?: ChromaConfig["homepage"]): Required<Appearance> {
  const inherited = resolveTabAppearance(tab, homepage);
  return { ...inherited, ...section?.appearance, accent: section?.appearance?.accent ?? inherited.accent };
}

/** Homepage → tab → section → card; missing accents inherit, never get copied. */
export function resolveAppearance(card: Card, section?: Section, tab?: Tab, homepage?: ChromaConfig["homepage"]): Required<Appearance> {
  const inherited = resolveSectionAppearance(section, tab, homepage);
  return { ...inherited, ...card.appearance, accent: card.appearance?.accent ?? inherited.accent };
}
