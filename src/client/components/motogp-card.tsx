import { CalendarDays, Flag, MapPin, Star, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import type { MotoGpCard } from "../../shared/config";
import { loadMotoGpNextRace, loadMotoGpStandings } from "../lib/api";
import { Field, Input, Select } from "./ui";
import { VisualIcon } from "./visual-icon";

function useMotoGpData<T>(loader: (signal?: AbortSignal) => Promise<T>, minutes: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let controller: AbortController | undefined;
    const load = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      loader(request.signal).then((value) => { if (!request.signal.aborted) { setData(value); setError(null); } })
        .catch((cause: unknown) => { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load MotoGP data."); });
    };
    load();
    const timer = window.setInterval(load, minutes * 60_000);
    return () => { controller?.abort(); window.clearInterval(timer); };
  }, [loader, minutes]);
  return { data, error };
}

function Header({ card, badge }: { card: MotoGpCard; badge: string }) {
  return <div className="flex items-start justify-between gap-3"><span className="flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--card-accent)]"><VisualIcon icon={card.icon} className="size-5 shrink-0" /><span>{card.label}</span></span><span className="shrink-0 rounded-full bg-white/6 px-2 py-1 text-[10px] text-slate-300">{badge}</span></div>;
}

function Notice({ error, stale = false }: { error: string; stale?: boolean }) {
  return <p role="status" className="m-0 text-xs leading-relaxed text-amber-200">{stale && "Showing previously loaded data. "}{error}</p>;
}

function Attribution({ editing, season }: { editing: boolean; season: number }) {
  const text = `© MotoGP Sports Entertainment Group, ${season} · MotoGP.com`;
  return editing ? <span className="text-[10px] text-slate-500">{text}</span> : <a href="https://www.motogp.com/en/" target="_blank" rel="noreferrer" className="text-[10px] text-slate-500 hover:text-slate-300">{text}</a>;
}

function countdown(date: string, now: number) {
  const minutes = Math.ceil((Date.parse(date) - now) / 60_000);
  if (minutes <= 0) return "Race start time reached";
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60);
  return days ? `${days}d ${hours}h to race` : hours ? `${hours}h ${minutes % 60}m to race` : `${minutes}m to race`;
}

function NextRace({ card, editing }: { card: MotoGpCard; editing: boolean }) {
  const { data, error } = useMotoGpData(loadMotoGpNextRace, card.refreshMinutes);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const race = data?.race;
  const day = (date: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return <div className="flex min-h-[130px] flex-col justify-between gap-4" data-testid="motogp-content">
    <Header card={card} badge={race?.status ?? "MotoGP"} />
    {error && <Notice error={error} stale={!!data} />}
    {!data && !error && <span role="status" className="animate-pulse text-xs text-slate-400">Loading MotoGP schedule…</span>}
    {data && !race && <p className="text-sm text-slate-300">No upcoming MotoGP Grand Prix has been published. Check back for the next calendar.</p>}
    {race && <>
      <div><p className="m-0 text-lg font-extrabold tracking-tight text-white">{race.name}</p><p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400"><MapPin className="size-3.5 shrink-0" />{[race.circuit, race.country].filter(Boolean).join(" · ")}</p></div>
      <div className="grid gap-2 border-t border-white/8 pt-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200"><CalendarDays className="size-3.5 shrink-0 text-[var(--card-accent)]" />{race.date ? new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(race.date)) : `${day(race.weekendStart)} – ${day(race.weekendEnd)}`}</span>
        <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--card-accent)]"><Flag className="size-3.5" />{race.status === "In progress" ? "Race in progress" : race.date ? countdown(race.date, now) : "Race start time to be confirmed"}</span>
        <span className="text-[10px] text-slate-500">{race.date ? "Your local time · Grand Prix, not Sprint" : "Race weekend · circuit-local dates"}</span>
      </div>
    </>}
    {data && <Attribution editing={editing} season={data.season} />}
  </div>;
}

