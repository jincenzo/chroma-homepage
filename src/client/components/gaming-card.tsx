import { ExternalLink, Gamepad2, Gift, KeyRound, Tag, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { GamingCard } from "../../shared/config";
import { gamingCountrySchema, type GamingShop, type GamingWidget } from "../../shared/gaming";
import { gamingCredential, loadGaming, loadGamingShops } from "../lib/api";
import { Button, Field, Input, Select } from "./ui";

const CREDENTIAL_EVENT = "chroma:gaming-credential";
const platforms: Record<GamingCard["platform"], string> = {
  pc: "All PC", steam: "Steam", "epic-games-store": "Epic Games Store", gog: "GOG", "drm-free": "DRM-free", itchio: "itch.io",
  ps5: "PlayStation 5", "xbox-series-xs": "Xbox Series X|S", switch: "Nintendo Switch", android: "Android", ios: "iOS"
};
const labels = { "free-games": "Free games", deals: "Gaming deals" };

function price(value: { amount: number; currency: string }) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: value.currency }).format(value.amount);
}

function GameImage({ url, free }: { url?: string; free: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className="relative flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--card-accent)]/10 text-[var(--card-accent)] sm:h-12 sm:w-20">
    {free ? <Gift className="size-5" /> : <Tag className="size-5" />}
    {url && !failed && <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" onError={() => setFailed(true)} />}
  </span>;
}

function GamingDataView({ card, editing }: { card: GamingCard; editing: boolean }) {
  const [data, setData] = useState<GamingWidget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { view, platform, country, refreshMinutes } = card;
  const shopsKey = card.shops.join(",");
  useEffect(() => {
    let controller: AbortController | undefined;
    const load = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      loadGaming({ view, platform, country, shops: shopsKey ? shopsKey.split(",").map(Number) : [] }, request.signal)
        .then((value) => { if (!request.signal.aborted) { setData(value); setError(null); } })
        .catch((cause: unknown) => { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load gaming data."); });
    };
    const credentialChanged = () => { setData(null); setError(null); load(); };
    load();
    const timer = window.setInterval(load, refreshMinutes * 60_000);
    window.addEventListener(CREDENTIAL_EVENT, credentialChanged);
    return () => { controller?.abort(); window.clearInterval(timer); window.removeEventListener(CREDENTIAL_EVENT, credentialChanged); };
  }, [view, platform, country, refreshMinutes, shopsKey]);

  return <div className="flex min-h-[150px] flex-col gap-3" data-testid="gaming-content">
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--card-accent)]"><Gamepad2 className="size-5 shrink-0" /><span className="truncate">{card.label}</span></span>
      <span className="shrink-0 rounded-full bg-white/6 px-2 py-1 text-[10px] font-bold text-slate-300">{view === "free-games" ? "FREE TO CLAIM" : country}</span>
    </div>
    {!data && !error && <p role="status" className="animate-pulse text-xs text-slate-400">Finding games…</p>}
    {error && <p role="status" className="m-0 text-xs leading-relaxed text-amber-200">{data ? "Showing previously loaded offers. " : ""}{error}</p>}
    {data && <>
      {data.items.length === 0 && <p className="text-xs text-slate-400">No active {view === "free-games" ? "giveaways for this platform" : "offers for this country and store selection"}. Check back later.</p>}
      <div className="gaming-items grid gap-1.5">{data.items.slice(0, card.gameCount).map((game) => {
        const content = <>
          <GameImage key={game.imageUrl ?? "no-image"} url={game.imageUrl} free={view === "free-games"} />
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-100" title={game.title}>{game.title}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{game.detail}</span>{game.voucher && <span className="mt-0.5 block text-[10px] text-amber-200">Code: {game.voucher}</span>}</span>
          <span className="shrink-0 text-right"><span className="block text-xs font-bold text-[var(--card-accent)]">{game.price ? price(game.price) : "Free"}</span>{game.regular && game.price && game.regular.amount > game.price.amount && <span className="block text-[10px] text-slate-500 line-through">{price(game.regular)}</span>}{!!game.discount && <span className="block text-[10px] font-semibold text-slate-300">−{game.discount}%</span>}</span>
        </>;
        const className = "flex min-w-0 items-center gap-2 rounded-xl bg-white/[.035] px-2.5 py-2";
        return editing ? <div key={game.id} className={className}>{content}</div> : <a key={game.id} href={game.url} target="_blank" rel="noreferrer" className={`${className} transition hover:bg-white/10 focus-visible:outline focus-visible:outline-violet-400`}>{content}</a>;
      })}</div>
      <div className="flex flex-wrap items-center justify-between gap-1 border-t border-white/8 pt-2 text-[10px] text-slate-500">
        {editing ? <span>{data.source}</span> : <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-slate-300">{data.source}<ExternalLink className="size-2.5" /></a>}
        <span title={new Date(data.updatedAt).toLocaleString()}>Updated {new Date(data.updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <span className="text-[10px] leading-relaxed text-slate-500">{view === "free-games" ? "Check redemption requirements and availability before claiming." : "Prices and availability can change. Verify at checkout."}</span>
    </>}
  </div>;
}

export function GamingCardView({ card, editing }: { card: GamingCard; editing: boolean }) {
  return <GamingDataView key={`${card.view}:${card.platform}:${card.country}:${card.shops.join(",")}`} card={card} editing={editing} />;
}

function GamingStorePicker({ country, selected, onChange }: { country: GamingCard["country"]; selected: number[]; onChange(ids: number[]): void }) {
  const [shops, setShops] = useState<GamingShop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadGamingShops(country, controller.signal).then((value) => {
      if (!controller.signal.aborted) { setShops(value); setError(null); }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load stores."); });
    return () => controller.abort();
  }, [country, attempt]);
  const unavailable = selected.filter((id) => !shops?.some((shop) => shop.id === id));
  const choices = [...(shops ?? []), ...unavailable.map((id) => ({ id, title: `Store #${id}${shops ? " · unavailable in this country" : " · saved selection"}` }))];
  return <fieldset className="min-w-0 rounded-xl border border-white/10 p-3">
    <legend className="px-1 text-xs font-medium text-slate-400">Stores</legend>
    <label className="flex items-center gap-2 text-xs text-slate-200"><input type="checkbox" checked={!selected.length} onChange={() => onChange([])} className="accent-violet-500" />All stores</label>
    <p className="my-2 text-[11px] leading-relaxed text-slate-500">{selected.length ? `${selected.length} selected. Only offers from these stores.` : "No selection means all stores. Select one or more below to filter."}</p>
    {!shops && !error && <p role="status" className="text-xs text-slate-400">Loading stores…</p>}
    {error && <div role="status" className="my-2 text-xs text-amber-200">{error}<Button className="mt-2" onClick={() => setAttempt((value) => value + 1)}>Retry stores</Button></div>}
    {!!choices.length && <>
      <Input aria-label="Search stores" placeholder="Search stores…" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="mt-2 grid max-h-44 gap-1 overflow-y-auto">{choices.filter((shop) => shop.title.toLowerCase().includes(search.toLowerCase())).map((shop) => <label key={shop.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-xs text-slate-300 hover:bg-white/5">
        <input type="checkbox" checked={selected.includes(shop.id)} disabled={!selected.includes(shop.id) && selected.length >= 100} onChange={(event) => onChange(event.target.checked ? [...selected, shop.id].sort((a, b) => a - b) : selected.filter((id) => id !== shop.id))} className="accent-violet-500" /><span>{shop.title}</span>
      </label>)}</div>
    </>}
    {shops?.length === 0 && <p className="text-xs text-slate-400">No stores available for this country.</p>}
  </fieldset>;
}

function GamingKeyEditor() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    gamingCredential().then((status) => { if (active) setConfigured(status.configured); }).catch(() => { if (active) setMessage("Could not check the saved key."); });
    return () => { active = false; };
  }, []);
  const changeKey = async (method: "PUT" | "DELETE") => {
    if (pending) return;
    setPending(true); setMessage(null);
    try {
      const status = await gamingCredential(method, apiKey);
      setConfigured(status.configured); setApiKey("");
      setMessage(method === "PUT" ? "Key stored. Loading offers will verify access." : "Key removed.");
      window.dispatchEvent(new Event(CREDENTIAL_EVENT));
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not update the key."); }
    finally { setPending(false); }
  };
  return <div className="rounded-xl border border-white/10 bg-black/15 p-3">
    <div className="mb-3 flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2 text-slate-200"><KeyRound className="size-4" />IsThereAnyDeal</span><span className={configured ? "text-emerald-300" : "text-slate-500"}>{configured === null ? "Checking…" : configured ? "Key saved" : "Not configured"}</span></div>
    <Field label={configured ? "Replace API key" : "API key"}><Input type="password" autoComplete="new-password" spellCheck={false} maxLength={256} placeholder={configured ? "Enter a new key" : "Paste your API key"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (apiKey.trim().length >= 8) void changeKey("PUT"); } }} /></Field>
    <div className="mt-3 flex gap-2"><Button disabled={pending || apiKey.trim().length < 8} onClick={() => void changeKey("PUT")} className="flex-1">{pending ? "Saving…" : configured ? "Replace key" : "Save key"}</Button>{configured && <Button aria-label="Remove gaming API key" disabled={pending} onClick={() => void changeKey("DELETE")} className="px-2.5 text-rose-300"><Trash2 className="size-3.5" /></Button>}</div>
    {message && <p role="status" className="mt-2 text-xs text-slate-400">{message}</p>}
    <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Encrypted on this server, shared by all Gaming cards, and never included in dashboard exports. Key changes apply immediately, even if you cancel editing. <a href="https://isthereanydeal.com/apps/" target="_blank" rel="noreferrer" className="text-violet-300 hover:underline">Get an API key</a></p>
  </div>;
}

export function GamingCardEditor({ card, onChange }: { card: GamingCard; onChange(card: GamingCard): void }) {
  const update = (patch: Partial<GamingCard>) => onChange({ ...card, ...patch });
  return <div className="grid gap-4">
    <Field label="Label"><Input value={card.label} onChange={(event) => update({ label: event.target.value })} /></Field>
    <Field label="Data shown"><Select value={card.view} onChange={(event) => {
      const view = event.target.value as GamingCard["view"];
      update({ view, label: Object.values(labels).includes(card.label) ? labels[view] : card.label });
    }}><option value="free-games">Free games · GamerPower</option><option value="deals">Deals · IsThereAnyDeal</option></Select></Field>
    {card.view === "free-games" ? <>
      <Field label="Platform"><Select value={card.platform} onChange={(event) => update({ platform: event.target.value as GamingCard["platform"] })}>{Object.entries(platforms).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></Field>
      <p className="m-0 text-xs leading-relaxed text-slate-400">Full-game giveaways, newest first. No API key needed. Powered by <a href="https://www.gamerpower.com/" target="_blank" rel="noreferrer" className="text-violet-300 hover:underline">GamerPower</a>.</p>
    </> : <><Field label="Store country"><Select value={card.country} onChange={(event) => update({ country: event.target.value as GamingCard["country"] })}>{gamingCountrySchema.options.map((country) => <option key={country} value={country}>{new Intl.DisplayNames(["en"], { type: "region" }).of(country)}</option>)}</Select></Field><GamingStorePicker key={card.country} country={card.country} selected={card.shops} onChange={(shops) => update({ shops })} /></>}
    <Field label="Games shown"><Input type="number" min={1} max={20} step={1} value={card.gameCount} onChange={(event) => {
      const value = Number(event.target.value);
      if (Number.isInteger(value)) update({ gameCount: Math.max(1, Math.min(20, value)) });
    }} /></Field>
    <Field label="Refresh interval"><Select value={card.refreshMinutes} onChange={(event) => update({ refreshMinutes: Number(event.target.value) })}>{[...new Set([30, 60, 180, 360, card.refreshMinutes])].sort((a, b) => a - b).map((minutes) => <option key={minutes} value={minutes}>Every {minutes} minutes</option>)}</Select></Field>
    {card.view === "deals" && <><p className="m-0 text-xs leading-relaxed text-slate-400">Offers ordered by highest discount, with store, regional price and any required voucher. May include DLC and bundles.</p><GamingKeyEditor /></>}
  </div>;
}
