import { type ComponentType, useState } from "react";
import type { Card, FormulaOneCard, GamingCard, LinkCard, MotoGpCard, RemoteCard, StickyNoteCard } from "../../shared/config";
import { VisualIcon } from "../components/visual-icon";
import { Field, Input } from "../components/ui";
import { IconPicker } from "../components/icon-picker";
import { LinkUrlEditor } from "../components/link-url-editor";
import { FormulaOneCardEditor, FormulaOneCardView } from "../components/formula-one-card";
import { GamingCardEditor, GamingCardView } from "../components/gaming-card";
import { MotoGpCardEditor, MotoGpCardView } from "../components/motogp-card";
import { RemoteCardEditor, RemoteCardView } from "../components/remote-card";
import { StickyNoteCardEditor, StickyNoteCardView } from "../components/sticky-note-card";

interface CardViewProps { card: Card; editing: boolean }
interface CardEditorProps { card: Card; onChange(card: Card): void }
interface CardDefinition {
  label: string;
  Renderer: ComponentType<CardViewProps>;
  Editor: ComponentType<CardEditorProps>;
}

function LinkCardView({ card, editing }: CardViewProps) {
  const link = card as LinkCard;
  const content = <>
    <span className="chroma-link-icon"><VisualIcon icon={link.icon} className="size-[25px]" /></span>
    <span className="min-w-0 flex-1"><span className="chroma-link-label block">{link.label}</span>{link.description && <span className="chroma-link-description mt-1 block">{link.description}</span>}</span>
  </>;
  if (editing) return <div className="chroma-link-content flex items-center gap-3.5">{content}</div>;
  return <a href={link.url} target={link.openInNewTab ? "_blank" : "_self"} rel={link.openInNewTab ? "noreferrer" : undefined} className="chroma-link-content group flex items-center gap-3.5">{content}</a>;
}

function LinkCardEditor({ card, onChange }: CardEditorProps) {
  const link = card as LinkCard;
  const update = (patch: Partial<LinkCard>) => onChange({ ...link, ...patch });
  return <div className="grid gap-4">
    <LinkUrlEditor key={link.id} card={link} onUrlChange={(url) => update({ url })} />
    <Field label="Label"><Input value={link.label} onChange={(event) => update({ label: event.target.value })} /></Field>
    <Field label="Description"><Input value={link.description ?? ""} onChange={(event) => update({ description: event.target.value || undefined })} /></Field>
    <Field label="Aliases (comma separated)"><KeywordsInput key={link.id + "-aliases"} value={link.aliases ?? []} placeholder="ha, home" onChange={(aliases) => update({ aliases })} /></Field>
    <Field label="Tags (comma separated)"><KeywordsInput key={link.id + "-tags"} value={link.tags ?? []} placeholder="home, automation" onChange={(tags) => update({ tags })} /></Field>
    <label className="flex items-center justify-between gap-3 text-sm text-slate-300"><span>Open in new tab</span><input type="checkbox" checked={link.openInNewTab} onChange={(event) => update({ openInNewTab: event.target.checked })} className="size-4 accent-violet-500" /></label>
    <IconPicker value={link.icon} onChange={(icon) => { if (typeof icon !== "string") update({ icon }); }} allowUpload />
  </div>;
}

function splitKeywords(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

/** Keep separators while typing; still persist every edit and follow undo/redo. */
function KeywordsInput({ value, onChange, placeholder }: { value: string[]; onChange(value: string[]): void; placeholder: string }) {
  const source = value.join(", ");
  const [input, setInput] = useState({ source, text: source });
  if (source !== input.source) setInput({ source, text: source });
  return <Input placeholder={placeholder} value={input.text} onChange={(event) => {
    const text = event.target.value;
    const keywords = splitKeywords(text);
    setInput({ text, source: keywords.join(", ") });
    onChange(keywords);
  }} />;
}

export const CardTypeRegistry: Record<Card["type"], CardDefinition> = {
  "sticky-note": {
    label: "Post-it",
    Renderer: ({ card, editing }) => <StickyNoteCardView card={card as StickyNoteCard} editing={editing} />,
    Editor: ({ card, onChange }) => <StickyNoteCardEditor key={card.id} card={card as StickyNoteCard} onChange={onChange} />
  },
  link: { label: "Link", Renderer: LinkCardView, Editor: LinkCardEditor },
  "remote-data": {
    label: "Custom · Remote JSON",
    Renderer: ({ card, editing }) => <RemoteCardView card={card as RemoteCard} editing={editing} />,
    Editor: ({ card, onChange }) => <RemoteCardEditor key={card.id} card={card as RemoteCard} onChange={onChange} />
  },
  motogp: {
    label: "MotoGP",
    Renderer: ({ card, editing }) => <MotoGpCardView card={card as MotoGpCard} editing={editing} />,
    Editor: ({ card, onChange }) => <MotoGpCardEditor card={card as MotoGpCard} onChange={onChange} />
  },
  gaming: {
    label: "Gaming",
    Renderer: ({ card, editing }) => <GamingCardView card={card as GamingCard} editing={editing} />,
    Editor: ({ card, onChange }) => <GamingCardEditor card={card as GamingCard} onChange={onChange} />
  },
  "formula-one": {
    label: "Formula 1 · Next race",
    Renderer: ({ card }) => <FormulaOneCardView card={card as FormulaOneCard} />,
    Editor: ({ card, onChange }) => <FormulaOneCardEditor card={card as FormulaOneCard} onChange={(updated) => onChange(updated)} />
  }
};

export function CardRenderer({ card, editing }: CardViewProps) {
  const definition = CardTypeRegistry[card.type];
  return <definition.Renderer card={card} editing={editing} />;
}
