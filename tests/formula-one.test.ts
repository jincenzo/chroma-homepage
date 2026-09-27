// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../src/server/app";

describe("Formula 1 integration", () => {
  let dataPath: string;
  let app: Awaited<ReturnType<typeof createApp>>;
  const defaultConfigPath = path.resolve("config/default-config.json");
  const upstream = vi.fn<typeof fetch>();

  beforeEach(async () => {
    upstream.mockReset();
    upstream.mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("driverstandings") ? {
        MRData: { StandingsTable: { season: "2026", round: "18", StandingsLists: [{ DriverStandings: [
          { position: "1", points: "310", wins: "7", Driver: { driverId: "norris", permanentNumber: "4", code: "NOR", givenName: "Lando", familyName: "Norris", nationality: "British" }, Constructors: [{ name: "McLaren" }] },
          { position: "2", points: "295", wins: "6", Driver: { driverId: "piastri", permanentNumber: "81", code: "PIA", givenName: "Oscar", familyName: "Piastri", nationality: "Australian" }, Constructors: [{ name: "McLaren" }] }
        ] }] } }
      } : url.includes("jolpi.ca") ? { MRData: { RaceTable: { Races: [{
        season: "2026", round: "18", raceName: "Italian Grand Prix", date: "2026-09-06", time: "13:00:00Z",
        Circuit: { circuitName: "Autodromo Nazionale Monza", Location: { locality: "Monza", country: "Italy" } }
      }] } } } : {
      errors: [], response: [{
        id: 321, competition: { name: "Italian Grand Prix", location: { city: "Monza", country: "Italy" } },
        circuit: { name: "Autodromo Nazionale Monza" }, date: "2026-09-06T13:00:00+00:00", status: "Scheduled"
      }]
      };
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    });
    dataPath = await mkdtemp(path.join(tmpdir(), "chroma-f1-test-"));
    app = await createApp({ dataPath, defaultConfigPath, fetchFormulaOne: upstream });
  });

  afterEach(async () => {
    await app.close();
    await rm(dataPath, { recursive: true, force: true });
  });

  it("stores the API key encrypted, never returns it, and serves cached normalized race data", async () => {
    expect((await app.inject("/api/integrations/api-sports-formula-one")).json()).toEqual({ configured: false });
    const publicRace = await app.inject("/api/widgets/formula-one/next-race");
    expect(publicRace.statusCode).toBe(200);
    expect(publicRace.json()).toMatchObject({ source: "Jolpica F1", race: { name: "Italian Grand Prix" } });

    const apiKey = "test-secret-api-key-123";
    const saved = await app.inject({ method: "PUT", url: "/api/integrations/api-sports-formula-one", payload: { apiKey } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ configured: true });
    expect(JSON.stringify(saved.json())).not.toContain(apiKey);

    const encrypted = await readFile(path.join(dataPath, "secrets.json"), "utf8");
    const config = await readFile(path.join(dataPath, "config.json"), "utf8");
    expect(encrypted).not.toContain(apiKey);
    expect(config).not.toContain(apiKey);
    expect((await stat(path.join(dataPath, "secrets.json"))).mode & 0o777).toBe(0o600);
    expect((await stat(path.join(dataPath, "secrets.key"))).mode & 0o777).toBe(0o600);

    upstream.mockClear();
    const first = await app.inject("/api/widgets/formula-one/next-race");
    const second = await app.inject("/api/widgets/formula-one/next-race");
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ race: { id: 321, name: "Italian Grand Prix", circuit: "Autodromo Nazionale Monza", city: "Monza", country: "Italy", status: "Scheduled" } });
    expect(second.json()).toEqual(first.json());
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0];
    expect(String(url)).toContain("next=1");
    expect(String(url)).toContain("timezone=UTC");
    expect(new Headers(init?.headers).get("x-apisports-key")).toBe(apiKey);
  });

  it("persists the encrypted credential across restarts and can remove it", async () => {
    await app.inject({ method: "PUT", url: "/api/integrations/api-sports-formula-one", payload: { apiKey: "persistent-secret-key" } });
    await app.close();
    app = await createApp({ dataPath, defaultConfigPath, fetchFormulaOne: upstream });
    expect((await app.inject("/api/integrations/api-sports-formula-one")).json()).toEqual({ configured: true });
    expect((await app.inject({ method: "DELETE", url: "/api/integrations/api-sports-formula-one" })).json()).toEqual({ configured: false });
    expect((await app.inject("/api/widgets/formula-one/next-race")).json()).toMatchObject({ source: "Jolpica F1" });
  });

  it("serves and caches normalized current driver standings", async () => {
    const first = await app.inject("/api/widgets/formula-one/driver-standings");
    const second = await app.inject("/api/widgets/formula-one/driver-standings");
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();
    expect(firstBody).toMatchObject({ season: "2026", round: "18", source: "Jolpica F1" });
    expect(firstBody.drivers).toEqual(expect.arrayContaining([expect.objectContaining(
      { id: "norris", givenName: "Lando", familyName: "Norris", team: "McLaren", position: 1, points: 310, wins: 7 }
    )]));
    expect(second.json()).toEqual(first.json());
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(String(upstream.mock.calls[0][0])).toContain("driverstandings");
  });

  it("validates credential input, hides provider errors, and falls back for free plans", async () => {
    expect((await app.inject({ method: "PUT", url: "/api/integrations/api-sports-formula-one", payload: { apiKey: "short" } })).statusCode).toBe(400);
    await app.inject({ method: "PUT", url: "/api/integrations/api-sports-formula-one", payload: { apiKey: "long-enough-key" } });
    upstream.mockResolvedValueOnce(new Response(JSON.stringify({ errors: { token: "raw provider detail" }, response: [] })));
    const response = await app.inject("/api/widgets/formula-one/next-race");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ source: "Jolpica F1", race: { name: "Italian Grand Prix" } });
    expect(response.body).not.toContain("raw provider detail");
    expect(String(upstream.mock.calls[0][0])).toContain("timezone=UTC");
  });
});
