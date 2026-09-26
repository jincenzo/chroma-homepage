import type { SearchShortcut } from "../../shared/config";
import { createId } from "../../shared/id";
import { DEFAULT_SEARCH_SHORTCUTS } from "../../shared/search-defaults";
import { useEditorStore } from "../store/editor-store";
import { Button, Field, Input } from "./ui";

export function LauncherSettings() {
  const { draft, updateDraft } = useEditorStore();
  if (!draft) return null;
  const shortcuts = draft.homepage.searchShortcuts ?? DEFAULT_SEARCH_SHORTCUTS;
  const change = (id: string, patch: Partial<SearchShortcut>) => updateDraft((config) => {
    config.homepage.searchShortcuts = structuredClone(config.homepage.searchShortcuts ?? DEFAULT_SEARCH_SHORTCUTS);
    const shortcut = config.homepage.searchShortcuts.find((item) => item.id === id);
    if (shortcut) Object.assign(shortcut, patch);
  });
  return <div className="grid gap-4">
    <h3 className="font-semibold text-slate-200">Launcher shortcuts</h3>
    <p className="text-xs text-slate-400">Press Ctrl/Cmd + K. Use a keyword followed by a query, such as “gh zustand”. Settings are saved with your draft.</p>
    {shortcuts.map((shortcut) => <div key={shortcut.id} className="grid gap-3 rounded-xl border border-white/10 p-3">
      <Field label="Keyword"><Input value={shortcut.keyword} onChange={(event) => change(shortcut.id, { keyword: event.target.value })} /></Field>
      <Field label="Search provider"><Input value={shortcut.label} onChange={(event) => change(shortcut.id, { label: event.target.value })} /></Field>
      <Field label="Search URL"><Input value={shortcut.urlTemplate} onChange={(event) => change(shortcut.id, { urlTemplate: event.target.value })} /></Field>
      <p className="text-xs text-slate-400">Use { "{query}" } where the search terms should go.</p>
      <label className="flex items-center justify-between text-xs text-slate-300">Open in new tab<input type="checkbox" checked={shortcut.openInNewTab} onChange={(event) => change(shortcut.id, { openInNewTab: event.target.checked })} /></label>
      <Button onClick={() => updateDraft((config) => { config.homepage.searchShortcuts = shortcuts.filter((item) => item.id !== shortcut.id); })}>Remove shortcut</Button>
    </div>)}
    <Button onClick={() => updateDraft((config) => {
      const existing = config.homepage.searchShortcuts ?? DEFAULT_SEARCH_SHORTCUTS;
      let suffix = 1;
      while (existing.some((item) => item.keyword === `s${suffix}`)) suffix++;
      config.homepage.searchShortcuts = [...structuredClone(existing), { id: createId(), keyword: `s${suffix}`, label: "New search", urlTemplate: "https://www.google.com/search?q={query}", openInNewTab: true }];
    })}>Add search shortcut</Button>
  </div>;
}
