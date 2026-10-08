import type { StickyNoteCard } from "../../shared/config";
import { Pencil } from "lucide-react";
import { findCard } from "../../shared/operations";
import { useEditorStore } from "../store/editor-store";
import { Field, Input } from "./ui";

export const noteColors: Record<StickyNoteCard["color"], string> = {
  yellow: "#f9e795", peach: "#ffcba6", pink: "#f6bdd5",
  lavender: "#d5c5f3", blue: "#b9ddf5", mint: "#bfe6c7"
};

export function StickyNoteCardView({ card, editing }: { card: StickyNoteCard; editing: boolean }) {
  const edit = () => {
    const store = useEditorStore.getState();
    const config = store.persisted;
    if (!config) return;
    const location = findCard(config, card.id);
    if (!location) return;
    const tab = config.tabs[location.tabIndex];
    store.beginEdit();
    store.setActiveTab(tab.id);
    store.select({ type: "card", tabId: tab.id, sectionId: tab.sections[location.sectionIndex].id, cardId: card.id });
  };
  return <div className="sticky-note-content" style={{ backgroundColor: noteColors[card.color] }}>
    {!editing && <button type="button" aria-label={`Edit post-it ${card.label}`} onClick={(event) => { event.stopPropagation(); edit(); }} className="absolute right-2 top-2 rounded-lg p-1.5 text-black/40 transition hover:bg-black/10 hover:text-black/80"><Pencil className="size-3.5" /></button>}
    <h3 className="sticky-note-title">{card.label}</h3>
    <p className={`sticky-note-body ${card.content ? "" : "sticky-note-placeholder"}`}>{card.content || "A little space for your next idea…"}</p>
  </div>;
}

export function StickyNoteCardEditor({ card, onChange }: { card: StickyNoteCard; onChange(card: StickyNoteCard): void }) {
  return <div className="grid gap-4">
    <Field label="Title"><Input autoFocus maxLength={120} value={card.label} onChange={(event) => onChange({ ...card, label: event.target.value })} /></Field>
    <Field label="Note"><textarea aria-label="Note" maxLength={10000} rows={9} placeholder="Write a thought, a reminder, a list…" value={card.content} onChange={(event) => onChange({ ...card, content: event.target.value })} className="w-full resize-y rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-relaxed text-slate-100 outline-none focus:border-violet-400/60" /></Field>
    <fieldset><legend className="mb-2 text-xs font-medium text-slate-400">Post-it color</legend><div className="flex flex-wrap gap-2">
      {Object.entries(noteColors).map(([color, hex]) => <button key={color} type="button" aria-label={`${color[0].toUpperCase() + color.slice(1)} post-it`} aria-pressed={card.color === color} title={color} onClick={() => onChange({ ...card, color: color as StickyNoteCard["color"] })} style={{ backgroundColor: hex }} className={`size-8 rounded-full border-2 transition hover:scale-110 ${card.color === color ? "border-white ring-2 ring-violet-400 ring-offset-2 ring-offset-[#0b0d16]" : "border-transparent"}`} />)}
    </div></fieldset>
  </div>;
}
