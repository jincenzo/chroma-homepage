import { ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RemoteCard } from "../../shared/config";
import { remoteCredentialInputSchema, remoteRequestSchema, type RemoteBlock, type RemoteSettings, type RemoteWidget, type RemotePayload } from "../../shared/remote-card";
import { loadRemoteCard, remoteCredential, saveRemoteCredential } from "../lib/api";
import { findCard } from "../../shared/operations";
import { useEditorStore } from "../store/editor-store";
import { Button, Field, Input, Select } from "./ui";
import { VisualIcon } from "./visual-icon";

const tones = { neutral: "text-slate-200", success: "text-emerald-300", warning: "text-amber-300", danger: "text-rose-300", info: "text-sky-300" };
const bars = { neutral: "bg-slate-400", success: "bg-emerald-400", warning: "bg-amber-400", danger: "bg-rose-400", info: "bg-sky-400" };
const displayValue = (value: string | number, unit?: string) => `${value}${unit ? ` ${unit}` : ""}`;
const settingsFor = (card: RemoteSettings): RemoteSettings => ({ endpoint: card.endpoint, authMode: card.authMode, credentialId: card.credentialId, allowLocalNetwork: card.allowLocalNetwork, refreshSeconds: card.refreshSeconds });

function Block({ block }: { block: RemoteBlock }) {
  return <section className="grid min-w-0 gap-2" aria-label={block.title}>
    {block.title && <h4 className="m-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">{block.title}</h4>}
    {block.type === "text" && <p className="m-0 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-300">{block.text}</p>}
    {block.type === "metrics" && <dl className="remote-metrics m-0 grid grid-cols-2 gap-2">{block.items.map((item, index) => <div key={index} className="remote-metric min-w-0 rounded-lg bg-white/[.035] p-2.5"><dt className="break-words text-[10px] text-slate-400">{item.label}</dt><dd className={`m-0 mt-1 break-words text-lg font-semibold ${tones[item.tone]}`}>{displayValue(item.value, item.unit)}</dd></div>)}</dl>}
    {block.type === "progress" && <div className="grid gap-2"><div className="flex flex-wrap justify-between gap-2 text-xs"><span className="break-words text-slate-300">{block.label}</span><strong className={tones[block.tone]}>{displayValue(block.value, block.unit)} / {displayValue(block.max, block.unit)}</strong></div><div role="progressbar" aria-label={block.label} aria-valuemin={0} aria-valuemax={block.max} aria-valuenow={block.value} className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${bars[block.tone]}`} style={{ width: `${block.value / block.max * 100}%` }} /></div></div>}
    {block.type === "list" && <dl className="remote-list m-0 grid gap-1.5">{block.items.map((item, index) => <div key={index} className="remote-list-item grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 rounded-lg bg-white/[.025] px-2.5 py-2 text-xs"><dt className="break-words text-slate-400">{item.label}</dt><dd className={`m-0 break-words text-right font-medium ${tones[item.tone]}`}>{item.value}</dd>{item.description && <dd className="col-span-2 m-0 mt-1 break-words text-[10px] text-slate-500">{item.description}</dd>}</div>)}</dl>}
  </section>;
}

export function RemotePayloadView({ data, editing }: { data: RemotePayload; editing: boolean }) {
  return <div className="remote-payload grid min-w-0 gap-4">
    {data.blocks.map((block, index) => <Block key={index} block={block} />)}
    {!!data.actions.length && <div className="flex flex-wrap gap-2 border-t border-white/8 pt-3">{data.actions.map((action, index) => editing
      ? <span key={index} className="break-all text-xs text-[var(--card-accent)]">{action.label}</span>
      : <a key={index} href={action.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 break-all text-xs text-[var(--card-accent)] hover:underline">{action.label}<ExternalLink className="size-3 shrink-0" /></a>)}</div>}
    {data.updatedAt && <span className="text-[10px] text-slate-500">Source updated {new Date(data.updatedAt).toLocaleString()}</span>}
  </div>;
}

export function RemoteCardView({ card, editing }: { card: RemoteCard; editing: boolean }) {
  const settingsKey = JSON.stringify(settingsFor(card));
  const [state, setState] = useState<{ key: string; data?: RemoteWidget; error?: string }>({ key: settingsKey });
  useEffect(() => {
    let stopped = false;
    let controller: AbortController;
    let timer: number;
    let last: RemoteWidget | undefined;
    let failures = 0;
    const settings = JSON.parse(settingsKey) as RemoteSettings;
    const load = async () => {
      controller = new AbortController();
      let seconds = settings.refreshSeconds;
      try {
        const result = await loadRemoteCard(settings, controller.signal);
        if (stopped) return;
        last = result; failures = result.stale ? failures + 1 : 0;
        seconds = result.nextRefreshSeconds;
        setState({ key: settingsKey, data: result, error: result.error });
      } catch (cause) {
        if (stopped) return;
        failures++;
        seconds = Math.max(seconds, Math.min(900, 30 * 2 ** Math.min(failures - 1, 5)));
        setState({ key: settingsKey, data: last, error: cause instanceof Error ? cause.message : "Could not load the custom card." });
      }
      if (!stopped) timer = window.setTimeout(() => void load(), Math.max(30, seconds) * 1000);
    };
    // Small debounce avoids sending partial endpoint URLs while the editor is typing.
    timer = window.setTimeout(() => void load(), 350);
    return () => { stopped = true; controller?.abort(); window.clearTimeout(timer); };
  }, [settingsKey]);
  const current = state.key === settingsKey ? state : undefined;
  const result = current?.data;
  return <div className="remote-card-content grid min-h-[130px] min-w-0 gap-4" data-testid="remote-card-content">
    <div className="flex flex-wrap items-start justify-between gap-2"><span className="flex min-w-0 items-center gap-2 break-words text-[11px] font-bold uppercase tracking-wider text-[var(--card-accent)]"><VisualIcon icon={card.icon} className="size-5 shrink-0" />{card.label}</span>{result?.data.status && <span className={`max-w-full break-words rounded-full bg-white/6 px-2 py-1 text-[10px] ${tones[result.data.status.tone]}`}>{result.data.status.label}</span>}</div>
    {!result && !current?.error && <span role="status" className="animate-pulse text-xs text-slate-400">Loading custom card…</span>}
    {current?.error && <p role="status" className="m-0 break-words text-xs leading-relaxed text-amber-200">{result && "Stale — showing last valid data. "}{current.error}</p>}
    {result && <><RemotePayloadView data={result.data} editing={editing} /><span className="text-[10px] text-slate-500">Last success {new Date(result.fetchedAt).toLocaleTimeString()}{result.stale ? " · Stale" : ` · ${result.cache}`}{card.endpoint === "demo:house" && " · Mock data"}</span></>}
  </div>;
}

export function RemoteCardEditor({ card, onChange }: { card: RemoteCard; onChange(card: RemoteCard): void }) {
  const [secret, setSecret] = useState("");
  const [credentialStatus, setCredentialStatus] = useState<{ id?: string; configured: boolean }>({ configured: false });
  const configured = !!card.credentialId && credentialStatus.id === card.credentialId && credentialStatus.configured;
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ key: string; text: string }>();
  const [testResult, setTestResult] = useState<{ key: string; data: RemoteWidget }>();
  const request = useRef<AbortController | null>(null);
  const sourceKey = JSON.stringify([card.id, settingsFor(card)]);
  const message = feedback?.key === sourceKey ? feedback.text : undefined;
  const preview = testResult?.key === sourceKey ? testResult.data : undefined;
  const setMessage = (text?: string) => setFeedback(text ? { key: sourceKey, text } : undefined);
  const setPreview = (data?: RemoteWidget) => setTestResult(data ? { key: sourceKey, data } : undefined);
  useEffect(() => {
    const controller = new AbortController();
    if (card.credentialId) remoteCredential(card.credentialId, "GET", controller.signal).then((status) => { if (!controller.signal.aborted) setCredentialStatus({ id: card.credentialId, configured: status.configured }); }).catch(() => { if (!controller.signal.aborted) setCredentialStatus({ id: card.credentialId, configured: false }); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [card.credentialId, sourceKey]);
  const update = (patch: Partial<RemoteCard>) => { setPreview(undefined); setMessage(undefined); onChange({ ...card, ...patch }); };
  const active = (controller: AbortController) => {
    const draft = useEditorStore.getState().draft;
    const location = draft && findCard(draft, card.id);
    const actual = location && draft!.tabs[location.tabIndex].sections[location.sectionIndex].cards[location.cardIndex];
    return !controller.signal.aborted && actual?.type === "remote-data" && JSON.stringify(settingsFor(actual)) === JSON.stringify(settingsFor(card)) ? actual : undefined;
  };
  const run = async (task: (controller: AbortController) => Promise<void>) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller; setBusy(true); setMessage(undefined);
    try { await task(controller); }
    catch (cause) { if (!controller.signal.aborted) setMessage(cause instanceof Error ? cause.message : "Request failed."); }
    finally { if (request.current === controller) { request.current = null; setBusy(false); } }
  };
  return <div className="grid gap-4">
    <Field label="Label"><Input value={card.label} onChange={(event) => update({ label: event.target.value })} /></Field>
    <Field label="JSON endpoint"><Input value={card.endpoint} placeholder="https://your-service.example/chroma-card" onChange={(event) => { setSecret(""); update({ endpoint: event.target.value, credentialId: undefined }); }} /></Field>
    <Button disabled={busy} onClick={() => { setSecret(""); update({ endpoint: "demo:house", authMode: "none", credentialId: undefined, allowLocalNetwork: false }); }}>Use house demo</Button>
    <label className="flex items-center justify-between gap-3 text-xs text-slate-300"><span>Allow local network</span><input type="checkbox" checked={card.allowLocalNetwork} onChange={(event) => update({ allowLocalNetwork: event.target.checked })} className="size-4 accent-violet-500" /></label>
    <Field label="Refresh seconds"><Input type="number" min={30} max={86400} value={card.refreshSeconds} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value)) update({ refreshSeconds: Math.max(30, Math.min(86400, value)) }); }} /></Field>
    <Field label="Endpoint authentication"><Select value={card.authMode} onChange={(event) => { setSecret(""); update({ authMode: event.target.value as RemoteCard["authMode"], credentialId: undefined }); }}><option value="none">None</option><option value="bearer">Bearer token</option><option value="api-key">X-API-Key</option></Select></Field>
    {card.authMode !== "none" && <div className="grid gap-3 rounded-xl border border-white/10 p-3">
      <span className="text-xs text-slate-400">{configured ? "Credential configured (encrypted)" : "No credential configured for this endpoint"}</span>
      <Field label="Endpoint secret"><Input type="password" autoComplete="new-password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={configured ? "Enter a replacement token" : "Paste your token"} /></Field>
      <Button disabled={busy || !secret} onClick={() => void run(async (controller) => {
        const input = remoteCredentialInputSchema.safeParse({ endpoint: card.endpoint, authMode: card.authMode, secret });
        if (!input.success) throw new Error("Use an HTTP(S) endpoint and a token of 8–4096 printable characters without spaces.");
        const status = await saveRemoteCredential(input.data, controller.signal);
        const current = active(controller);
        if (!current) return;
        const updated = { ...current, credentialId: status.credentialId };
        setSecret(""); setCredentialStatus({ id: status.credentialId, configured: true }); onChange(updated);
        setFeedback({ key: JSON.stringify([card.id, settingsFor(updated)]), text: "Credential saved securely. Save the dashboard to keep its reference." });
      })}>{configured ? "Replace credential" : "Save credential"}</Button>
      {card.credentialId && <Button disabled={busy} onClick={() => void run(async (controller) => { await remoteCredential(card.credentialId!, "DELETE", controller.signal); const current = active(controller); if (!current) return; const updated = { ...current, credentialId: undefined }; setCredentialStatus({ configured: false }); onChange(updated); setFeedback({ key: JSON.stringify([card.id, settingsFor(updated)]), text: "Credential removed." }); })}>Remove credential</Button>}
      <p className="m-0 text-[10px] leading-relaxed text-slate-500">Keys are saved/removed immediately, outside Undo/Cancel. Only an opaque reference enters configuration or exports. Tokens are bound to the exact endpoint; changing it requires a new credential. Use HTTPS outside a trusted LAN.</p>
    </div>}
    <Button disabled={busy} onClick={() => void run(async (controller) => {
      const settings = remoteRequestSchema.safeParse(settingsFor(card));
      if (!settings.success) throw new Error("Enter a valid HTTP(S) URL or demo:house, and a refresh interval of at least 30 seconds.");
      const result = await loadRemoteCard(settings.data, controller.signal);
      if (!active(controller)) return;
      setPreview(result); setMessage(result.stale ? `Endpoint failed — stale data. ${result.error}` : `Valid chroma-card/v1 · ${result.cache} · Last success ${new Date(result.fetchedAt).toLocaleString()}`);
    })}><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />Test endpoint</Button>
    {message && <p role="status" className="m-0 break-words text-xs leading-relaxed text-slate-300">{message}</p>}
    {preview && <div className="grid gap-3 rounded-xl border border-white/10 p-3"><span className="text-xs font-semibold text-slate-300">Response preview</span><RemotePayloadView data={preview.data} editing /></div>}
    <p className="m-0 text-xs leading-relaxed text-slate-500">GET JSON through the Chroma server. Requires chroma-card/v1, no HTML or scripts. 64 KB / 5 second limits. The house demo is fake data. Protocol and field placement: docs/custom-card-protocol.md.</p>
  </div>;
}
