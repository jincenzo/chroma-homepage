import { useLayoutEffect, useRef, useState, type CSSProperties, type PropsWithChildren } from "react";
import { bentoColumns, bentoSize, type BentoLayout } from "../../shared/bento";
import type { Card } from "../../shared/config";

export function bentoBoxStyle(card: Pick<Card, "bento">): CSSProperties {
  const size = bentoSize(card);
  return { gridColumn: `span min(${size.width}, var(--bento-columns))`, gridRow: `span ${size.height}` };
}

export function BentoGrid({ layout, children }: PropsWithChildren<{ layout: BentoLayout }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const style = {
    "--bento-columns": bentoColumns(layout, width),
    "--bento-row-height": `${layout.rowHeight}px`,
    "--bento-gap": `${layout.gap}px`
  } as CSSProperties;
  return <div ref={ref} className="layout-bento" style={style}>{children}</div>;
}
