import { LayoutDashboard, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { bentoSize, type BentoLayout } from "../../shared/bento";
import { sectionSchema, type Section } from "../../shared/config";
import { resolveAppearance } from "../../shared/presentation";
import { CardRenderer } from "../registries/card-registry";
import { noteColors } from "./sticky-note-card";
import { useEditorStore } from "../store/editor-store";
import { BentoGrid, bentoBoxStyle } from "./bento-grid";
import { Button, Field, Input, Select } from "./ui";

const presets = [
  { label: "Small", width: 1, height: 1 },
  { label: "Wide", width: 2, height: 1 },
  { label: "Tall", width: 1, height: 2 },
  { label: "Feature", width: 2, height: 2 }
];

export function BentoStudio({ section, selectedId, onClose }: { section: Section; selectedId?: string; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [working, setWorking] = useState(() => structuredClone(section));
  const [activeId, setActiveId] = useState(selectedId ?? section.cards[0]?.id);
  const draft = useEditorStore((state) => state.draft);
  const layout = working.layout;
  const card = working.cards.find((item) => item.id === activeId);
  const sourceTab = draft?.tabs.find((tab) => tab.sections.some((item) => item.id === section.id));
  const validation = sectionSchema.safeParse(working);

  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);

  if (layout.type !== "bento") return null;
  const updateLayout = (patch: Partial<BentoLayout>) => setWorking((value) => ({ ...value, layout: { ...layout, ...patch } }));
  const updateSize = (width: number, height: number) => setWorking((value) => ({ ...value, cards: value.cards.map((item) => item.id === activeId ? { ...item, bento: { width, height } } : item) }));
  const size = card ? bentoSize(card) : { width: 1, height: 1 };
  const apply = () => {
    if (!validation.success) return;
    useEditorStore.getState().updateDraft((config) => {
      const target = config.tabs.flatMap((tab) => tab.sections).find((item) => item.id === section.id);
      if (!target) return;
      target.layout = validation.data.layout;
      for (const item of target.cards) {
        const updated = validation.data.cards.find((candidate) => candidate.id === item.id);
        if (updated?.bento) item.bento = updated.bento;
        else delete item.bento;
      }
    });
    onClose();
  };

  return <dialog ref={dialog} data-editor-dialog aria-labelledby="bento-title" onCancel={onClose} className="bento-studio fixed inset-0 m-auto max-h-[90dvh] w-[min(1180px,calc(100vw-32px))] overflow-y-auto rounded-3xl border border-white/15 bg-[#10131e] p-0 text-slate-100 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm">
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#10131e] p-5">
      <div><h2 id="bento-title" className="flex items-center gap-2 text-lg font-semibold"><LayoutDashboard className="size-5 text-violet-300" />Bento studio</h2><p className="mt-1 text-sm text-slate-400">{section.title} · Select a box to shape your layout.</p></div>
      <Button aria-label="Close Bento studio" onClick={onClose}><X className="size-4" /></Button>
    </header>
    <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0">
        <div className="mb-4 flex items-center justify-between text-xs text-slate-400"><span>Live preview</span><span>Width × height in grid units</span></div>
        <BentoGrid layout={layout}>
          {working.cards.map((item) => {
            const appearance = resolveAppearance(item, working, sourceTab, draft?.homepage);
            const dimensions = bentoSize(item);
            return <button type="button" key={item.id} aria-label={`Resize ${item.label}`} aria-pressed={item.id === activeId} onClick={() => setActiveId(item.id)} data-card-type={item.type} data-surface={appearance.surface} data-density={appearance.density}
              className={`chroma-link-card bento-preview-card relative overflow-hidden rounded-[22px] text-left ${item.id === activeId ? "ring-2 ring-violet-400 ring-offset-2 ring-offset-[#10131e]" : ""}`}
              style={{ ...bentoBoxStyle(item), ...(item.type === "sticky-note" ? { "--note-color": noteColors[item.color] } : {}), "--card-accent": appearance.accent, "--icon-size": `${appearance.iconSize}px`, "--description-display": appearance.showDescription ? "-webkit-box" : "none" } as CSSProperties}>
              <span className="pointer-events-none"><CardRenderer card={item} editing /></span>
              <span className="absolute right-2 top-2 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] text-slate-300">{dimensions.width} × {dimensions.height}</span>
            </button>;
          })}
        </BentoGrid>
        {!working.cards.length && <p className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-sm text-slate-400">No boxes yet. Apply this layout, then use Add link to create cards.</p>}
        <p className="mt-4 text-xs leading-relaxed text-slate-500">Preview fits this window. The dashboard adapts to its section width, keeping card order. Wide boxes shrink to fit; content may expand rows. Drag cards on the dashboard to reorder them.</p>
      </div>
      <div className="grid content-start gap-5">
        <fieldset className="grid gap-3"><legend className="mb-3 text-sm font-semibold">Section grid</legend>
          <Field label="Columns"><Input type="number" min={1} max={12} value={layout.columns} onChange={(event) => updateLayout({ columns: Number(event.target.value) })} /></Field>
          <Field label="Row height (px)"><Input type="number" min={120} max={320} value={layout.rowHeight} onChange={(event) => updateLayout({ rowHeight: Number(event.target.value) })} /></Field>
          <Field label="Box gap (px)"><Input type="number" min={4} max={64} value={layout.gap} onChange={(event) => updateLayout({ gap: Number(event.target.value) })} /></Field>
        </fieldset>
        {card && <fieldset className="grid gap-3 border-t border-white/10 pt-4"><legend className="pt-4 text-sm font-semibold">Selected box</legend>
          <Field label="Box"><Select value={activeId} onChange={(event) => setActiveId(event.target.value)}>{working.cards.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-2">{presets.map((preset) => <Button key={preset.label} aria-pressed={size.width === preset.width && size.height === preset.height} className="h-auto flex-col gap-0.5 py-2 aria-pressed:border-violet-400/50 aria-pressed:bg-violet-400/15" onClick={() => updateSize(preset.width, preset.height)}>{preset.label}<span className="text-xs text-slate-400">{preset.width} × {preset.height}</span></Button>)}</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Box width"><Input type="number" min={1} max={12} value={size.width} onChange={(event) => updateSize(Number(event.target.value), size.height)} /></Field>
            <Field label="Box height"><Input type="number" min={1} max={4} value={size.height} onChange={(event) => updateSize(size.width, Number(event.target.value))} /></Field>
          </div>
        </fieldset>}
      </div>
    </div>
    <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-white/10 bg-[#10131e] p-4">
      {!validation.success && <p role="alert" className="w-full text-sm text-rose-300">{validation.error.issues[0]?.message}</p>}
      <span className="mr-auto text-xs text-slate-400">Changes are not saved until you Save the homepage.</span>
      <Button onClick={onClose}>Cancel studio</Button><Button disabled={!validation.success} className="bg-violet-500/20" onClick={apply}>Apply to draft</Button>
    </footer>
  </dialog>;
}
