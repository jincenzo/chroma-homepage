import { describe, expect, it } from "vitest";
import { copyCard, duplicateCard, findCard, moveCard, moveSection, pasteCard, removeCard } from "../src/shared/operations";
import { fixtureConfig } from "./fixtures";

describe("card operations", () => {
  it("moves a card between sections and tabs without changing its ID", () => {
    const withinTab = moveCard(fixtureConfig(), "card-a", "tab-a", "section-b");
    expect(withinTab.tabs[0].sections[0].cards).toHaveLength(0);
    expect(withinTab.tabs[0].sections[1].cards[0].id).toBe("card-a");
    const acrossTabs = moveCard(withinTab, "card-a", "tab-b", "section-c");
    expect(findCard(acrossTabs, "card-a")).toEqual({ tabIndex: 1, sectionIndex: 0, cardIndex: 0 });
  });

  it("copies without mutation and pastes using a new ID", () => {
    const config = fixtureConfig();
    const copied = copyCard(config, "card-a")!;
    const pasted = pasteCard(config, copied, "tab-a", "section-b", "card-copy");
    expect(config.tabs[0].sections[1].cards).toHaveLength(0);
    expect(pasted.tabs[0].sections[1].cards[0]).toMatchObject({ id: "card-copy", label: "A" });
  });

  it("supports cut/paste as remove followed by paste", () => {
    const config = fixtureConfig();
    const copied = copyCard(config, "card-a")!;
    const cut = removeCard(config, "card-a");
    const pasted = pasteCard(cut, copied, "tab-b", "section-c", "card-cut");
    expect(findCard(pasted, "card-a")).toBeUndefined();
    expect(findCard(pasted, "card-cut")?.tabIndex).toBe(1);
  });

  it("duplicates next to the original with a fresh ID", () => {
    const duplicated = duplicateCard(fixtureConfig(), "card-a", "card-duplicate");
    expect(duplicated.tabs[0].sections[0].cards.map((card) => card.id)).toEqual(["card-a", "card-duplicate"]);
  });
});

describe("section moves", () => {
  it("moves all contents, layout and overrides without changing IDs or the input", () => {
    const config = fixtureConfig();
    config.tabs[0].sections[0].appearance = { accent: "#123456" };
    config.tabs[0].sections[0].width = "half";
    const section = structuredClone(config.tabs[0].sections[0]);
    const result = moveSection(config, section.id, "tab-b", 0);
    expect(result.tabs[0].sections.map((item) => item.id)).toEqual(["section-b"]);
    expect(result.tabs[1].sections[0]).toEqual(section);
    expect(config.tabs[0].sections[0]).toEqual(section);
  });
  it("supports empty tabs, within-tab ordering and invalid destinations safely", () => {
    const config = fixtureConfig();
    config.tabs[1].sections = [];
    expect(moveSection(config, "section-a", "tab-b").tabs[1].sections[0].id).toBe("section-a");
    expect(moveSection(config, "section-a", "tab-a", 2).tabs[0].sections.map((item) => item.id)).toEqual(["section-b", "section-a"]);
    expect(moveSection(config, "section-a", "missing")).toEqual(config);
    expect(moveSection(config, "missing", "tab-b")).toEqual(config);
  });
});
