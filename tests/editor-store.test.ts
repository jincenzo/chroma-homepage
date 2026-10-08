import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../src/client/store/editor-store";
import { fixtureConfig } from "./fixtures";

describe("editor history", () => {
  beforeEach(() => useEditorStore.getState().load(fixtureConfig()));

  it("keeps edits in a draft and supports undo/redo", () => {
    const store = useEditorStore.getState();
    store.beginEdit();
    useEditorStore.getState().updateDraft((draft) => { draft.homepage.title = "Changed"; });
    expect(useEditorStore.getState().draft?.homepage.title).toBe("Changed");
    expect(useEditorStore.getState().persisted?.homepage.title).toBe("Test");
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().draft?.homepage.title).toBe("Test");
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().draft?.homepage.title).toBe("Changed");
  });

  it("discards the whole draft on cancel", () => {
    useEditorStore.getState().beginEdit();
    useEditorStore.getState().updateDraft((draft) => { draft.tabs[0].label = "Changed"; });
    useEditorStore.getState().cancelEdit();
    expect(useEditorStore.getState().draft).toBeNull();
    expect(useEditorStore.getState().persisted?.tabs[0].label).toBe("A");
  });

  it("moves a whole section in one undo/redo step and updates the selection", () => {
    const original = fixtureConfig();
    useEditorStore.getState().beginEdit();
    useEditorStore.getState().moveSection("section-a", "tab-b");
    const moved = structuredClone(useEditorStore.getState().draft);
    expect(useEditorStore.getState().history).toHaveLength(1);
    expect(useEditorStore.getState().selection).toEqual({ type: "section", tabId: "tab-b", sectionId: "section-a" });
    expect(useEditorStore.getState().persisted).toEqual(original);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().draft).toEqual(original);
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().draft).toEqual(moved);
  });

  it("clears draft, clipboard, selection and history when loading another profile", () => {
    useEditorStore.getState().beginEdit();
    useEditorStore.getState().addCard();
    useEditorStore.getState().copy();
    expect(useEditorStore.getState().clipboard).not.toBeNull();
    useEditorStore.getState().undo();
    const next = fixtureConfig();
    next.homepage.title = "Other profile";
    useEditorStore.getState().load(next);
    expect(useEditorStore.getState()).toMatchObject({ persisted: next, draft: null, editMode: false, clipboard: null, selection: null, history: [], future: [], activeTabId: next.homepage.defaultTabId });
  });

  it("adds a Formula 1 card through the common card workflow", () => {
    useEditorStore.getState().beginEdit();
    useEditorStore.getState().addCard("formula-one");
    const card = useEditorStore.getState().draft?.tabs[0].sections[0].cards.at(-1);
    expect(card).toMatchObject({ type: "formula-one", view: "next-race", driverCount: 3, label: "Next F1 race", refreshMinutes: 60 });
    expect(useEditorStore.getState().selection).toMatchObject({ type: "card", cardId: card?.id });
  });

  it("creates a post-it board in one undoable step and keeps notes through copies", () => {
    const original = fixtureConfig();
    useEditorStore.getState().beginEdit();
    useEditorStore.getState().addTab("board");
    const state = useEditorStore.getState();
    const board = state.draft!.tabs.at(-1)!;
    const note = board.sections[0].cards[0];
    expect(note.type).toBe("sticky-note");
    expect(state.activeTabId).toBe(board.id);
    expect(state.history).toHaveLength(1);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().draft).toEqual(original);
    useEditorStore.getState().redo();
    useEditorStore.getState().select({ type: "card", tabId: board.id, sectionId: board.sections[0].id, cardId: note.id });
    useEditorStore.getState().updateDraft((draft) => {
      const card = draft.tabs.at(-1)!.sections[0].cards[0];
      if (card.type === "sticky-note") { card.content = "First line\nSecond line"; card.color = "mint"; }
    });
    useEditorStore.getState().duplicate();
    const cards = useEditorStore.getState().draft!.tabs.at(-1)!.sections[0].cards;
    expect(cards).toHaveLength(2);
    expect(cards[1]).toMatchObject({ type: "sticky-note", content: "First line\nSecond line", color: "mint" });
    expect(cards[1].id).not.toBe(cards[0].id);
    expect(useEditorStore.getState().persisted).toEqual(original);
  });

  it("adds to the active tab despite a stale section selection and handles empty tabs", () => {
    useEditorStore.getState().beginEdit();
    useEditorStore.getState().select({ type: "section", tabId: "tab-a", sectionId: "section-a" });
    useEditorStore.getState().setActiveTab("tab-b");
    useEditorStore.getState().addCard("sticky-note");
    expect(useEditorStore.getState().draft!.tabs[0].sections[0].cards).toHaveLength(1);
    expect(useEditorStore.getState().draft!.tabs[1].sections[0].cards.at(-1)).toMatchObject({ type: "sticky-note" });
    useEditorStore.getState().updateDraft((draft) => { draft.tabs[1].sections = []; });
    const empty = structuredClone(useEditorStore.getState().draft);
    useEditorStore.getState().addCard("sticky-note");
    expect(useEditorStore.getState().draft!.tabs[1].sections).toHaveLength(1);
    expect(useEditorStore.getState().draft!.tabs[1].sections[0].cards).toHaveLength(1);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().draft).toEqual(empty);
  });
});
