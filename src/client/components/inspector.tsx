import { Settings2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { BentoStudio } from "./bento-studio";
import { CardTypeRegistry } from "../registries/card-registry";
import { LayoutTypeRegistry } from "../registries/layout-registry";
import { selectedCard, useEditorStore } from "../store/editor-store";
import { Button, Field, Input, Select } from "./ui";
import { IconPicker } from "./icon-picker";
import { AppearanceEditor } from "./appearance-editor";
import { HomepageSettings } from "./homepage-settings";
import { AccentColorEditor } from "./accent-color-editor";
import { resolveSectionAppearance, resolveTabAppearance } from "../../shared/presentation";
import type { Section } from "../../shared/config";

export function Inspector() {
  const { draft, selection, updateDraft, deleteSelection } = useEditorStore();
  const card = useEditorStore(selectedCard);
  const sidebar = useRef<HTMLElement>(null);
  const [bentoOpen, setBentoOpen] = useState(false);
  if (!draft) return null;
  const tab = selection ? draft.tabs.find((item) => item.id === selection.tabId) : undefined;
  const section = selection && selection.type !== "tab" ? tab?.sections.find((item) => item.id === selection.sectionId) : undefined;
  const title = selection ? selection.type[0].toUpperCase() + selection.type.slice(1) : "Homepage settings";
  const updateSection = (patch: Partial<Section>) => updateDraft((config) => {
    const target = config.tabs.find((item) => item.id === tab?.id)?.sections.find((item) => item.id === section?.id);
    if (target) Object.assign(target, patch);
  });

  return <aside ref={sidebar} className="inspector-scroll fixed inset-y-0 right-0 z-40 w-[320px] overflow-y-auto border-l border-white/10 bg-[#0b0d16]/94 p-5 shadow-2xl backdrop-blur-2xl">
    <div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-violet-400">Properties</p><h2 className="mt-1 text-lg font-semibold text-white">{title}</h2></div>{selection && <Button aria-label="Delete selected item" title="Delete" onClick={deleteSelection} className="size-9 px-0 text-rose-300"><Trash2 className="size-4" /></Button>}</div>
    {!selection && <HomepageSettings />}
    {section?.layout.type === "bento" && <Button className="mb-5 w-full" onClick={() => setBentoOpen(true)}>Open Bento studio</Button>}
    {selection && <Button className="mb-5 w-full" onClick={() => { useEditorStore.getState().select(null); sidebar.current?.scrollTo({ top: 0 }); }}><Settings2 className="size-4" />Homepage settings</Button>}
    {selection?.type === "tab" && tab && <div className="grid gap-4">
      <Field label="Label"><Input value={tab.label} onChange={(event) => updateDraft((config) => { const target = config.tabs.find((item) => item.id === tab.id); if (target) target.label = event.target.value; })} /></Field>
      <AccentColorEditor key={tab.id} icon={tab.icon} value={tab.appearance?.accent} inherited={resolveTabAppearance(undefined, draft.homepage).accent} source="homepage" onChange={(accent) => updateDraft((config) => {
        const target = config.tabs.find((item) => item.id === tab.id);
        if (!target) return;
        if (accent) target.appearance = { accent }; else delete target.appearance;
      })} />
      <IconPicker value={tab.icon} onChange={(icon) => updateDraft((config) => { const target = config.tabs.find((item) => item.id === tab.id); if (target && typeof icon === "string") target.icon = icon; })} />
      <label className="flex items-center justify-between gap-3 text-sm text-slate-300"><span>Default tab</span><input type="radio" checked={draft.homepage.defaultTabId === tab.id} onChange={() => updateDraft((config) => { config.homepage.defaultTabId = tab.id; })} className="size-4 accent-violet-500" /></label>
    </div>}
    {selection?.type === "section" && section && <div className="grid gap-5">
      <Field label="Move section to tab"><Select value={tab?.id} onChange={(event) => {
        useEditorStore.getState().moveSection(section.id, event.target.value);
        useEditorStore.getState().setActiveTab(event.target.value);
      }}>{draft.tabs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field>
      <Field label="Title"><Input value={section.title} onChange={(event) => updateDraft((config) => { const target = config.tabs.find((item) => item.id === tab?.id)?.sections.find((item) => item.id === section.id); if (target) target.title = event.target.value; })} /></Field>
      <Field label="Section width"><Select value={section.width ?? "full"} onChange={(event) => updateSection({ width: event.target.value as Section["width"] })}>
        <option value="full">Full width</option><option value="two-thirds">Two thirds</option><option value="half">Half width</option><option value="third">One third</option>
      </Select></Field>
      <div className="border-t border-white/8 pt-5"><h3 className="mb-4 text-sm font-semibold text-slate-200">Layout · {LayoutTypeRegistry[section.layout.type].label}</h3>{(() => { const Editor = LayoutTypeRegistry[section.layout.type].Editor; return <Editor layout={section.layout} onChange={(layout) => updateDraft((config) => { const target = config.tabs.find((item) => item.id === tab?.id)?.sections.find((item) => item.id === section.id); if (target) target.layout = layout; })} />; })()}</div>
      <AppearanceEditor inherited={resolveTabAppearance(tab, draft.homepage)} value={section.appearance} onChange={(appearance) => updateSection({ appearance })} />
    </div>}
    {selection?.type === "card" && card && <div className="grid gap-5"><p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400">Type: {CardTypeRegistry[card.type].label}</p>{(() => { const Editor = CardTypeRegistry[card.type].Editor; return <Editor card={card} onChange={(updated) => updateDraft((config) => { const target = config.tabs.flatMap((item) => item.sections).flatMap((item) => item.cards).find((item) => item.id === card.id); if (target) Object.assign(target, updated); })} />; })()}</div>}
    {selection?.type === "card" && card && <AppearanceEditor key={card.id} card icon={card.icon} inherited={resolveSectionAppearance(section, tab, draft.homepage)} value={card.appearance} onChange={(appearance) => updateDraft((config) => {
      const target = config.tabs.flatMap((item) => item.sections).flatMap((item) => item.cards).find((item) => item.id === card.id);
      if (target) target.appearance = appearance;
    })} />}
    {bentoOpen && section?.layout.type === "bento" && <BentoStudio key={section.id} section={section} selectedId={card?.id} onClose={() => setBentoOpen(false)} />}
  </aside>;
}
