import { Download, History, Plus, Redo2, Save, Undo2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { parseConfig } from "../../shared/config";
import { useEditorStore } from "../store/editor-store";
import { Button } from "./ui";
import { HistoryImporter } from "./history-importer";

export function EditorToolbar({ onSave, saving }: { onSave(): void; saving: boolean }) {
  const { draft, history, future, cancelEdit, undo, redo, addTab, addSection, addCard, replaceDraft } = useEditorStore();
  const mounted = useRef(true);
  const [importingHistory, setImportingHistory] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const exportConfig = () => {
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${draft.homepage.title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "chroma-homepage"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importConfig = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const config = parseConfig(JSON.parse(await file.text()));
      // A file read from a closed editor must never replace another profile's draft.
      if (mounted.current && useEditorStore.getState().editMode) replaceDraft(config);
    }
    catch { if (mounted.current) window.alert("The selected file is not a valid Chroma configuration."); }
    event.target.value = "";
  };

  return <><div className="fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-360px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/12 bg-[#11131e]/90 p-2 shadow-2xl backdrop-blur-2xl">
    <Button onClick={onSave} disabled={saving} className="border-violet-400/30 bg-violet-500/25 text-white hover:bg-violet-500/35"><Save className="size-4" />{saving ? "Saving…" : "Save"}</Button>
    <Button onClick={cancelEdit}><X className="size-4" />Cancel</Button>
    <span className="mx-1 h-6 w-px bg-white/10" />
    <Button aria-label="Undo" title="Undo" onClick={undo} disabled={!history.length} className="size-9 px-0"><Undo2 className="size-4" /></Button>
    <Button aria-label="Redo" title="Redo" onClick={redo} disabled={!future.length} className="size-9 px-0"><Redo2 className="size-4" /></Button>
    <span className="mx-1 h-6 w-px bg-white/10" />
    <Button onClick={addTab}><Plus className="size-4" />Tab</Button>
    <Button onClick={addSection}><Plus className="size-4" />Section</Button>
    <Button onClick={() => addCard("link")} data-testid="add-card"><Plus className="size-4" />Link</Button>
    <Button onClick={() => addCard("formula-one")} data-testid="add-f1-card"><Plus className="size-4" />F1</Button>
    <span className="mx-1 h-6 w-px bg-white/10" />
    <Button onClick={exportConfig} aria-label="Export configuration" title="Export configuration" className="size-9 px-0"><Download className="size-4" /></Button>
    <Button aria-label="Import configuration" title="Import configuration" className="relative size-9 overflow-hidden px-0"><Upload className="size-4" /><input type="file" accept="application/json,.json" className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => void importConfig(event)} /></Button>
    <Button aria-label="Import HistoryOut" onClick={() => setImportingHistory(true)}><History className="size-4 shrink-0" />HistoryOut</Button>
  </div>{importingHistory && <HistoryImporter onClose={() => setImportingHistory(false)} />}</>;
}
