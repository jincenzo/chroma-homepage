import { Download, History, Plus, Redo2, Save, Undo2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { MAX_BUNDLE_BYTES } from "../../shared/dashboard-bundle";
import { exportDashboardBundle, importDashboardBundle } from "../lib/api";
import { useEditorStore } from "../store/editor-store";
import { Button } from "./ui";
import { HistoryImporter } from "./history-importer";
import { SectionBentoStudio } from "./section-bento-studio";

export function EditorToolbar({ onSave, saving }: { onSave(): void; saving: boolean }) {
  const { draft, history, future, cancelEdit, undo, redo, addTab, addSection, addCard, replaceDraft } = useEditorStore();
  const mounted = useRef(true);
  const transfer = useRef<AbortController | null>(null);
  const [transferring, setTransferring] = useState<"export" | "import" | null>(null);
  const [transferMessage, setTransferMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [importingHistory, setImportingHistory] = useState(false);
  const [sectionStudioOpen, setSectionStudioOpen] = useState(false);
  const activeTabId = useEditorStore((state) => state.activeTabId);
  const tab = draft?.tabs.find((item) => item.id === activeTabId);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; transfer.current?.abort(); }; }, []);
  const exportConfig = async () => {
    if (!draft || transfer.current) return;
    const controller = new AbortController();
    transfer.current = controller;
    setTransferring("export"); setTransferMessage(null);
    try {
      const bundle = await exportDashboardBundle(draft, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      const url = URL.createObjectURL(bundle);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${draft.homepage.title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "chroma-homepage"}.zip`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setTransferMessage({ error: false, text: "ZIP exported with this draft’s uploaded images. API keys are excluded." });
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) setTransferMessage({ error: true, text: cause instanceof Error ? cause.message : "Export failed." });
    } finally { transfer.current = null; if (mounted.current) setTransferring(null); }
  };
  const importConfig = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file || transfer.current) return;
    if (file.size > MAX_BUNDLE_BYTES) { setTransferMessage({ error: true, text: "The import file exceeds 55 MB." }); input.value = ""; return; }
    const initialDraft = useEditorStore.getState().draft;
    const controller = new AbortController();
    transfer.current = controller;
    setTransferring("import"); setTransferMessage(null);
    try {
      const config = await importDashboardBundle(file, controller.signal);
      // A file read from a closed editor must never replace another profile's draft.
      if (!mounted.current || controller.signal.aborted || !useEditorStore.getState().editMode) return;
      if (useEditorStore.getState().draft !== initialDraft) throw new Error("Your draft changed during import. Please import again to avoid replacing newer edits.");
      replaceDraft(config);
      useEditorStore.getState().setActiveTab(config.homepage.defaultTabId);
      useEditorStore.getState().select(null);
      setTransferMessage({ error: false, text: "Dashboard imported into your draft. Press Save to keep it, or Undo/Cancel to discard the configuration change." });
    }
    catch (cause) { if (mounted.current && !controller.signal.aborted) setTransferMessage({ error: true, text: cause instanceof Error ? cause.message : "Import failed." }); }
    finally { transfer.current = null; if (mounted.current) setTransferring(null); input.value = ""; }
  };

  return <><div className="fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-360px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/12 bg-[#11131e]/90 p-2 shadow-2xl backdrop-blur-2xl">
    <Button onClick={onSave} disabled={saving || transferring === "import"} className="border-violet-400/30 bg-violet-500/25 text-white hover:bg-violet-500/35"><Save className="size-4" />{saving ? "Saving…" : "Save"}</Button>
    <Button onClick={cancelEdit}><X className="size-4" />Cancel</Button>
    <span className="mx-1 h-6 w-px bg-white/10" />
    <Button aria-label="Undo" title="Undo" onClick={undo} disabled={!history.length} className="size-9 px-0"><Undo2 className="size-4" /></Button>
    <Button aria-label="Redo" title="Redo" onClick={redo} disabled={!future.length} className="size-9 px-0"><Redo2 className="size-4" /></Button>
    <span className="mx-1 h-6 w-px bg-white/10" />
    <Button onClick={addTab}><Plus className="size-4" />Tab</Button>
    <Button onClick={addSection}><Plus className="size-4" />Section</Button>
    <Button disabled={!tab} onClick={() => setSectionStudioOpen(true)}>Arrange sections</Button>
    <Button onClick={() => addCard("link")} data-testid="add-card"><Plus className="size-4" />Link</Button>
    <Button onClick={() => addCard("formula-one")} data-testid="add-f1-card"><Plus className="size-4" />F1</Button>
    <Button onClick={() => addCard("gaming")} data-testid="add-gaming-card"><Plus className="size-4" />Gaming</Button>
    <Button onClick={() => addCard("motogp")} data-testid="add-motogp-card"><Plus className="size-4" />MotoGP</Button>
    <Button onClick={() => addCard("remote-data")} data-testid="add-remote-card"><Plus className="size-4" />Custom</Button>
    <span className="mx-1 h-6 w-px bg-white/10" />
    <Button onClick={() => void exportConfig()} disabled={!!transferring} aria-label="Export configuration" title="Export dashboard ZIP (includes images, excludes API keys)" className="size-9 px-0"><Download className={`size-4 ${transferring === "export" ? "animate-pulse" : ""}`} /></Button>
    <Button disabled={!!transferring} aria-label="Import configuration" title="Import dashboard ZIP or legacy JSON" className="relative size-9 overflow-hidden px-0"><Upload className={`size-4 ${transferring === "import" ? "animate-pulse" : ""}`} /><input aria-label="Dashboard ZIP or JSON file" disabled={!!transferring} type="file" accept="application/zip,.zip,application/json,.json" className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => void importConfig(event)} /></Button>
    <Button aria-label="Import HistoryOut" onClick={() => setImportingHistory(true)}><History className="size-4 shrink-0" />HistoryOut</Button>
    {(transferring || transferMessage) && <div role={transferMessage?.error ? "alert" : "status"} className={`flex w-full items-center justify-center gap-2 px-2 py-1 text-xs ${transferMessage?.error ? "text-rose-300" : "text-slate-400"}`}><span>{transferring ? transferring === "export" ? "Packing dashboard and images…" : "Restoring dashboard and images…" : transferMessage?.text}</span>{!transferring && <button type="button" aria-label="Dismiss transfer message" onClick={() => setTransferMessage(null)}><X className="size-3.5 shrink-0" /></button>}</div>}
  </div>{importingHistory && <HistoryImporter onClose={() => setImportingHistory(false)} />}{sectionStudioOpen && tab && <SectionBentoStudio key={tab.id} tab={tab} onClose={() => setSectionStudioOpen(false)} />}</>;
}
