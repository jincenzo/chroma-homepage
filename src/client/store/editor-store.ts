import { create } from "zustand";
import { createId } from "../../shared/id";
import type { Card, ChromaConfig } from "../../shared/config";
import { copyCard, createFormulaOneCard, createLinkCard, createSection, createTab, duplicateCard, findCard, moveCard, moveSection, pasteCard, removeCard, reorderSections, reorderTabs } from "../../shared/operations";

export type Selection =
  | { type: "tab"; tabId: string }
  | { type: "section"; tabId: string; sectionId: string }
  | { type: "card"; tabId: string; sectionId: string; cardId: string };

interface EditorState {
  persisted: ChromaConfig | null;
  draft: ChromaConfig | null;
  activeTabId: string | null;
  selection: Selection | null;
  editMode: boolean;
  clipboard: Card | null;
  history: ChromaConfig[];
  future: ChromaConfig[];
  load(config: ChromaConfig): void;
  beginEdit(): void;
  cancelEdit(): void;
  acceptSaved(config: ChromaConfig): void;
  setActiveTab(id: string): void;
  select(selection: Selection | null): void;
  updateDraft(update: (draft: ChromaConfig) => void): void;
  replaceDraft(config: ChromaConfig): void;
  undo(): void;
  redo(): void;
  addTab(): void;
  addSection(): void;
  addCard(type?: Card["type"]): void;
  deleteSelection(): void;
  copy(): void;
  cut(): void;
  paste(): void;
  duplicate(): void;
  moveCard(cardId: string, tabId: string, sectionId: string, index?: number): void;
  moveSection(sectionId: string, tabId: string, index?: number): void;
  reorderTabs(activeId: string, overId: string): void;
  reorderSections(activeId: string, overId: string): void;
}

const snapshotUpdate = (set: (recipe: (state: EditorState) => Partial<EditorState>) => void, transform: (draft: ChromaConfig) => ChromaConfig) => {
  set((state) => {
    if (!state.draft) return {};
    return { draft: transform(state.draft), history: [...state.history.slice(-99), structuredClone(state.draft)], future: [] };
  });
};

