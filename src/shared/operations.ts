import type { Card, ChromaConfig, Section, Tab } from "./config";
import { createId } from "./id";

export interface CardLocation { tabIndex: number; sectionIndex: number; cardIndex: number }

export function findCard(config: ChromaConfig, cardId: string): CardLocation | undefined {
  for (let tabIndex = 0; tabIndex < config.tabs.length; tabIndex += 1) {
    for (let sectionIndex = 0; sectionIndex < config.tabs[tabIndex].sections.length; sectionIndex += 1) {
      const cardIndex = config.tabs[tabIndex].sections[sectionIndex].cards.findIndex((card) => card.id === cardId);
      if (cardIndex >= 0) return { tabIndex, sectionIndex, cardIndex };
    }
  }
}

export function moveCard(config: ChromaConfig, cardId: string, targetTabId: string, targetSectionId: string, targetIndex?: number): ChromaConfig {
  const next = structuredClone(config);
  const source = findCard(next, cardId);
  if (!source) return next;
  const [card] = next.tabs[source.tabIndex].sections[source.sectionIndex].cards.splice(source.cardIndex, 1);
  const targetTab = next.tabs.find((tab) => tab.id === targetTabId);
  const targetSection = targetTab?.sections.find((section) => section.id === targetSectionId);
  if (!targetTab || !targetSection) {
    next.tabs[source.tabIndex].sections[source.sectionIndex].cards.splice(source.cardIndex, 0, card);
    return next;
  }
  let index = targetIndex ?? targetSection.cards.length;
  if (targetTab.id === config.tabs[source.tabIndex].id && targetSection.id === config.tabs[source.tabIndex].sections[source.sectionIndex].id && source.cardIndex < index) index -= 1;
  targetSection.cards.splice(Math.max(0, Math.min(index, targetSection.cards.length)), 0, card);
  return next;
}

export function removeCard(config: ChromaConfig, cardId: string): ChromaConfig {
  const next = structuredClone(config);
  const location = findCard(next, cardId);
  if (location) next.tabs[location.tabIndex].sections[location.sectionIndex].cards.splice(location.cardIndex, 1);
  return next;
}

export function copyCard(config: ChromaConfig, cardId: string): Card | undefined {
  const location = findCard(config, cardId);
  return location ? structuredClone(config.tabs[location.tabIndex].sections[location.sectionIndex].cards[location.cardIndex]) : undefined;
}

export function pasteCard(config: ChromaConfig, card: Card, targetTabId: string, targetSectionId: string, id: string = createId()): ChromaConfig {
  const next = structuredClone(config);
  const section = next.tabs.find((tab) => tab.id === targetTabId)?.sections.find((item) => item.id === targetSectionId);
  if (section) section.cards.push({ ...structuredClone(card), id });
  return next;
}

export function duplicateCard(config: ChromaConfig, cardId: string, id: string = createId()): ChromaConfig {
  const next = structuredClone(config);
  const location = findCard(next, cardId);
  if (!location) return next;
  const cards = next.tabs[location.tabIndex].sections[location.sectionIndex].cards;
  cards.splice(location.cardIndex + 1, 0, { ...structuredClone(cards[location.cardIndex]), id });
  return next;
}

export function reorderTabs(config: ChromaConfig, activeId: string, overId: string): ChromaConfig {
  const next = structuredClone(config);
  const from = next.tabs.findIndex((tab) => tab.id === activeId);
  const to = next.tabs.findIndex((tab) => tab.id === overId);
  if (from >= 0 && to >= 0 && from !== to) next.tabs.splice(to, 0, next.tabs.splice(from, 1)[0]);
  return next;
}

export function reorderSections(config: ChromaConfig, tabId: string, activeId: string, overId: string): ChromaConfig {
  const next = structuredClone(config);
  const sections = next.tabs.find((tab) => tab.id === tabId)?.sections;
  if (!sections) return next;
  const from = sections.findIndex((section) => section.id === activeId);
  const to = sections.findIndex((section) => section.id === overId);
  if (from >= 0 && to >= 0 && from !== to) sections.splice(to, 0, sections.splice(from, 1)[0]);
  return next;
}

/** Move a complete section, retaining its ID, cards, layout and appearance. */
export function moveSection(config: ChromaConfig, sectionId: string, targetTabId: string, targetIndex?: number): ChromaConfig {
  const source = config.tabs.find((tab) => tab.sections.some((section) => section.id === sectionId));
  if (!source || !config.tabs.some((tab) => tab.id === targetTabId)) return config;
  const next = structuredClone(config);
  const sourceTab = next.tabs.find((tab) => tab.id === source.id)!;
  const targetTab = next.tabs.find((tab) => tab.id === targetTabId)!;
  const from = sourceTab.sections.findIndex((section) => section.id === sectionId);
  const [section] = sourceTab.sections.splice(from, 1);
  let index = targetIndex ?? targetTab.sections.length;
  if (source.id === targetTabId && targetIndex !== undefined && from < index) index--;
  targetTab.sections.splice(Math.max(0, Math.min(index, targetTab.sections.length)), 0, section);
  return next;
}

export function createLinkCard(): Card {
  return { id: createId(), type: "link", label: "New link", description: "", url: "https://example.com", openInNewTab: true, icon: { type: "iconify", value: "lucide:link" } };
}

export function createSection(): Section {
  return { id: createId(), title: "New section", layout: { type: "grid", minCardWidth: 180, gap: 16 }, cards: [] };
}

export function createTab(): Tab {
  return { id: createId(), label: "New tab", icon: "lucide:layout-dashboard", sections: [createSection()] };
}
