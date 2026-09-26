import { Search } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(date);
}

export function SearchClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = String(data.get("q") ?? "").trim();
    if (query) window.location.assign(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  };

  return <>
    <form onSubmit={submit} role="search" className="chroma-search group flex min-w-0 items-center gap-3 px-3">
      <span className="chroma-search-icon"><Search className="size-[18px]" /></span>
      <input name="q" type="search" autoComplete="off" aria-label="Search Google" placeholder="Search Google…" className="h-11 min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-100 outline-none placeholder:text-slate-400" />
    </form>
    <div className="chroma-clock px-3 py-1 text-right" data-testid="header-clock">
      <time dateTime={now.toISOString()} className="block text-[23px] font-semibold leading-none tracking-tight text-slate-50 tabular-nums">{formatTime(now)}</time><p className="header-date mt-1 whitespace-nowrap text-[10px] font-medium text-slate-400">{formatDate(now)}</p>
    </div>
  </>;
}
