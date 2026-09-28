import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Section, SectionBox, Tab } from "../../shared/config";
import { placeSections } from "../../shared/section-bento";

export function sectionBoxStyle(box: SectionBox): CSSProperties {
  return { gridColumn: `${box.column} / span ${box.width}`, gridRow: `${box.row} / span ${box.height}` };
}

export function SectionGrid({ tab, children }: { tab: Tab; children(section: Section, style?: CSSProperties): ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const layout = tab.sectionLayout;
  const boxes = layout ? placeSections(tab.sections, layout.columns) : null;
  const compact = (width ?? 0) < 760;
  const sections = boxes ? [...tab.sections].sort((a, b) => boxes[a.id].row - boxes[b.id].row || boxes[a.id].column - boxes[b.id].column) : tab.sections;
  const style: CSSProperties | undefined = layout ? {
    gridTemplateColumns: compact ? "minmax(0, 1fr)" : `repeat(${layout.columns}, minmax(0, 1fr))`,
    gridAutoRows: compact ? "auto" : `${layout.rowHeight}px`, gap: layout.gap
  } : undefined;
  return <div ref={ref} className={layout ? "section-bento-grid" : "section-grid"} data-compact={compact} style={style}>
    {(layout && width === null ? [] : sections).map((section) => children(section, boxes && !compact ? sectionBoxStyle(boxes[section.id]) : undefined))}
  </div>;
}
