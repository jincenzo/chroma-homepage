import type { Section, SectionBox, SectionGrid, Tab } from "./config";

export const DEFAULT_SECTION_GRID: SectionGrid = { type: "bento", columns: 6, rowHeight: 80, gap: 24 };

export function overlaps(a: SectionBox, b: SectionBox): boolean {
  return a.column < b.column + b.width && a.column + a.width > b.column && a.row < b.row + b.height && a.row + a.height > b.row;
}

/** Reserve explicit positions first; new or displaced sections take the first free space. */
export function placeSections(sections: Section[], columns: number, priorityId?: string): Record<string, SectionBox> {
  const placed: Record<string, SectionBox> = Object.create(null) as Record<string, SectionBox>;
  const pending: Array<{ id: string; box: SectionBox }> = [];
  const ordered = priorityId ? [...sections.filter((s) => s.id === priorityId), ...sections.filter((s) => s.id !== priorityId)] : sections;
  const free = (box: SectionBox) => Object.values(placed).every((other) => !overlaps(box, other));
  for (const section of ordered) {
    const fraction = section.width === "third" ? 1 / 3 : section.width === "half" ? 1 / 2 : section.width === "two-thirds" ? 2 / 3 : 1;
    const box = { ...(section.dashboardBox ?? { column: 1, row: 1, width: Math.max(1, Math.round(columns * fraction)), height: 4 }) };
    box.width = Math.min(box.width, columns);
    box.column = Math.min(box.column, columns - box.width + 1);
    if (section.dashboardBox && free(box)) placed[section.id] = box;
    else pending.push({ id: section.id, box });
  }
  for (const { id, box } of pending) {
    let found = false;
    for (let row = 1; !found; row++) {
      for (let column = 1; column <= columns - box.width + 1; column++) {
        const candidate = { ...box, row, column };
        if (free(candidate)) { placed[id] = candidate; found = true; break; }
      }
    }
  }
  return placed;
}

export function arrangeSections(tab: Tab, priorityId?: string): Tab {
  const boxes = placeSections(tab.sections, tab.sectionLayout?.columns ?? 6, priorityId);
  return { ...tab, sections: tab.sections.map((section) => ({ ...section, dashboardBox: boxes[section.id] })) };
}

export function positionSection(tab: Tab, id: string, patch: Partial<SectionBox>): Tab {
  const normalized = arrangeSections(tab);
  return arrangeSections({ ...normalized, sections: normalized.sections.map((s) => s.id === id ? { ...s, dashboardBox: { ...s.dashboardBox!, ...patch } } : s) }, id);
}
