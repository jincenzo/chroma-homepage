// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../src/server/app";
import { motoGpCardSchema } from "../src/shared/config";
import { createMotoGpCard } from "../src/shared/operations";

const event = { id: "japan", name: "Grand Prix of Japan", kind: "GP", status: "NOT-STARTED", date_start: "2026-10-02T08:00:00+09:00", date_end: "2026-10-04T18:00:00+09:00", circuit: { name: "Mobility Resort Motegi", country: "Japan" }, broadcasts: [
  { shortname: "SPR", date_start: "2026-10-03T15:00:00+0900", status: "NOT-STARTED", category: { acronym: "MGP" } },
  { shortname: "RAC", date_start: "2026-10-04T12:15:00+0900", status: "NOT-STARTED", category: { acronym: "MT2" } },
  { shortname: "RAC", date_start: "2026-10-04T14:00:00+0900", status: "NOT-STARTED", category: { acronym: "MGP" } }
] };
const standing = { position: 1, points: 300, rider: { id: "season-rider", riders_api_uuid: "stable-rider", full_name: "Test Rider", number: 93, country: { name: "Spain" } }, team: { name: "Test Team" }, constructor: { name: "Ducati" }, race_wins: 5, sprint_wins: 6 };
const endpoint = "/api/widgets/motogp/";

describe("MotoGP integration", () => {
  let dataPath: string;
  let app: Awaited<ReturnType<typeof createApp>>;
  const upstream = vi.fn<typeof fetch>();
  beforeEach(async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-27T12:00:00Z"));
    upstream.mockReset();
    upstream.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const body = url.pathname.endsWith("/seasons") ? [{ id: "season", year: 2026, current: true }]
        : url.pathname.endsWith("/categories") ? [{ id: "moto2", name: "Moto2", legacy_id: 2 }, { id: "motogp", name: "MotoGP™", legacy_id: 3 }]
        : url.pathname.endsWith("/standings") ? { classification: [standing] } : [event];
      return Response.json(body);
    });
    dataPath = await mkdtemp(path.join(tmpdir(), "chroma-motogp-test-"));
    app = await createApp({ dataPath, defaultConfigPath: path.resolve("config/default-config.json"), fetchMotoGp: upstream });
  });
  afterEach(async () => { await app.close(); await rm(dataPath, { recursive: true, force: true }); vi.restoreAllMocks(); });

  it("selects the MotoGP Grand Prix rather than Sprint/Moto2 and correctly converts its offset", async () => {
    const [first, second] = await Promise.all([app.inject(endpoint + "next-race"), app.inject(endpoint + "next-race")]);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ season: 2026, source: "MotoGP", race: { name: "Grand Prix of Japan", date: "2026-10-04T05:00:00.000Z", circuit: "Mobility Resort Motegi", weekendStart: "2026-10-02", status: "Scheduled" } });
    expect(second.json().race).toEqual(first.json().race);
    expect(upstream).toHaveBeenCalledTimes(2);
    for (const [url, init] of upstream.mock.calls) {
      expect(new URL(String(url)).hostname).toBe("api.motogp.pulselive.com");
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
    }
  });

  it("normalizes standings and keeps GP and Sprint wins separate", async () => {
    const first = await app.inject(endpoint + "rider-standings");
    expect(first.statusCode).toBe(200);
    expect(first.json().riders).toEqual([{ id: "stable-rider", name: "Test Rider", number: 93, nationality: "Spain", team: "Test Team", manufacturer: "Ducati", position: 1, points: 300, raceWins: 5, sprintWins: 6 }]);
    await app.inject(endpoint + "rider-standings");
    expect(upstream).toHaveBeenCalledTimes(3);
    expect(new URL(String(upstream.mock.calls[2][0])).searchParams.get("categoryUuid")).toBe("motogp");
  });

  it("shows a date-only weekend if the precise race start is unpublished", async () => {
    const original = upstream.getMockImplementation()!;
    upstream.mockImplementation((input, init) => String(input).includes("/events?") ? Promise.resolve(Response.json([{ ...event, broadcasts: [] }])) : original(input, init));
    const response = await app.inject(endpoint + "next-race");
    expect(response.json().race).toMatchObject({ status: "Time TBC", weekendEnd: "2026-10-04" });
    expect(response.json().race).not.toHaveProperty("date");
  });

  it("excludes tests, cancelled events and completed Grands Prix", async () => {
    const original = upstream.getMockImplementation()!;
    upstream.mockImplementation((input, init) => String(input).includes("/events?") ? Promise.resolve(Response.json([
      { ...event, kind: "TEST" }, { ...event, status: "CANCELLED" }, { ...event, broadcasts: [{ ...event.broadcasts[2], status: "FINISHED" }] }
    ])) : original(input, init));
    expect((await app.inject(endpoint + "next-race")).json().race).toBeNull();
  });

  it("re-evaluates cached races once their start time has passed", async () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-10-04T04:59:00Z"));
    expect((await app.inject(endpoint + "next-race")).json().race).not.toBeNull();
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-10-04T05:10:00Z"));
    expect((await app.inject(endpoint + "next-race")).json().race).toBeNull();
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("uses a published next-season calendar when the current season is over", async () => {
    upstream.mockImplementation(async (input) => {
      const url = new URL(String(input));
      return Response.json(url.pathname.endsWith("seasons") ? [{ id: "current", year: 2026, current: true }, { id: "next", year: 2027, current: false }]
        : url.searchParams.get("seasonYear") === "2026" ? [] : [{ ...event, date_start: "2027-03-05T08:00:00+09:00", date_end: "2027-03-07T18:00:00+09:00", broadcasts: [] }]);
    });
    expect((await app.inject(endpoint + "next-race")).json()).toMatchObject({ season: 2027, race: { weekendStart: "2027-03-05", status: "Time TBC" } });
  });

  it("allows empty standings before the first round without fabricating points", async () => {
    const original = upstream.getMockImplementation()!;
    upstream.mockImplementation((input, init) => String(input).includes("/standings?") ? Promise.resolve(Response.json({ classification: [] })) : original(input, init));
    expect((await app.inject(endpoint + "rider-standings")).json().riders).toEqual([]);
  });

  it.each([429, 500])("sanitizes provider HTTP %s errors and backs off repeated failures", async (status) => {
    upstream.mockResolvedValueOnce(new Response("private provider diagnostics", { status }));
    const first = await app.inject(endpoint + "next-race");
    expect(first.statusCode).toBe(status === 429 ? 429 : 502);
    expect(first.body).not.toContain("private provider diagnostics");
    await app.inject(endpoint + "next-race");
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("bounds payloads and hides malformed responses", async () => {
    upstream.mockResolvedValueOnce(new Response("x".repeat(2 * 1024 * 1024 + 1)));
    expect((await app.inject(endpoint + "next-race")).json().error).toContain("too much data");
    vi.mocked(Date.now).mockReturnValue(Date.now() + 61_000);
    upstream.mockResolvedValueOnce(new Response("invalid JSON"));
    const response = await app.inject(endpoint + "next-race");
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain("invalid JSON");
  });

  it("provides backwards-compatible card defaults and validates rider count", () => {
    const card = createMotoGpCard();
    expect(motoGpCardSchema.parse(card)).toEqual(card);
    expect(motoGpCardSchema.parse({ ...card, riderCount: undefined, view: undefined })).toMatchObject({ riderCount: 3, view: "next-race" });
    for (const riderCount of [0, 31, 1.5]) expect(motoGpCardSchema.safeParse({ ...card, riderCount }).success).toBe(false);
  });
});
