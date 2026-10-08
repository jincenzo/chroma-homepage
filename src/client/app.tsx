import { Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { parseConfig } from "../shared/config";
import { resolveTabAppearance } from "../shared/presentation";
import { Dashboard } from "./components/dashboard";
import { CardLauncher } from "./components/card-launcher";
import { EditorToolbar } from "./components/editor-toolbar";
import { Inspector } from "./components/inspector";
import { SearchClock } from "./components/search-clock";
import { ProfileSelector } from "./components/profile-selector";
import { saveConfig } from "./lib/api";
import { useProfiles } from "./lib/use-profiles";
import { useEditorStore } from "./store/editor-store";

export function App() {
  const { persisted, draft, editMode, beginEdit, acceptSaved, undo, redo, copy, cut, paste, duplicate, deleteSelection } = useEditorStore();
  const activeTabId = useEditorStore((state) => state.activeTabId);
  const profileState = useProfiles();
  const { activeId, loading, updateProfile } = profileState;
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savePending = useRef(false);
  const save = useCallback(async () => {
    const current = useEditorStore.getState().draft;
    if (!current || savePending.current || loading) return;
    savePending.current = true;
    setSaving(true); setError(null);
    try {
      const saved = await saveConfig(parseConfig(current), activeId);
      acceptSaved(saved);
      updateProfile(activeId, saved.homepage);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the configuration"); }
    finally { savePending.current = false; setSaving(false); }
  }, [acceptSaved, activeId, loading, updateProfile]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!useEditorStore.getState().editMode) return;
      // Native dialogs make the editor inert, but window shortcuts still need a guard.
      if (document.querySelector("dialog[data-editor-dialog][open]")) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") event.preventDefault();
        return;
      }
      if (savePending.current) { if (event.ctrlKey || event.metaKey) event.preventDefault(); return; }
      const modifier = event.ctrlKey || event.metaKey;
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, [contenteditable=true]");
      if (modifier && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); return; }
      if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if (modifier && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
      if (typing) return;
      if (modifier && event.key.toLowerCase() === "c") { event.preventDefault(); copy(); }
      if (modifier && event.key.toLowerCase() === "x") { event.preventDefault(); cut(); }
      if (modifier && event.key.toLowerCase() === "v") { event.preventDefault(); paste(); }
      if (modifier && event.key.toLowerCase() === "d") { event.preventDefault(); duplicate(); }
      if (event.key === "Delete") { event.preventDefault(); deleteSelection(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [copy, cut, deleteSelection, duplicate, paste, redo, save, undo]);

  const config = editMode ? draft : persisted;
  const visibleError = error ?? profileState.error;
  if (!config) return <div className="grid min-h-screen place-items-center bg-[#080a12] text-slate-400">{visibleError ?? "Loading Chroma Homepage…"}</div>;
  const fitViewport = !editMode && Boolean((config.tabs.find((tab) => tab.id === activeTabId) ?? config.tabs[0])?.fitViewport);
  return <div data-fit-viewport={fitViewport || undefined} style={{ "--home-accent": resolveTabAppearance(undefined, config.homepage).accent } as CSSProperties} className={`chroma-app min-h-screen overflow-x-hidden ${editMode ? "pr-[320px]" : ""}`}>
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header data-testid="app-header" className="relative z-30 mx-auto max-w-7xl px-6 pb-5 pt-5">
      <div className="chroma-command-bar chroma-header-grid gap-3 p-2.5">
      <div className="header-brand relative flex min-w-0 items-center gap-2.5 pl-1"><img src="/chroma.svg" alt="Chroma Homepage" className="size-10 shrink-0" /><h1 title={config.homepage.title} className="header-title max-w-44 truncate text-sm font-semibold tracking-tight text-white">{config.homepage.title}</h1></div>
      <SearchClock />
      <div className="relative flex shrink-0 items-center gap-2">
      {editMode && <span title="Edit mode" className="flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-400/10 p-2 text-xs font-semibold text-violet-300"><Pencil className="size-3.5" /><span className="hidden xl:inline">Editing</span></span>}
      <ProfileSelector {...profileState} homepage={config.homepage} onEdit={beginEdit} disabled={editMode || saving || profileState.loading} editing={editMode} onChange={async (action) => { setError(null); return profileState.changeProfile(action); }} />
      </div>
      </div>
    </header>
    {visibleError && <div role="alert" className="fixed left-1/2 top-5 z-[100] -translate-x-1/2 rounded-xl border border-rose-400/30 bg-rose-950/90 px-4 py-2 text-sm text-rose-200 shadow-xl">{visibleError}</div>}
    <div className="dashboard-stage" inert={saving || profileState.loading} key={profileState.activeId}>
    <div className="dashboard-host relative z-10 px-6 pb-28"><Dashboard config={config} editing={editMode} /></div>
    <CardLauncher config={config} disabled={editMode || profileState.loading} />
    {editMode && <><Inspector /><EditorToolbar onSave={() => void save()} saving={saving} /></>}
    </div>
  </div>;
}
