import { describe, expect, it } from "vitest";
import { bentoColumns, bentoSize, changeLayout, type BentoLayout } from "../src/shared/bento";
import { layoutSchema, parseConfig } from "../src/shared/config";
import { copyCard, duplicateCard, moveCard, pasteCard, removeCard } from "../src/shared/operations";
import { useEditorStore } from "../src/client/store/editor-store";
import { fixtureConfig } from "./fixtures";

const layout = layoutSchema.parse({ type: "bento" }) as BentoLayout;

describe("bento layouts", () => {
  it("adds backward-compatible defaults and rejects invalid dimensions", () => {
    expect(layout).toMatchObject({ columns: 4, rowHeight: 160, minCardWidth: 180, gap: 16 });
    expect(parseConfig(fixtureConfig()).tabs[0].sections[0].cards[0].bento).toBeUndefined();
    const config = fixtureConfig();
    config.tabs[0].sections[0].layout = layout;
    config.tabs[0].sections[0].cards[0].bento = { width: 2, height: 2 };
    expect(parseConfig(config)).toEqual(config);
    for (const size of [{ width: 0, height: 1 }, { width: 13, height: 1 }, { width: 2, height: 5 }, { width: 1.5, height: 1 }]) {
      config.tabs[0].sections[0].cards[0].bento = size;
      expect(() => parseConfig(config)).toThrow();
    }
    for (const patch of [{ columns: 0 }, { columns: 13 }, { rowHeight: 0 }, { rowHeight: 321 }]) expect(layoutSchema.safeParse({ ...layout, ...patch }).success).toBe(false);
  });

  it("reduces columns without altering saved sizes and converts layouts cleanly", () => {
    expect([0, 180, 375, 376, 800, 1600].map((width) => bentoColumns(layout, width))).toEqual([1, 1, 1, 2, 4, 4]);
    expect(bentoSize({})).toEqual({ width: 1, height: 1 });
    expect(changeLayout(layout, "tiles")).toEqual({ type: "tiles", minCardWidth: 180, gap: 16 });
    expect(changeLayout(changeLayout(layout, "grid"), "bento")).toEqual(layout);
  });

  it("preserves box sizes through moving, duplicating, copying and cut/paste", () => {
    const config = fixtureConfig();
    config.tabs[0].sections[0].cards[0].bento = { width: 2, height: 3 };
    const clipboard = copyCard(config, "card-a")!;
    const moved = moveCard(config, "card-a", "tab-b", "section-c");
    expect(moved.tabs[1].sections[0].cards[0].bento).toEqual(clipboard.bento);
    const duplicated = duplicateCard(config, "card-a", "duplicate");
    expect(duplicated.tabs[0].sections[0].cards[1]).toMatchObject({ id: "duplicate", bento: clipboard.bento });
    const pasted = pasteCard(removeCard(config, "card-a"), clipboard, "tab-b", "section-c", "pasted");
    expect(pasted.tabs[1].sections[0].cards[0]).toMatchObject({ id: "pasted", bento: clipboard.bento });
  });

  it("applies a whole studio session as one undo/redo step without changing persisted data", () => {
    const config = fixtureConfig();
    const store = useEditorStore.getState();
    store.load(config); store.beginEdit();
    store.updateDraft((draft) => {
      draft.tabs[0].sections[0].layout = layout;
      draft.tabs[0].sections[0].cards[0].bento = { width: 2, height: 2 };
    });
    const applied = structuredClone(useEditorStore.getState().draft);
    expect(useEditorStore.getState().history).toHaveLength(1);
    expect(useEditorStore.getState().persisted).toEqual(config);
    store.undo(); expect(useEditorStore.getState().draft).toEqual(config);
    store.redo(); expect(useEditorStore.getState().draft).toEqual(applied);
    store.cancelEdit(); expect(useEditorStore.getState().persisted).toEqual(config);
  });
});
