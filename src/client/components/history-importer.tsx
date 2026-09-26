import { History, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { appendHistorySites, existingHistorySites, HISTORY_FILE_LIMIT, HISTORY_SELECTION_LIMIT, type HistoryAnalysis, type HistoryLink } from "../../shared/history-import";
import type { Layout } from "../../shared/config";
import type { HistoryWorkerResult } from "../lib/history-import.worker";
import { previewLink } from "../lib/api";
import { useEditorStore } from "../store/editor-store";
import { Button, Field, Input, Select } from "./ui";
import { VisualIcon } from "./visual-icon";

export function HistoryImporter({ onClose }: { onClose(): void }) {
  const draft = useEditorStore((state) => state.draft);
  const session = useRef(useEditorStore.getState().persisted);
  const dialog = useRef<HTMLDialogElement>(null);
  const worker = useRef<Worker | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef({ value: 0 });
  const applying = useRef(false);
  const [analysis, setAnalysis] = useState<HistoryAnalysis | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState("new");
  const [tabName, setTabName] = useState("Browsing");
  const [layout, setLayout] = useState<Layout["type"]>("grid");
  const [makeDefault, setMakeDefault] = useState(() => draft?.tabs.every((tab) => tab.sections.every((section) => section.cards.length === 0)) ?? false);
  const [fetchDetails, setFetchDetails] = useState(false);
  const [allowLocal, setAllowLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<{ links: HistoryLink[]; failed: number } | null>(null);
  const existing = useMemo(() => draft ? existingHistorySites(draft) : new Set<string>(), [draft]);
  const eligible = useMemo(() => analysis?.sites.filter((site) => !existing.has(site.url)) ?? [], [analysis, existing]);
  const filtered = useMemo(() => analysis?.sites.filter((site) => `${site.url} ${site.label}`.toLowerCase().includes(query.toLowerCase())) ?? [], [analysis, query]);
  const visible = filtered.slice(page * 20, (page + 1) * 20);

  useEffect(() => {
    const previous = document.activeElement;
    const lifecycle = generation.current;
    dialog.current?.showModal();
    return () => {
      lifecycle.value++;
      worker.current?.terminate(); request.current?.abort();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  async function read(file?: File) {
    if (!file) return;
    const current = ++generation.current.value;
    worker.current?.terminate(); setAnalysis(null); setStaged(null); setSelected(new Set()); setLabels({}); setPage(0); setQuery(""); setError(null);
    if (file.size > HISTORY_FILE_LIMIT) { setError("The file exceeds 20 MB. Export a shorter period from HistoryOut."); setBusy(false); return; }
    setBusy(true); setProgress("Analyzing locally in your browser…");
    try {
      const text = await file.text();
      if (generation.current.value !== current) return;
      const task = new Worker(new URL("../lib/history-import.worker.ts", import.meta.url), { type: "module" });
      worker.current = task;
      task.onmessage = (event: MessageEvent<HistoryWorkerResult>) => {
        task.terminate();
        if (generation.current.value !== current) return;
        setBusy(false);
        if ("error" in event.data) { setError(event.data.error); return; }
        const result = event.data.analysis;
        setAnalysis(result);
        setSelected(new Set(result.sites.filter((site) => !existing.has(site.url)).slice(0, 20).map((site) => site.url)));
      };
      task.onerror = () => { task.terminate(); if (generation.current.value === current) { setBusy(false); setError("Could not analyze this export. Try a smaller file."); } };
      task.postMessage(text);
    } catch { if (generation.current.value === current) { setBusy(false); setError("Could not read the file."); } }
  }

  function apply(links: HistoryLink[]) {
    if (applying.current) return;
    const state = useEditorStore.getState();
    if (!state.editMode || !state.draft || state.persisted !== session.current) { onClose(); return; }
    applying.current = true;
    try {
      const result = appendHistorySites(state.draft, links, { tabId: target === "new" ? undefined : target, newTabLabel: tabName, layout, makeDefault });
      state.replaceDraft(result.config); state.setActiveTab(result.tabId); state.select(null);
      onClose();
    } catch (cause) { applying.current = false; setError(cause instanceof Error ? cause.message : "Could not import the selected sites."); }
  }

  async function prepareImport() {
    if (busy || !analysis || !selected.size) return;
    setError(null);
    const links: HistoryLink[] = eligible.filter((site) => selected.has(site.url)).map((site) => ({ url: site.url, label: labels[site.url]?.trim() || site.label }));
    if (!fetchDetails) { apply(links); return; }
    const controller = new AbortController(); request.current = controller;
    const current = generation.current.value;
    setBusy(true); setProgress(`Finding site details: 0 / ${links.length}`);
    let cursor = 0, done = 0, failed = 0;
    // Keep below the backend's preview concurrency limit; no raw history URLs leave the browser.
    await Promise.all(Array.from({ length: 2 }, async () => {
      while (cursor < links.length && !controller.signal.aborted) {
        const index = cursor++, link = links[index];
        try {
          const preview = await previewLink(link.url, allowLocal, controller.signal);
          links[index] = { ...link, label: labels[link.url]?.trim() || preview.title, icon: preview.icon, description: preview.description };
          if (preview.warning) failed++;
        } catch { failed++; }
        done++;
        if (generation.current.value === current) setProgress(`Finding site details: ${done} / ${links.length}`);
      }
    }));
    if (controller.signal.aborted || generation.current.value !== current) return;
    setBusy(false); setStaged({ links, failed });
  }

  if (!draft) return null;
  return <dialog ref={dialog} data-editor-dialog aria-labelledby="history-import-title" onCancel={onClose}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[min(960px,calc(100vw-32px))] overflow-y-auto rounded-3xl border border-white/15 bg-[#10131e] p-0 text-slate-100 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm">
    <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#10131e] p-5">
      <div><h2 id="history-import-title" className="flex items-center gap-2 text-lg font-semibold"><History className="size-5 text-violet-300" />Import HistoryOut</h2><p className="mt-1 text-sm text-slate-400">Into: {draft.homepage.title} · Add to draft, then Save</p></div>
      <Button aria-label="Close HistoryOut import" onClick={onClose}><X className="size-4 shrink-0" /></Button>
    </div>
    <div className="grid gap-5 p-5">
      <p className="text-sm leading-relaxed text-slate-400">Your history file stays in this browser. We group HTTP(S) pages by site, keeping subdomains and ports distinct. Imported links use site homepages, never the original paths, queries, or fragments. Existing cards and other profiles are left untouched.</p>
      <Field label="HistoryOut JSON file"><input autoFocus type="file" accept="application/json,.json" disabled={busy || !!staged} onChange={(event) => { void read(event.target.files?.[0]); event.target.value = ""; }} className="rounded-xl border border-white/15 p-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-violet-400/15 file:px-3 file:py-2 file:text-violet-200" /></Field>
      {busy && <p role="status" className="text-sm text-violet-200">{progress} You can close this window to cancel.</p>}
      {analysis && <>
        <p className="text-xs leading-relaxed text-slate-400">{analysis.total} records · {analysis.sites.length} sites · {analysis.unsupported} unsupported/credential URLs skipped · {analysis.invalid} invalid records skipped · {analysis.duplicates} repeated pages merged. Visit score sums the highest visitCount per distinct page, not time spent or exact visits in a date range.</p>
        {!analysis.sites.length && <p role="status">No importable HTTP(S) sites found in this file.</p>}
        <fieldset disabled={busy || !!staged} className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1"><Field label="Filter sites"><Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Find a site…" /></Field></div>
            <Button onClick={() => setSelected(new Set(eligible.slice(0, 20).map((site) => site.url)))}>Top 20</Button>
            <Button onClick={() => setSelected(new Set(eligible.slice(0, HISTORY_SELECTION_LIMIT).map((site) => site.url)))}>Top 100</Button>
            <Button onClick={() => setSelected(new Set())}>Clear selection</Button>
          </div>
          <p className="text-sm text-violet-200">{selected.size} selected · Maximum 100 per import</p>
          <div className="grid gap-2">
            {visible.map((site) => <div key={site.url} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.025] p-3">
              <input type="checkbox" aria-label={`Select ${site.url}`} checked={selected.has(site.url)} disabled={existing.has(site.url) || (!selected.has(site.url) && selected.size >= HISTORY_SELECTION_LIMIT)} onChange={(event) => setSelected((previous) => { const next = new Set(previous); if (event.target.checked) next.add(site.url); else next.delete(site.url); return next; })} className="size-4 shrink-0 accent-violet-400" />
              <div className="min-w-0 flex-1"><Input aria-label={`Label for ${site.url}`} maxLength={120} value={labels[site.url] ?? site.label} disabled={existing.has(site.url)} onChange={(event) => setLabels((previous) => ({ ...previous, [site.url]: event.target.value }))} /><p className="mt-1 break-all text-xs text-slate-400">{site.url}</p></div>
              <div className="shrink-0 text-right text-xs text-slate-400"><p>{existing.has(site.url) ? "Already linked" : `Score ${site.score}`}</p><p>{site.pages} pages</p></div>
            </div>)}
          </div>
          {filtered.length > 20 && <div className="flex items-center justify-between"><Button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous sites</Button><span className="text-xs text-slate-400">Page {page + 1} of {Math.ceil(filtered.length / 20)}</span><Button disabled={(page + 1) * 20 >= filtered.length} onClick={() => setPage(page + 1)}>Next sites</Button></div>}
          <div className="grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
            <Field label="Destination tab"><Select value={target} onChange={(event) => setTarget(event.target.value)}><option value="new">Create a new tab</option>{draft.tabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}</Select></Field>
            {target === "new" && <Field label="New tab name"><Input maxLength={80} value={tabName} onChange={(event) => setTabName(event.target.value)} /></Field>}
            <Field label="Imported card layout"><Select value={layout} onChange={(event) => setLayout(event.target.value as Layout["type"])}><option value="grid">Horizontal cards</option><option value="tiles">Icon tiles</option><option value="list">Compact list</option></Select></Field>
          </div>
          <p className="text-xs text-slate-400">Creates new sections with up to 12 cards each. Colors inherit from this homepage and the destination tab.</p>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} className="size-4 accent-violet-400" />Open the destination tab by default</label>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={fetchDetails} onChange={(event) => setFetchDetails(event.target.checked)} className="size-4 accent-violet-400" />Fetch site titles and icons</label>
          {fetchDetails && <div className="grid gap-3 rounded-xl border border-amber-200/15 p-3 text-xs text-slate-400"><p>Only selected site homepage URLs will be sent to your Chroma server, which visits those sites. No raw history is sent. Icons are saved locally; unavailable sites keep their fallback details. Edited labels are preserved.</p><label className="flex items-center gap-3"><input type="checkbox" checked={allowLocal} onChange={(event) => setAllowLocal(event.target.checked)} className="size-4 accent-violet-400" />Allow local network discovery</label></div>}
        </fieldset>
      </>}
      {staged && <div className="grid gap-3 rounded-xl border border-violet-300/20 p-4"><h3 className="font-semibold">Site details ready</h3><p className="text-xs text-slate-400">{staged.failed} sites had missing or unavailable details. Review the names below before adding them.</p>{staged.links.map((link) => <div key={link.url} className="flex items-center gap-3 text-sm"><VisualIcon icon={link.icon ?? "lucide:globe"} /><p>{link.label}<span className="ml-2 break-all text-xs text-slate-400">{link.url}</span></p></div>)}</div>}
    </div>
    <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-white/10 bg-[#10131e] p-4">
      {error && <p role="alert" className="max-h-24 w-full overflow-y-auto rounded-xl border border-rose-300/20 bg-rose-300/5 p-3 text-sm text-rose-200">{error}</p>}
      <Button onClick={onClose}>Cancel import</Button>
      {staged ? <Button onClick={() => apply(staged.links)} className="bg-violet-500/20">Add {staged.links.length} sites to draft</Button> : <Button disabled={busy || !selected.size || (target === "new" && !tabName.trim())} onClick={() => void prepareImport()} className="bg-violet-500/20"><Upload className="size-4" />{fetchDetails ? "Preview site details" : `Add ${selected.size} sites to draft`}</Button>}
    </div>
  </dialog>;
}
