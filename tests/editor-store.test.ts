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
});
