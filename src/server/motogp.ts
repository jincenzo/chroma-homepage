import { z } from "zod";
import { motoGpNextRaceSchema, motoGpStandingsSchema, type MotoGpNextRace, type MotoGpStandings } from "../shared/motogp";

const BASE = "https://api.motogp.pulselive.com/motogp/v1";
const seasonSchema = z.object({ id: z.string().min(1), year: z.number().int().min(1949).max(9999), current: z.boolean() });
const optionalText = z.string().trim().min(1).optional().catch(undefined);
const optionalWins = z.number().int().nonnegative().optional().catch(undefined);
const broadcastSchema = z.object({
  shortname: z.string(), date_start: optionalText, status: optionalText,
  category: z.object({ acronym: z.string() }).nullable().optional()
});
const eventSchema = z.object({
  id: z.string(), name: z.string().trim().min(1), kind: z.string(), status: optionalText,
  date_start: z.string(), date_end: z.string(),
  circuit: z.object({ name: optionalText, country: optionalText }).nullable().optional(),
  broadcasts: z.array(z.unknown()).optional().default([])
});
const standingSchema = z.object({
  position: z.number().int().positive(), points: z.number().nonnegative(),
  rider: z.object({ id: z.string(), full_name: z.string().min(1), riders_api_uuid: optionalText, riders_id: optionalText,
    number: z.number().int().optional().catch(undefined), country: z.object({ name: optionalText }).optional() }),
  team: z.object({ name: optionalText }).nullable().optional(),
  constructor: z.object({ name: optionalText }).nullable().optional(),
  race_wins: optionalWins, sprint_wins: optionalWins
});

export class MotoGpError extends Error {
  constructor(message: string, public statusCode = 502) { super(message); }
}

/** Broadcast dates include real offsets; results-session dates can be local times labelled UTC. */
function instant(value?: string): string | undefined {
  if (!value || !/(Z|[+-]\d{2}:?\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return;
  return new Date(value).toISOString();
}

export class MotoGpService {
  private cache = new Map<string, { expires: number; result: Promise<unknown> }>();
  constructor(private fetcher: typeof fetch = fetch) {}

  private async seasons() {
    const seasons = z.array(seasonSchema).max(200).parse(await this.json("/results/seasons"));
    const current = seasons.find((season) => season.current) ?? seasons.find((season) => season.year === new Date().getUTCFullYear());
    if (!current) throw new MotoGpError("The current MotoGP season is not available yet.", 503);
    return { current, seasons };
  }

  async nextRace(): Promise<MotoGpNextRace> {
    try {
      const { current, seasons } = await this.seasons();
      const nextSeason = seasons.find((season) => season.year === current.year + 1);
      for (const season of [current, ...(nextSeason ? [nextSeason] : [])]) {
        const raw = z.array(z.unknown()).max(200).parse(await this.json("/events", { seasonYear: String(season.year) }));
        const candidates: NonNullable<MotoGpNextRace["race"]>[] = [];
        for (const value of raw) {
          const parsed = eventSchema.safeParse(value);
          if (!parsed.success) continue;
          const event = parsed.data;
          if (event.kind !== "GP" || /FINISHED|CANCELLED|CANCELED/.test(event.status ?? "")) continue;
          const end = instant(event.date_end), start = instant(event.date_start);
          if (!end || !start || Date.parse(end) < Date.now()) continue;
          const session = event.broadcasts.flatMap((row) => {
            const result = broadcastSchema.safeParse(row);
            return result.success && result.data.shortname === "RAC" && result.data.category?.acronym === "MGP" ? [result.data] : [];
          })[0];
          if (session && /FINISHED|CANCELLED|CANCELED/.test(session.status ?? "")) continue;
          const date = instant(session?.date_start);
          const live = session?.status === "IN-PROGRESS" || session?.status === "ONGOING";
          if (date && Date.parse(date) < Date.now() && !live) continue;
          candidates.push({ id: event.id, name: event.name, circuit: event.circuit?.name, country: event.circuit?.country,
            weekendStart: event.date_start.slice(0, 10), weekendEnd: event.date_end.slice(0, 10), date,
            status: live ? "In progress" : date ? "Scheduled" : "Time TBC" });
        }
        candidates.sort((a, b) => (a.date ?? a.weekendStart).localeCompare(b.date ?? b.weekendStart));
        if (candidates[0]) return motoGpNextRaceSchema.parse({ season: season.year, race: candidates[0], fetchedAt: new Date().toISOString(), source: "MotoGP" });
      }
      return { season: current.year, race: null, fetchedAt: new Date().toISOString(), source: "MotoGP" };
    } catch (error) { throw this.safeError(error); }
  }

  async standings(): Promise<MotoGpStandings> {
    try {
      const { current } = await this.seasons();
      const categories = z.array(z.object({ id: z.string(), name: z.string(), legacy_id: z.number().optional() })).parse(await this.json("/results/categories", { seasonUuid: current.id }));
      const category = categories.find((item) => item.legacy_id === 3 || /^MotoGP[™®]?$/.test(item.name));
      if (!category) throw new MotoGpError("MotoGP rider standings are not available yet.", 503);
      const body = z.object({ classification: z.array(z.unknown()).max(100) }).parse(await this.json("/results/standings", { seasonUuid: current.id, categoryUuid: category.id }));
      const seen = new Set<string>();
      const riders = body.classification.flatMap((value) => {
        const result = standingSchema.safeParse(value);
        if (!result.success) return [];
        const row = result.data, rider = row.rider;
        const id = rider.riders_api_uuid ?? rider.riders_id ?? rider.id;
        if (seen.has(id)) return [];
        seen.add(id);
        return [{ id, name: rider.full_name, number: rider.number, nationality: rider.country?.name, team: row.team?.name,
          manufacturer: row.constructor?.name, position: row.position, points: row.points, raceWins: row.race_wins, sprintWins: row.sprint_wins }];
      }).sort((a, b) => a.position - b.position);
      if (body.classification.length && !riders.length) throw new MotoGpError("MotoGP returned unreadable rider standings.");
      return motoGpStandingsSchema.parse({ season: current.year, riders, fetchedAt: new Date().toISOString(), source: "MotoGP" });
    } catch (error) { throw this.safeError(error); }
  }

  private safeError(error: unknown) {
    return error instanceof MotoGpError ? error : new MotoGpError("MotoGP data is temporarily unavailable. Please try again later.");
  }

  private json(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(BASE + path);
    url.search = new URLSearchParams(params).toString();
    const key = url.toString();
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.result;
    if (this.cache.size >= 32) this.cache.delete(this.cache.keys().next().value!);
    const entry = { expires: Date.now() + 30 * 60_000, result: this.fetchJson(url).catch((error: unknown) => {
      entry.expires = Date.now() + 60_000;
      throw this.safeError(error);
    }) };
    this.cache.set(key, entry);
    return entry.result;
  }

  private async fetchJson(url: URL): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await this.fetcher(url, { headers: { accept: "application/json" }, signal: controller.signal, redirect: "error" });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new MotoGpError(response.status === 429 ? "MotoGP’s request limit was reached. Please try again later." : "MotoGP data is temporarily unavailable.", response.status === 429 ? 429 : 502);
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2 * 1024 * 1024) throw new MotoGpError("MotoGP returned too much data.");
          chunks.push(value);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } finally { await reader.cancel().catch(() => {}); }
    } finally { clearTimeout(timer); }
  }
}
