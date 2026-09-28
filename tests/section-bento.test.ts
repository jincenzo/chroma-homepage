import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/shared/config";
import { arrangeSections, DEFAULT_SECTION_GRID, overlaps, placeSections, positionSection } from "../src/shared/section-bento";
import { moveSection, reorderSections } from "../src/shared/operations";
import { fixtureConfig } from "./fixtures";

describe("dashboard section Bento", () => {
  it("preserves old dashboards and converts fractional widths without changing cards", () => {
    const config = fixtureConfig();
    expect(parseConfig(config).tabs[0].sectionLayout).toBeUndefined();
    const tab = config.tabs[0];
    tab.sections[0].width = "two-thirds";
    tab.sections[1].width = "third";
    const arranged = arrangeSections({ ...tab, sectionLayout: DEFAULT_SECTION_GRID });
    expect(arranged.sections.map((s) => s.dashboardBox)).toEqual([
      { column: 1, row: 1, width: 4, height: 4 }, { column: 5, row: 1, width: 2, height: 4 }
    ]);
    expect(arranged.sections[0].cards).toEqual(tab.sections[0].cards);
  });

  it("keeps an explicit empty space and moves collisions out of the selected section", () => {
    let tab = arrangeSections({ ...fixtureConfig().tabs[0], sectionLayout: DEFAULT_SECTION_GRID });
    tab = positionSection(tab, "section-b", { row: 10 });
    expect(tab.sections[1].dashboardBox?.row).toBe(10);
    tab = positionSection(tab, "section-b", { row: 1 });
    expect(tab.sections[1].dashboardBox?.row).toBe(1);
    expect(tab.sections[0].dashboardBox?.row).toBe(5);
    expect(overlaps(tab.sections[0].dashboardBox!, tab.sections[1].dashboardBox!)).toBe(false);
  });

  it("fits a narrower grid without overlaps or mutating stored positions", () => {
    const tab = fixtureConfig().tabs[0];
    tab.sections[0].dashboardBox = { column: 1, row: 1, width: 4, height: 6 };
    tab.sections[1].dashboardBox = { column: 5, row: 1, width: 2, height: 3 };
    const placed = Object.values(placeSections(tab.sections, 3));
    expect(placed.every((box) => box.column + box.width <= 4)).toBe(true);
    expect(overlaps(placed[0], placed[1])).toBe(false);
    expect(tab.sections[1].dashboardBox.column).toBe(5);
  });

  it("positions newly moved sections safely and supports dashboard drag repositioning", () => {
    let config = fixtureConfig();
    config.tabs[0] = arrangeSections({ ...config.tabs[0], sectionLayout: DEFAULT_SECTION_GRID });
    config = reorderSections(config, "tab-a", "section-b", "section-a");
    expect(config.tabs[0].sections.find((s) => s.id === "section-b")?.dashboardBox?.row).toBe(1);
    config = moveSection(config, "section-c", "tab-a");
    const boxes = config.tabs[0].sections.map((s) => s.dashboardBox!);
    expect(boxes).toHaveLength(3);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
    expect(parseConfig(config)).toEqual(config);
  });
});