export const useEditorStore = create<EditorState>((set, get) => ({
  persisted: null,
  draft: null,
  activeTabId: null,
  selection: null,
  editMode: false,
  clipboard: null,
  history: [],
  future: [],
  load: (config) => set({ persisted: config, draft: null, activeTabId: config.homepage.defaultTabId, selection: null, editMode: false, clipboard: null, history: [], future: [] }),
  beginEdit: () => set((state) => ({ draft: state.persisted ? structuredClone(state.persisted) : null, editMode: true, selection: null, history: [], future: [] })),
  cancelEdit: () => set({ draft: null, editMode: false, selection: null, history: [], future: [] }),
  acceptSaved: (config) => set({ persisted: config, draft: null, editMode: false, selection: null, history: [], future: [], activeTabId: config.tabs.some((tab) => tab.id === get().activeTabId) ? get().activeTabId : config.homepage.defaultTabId }),
  setActiveTab: (activeTabId) => set({ activeTabId }),
  select: (selection) => set({ selection }),
  updateDraft: (update) => snapshotUpdate(set, (draft) => { const next = structuredClone(draft); update(next); return next; }),
  replaceDraft: (config) => snapshotUpdate(set, () => structuredClone(config)),
  undo: () => set((state) => {
    if (!state.draft || state.history.length === 0) return {};
    const previous = state.history.at(-1)!;
    return { draft: structuredClone(previous), history: state.history.slice(0, -1), future: [structuredClone(state.draft), ...state.future] };
  }),
  redo: () => set((state) => {
    if (!state.draft || state.future.length === 0) return {};
    const [next, ...future] = state.future;
    return { draft: structuredClone(next), history: [...state.history, structuredClone(state.draft)], future };
  }),
  addTab: () => {
    const tab = createTab();
    snapshotUpdate(set, (draft) => ({ ...structuredClone(draft), tabs: [...draft.tabs, tab] }));
    set({ activeTabId: tab.id, selection: { type: "tab", tabId: tab.id } });
  },
  addSection: () => {
    const state = get();
    if (!state.activeTabId) return;
    const section = createSection();
    state.updateDraft((draft) => { draft.tabs.find((tab) => tab.id === state.activeTabId)?.sections.push(section); });
    set({ selection: { type: "section", tabId: state.activeTabId, sectionId: section.id } });
  },
  addCard: (type = "link") => {
    const state = get();
    if (!state.draft || !state.activeTabId) return;
    const tab = state.draft.tabs.find((item) => item.id === state.activeTabId);
    const selectedSectionId = state.selection?.type === "section" || state.selection?.type === "card" ? state.selection.sectionId : tab?.sections[0]?.id;
    if (!selectedSectionId) return;
    const card = type === "formula-one" ? createFormulaOneCard() : createLinkCard();
    state.updateDraft((draft) => { draft.tabs.find((item) => item.id === state.activeTabId)?.sections.find((item) => item.id === selectedSectionId)?.cards.push(card); });
    set({ selection: { type: "card", tabId: state.activeTabId, sectionId: selectedSectionId, cardId: card.id } });
  },
  deleteSelection: () => {
    const state = get();
    if (!state.draft || !state.selection) return;
    const selection = state.selection;
    state.updateDraft((draft) => {
      if (selection.type === "card") Object.assign(draft, removeCard(draft, selection.cardId));
      if (selection.type === "section") {
        const tab = draft.tabs.find((item) => item.id === selection.tabId);
        if (tab) tab.sections = tab.sections.filter((item) => item.id !== selection.sectionId);
      }
      if (selection.type === "tab" && draft.tabs.length > 1) {
        draft.tabs = draft.tabs.filter((item) => item.id !== selection.tabId);
        if (draft.homepage.defaultTabId === selection.tabId) draft.homepage.defaultTabId = draft.tabs[0].id;
      }
    });
    const next = get().draft;
    if (selection.type === "tab" && next && !next.tabs.some((tab) => tab.id === state.activeTabId)) set({ activeTabId: next.tabs[0]?.id ?? null });
    set({ selection: null });
  },
  copy: () => {
    const state = get();
    if (state.draft && state.selection?.type === "card") set({ clipboard: copyCard(state.draft, state.selection.cardId) ?? null });
  },
  cut: () => {
    const state = get();
    if (!state.draft || state.selection?.type !== "card") return;
    const cardId = state.selection.cardId;
    const card = copyCard(state.draft, cardId);
    if (!card) return;
    snapshotUpdate(set, (draft) => removeCard(draft, cardId));
    set({ clipboard: card, selection: null });
  },
  paste: () => {
    const state = get();
    if (!state.draft || !state.clipboard || !state.activeTabId) return;
    const tab = state.draft.tabs.find((item) => item.id === state.activeTabId);
    const sectionId = state.selection?.type === "section" || state.selection?.type === "card" ? state.selection.sectionId : tab?.sections[0]?.id;
    if (!sectionId) return;
    const id = createId();
    snapshotUpdate(set, (draft) => pasteCard(draft, state.clipboard!, state.activeTabId!, sectionId, id));
    set({ selection: { type: "card", tabId: state.activeTabId, sectionId, cardId: id } });
  },
  duplicate: () => {
    const state = get();
    if (!state.draft || state.selection?.type !== "card") return;
    const selection = state.selection;
    const id = createId();
    snapshotUpdate(set, (draft) => duplicateCard(draft, selection.cardId, id));
    set({ selection: { ...selection, cardId: id } });
  },
  moveCard: (cardId, tabId, sectionId, index) => {
    snapshotUpdate(set, (draft) => moveCard(draft, cardId, tabId, sectionId, index));
    set({ selection: { type: "card", tabId, sectionId, cardId } });
  },
  moveSection: (sectionId, tabId, index) => {
    snapshotUpdate(set, (draft) => moveSection(draft, sectionId, tabId, index));
    set({ selection: { type: "section", tabId, sectionId } });
  },
  reorderTabs: (activeId, overId) => snapshotUpdate(set, (draft) => reorderTabs(draft, activeId, overId)),
  reorderSections: (activeId, overId) => {
    const tabId = get().activeTabId;
    if (tabId) snapshotUpdate(set, (draft) => reorderSections(draft, tabId, activeId, overId));
  }
}));

export function selectedCard(state: Pick<EditorState, "draft" | "selection">): Card | undefined {
  if (!state.draft || state.selection?.type !== "card") return;
  const location = findCard(state.draft, state.selection.cardId);
  return location ? state.draft.tabs[location.tabIndex].sections[location.sectionIndex].cards[location.cardIndex] : undefined;
}
