import type { FormulaOneStandings, FormulaOneWidget } from "../shared/formula-one";
import { SecretRepository } from "./secrets";

const API_URL = "https://v1.formula-1.api-sports.io/races";
const JOLPICA_URL = "https://api.jolpi.ca/ergast/f1/current/next.json";
const JOLPICA_STANDINGS_URL = "https://api.jolpi.ca/ergast/f1/current/driverstandings.json";
const SECRET_NAME = "api-sports-formula-one";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const CACHE_MILLISECONDS = 30 * 60 * 1000;

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class FormulaOneError extends Error {
  constructor(message: string, readonly statusCode: number) { super(message); }
}

interface CacheEntry { expiresAt: number; value: FormulaOneWidget }
interface StandingsCacheEntry { expiresAt: number; value: FormulaOneStandings }

export class FormulaOneService {
  private readonly cache = new Map<string, CacheEntry>();
  private standingsCache: StandingsCacheEntry | undefined;

  constructor(private readonly secrets: SecretRepository, private readonly fetcher: Fetcher = fetch) {}

  async configured(): Promise<boolean> { return this.secrets.has(SECRET_NAME); }

  async setApiKey(apiKey: string): Promise<void> {
    await this.secrets.set(SECRET_NAME, apiKey);
    this.cache.clear();
    this.standingsCache = undefined;
  }

  async deleteApiKey(): Promise<void> {
    await this.secrets.delete(SECRET_NAME);
    this.cache.clear();
    this.standingsCache = undefined;
  }

  async nextRace(): Promise<FormulaOneWidget> {
    const cached = this.cache.get("next");
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const apiKey = await this.secrets.get(SECRET_NAME);
    let value: FormulaOneWidget | undefined;
    if (apiKey) {
      try { value = await this.nextRaceFromApiSports(apiKey); }
      catch (error) { if (!(error instanceof FormulaOneError)) throw error; }
    }
    value ??= await this.nextRaceFromJolpica();
    this.cache.set("next", { value, expiresAt: Date.now() + CACHE_MILLISECONDS });
    return value;
  }