function RiderView({ card, editing }: { card: MotoGpCard; editing: boolean }) {
  const { data, error } = useMotoGpData(loadMotoGpStandings, card.refreshMinutes);
  const rider = data?.riders.find((item) => item.id === card.riderId);
  return <div className="flex min-h-[130px] flex-col justify-between gap-3" data-testid="motogp-content">
    <Header card={card} badge={data ? String(data.season) : "MotoGP"} />
    {error && <Notice error={error} stale={!!data} />}
    {!data && !error && <span role="status" className="animate-pulse text-xs text-slate-400">Loading MotoGP standings…</span>}
    {data && (data.riders.length === 0 ? <p className="text-xs text-slate-400">Championship standings have not been published yet.</p> : card.view === "favorite-rider" ? rider ? <>
      <div className="flex items-center justify-between gap-3"><span className="min-w-0"><span className="flex items-center gap-2 text-lg font-bold text-white"><Star className="size-4 shrink-0 text-[var(--card-accent)]" />{rider.name}</span><span className="mt-1 block text-xs text-slate-400">{[rider.number !== undefined ? `#${rider.number}` : null, rider.team, rider.manufacturer].filter(Boolean).join(" · ")}</span></span><strong className="text-3xl text-[var(--card-accent)]">P{rider.position}</strong></div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-white/8 pt-3 text-xs text-slate-400"><span><strong className="text-white">{rider.points}</strong> points</span>{rider.raceWins !== undefined && <span><strong className="text-white">{rider.raceWins}</strong> GP wins</span>}{rider.sprintWins !== undefined && <span><strong className="text-white">{rider.sprintWins}</strong> Sprint wins</span>}</div>
    </> : <p className="text-xs text-slate-400">{card.riderId ? "Your selected rider is not in this season’s standings. Choose another rider in the card settings." : "Choose your favourite rider in the card settings."}</p> : <>
      <div className="motogp-standings-list grid gap-1.5">{data.riders.slice(0, card.riderCount).map((item) => <div key={item.id} className="grid grid-cols-[24px_1fr_auto] items-center gap-2 rounded-lg bg-white/[.035] px-2.5 py-2"><span className="text-center text-xs font-black text-[var(--card-accent)]">{item.position}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-100">{item.name}</span><span className="block truncate text-[10px] text-slate-500">{item.team}</span></span><span className="text-xs font-bold text-slate-300">{item.points} pts</span></div>)}</div>
      <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><Trophy className="size-3" />Rider championship · GP + Sprint points</span>
    </>)}
    {data && <Attribution editing={editing} season={data.season} />}
  </div>;
}

export function MotoGpCardView({ card, editing }: { card: MotoGpCard; editing: boolean }) {
  return card.view === "next-race" ? <NextRace card={card} editing={editing} /> : <RiderView card={card} editing={editing} />;
}

const labels = { "next-race": "Next MotoGP race", "rider-standings": "MotoGP championship leaders", "favorite-rider": "Favourite MotoGP rider" };

function RiderPicker({ card, onChange }: { card: MotoGpCard; onChange(card: MotoGpCard): void }) {
  const { data, error } = useMotoGpData(loadMotoGpStandings, card.refreshMinutes);
  return <><Field label="Favourite rider"><Select value={card.riderId ?? ""} disabled={!data} onChange={(event) => onChange({ ...card, riderId: event.target.value || undefined })}>
    <option value="">Select a rider</option>{card.riderId && !data?.riders.some((rider) => rider.id === card.riderId) && <option value={card.riderId}>Previously selected rider (unavailable)</option>}{data?.riders.map((rider) => <option key={rider.id} value={rider.id}>P{rider.position} · {rider.name}</option>)}
  </Select></Field>{error && <Notice error={error} />}</>;
}

export function MotoGpCardEditor({ card, onChange }: { card: MotoGpCard; onChange(card: MotoGpCard): void }) {
  const update = (patch: Partial<MotoGpCard>) => onChange({ ...card, ...patch });
  return <div className="grid gap-4">
    <Field label="Label"><Input value={card.label} onChange={(event) => update({ label: event.target.value })} /></Field>
    <Field label="Data shown"><Select value={card.view} onChange={(event) => {
      const view = event.target.value as MotoGpCard["view"];
      update({ view, label: Object.values(labels).includes(card.label) ? labels[view] : card.label });
    }}><option value="next-race">Next Grand Prix</option><option value="rider-standings">Championship leaders</option><option value="favorite-rider">Favourite rider</option></Select></Field>
    {card.view === "rider-standings" && <Field label="Riders shown"><Input type="number" min={1} max={30} step={1} value={card.riderCount} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value)) update({ riderCount: Math.max(1, Math.min(30, value)) }); }} /></Field>}
    {card.view === "favorite-rider" && <RiderPicker card={card} onChange={onChange} />}
    <Field label="Refresh interval"><Select value={card.refreshMinutes} onChange={(event) => update({ refreshMinutes: Number(event.target.value) })}>{[...new Set([30, 60, 180, 360, card.refreshMinutes])].sort((a, b) => a - b).map((minutes) => <option key={minutes} value={minutes}>Every {minutes} minutes</option>)}</Select></Field>
    <p className="m-0 rounded-xl border border-white/10 bg-black/15 p-3 text-xs leading-relaxed text-slate-400">No API key required. Uses MotoGP’s public calendar and standings feeds, cached for 30 minutes. This is not live timing. Public feeds can change or become unavailable. <a href="https://www.motogp.com/en/" target="_blank" rel="noreferrer" className="text-violet-300 hover:underline">MotoGP.com</a></p>
  </div>;
}
