import { GripVertical, Move, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { sectionBoxSchema, tabSchema, type SectionBox, type Tab } from "../../shared/config";
import { arrangeSections, DEFAULT_SECTION_GRID, positionSection } from "../../shared/section-bento";
import { useEditorStore } from "../store/editor-store";
import { sectionBoxStyle } from "./section-grid";
import { Button, Field, Input, Select } from "./ui";

const PREVIEW_ROW = 56;
const PREVIEW_GAP = 8;

export function SectionBentoStudio({ tab, onClose }: { tab: Tab; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [working, setWorking] = useState(() => arrangeSections({ ...structuredClone(tab), sectionLayout: tab.sectionLayout ?? DEFAULT_SECTION_GRID }));
  const [activeId, setActiveId] = useState(tab.sections[0]?.id);
  const [message, setMessage] = useState("");
  const layout = working.sectionLayout!;
  const active = working.sections.find((s) => s.id === activeId);
  const box = active?.dashboardBox;
  const gesture = useRef<{ id: string; mode: "move" | "resize"; x: number; y: number; stepX: number; box: SectionBox; tab: Tab } | null>(null);
  const rows = Math.max(8, ...working.sections.map((s) => s.dashboardBox!.row + s.dashboardBox!.height + 1));

  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);

  const changeBox = (patch: Partial<SectionBox>) => {
    if (!active || !box) return;
    const candidate = { ...box, ...patch };
    if (!sectionBoxSchema.safeParse(candidate).success || candidate.column + candidate.width - 1 > layout.columns) {
      setMessage("Use whole grid units within the column count (height: 1–24, row: 1–10000)."); return;
    }
    setMessage(""); setWorking(positionSection(working, active.id, patch));
  };
  const startGesture = (event: PointerEvent<HTMLButtonElement>, id: string, mode: "move" | "resize") => {
    if (event.button !== 0 || !grid.current) return;
    event.preventDefault(); event.stopPropagation();
    const section = working.sections.find((s) => s.id === id)!;
    setActiveId(id);
    gesture.current = { id, mode, x: event.clientX, y: event.clientY, box: section.dashboardBox!, tab: working,
      stepX: (grid.current.getBoundingClientRect().width + PREVIEW_GAP) / layout.columns };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveGesture = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current) return;
    const dx = Math.round((event.clientX - current.x) / current.stepX);
    const dy = Math.round((event.clientY - current.y) / (PREVIEW_ROW + PREVIEW_GAP));
    const patch = current.mode === "move" ? {
      column: Math.max(1, Math.min(layout.columns - current.box.width + 1, current.box.column + dx)),
      row: Math.max(1, Math.min(10000, current.box.row + dy))
    } : {
      width: Math.max(1, Math.min(layout.columns - current.box.column + 1, current.box.width + dx)),
      height: Math.max(1, Math.min(24, current.box.height + dy))
    };
    setWorking(positionSection(current.tab, current.id, patch));
  };
  const apply = () => {
    const parsed = tabSchema.safeParse(working);
    if (!parsed.success) return;
    useEditorStore.getState().updateDraft((config) => {
      const target = config.tabs.find((t) => t.id === tab.id);
      if (!target) return;
      target.sectionLayout = parsed.data.sectionLayout;
      for (const section of target.sections) section.dashboardBox = parsed.data.sections.find((s) => s.id === section.id)?.dashboardBox;
    });
    onClose();
  };

  return <dialog ref={dialog} data-editor-dialog aria-labelledby="section-bento-title" onCancel={onClose} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(1180px,calc(100vw-32px))] overflow-y-auto rounded-3xl border border-white/15 bg-[#10131e] p-0 text-slate-100 shadow-2xl backdrop:bg-black/70">
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#10131e] p-5">
      <div><h2 id="section-bento-title" className="text-lg font-semibold">Dashboard Bento studio</h2><p className="mt-1 text-sm text-slate-400">{tab.label} · Arrange and resize your sections.</p></div>
      <Button aria-label="Close dashboard studio" onClick={onClose}><X className="size-4" /></Button>
    </header>
    <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0">
        <p className="mb-4 text-xs text-slate-400">Drag a section by its handle. Resize using the bottom-right corner, or use the controls. Other sections move out of the way.</p>
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-white/10 p-2">
          <div ref={grid} data-testid="section-studio-grid" className="grid min-w-[400px]" style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`, gridAutoRows: PREVIEW_ROW, gap: PREVIEW_GAP }}>
            {Array.from({ length: Math.min(rows, 100) * layout.columns }, (_, index) => <button type="button" key={`cell-${index}`} aria-label={`Place section at column ${index % layout.columns + 1}, row ${Math.floor(index / layout.columns) + 1}`} onClick={() => changeBox({ column: index % layout.columns + 1, row: Math.floor(index / layout.columns) + 1 })} className="rounded-lg border border-dashed border-white/10 bg-white/[.015] hover:bg-violet-400/10" style={{ gridColumn: index % layout.columns + 1, gridRow: Math.floor(index / layout.columns) + 1 }} />)}
            {working.sections.map((section) => <div key={section.id} style={sectionBoxStyle(section.dashboardBox!)} className={`relative z-[1] min-w-0 overflow-hidden rounded-xl border bg-[#1c2032] p-3 ${activeId === section.id ? "border-violet-400 ring-1 ring-violet-400" : "border-white/15"}`}>
              <div className="flex items-center gap-1">
                <button type="button" aria-label={`Move section ${section.title}`} onPointerDown={(event) => startGesture(event, section.id, "move")} onPointerMove={moveGesture} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { const current = gesture.current; if (current) setWorking(current.tab); gesture.current = null; }} className="touch-none cursor-grab rounded p-1 text-violet-300"><GripVertical className="size-4" /></button>
                <button type="button" aria-pressed={activeId === section.id} onClick={() => setActiveId(section.id)} className="truncate text-left text-sm font-semibold">{section.title}</button>
              </div>
              <p className="mt-2 text-xs text-slate-400">{section.cards.length} cards · {section.dashboardBox!.width} × {section.dashboardBox!.height}</p>
              <button type="button" aria-label={`Resize section ${section.title}`} onPointerDown={(event) => startGesture(event, section.id, "resize")} onPointerMove={moveGesture} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { const current = gesture.current; if (current) setWorking(current.tab); gesture.current = null; }} className="absolute bottom-1 right-1 touch-none cursor-nwse-resize rounded p-1 text-violet-300"><Move className="size-4" /></button>
            </div>)}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Preview uses compact rows. Dashboard sections use the row height you choose. Long content scrolls within each section; narrow screens stack sections in reading order.</p>
      </div>
      <div className="grid content-start gap-4">
        <Field label="Dashboard columns"><Select value={layout.columns} onChange={(event) => setWorking(arrangeSections({ ...working, sectionLayout: { ...layout, columns: Number(event.target.value) } }))}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</Select></Field>
        <Field label="Dashboard row height (px)"><Input type="number" min={40} max={240} value={layout.rowHeight} onChange={(event) => setWorking({ ...working, sectionLayout: { ...layout, rowHeight: Number(event.target.value) } })} /></Field>
        <Field label="Section gap (px)"><Input type="number" min={4} max={64} value={layout.gap} onChange={(event) => setWorking({ ...working, sectionLayout: { ...layout, gap: Number(event.target.value) } })} /></Field>
        {active && box && <>
          <Field label="Selected section"><Select value={activeId} onChange={(event) => setActiveId(event.target.value)}>{working.sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">{(["column", "row", "width", "height"] as const).map((key) => <Field key={key} label={`Section ${key}`}><Input type="number" min={1} max={key === "row" ? 10000 : key === "height" ? 24 : layout.columns} value={box[key]} onChange={(event) => changeBox({ [key]: Number(event.target.value) })} /></Field>)}</div>
        </>}
        <Button onClick={() => setWorking(arrangeSections({ ...working, sections: working.sections.map((s) => ({ ...s, dashboardBox: s.dashboardBox ? { ...s.dashboardBox, column: 1, row: 1 } : undefined })) }))}>Pack sections</Button>
        {message && <p role="status" className="text-xs text-amber-300">{message}</p>}
      </div>
    </div>
    <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-white/10 bg-[#10131e] p-4">
      {!tabSchema.safeParse(working).success && <p role="alert" className="mr-auto text-xs text-rose-300">Check the grid values: row height 40–240 px, gap 4–64 px.</p>}
      <Button onClick={onClose}>Cancel studio</Button><Button disabled={!tabSchema.safeParse(working).success} onClick={apply}>Apply to draft</Button>
    </footer>
  </dialog>;
}
