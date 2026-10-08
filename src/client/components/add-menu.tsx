import { Gamepad2, Globe, LayoutDashboard, LayoutGrid, Link, Plus, StickyNote, Trophy, Bike, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Card } from "../../shared/config";
import { useEditorStore } from "../store/editor-store";
import { Button } from "./ui";

const cardOptions: { type: Card["type"]; label: string; detail: string; icon: LucideIcon; testId: string }[] = [
  { type: "sticky-note", label: "Post-it", detail: "A colorful note for your ideas", icon: StickyNote, testId: "add-post-it" },
  { type: "link", label: "Link", detail: "A shortcut to a website", icon: Link, testId: "add-card" },
  { type: "formula-one", label: "Formula 1", detail: "Races and driver standings", icon: Trophy, testId: "add-f1-card" },
  { type: "motogp", label: "MotoGP", detail: "Races and rider standings", icon: Bike, testId: "add-motogp-card" },
  { type: "gaming", label: "Gaming", detail: "Free games and deals", icon: Gamepad2, testId: "add-gaming-card" },
  { type: "remote-data", label: "Custom card", detail: "Live data from a JSON endpoint", icon: Globe, testId: "add-remote-card" }
];

function AddDialog({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const store = useEditorStore();
  const config = store.draft ?? store.persisted;
  const tab = config?.tabs.find((item) => item.id === store.activeTabId);
  const selectedSectionId = store.selection?.tabId === tab?.id && store.selection?.type !== "tab" ? store.selection?.sectionId : undefined;
  const section = tab?.sections.find((item) => item.id === selectedSectionId) ?? tab?.sections[0];
  useEffect(() => { ref.current?.showModal(); }, []);
  const add = (action: () => void) => {
    if (!useEditorStore.getState().editMode) useEditorStore.getState().beginEdit();
    action();
    onClose();
  };
  const item = (label: string, detail: string, Icon: LucideIcon, action: () => void, testId?: string) => <button type="button" data-testid={testId} onClick={() => add(action)} className="flex h-full w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/3 p-3 text-left transition hover:border-violet-400/40 hover:bg-violet-400/10 focus-visible:outline-2 focus-visible:outline-violet-400">
    <span className="rounded-xl bg-violet-400/10 p-2.5 text-violet-300"><Icon className="size-5" /></span><span><span className="block text-sm font-semibold text-slate-100">{label}</span><span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{detail}</span></span>
  </button>;
  return createPortal(<dialog ref={ref} data-editor-dialog aria-labelledby="add-dialog-title" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="m-auto max-h-[85dvh] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-3xl border border-white/12 bg-[#11131e] p-0 text-white shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm">
    <div className="p-5 sm:p-6"><div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="add-dialog-title" className="text-lg font-semibold">What would you like to add?</h2><p className="mt-1 text-xs text-slate-400">Create a new space or add to {tab?.label ?? "this tab"}.</p></div><Button aria-label="Close add menu" onClick={onClose} className="size-9 shrink-0 px-0"><X className="size-4" /></Button></div>
    <div className="grid gap-2 sm:grid-cols-2">
      {item("Tab", "A fresh dashboard", LayoutDashboard, () => store.addTab())}
      {item("Post-it board", "A tab ready for your notes", StickyNote, () => store.addTab("board"), "add-post-it-board")}
      {item("Section", "Group cards in this tab", LayoutGrid, store.addSection)}
    </div>
    <p className="mb-3 mt-5 text-xs font-medium uppercase tracking-wider text-slate-500">Cards · {section?.title ?? "New section"}</p>
    <div className="grid gap-2 sm:grid-cols-2">{cardOptions.map((option) => <div key={option.type}>{item(option.label, option.detail, option.icon, () => store.addCard(option.type), option.testId)}</div>)}</div>
    <p className="mb-0 mt-4 text-xs text-slate-500">Changes stay in your draft until you press Save.</p></div>
  </dialog>, document.body);
}

export function AddMenu({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <><Button aria-label="Add new item" aria-haspopup="dialog" aria-expanded={open} title="Add tab, section or card" onClick={() => setOpen(true)} className={compact ? "size-11 shrink-0 border-dashed px-0" : "border-violet-400/30 bg-violet-500/15"}><Plus className="size-4" />{!compact && "Add"}</Button>{open && <AddDialog onClose={() => setOpen(false)} />}</>;
}
