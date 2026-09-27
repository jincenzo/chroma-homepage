import { CalendarDays, Check, Flag, KeyRound, MapPin, RefreshCw, Star, Trash2, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormulaOneCard } from "../../shared/config";
import type { FormulaOneStandings, FormulaOneWidget } from "../../shared/formula-one";
import { deleteFormulaOneApiKey, formulaOneCredentialStatus, loadFormulaOneDriverStandings, loadNextFormulaOneRace, saveFormulaOneApiKey } from "../lib/api";
import { Button, Field, Input, Select } from "./ui";
import { VisualIcon } from "./visual-icon";

const CREDENTIAL_EVENT = "chroma:formula-one-credential";

function countdown(date: string, now: number): string {
  const milliseconds = new Date(date).getTime() - now;
  if (milliseconds <= 0) return "Starting now";
  const minutes = Math.ceil(milliseconds / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h to lights out`;
  if (hours > 0) return `${hours}h ${minutes % 60}m to lights out`;
  return `${minutes}m to lights out`;
}

function LoadingState() {
  return <div className="chroma-f1-content grid h-full min-h-[112px] content-center gap-3" aria-label="Loading Formula 1 data">
    <div className="h-3 w-24 animate-pulse rounded-full bg-white/10" /><div className="h-6 w-4/5 animate-pulse rounded-lg bg-white/10" /><div className="h-3 w-2/3 animate-pulse rounded-full bg-white/10" />
  </div>;
}

function ErrorState({ card, error }: { card: FormulaOneCard; error: string }) {
  return <div className="chroma-f1-content flex h-full min-h-[112px] items-center gap-3">
    <span className="chroma-link-icon"><KeyRound className="size-[25px]" /></span>
    <span className="min-w-0"><span className="chroma-link-label block">{card.label}</span><span className="mt-1 block text-xs leading-relaxed text-slate-400">{error}</span></span>
  </div>;
}

function CardHeader({ card, badge }: { card: FormulaOneCard; badge: string }) {
  return <div className="flex items-start justify-between gap-3">
    <span className="flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase tracking-[.15em] text-[var(--card-accent)]"><VisualIcon icon={card.icon} className="size-5 shrink-0" />{card.label}</span>
    <span className="shrink-0 rounded-full border border-white/10 bg-white/6 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300">{badge}</span>
  </div>;
}

function NextRaceView({ card }: { card: FormulaOneCard }) {
  const [data, setData] = useState<FormulaOneWidget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let controller: AbortController | undefined;
    const load = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setLoading(true);
      loadNextFormulaOneRace(request.signal)
        .then((value) => { setData(value); setError(null); setNow(Date.now()); })
        .catch((cause: unknown) => { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load Formula 1 data."); })
        .finally(() => { if (!request.signal.aborted) setLoading(false); });
    };
    load();
    const refresh = window.setInterval(load, card.refreshMinutes * 60_000);
    window.addEventListener(CREDENTIAL_EVENT, load);
    return () => { controller?.abort(); window.clearInterval(refresh); window.removeEventListener(CREDENTIAL_EVENT, load); };
  }, [card.refreshMinutes]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!data && loading) return <LoadingState />;
  if (!data && error) return <ErrorState card={card} error={error} />;
  if (!data) return null;
  const place = [data.race.city, data.race.country].filter(Boolean).join(", ");
  const raceDate = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(data.race.date));
  return <div className="chroma-f1-content flex h-full min-h-[112px] flex-col justify-between gap-4">
    <CardHeader card={card} badge={data.race.status ?? "Scheduled"} />
    <div className="min-w-0">
      <p className="m-0 truncate text-lg font-extrabold tracking-tight text-white" title={data.race.name}>{data.race.name}</p>
      <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs font-medium text-slate-400"><MapPin className="size-3.5 shrink-0" />{data.race.circuit ?? (place || "Circuit to be announced")}{data.race.circuit && place ? ` · ${place}` : ""}</p>
    </div>
    <div className="grid grid-cols-[1fr_auto] items-end gap-3 border-t border-white/8 pt-3">
      <span className="min-w-0"><span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200"><CalendarDays className="size-3.5 text-[var(--card-accent)]" />{raceDate}</span><span className="mt-1 block text-[11px] text-slate-500">Your local time{data.source ? ` · ${data.source}` : ""}</span></span>
      <span className="flex items-center gap-1.5 text-right text-xs font-bold text-[var(--card-accent)]"><Flag className="size-3.5" />{countdown(data.race.date, now)}</span>
    </div>
  </div>;
}

function DriverDataView({ card }: { card: FormulaOneCard }) {
  const [data, setData] = useState<FormulaOneStandings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let controller: AbortController | undefined;
    const load = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setLoading(true);
      loadFormulaOneDriverStandings(request.signal)
        .then((value) => { setData(value); setError(null); })
        .catch((cause: unknown) => { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load Formula 1 standings."); })
        .finally(() => { if (!request.signal.aborted) setLoading(false); });
    };
    load();
    const refresh = window.setInterval(load, card.refreshMinutes * 60_000);
    return () => { controller?.abort(); window.clearInterval(refresh); };
  }, [card.refreshMinutes]);

  if (!data && loading) return <LoadingState />;
  if (!data && error) return <ErrorState card={card} error={error} />;
  if (!data) return null;

  if (card.view === "favorite-driver") {
    const driver = data.drivers.find((item) => item.id === card.driverId);
    if (!driver) return <div className="chroma-f1-content flex h-full min-h-[112px] flex-col justify-between gap-4">
      <CardHeader card={card} badge={data.season} />
      <div><p className="m-0 text-base font-bold text-white">Choose your favourite driver</p><p className="mt-1 text-xs leading-relaxed text-slate-400">Open this card in edit mode and select a driver.</p></div>
      <span className="text-[11px] text-slate-500">Standings · {data.source}</span>
    </div>;
    return <div className="chroma-f1-content flex h-full min-h-[112px] flex-col justify-between gap-4">
      <CardHeader card={card} badge={`${data.season} season`} />
      <div className="flex items-center justify-between gap-4">
        <span className="min-w-0"><span className="flex items-center gap-2"><Star className="size-4 fill-[var(--card-accent)] text-[var(--card-accent)]" /><span className="truncate text-lg font-extrabold text-white">{driver.givenName} {driver.familyName}</span></span><span className="mt-1 block truncate text-xs text-slate-400">{[driver.team, driver.nationality].filter(Boolean).join(" · ")}</span></span>
        <span className="shrink-0 text-right"><span className="block text-3xl font-black leading-none text-[var(--card-accent)]">P{driver.position}</span><span className="mt-1 block text-[10px] uppercase tracking-wider text-slate-500">Championship</span></span>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-white/8 pt-3 text-xs"><span className="text-slate-400"><strong className="mr-1 text-base text-white">{driver.points}</strong> points</span><span className="text-right text-slate-400"><strong className="mr-1 text-base text-white">{driver.wins}</strong> wins</span></div>
    </div>;
  }

  return <div className="chroma-f1-content flex h-full min-h-[112px] flex-col justify-between gap-3">
    <CardHeader card={card} badge={`${data.season} season`} />
    <div className="grid gap-1.5">{data.drivers.slice(0, card.driverCount).map((driver) => <div key={driver.id} className="grid grid-cols-[24px_1fr_auto] items-center gap-2 rounded-lg bg-white/[.035] px-2.5 py-1.5">
      <span className="text-center text-xs font-black text-[var(--card-accent)]">{driver.position}</span><span className="min-w-0 truncate text-xs font-semibold text-slate-100">{driver.givenName} {driver.familyName}<span className="ml-1.5 font-normal text-slate-500">{driver.team}</span></span><span className="text-xs font-bold text-slate-300">{driver.points} pts</span>
    </div>)}</div>
    <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><Trophy className="size-3 text-[var(--card-accent)]" />Driver championship · {data.source}</span>
  </div>;
}

export function FormulaOneCardView({ card }: { card: FormulaOneCard }) {
  return card.view === "next-race" ? <NextRaceView card={card} /> : <DriverDataView card={card} />;
}

const viewLabels: Record<FormulaOneCard["view"], string> = {
  "next-race": "Next F1 race",
  "driver-standings": "F1 championship leaders",
  "favorite-driver": "Favourite F1 driver"
};

export function FormulaOneCardEditor({ card, onChange }: { card: FormulaOneCard; onChange(card: FormulaOneCard): void }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [standings, setStandings] = useState<FormulaOneStandings | null>(null);
  const [standingsError, setStandingsError] = useState<string | null>(null);
  const update = (patch: Partial<FormulaOneCard>) => onChange({ ...card, ...patch });

  useEffect(() => { formulaOneCredentialStatus().then((status) => setConfigured(status.configured)).catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : "Could not check the API key.")); }, []);
  useEffect(() => {
    if (card.view !== "favorite-driver") return;
    const controller = new AbortController();
    loadFormulaOneDriverStandings(controller.signal).then((value) => { setStandings(value); setStandingsError(null); }).catch((cause: unknown) => { if (!controller.signal.aborted) setStandingsError(cause instanceof Error ? cause.message : "Could not load the drivers."); });
    return () => controller.abort();
  }, [card.view]);

  const saveKey = async () => {
    if (!apiKey.trim() || pending) return;
    setPending(true); setMessage(null);
    try {
      const status = await saveFormulaOneApiKey(apiKey);
      setConfigured(status.configured); setApiKey(""); setMessage("API key saved. Formula 1 data is refreshing.");
      window.dispatchEvent(new Event(CREDENTIAL_EVENT));
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not save the API key."); }
    finally { setPending(false); }
  };
  const removeKey = async () => {
    if (pending) return;
    setPending(true); setMessage(null);
    try {
      const status = await deleteFormulaOneApiKey();
      setConfigured(status.configured); setApiKey(""); setMessage("API key removed.");
      window.dispatchEvent(new Event(CREDENTIAL_EVENT));
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not remove the API key."); }
    finally { setPending(false); }
  };
  const changeView = (view: FormulaOneCard["view"]) => {
    const usesDefaultLabel = Object.values(viewLabels).includes(card.label);
    update({ view, label: usesDefaultLabel ? viewLabels[view] : card.label, driverId: view === "favorite-driver" ? card.driverId ?? standings?.drivers[0]?.id : card.driverId });
  };

  return <div className="grid gap-4">
    <Field label="Label"><Input value={card.label} onChange={(event) => update({ label: event.target.value })} /></Field>
    <Field label="Data shown"><Select value={card.view} onChange={(event) => changeView(event.target.value as FormulaOneCard["view"])}>
      <option value="next-race">Next race</option><option value="driver-standings">Championship leaders</option><option value="favorite-driver">Favourite driver</option>
    </Select></Field>
    {card.view === "driver-standings" && <Field label="Drivers shown"><Input type="number" min={1} max={30} step={1} value={card.driverCount} onChange={(event) => {
      const value = Number(event.target.value);
      if (Number.isInteger(value)) update({ driverCount: Math.max(1, Math.min(30, value)) });
    }} /></Field>}
    {card.view === "favorite-driver" && <Field label="Favourite driver"><Select value={card.driverId ?? ""} onChange={(event) => update({ driverId: event.target.value })} disabled={!standings}>
      <option value="">Select a driver</option>{standings?.drivers.map((driver) => <option key={driver.id} value={driver.id}>P{driver.position} · {driver.givenName} {driver.familyName}</option>)}
    </Select>{standingsError && <span className="mt-1 block text-xs text-rose-300">{standingsError}</span>}</Field>}
    <Field label="Refresh interval"><Select value={card.refreshMinutes} onChange={(event) => update({ refreshMinutes: Number(event.target.value) })}>
      <option value={30}>Every 30 minutes</option><option value={60}>Every hour</option><option value={180}>Every 3 hours</option><option value={360}>Every 6 hours</option>
    </Select></Field>
    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
      <div className="mb-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-semibold text-slate-200"><KeyRound className="size-4 text-[var(--card-accent)]" />API-Sports</span><span className={`flex items-center gap-1 text-[11px] ${configured ? "text-emerald-300" : "text-slate-500"}`}>{configured && <Check className="size-3" />}{configured === null ? "Checking…" : configured ? "Key saved" : "Not configured"}</span></div>
      <Field label={configured ? "Replace API key" : "API key"}><Input type="password" autoComplete="new-password" spellCheck={false} placeholder={configured ? "Enter a new key" : "Paste your API key"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveKey(); } }} /></Field>
      <div className="mt-3 flex gap-2"><Button disabled={pending || apiKey.trim().length < 8} onClick={() => void saveKey()} className="flex-1"><RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />{configured ? "Replace key" : "Save key"}</Button>{configured && <Button aria-label="Remove API key" title="Remove API key" disabled={pending} onClick={() => void removeKey()} className="px-2.5 text-rose-300"><Trash2 className="size-3.5" /></Button>}</div>
      {message && <p role="status" className="mt-2 text-xs leading-relaxed text-slate-400">{message}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">The optional key is encrypted on the Chroma server and is never added to homepage JSON or exports. Paid API-Sports access is preferred for race data; free plans and driver standings use Jolpica. <a href="https://dashboard.api-football.com/" target="_blank" rel="noreferrer" className="text-violet-300 hover:underline">API-Sports account</a></p>
    </div>
  </div>;
}