  async driverStandings(): Promise<FormulaOneStandings> {
    if (this.standingsCache && this.standingsCache.expiresAt > Date.now()) return this.standingsCache.value;
    const body = await this.fetchJson(JOLPICA_STANDINGS_URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) }, "Jolpica F1");
    const value = normalizeJolpicaStandings(body);
    this.standingsCache = { value, expiresAt: Date.now() + CACHE_MILLISECONDS };
    return value;
  }

  private async nextRaceFromApiSports(apiKey: string): Promise<FormulaOneWidget> {
    const url = new URL(API_URL);
    url.searchParams.set("next", "1");
    url.searchParams.set("type", "Race");
    url.searchParams.set("timezone", "UTC");
    const body = await this.fetchJson(url, {
        headers: { accept: "application/json", "x-apisports-key": apiKey },
        signal: AbortSignal.timeout(8000)
      }, "API-Sports");
    const providerError = readProviderError(body);
    if (providerError) throw new FormulaOneError(providerError, 502);
    const record = readFirstRace(body);
    return normalizeApiSportsRace(record);
  }

  private async nextRaceFromJolpica(): Promise<FormulaOneWidget> {
    const body = await this.fetchJson(JOLPICA_URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) }, "Jolpica F1");
    return normalizeJolpicaRace(body);
  }

  private async fetchJson(url: string | URL, init: RequestInit, provider: string): Promise<unknown> {
    let response: Response;
    try { response = await this.fetcher(url, init); }
    catch { throw new FormulaOneError(`${provider} could not be reached.`, 502); }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw new FormulaOneError(`${provider} returned too much data.`, 502);
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new FormulaOneError(`${provider} returned too much data.`, 502);
    let body: unknown;
    try { body = JSON.parse(text); }
    catch { throw new FormulaOneError(`${provider} returned an invalid response.`, 502); }
    if (!response.ok) throw new FormulaOneError(`${provider} rejected the request.`, 502);
    return body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readProviderError(body: unknown): string | undefined {
  if (!isRecord(body)) return "The Formula 1 provider returned an invalid response.";
  const errors = body.errors;
  if (Array.isArray(errors) && errors.length) return "The Formula 1 provider reported an error. Check your API key and subscription.";
  if (typeof errors === "string" && errors) return "The Formula 1 provider reported an error. Check your API key and subscription.";
  if (isRecord(errors) && Object.keys(errors).length) return "The Formula 1 provider reported an error. Check your API key and subscription.";
}

function readFirstRace(body: unknown): Record<string, unknown> {
  if (!isRecord(body) || !Array.isArray(body.response) || !isRecord(body.response[0])) {
    throw new FormulaOneError("No upcoming Formula 1 race was found.", 404);
  }
  return body.response[0];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeApiSportsRace(record: Record<string, unknown>): FormulaOneWidget {
  const competition = isRecord(record.competition) ? record.competition : {};
  const location = isRecord(competition.location) ? competition.location : {};
  const circuit = isRecord(record.circuit) ? record.circuit : {};
  const id = typeof record.id === "number" || typeof record.id === "string" ? record.id : "next";
  const name = optionalString(competition.name) ?? "Formula 1 Grand Prix";
  const date = optionalString(record.date);
  if (!date || Number.isNaN(Date.parse(date))) throw new FormulaOneError("The next race has no valid start time.", 502);
  return {
    fetchedAt: new Date().toISOString(),
    source: "API-Sports",
    race: {
      id,
      name,
      date: new Date(date).toISOString(),
      circuit: optionalString(circuit.name),
      city: optionalString(location.city),
      country: optionalString(location.country),
      status: optionalString(record.status)
    }
  };
}

function normalizeJolpicaRace(body: unknown): FormulaOneWidget {
  if (!isRecord(body) || !isRecord(body.MRData) || !isRecord(body.MRData.RaceTable) || !Array.isArray(body.MRData.RaceTable.Races) || !isRecord(body.MRData.RaceTable.Races[0])) {
    throw new FormulaOneError("No upcoming Formula 1 race was found.", 404);
  }
  const record = body.MRData.RaceTable.Races[0];
  const circuit = isRecord(record.Circuit) ? record.Circuit : {};
  const location = isRecord(circuit.Location) ? circuit.Location : {};
  const date = optionalString(record.date);
  const time = optionalString(record.time) ?? "00:00:00Z";
  const startValue = date ? `${date}T${time}` : "";
  if (!startValue || Number.isNaN(Date.parse(startValue))) throw new FormulaOneError("The next race has no valid start time.", 502);
  const start = new Date(startValue).toISOString();
  return {
    fetchedAt: new Date().toISOString(),
    source: "Jolpica F1",
    race: {
      id: `${optionalString(record.season) ?? "current"}-${optionalString(record.round) ?? "next"}`,
      name: optionalString(record.raceName) ?? "Formula 1 Grand Prix",
      date: start,
      circuit: optionalString(circuit.circuitName),
      city: optionalString(location.locality),
      country: optionalString(location.country),
      status: "Scheduled"
    }
  };
}

function numericValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeJolpicaStandings(body: unknown): FormulaOneStandings {
  if (!isRecord(body) || !isRecord(body.MRData) || !isRecord(body.MRData.StandingsTable)) {
    throw new FormulaOneError("No Formula 1 driver standings were found.", 404);
  }
  const table = body.MRData.StandingsTable;
  const lists = table.StandingsLists;
  if (!Array.isArray(lists) || !isRecord(lists[0])) throw new FormulaOneError("No Formula 1 driver standings were found.", 404);
  const list = lists[0];
  if (!Array.isArray(list.DriverStandings)) throw new FormulaOneError("No Formula 1 driver standings were found.", 404);
  const drivers = list.DriverStandings.flatMap((value, index) => {
    if (!isRecord(value) || !isRecord(value.Driver)) return [];
    const driver = value.Driver;
    const id = optionalString(driver.driverId);
    const givenName = optionalString(driver.givenName);
    const familyName = optionalString(driver.familyName);
    if (!id || !givenName || !familyName) return [];
    const constructors = Array.isArray(value.Constructors) ? value.Constructors : [];
    const constructor = isRecord(constructors[0]) ? constructors[0] : {};
    return [{
      id,
      code: optionalString(driver.code),
      givenName,
      familyName,
      number: optionalString(driver.permanentNumber),
      nationality: optionalString(driver.nationality),
      team: optionalString(constructor.name),
      position: Math.max(1, Math.trunc(numericValue(value.position, index + 1))),
      points: Math.max(0, numericValue(value.points)),
      wins: Math.max(0, Math.trunc(numericValue(value.wins)))
    }];
  });
  if (!drivers.length) throw new FormulaOneError("No Formula 1 driver standings were found.", 404);
  return {
    season: optionalString(table.season) ?? optionalString(list.season) ?? "current",
    round: optionalString(table.round) ?? optionalString(list.round),
    drivers,
    fetchedAt: new Date().toISOString(),
    source: "Jolpica F1"
  };
}
