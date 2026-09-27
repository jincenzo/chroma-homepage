import type { Card, Layout } from "./config";

export type BentoLayout = Extract<Layout, { type: "bento" }>;

export function bentoColumns(layout: BentoLayout, availableWidth: number): number {
  return Math.max(1, Math.min(layout.columns, Math.floor((availableWidth + layout.gap) / (layout.minCardWidth + layout.gap))));
}

export function bentoSize(card: Pick<Card, "bento">) {
  return card.bento ?? { width: 1, height: 1 };
}

// Keep box sizes on the card so moves, copies and layout switches are lossless.
export function changeLayout(layout: Layout, type: Layout["type"]): Layout {
  const common = { minCardWidth: layout.minCardWidth, gap: layout.gap, maxColumns: layout.maxColumns };
  if (type === "bento") return { ...common, type, columns: layout.type === "bento" ? layout.columns : 4, rowHeight: layout.type === "bento" ? layout.rowHeight : 160 };
  return { ...common, type };
}
