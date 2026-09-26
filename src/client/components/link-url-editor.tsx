import { useEffect, useState } from "react";
import type { LinkCard } from "../../shared/config";
import type { LinkPreview } from "../../shared/link-preview";
import { previewLink } from "../lib/api";
import { useEditorStore } from "../store/editor-store";
import { Button, Field, Input } from "./ui";
import { VisualIcon } from "./visual-icon";

type Lookup = { url: string; baseline: LinkCard };
type Status = { kind: "idle" | "loading" } | { kind: "error"; message: string } | { kind: "ready"; preview: LinkPreview; applied: boolean };

function validUrl(value: string): boolean {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

function currentCard(id: string): LinkCard | undefined {
  return useEditorStore.getState().draft?.tabs.flatMap((tab) => tab.sections).flatMap((section) => section.cards).find((card) => card.id === id);
}

function applyPreview(id: string, preview: LinkPreview, baseline?: LinkCard): boolean {
  const current = currentCard(id);
  if (!current || current.url !== preview.url) return false;
  const patch: Partial<LinkCard> = {};
  // Automatic discovery only fills untouched placeholders. Explicit Apply can replace them.
  if (!baseline || (["", "New link"].includes(baseline.label) && current.label === baseline.label)) patch.label = preview.title;
  if (preview.description && (!baseline || (!baseline.description && !current.description))) patch.description = preview.description;
  if (preview.icon && (!baseline || (current.icon.type === "iconify" && current.icon.value === "lucide:link"))) patch.icon = preview.icon;
  if (Object.keys(patch).length === 0) return false;
  useEditorStore.getState().updateDraft((draft) => {
    const target = draft.tabs.flatMap((tab) => tab.sections).flatMap((section) => section.cards).find((card) => card.id === id);
    if (target?.url === preview.url) Object.assign(target, patch);
  });
  return true;
}

export function LinkUrlEditor({ card, onUrlChange }: { card: LinkCard; onUrlChange(url: string): void }) {
  const [allowLocal, setAllowLocal] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  useEffect(() => {
    if (!lookup || !validUrl(lookup.url)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus({ kind: "loading" });
      try {
        const preview = await previewLink(lookup.url, allowLocal, controller.signal);
        if (controller.signal.aborted || currentCard(lookup.baseline.id)?.url !== lookup.url) return;
        const isNew = ["", "New link"].includes(lookup.baseline.label);
        const applied = isNew && applyPreview(lookup.baseline.id, preview, lookup.baseline);
        setStatus({ kind: "ready", preview, applied });
      } catch (error) {
        if (!controller.signal.aborted) setStatus({ kind: "error", message: error instanceof Error ? error.message : "Could not fetch site details." });
      }
    }, 700);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [lookup, allowLocal]);

  const discover = (url: string) => {
    setStatus({ kind: "idle" });
    setLookup({ url, baseline: structuredClone(card) });
  };
  return <div className="grid gap-3">
    <Field label="URL"><Input type="url" value={card.url} placeholder="https://your-service.example" onChange={(event) => {
      const url = event.target.value;
      onUrlChange(url);
      discover(url);
    }} /></Field>
    <p className="text-xs leading-relaxed text-slate-400">Paste a link to find its title and icon. New cards fill automatically; existing details stay yours until you apply a suggestion.</p>
    <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
      Allow local network
      <input type="checkbox" checked={allowLocal} onChange={(event) => {
        setAllowLocal(event.target.checked);
        discover(card.url);
      }} className="size-4 accent-violet-500" />
    </label>
    <Button disabled={!validUrl(card.url) || status.kind === "loading"} onClick={() => discover(card.url)}>
      {status.kind === "loading" ? "Finding site details…" : "Find site details"}
    </Button>
    <div aria-live="polite">
      {status.kind === "error" && <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-relaxed text-amber-200">{status.message}</p>}
      {status.kind === "ready" && status.preview.url === card.url && <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-3">
          {status.preview.icon && <VisualIcon icon={status.preview.icon} className="size-9 shrink-0" />}
          <div className="min-w-0"><p className="break-words text-sm font-semibold text-white">{status.preview.title}</p><p className="mt-1 text-xs text-slate-400">{status.preview.description}</p></div>
        </div>
        {status.applied && <p className="text-xs text-emerald-300">Added to your draft. Save when you are ready.</p>}
        {status.preview.warning && <p className="text-xs text-slate-400">{status.preview.warning}</p>}
        <Button onClick={() => { const applied = applyPreview(card.id, status.preview); setStatus({ ...status, applied }); }}>Use detected details</Button>
      </div>}
    </div>
  </div>;
}
