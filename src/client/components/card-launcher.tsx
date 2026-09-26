import { CornerDownLeft, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChromaConfig, IconReference } from "../../shared/config";
import { resolveSearchShortcut, searchCards } from "../lib/card-search";
import { DEFAULT_SEARCH_SHORTCUTS } from "../../shared/search-defaults";
import { VisualIcon } from "./visual-icon";

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable=true]"));
}

interface LauncherAction {
  id: string; label: string; detail: string; url: string; openInNewTab: boolean; icon: IconReference | string;
}

function activateAction(action: LauncherAction): void {
  if (action.openInNewTab) window.open(action.url, "_blank", "noopener,noreferrer");
  else window.location.assign(action.url);
}

export function CardLauncher({ config, disabled = false }: { config: ChromaConfig; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const results = useMemo<LauncherAction[]>(() => {
    const shortcut = resolveSearchShortcut(config, query);
    if (shortcut) return [{
      id: shortcut.id, label: `Search ${shortcut.label} for “${shortcut.terms}”`,
      detail: shortcut.url, url: shortcut.url, openInNewTab: shortcut.openInNewTab, icon: "lucide:search"
    }];
    return searchCards(config, query).map(({ card, tabLabel, sectionTitle }) => ({
      id: card.id, label: card.label, detail: [tabLabel, sectionTitle, ...(card.tags ?? []).map((tag) => `#${tag}`)].join(" · "),
      url: card.url, openInNewTab: card.openInNewTab, icon: card.icon
    }));
  }, [config, query]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => previous?.focus();
  }, [open]);

  useEffect(() => {
    if (open) dialogRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIndex]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (disabled || event.isComposing || event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        setQuery("");
        setSelectedIndex(0);
        return;
      }
      if (disabled || open || isEditableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length !== 1 || !event.key.trim()) return;
      event.preventDefault();
      setQuery(event.key);
      setOpen(true);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [disabled, open]);

  const close = () => { setOpen(false); setQuery(""); setSelectedIndex(0); };
  const keydown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "ArrowDown") { event.preventDefault(); setSelectedIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0))); }
    if (event.key === "ArrowUp") { event.preventDefault(); setSelectedIndex((index) => Math.max(index - 1, 0)); }
    if (event.key === "Enter" && results[selectedIndex]) { event.preventDefault(); activateAction(results[selectedIndex]); close(); }
  };
  const dialogKeydown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("input, button");
    if (!focusable?.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return <AnimatePresence>
    {open && <motion.div className="fixed inset-0 z-[90] flex items-start justify-center bg-[#03050a]/72 px-4 pt-[12vh] backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <motion.div ref={dialogRef} onKeyDown={dialogKeydown} role="dialog" aria-modal="true" aria-label="Find a card" className="chroma-launcher w-full max-w-2xl overflow-hidden rounded-[26px]" initial={{ opacity: 0, y: -14, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: .985 }} transition={{ duration: .16 }}>
        <div className="flex items-center gap-3 border-b border-white/8 px-5">
          <Search className="size-5 shrink-0 text-violet-300" />
          <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0); }} onKeyDown={keydown} aria-label="Find a card" placeholder="Card, alias, #tag, or search shortcut…" className="h-16 min-w-0 flex-1 bg-transparent text-[17px] font-semibold text-slate-100 outline-none placeholder:text-slate-600" />
          <button type="button" onClick={close} aria-label="Close card search" className="grid size-8 place-items-center rounded-xl border border-white/8 bg-white/[.035] text-slate-500 transition hover:text-white"><X className="size-4" /></button>
        </div>
        <div className="max-h-[54vh] overflow-y-auto p-2">
          {results.map((result, index) => <button key={result.id} type="button" aria-current={index === selectedIndex ? "true" : undefined} onMouseEnter={() => setSelectedIndex(index)} onClick={() => { activateAction(result); close(); }} className={`chroma-launcher-result flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${index === selectedIndex ? "is-selected" : ""}`}>
            <span className="chroma-launcher-icon"><VisualIcon icon={result.icon} className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-100">{result.label}</span><span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-400">{result.detail}</span></span>
            {index === selectedIndex && <span className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-black/20 px-2 py-1 text-[9px] font-extrabold uppercase tracking-wider text-slate-500"><CornerDownLeft className="size-3" />Open</span>}
          </button>)}
          {query && results.length === 0 && <div className="grid place-items-center gap-2 px-6 py-12 text-center"><Search className="size-7 text-slate-700" /><p className="text-sm font-semibold text-slate-500">No matching cards</p><p className="text-xs text-slate-700">Try a label, section, or service name.</p></div>}
        </div>
        {!query && <p className="px-5 pb-3 text-xs text-slate-400">Search shortcuts: {(config.homepage.searchShortcuts ?? DEFAULT_SEARCH_SHORTCUTS).map((item) => `${item.keyword} → ${item.label}`).join(" · ")}. Use #tag to filter.</p>}
        <div className="flex items-center justify-between border-t border-white/8 px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-slate-600"><span>{results.length} {results.length === 1 ? "result" : "results"}</span><span>↑ ↓ Navigate · Enter Open · Esc Close</span></div>
      </motion.div>
    </motion.div>}
  </AnimatePresence>;
}
