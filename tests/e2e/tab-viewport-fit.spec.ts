import { expect, test, type Page } from "@playwright/test";
import { fixtureConfig } from "../fixtures";
import type { ChromaConfig } from "../../src/shared/config";
import { remoteHouseExample } from "../../src/shared/remote-card";

function denseConfig(position: ChromaConfig["homepage"]["tabPosition"], bento: boolean) {
  const config = fixtureConfig();
  config.homepage.tabPosition = position;
  const original = config.tabs[0].sections[0].cards[0];
  config.tabs[0].sections[0].cards = Array.from({ length: 24 }, (_, index) => ({ ...original, id: `packed-${index}`, label: `Visible item ${index + 1}` }));
  config.tabs[0].sections[0].width = "half";
  config.tabs[0].sections[1].width = "half";
  config.tabs[0].sections[1].cards = Array.from({ length: 8 }, (_, index) => ({ ...original, id: `second-${index}`, label: `Other item ${index + 1}` }));
  config.tabs[1].sections[0].cards = Array.from({ length: 24 }, (_, index) => ({ ...original, id: `regular-${index}`, label: `Regular item ${index + 1}` }));
  if (bento) {
    config.tabs[0].sectionLayout = { type: "bento", columns: 6, rowHeight: 80, gap: 24 };
    config.tabs[0].sections[0].dashboardBox = { column: 1, row: 1, width: 3, height: 3 };
    config.tabs[0].sections[1].dashboardBox = { column: 4, row: 1, width: 3, height: 3 };
  }
  return config;
}

async function expectAllVisible(page: Page, viewportHeight: number) {
  const result = async () => page.evaluate(() => ({
    page: document.documentElement.scrollHeight,
    scale: getComputedStyle(document.querySelector(".dashboard-main")!).scale,
    bottom: Math.max(...[...document.querySelectorAll(".dashboard-main .dashboard-section, .dashboard-main .chroma-link-card")].map((element) => element.getBoundingClientRect().bottom)),
    scrollers: [...document.querySelectorAll(".dashboard-main .section-card-content")].filter((element) => element.scrollHeight > element.clientHeight + 1).length,
    clippedCards: [...document.querySelectorAll(".dashboard-main .chroma-link-card")].filter((element) => element.scrollHeight > element.clientHeight + 2).map((element) => ({ id: element.getAttribute("data-testid"), height: element.clientHeight, scrollHeight: element.scrollHeight })),
    canvas: { top: document.querySelector(".dashboard-main")!.getBoundingClientRect().top, height: document.querySelector(".dashboard-main")!.getBoundingClientRect().height, scrollHeight: document.querySelector(".dashboard-main")!.scrollHeight },
    sections: [...document.querySelectorAll(".dashboard-main .dashboard-section")].map((element) => ({ height: element.getBoundingClientRect().height, scrollHeight: element.scrollHeight })),
    fit: document.querySelector(".chroma-app")!.getAttribute("data-fit-viewport")
  }));
  await expect.poll(async () => { const r = await result(); return r.page <= viewportHeight + 1 && r.scale === "none" && r.bottom <= viewportHeight && r.scrollers === 0 && r.clippedCards.length === 0 ? "fit" : JSON.stringify(r); }).toBe("fit");
  const measured = await result();
  if (measured.bottom > viewportHeight || measured.scrollers) throw new Error(JSON.stringify(measured));
}

for (const [position, bento] of [["top", false], ["left", true], ["right", true]] as const) {
  test(`fits dense ${bento ? "Bento" : "flow"} tab with ${position} navigation; edits and mobile still scroll`, async ({ page, request }) => {
    const { profile } = await (await request.post("http://127.0.0.1:3001/api/profiles", { data: { name: `Fit ${position} sandbox` } })).json();
    const endpoint = `http://127.0.0.1:3001/api/profiles/${profile.id}/config`;
    await request.put(endpoint, { data: denseConfig(position, bento) });
    await page.addInitScript((id: string) => localStorage.setItem("chroma.active-profile", id), profile.id);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/");
    await expect(page.getByText("Visible item 24", { exact: true })).toHaveCount(1);
    if (!bento) expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(900);
    else expect(await page.getByTestId("section-section-a").locator(".section-card-content").evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

    await page.getByTestId("profile-switcher").click();
    await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
    await page.getByTestId("tab-tab-a").click();
    const toggle = page.getByRole("checkbox", { name: "Fit on one screen (desktop)" });
    await toggle.check();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(toggle).not.toBeChecked();
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(toggle).toBeChecked();
    if (!bento) expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(900);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeHidden();
    expect((await (await request.get(endpoint)).json()).tabs[0].fitViewport).toBe(true);
    await expectAllVisible(page, 900);

    await page.setViewportSize({ width: 1600, height: 700 });
    await expectAllVisible(page, 700);
    await page.getByTestId("tab-tab-b").click();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(700);
    await page.getByTestId("tab-tab-a").click();
    await expectAllVisible(page, 700);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("section-section-a")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(844);
    expect(await page.locator(".dashboard-main").evaluate((element) => getComputedStyle(element).scale)).toBe("none");
    await page.reload();
    expect((await (await request.get(endpoint)).json()).tabs[0].fitViewport).toBe(true);
  });
}

test("refits a tab when remote card content arrives after the initial layout", async ({ page, request }) => {
  const { profile } = await (await request.post("http://127.0.0.1:3001/api/profiles", { data: { name: "Async fit sandbox" } })).json();
  const config = fixtureConfig();
  config.tabs[0].fitViewport = true;
  config.tabs[0].sections[0].layout = { type: "grid", minCardWidth: 180, gap: 12, maxColumns: 1 };
  config.tabs[0].sections[0].cards = [{ id: "async-house", type: "remote-data", label: "House", icon: { type: "iconify", value: "lucide:house" }, endpoint: "https://example.com/house", authMode: "none", allowLocalNetwork: false, refreshSeconds: 60 }, { ...config.tabs[0].sections[0].cards[0], id: "small-link", label: "Short link" }];
  const data = remoteHouseExample();
  data.blocks = [
    { type: "text", text: "A complete, asynchronously loaded home summary." },
    { type: "metrics", items: Array.from({ length: 12 }, (_, index) => ({ label: `Metric ${index + 1}`, value: index, tone: "neutral" as const })) },
    { type: "list", items: Array.from({ length: 20 }, (_, index) => ({ label: `Sensor ${index + 1}`, value: "Active", description: "Current house state", tone: "neutral" as const })) }
  ];
  await request.put(`http://127.0.0.1:3001/api/profiles/${profile.id}/config`, { data: config });
  await page.addInitScript((id: string) => localStorage.setItem("chroma.active-profile", id), profile.id);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/widgets/remote-data", async (route) => {
    await gate;
    await route.fulfill({ json: { data, fetchedAt: "2026-09-30T00:00:00.000Z", stale: false, cache: "fresh", nextRefreshSeconds: 60 } });
  });
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/");
  await expect(page.getByTestId("remote-card-content").getByText("Loading custom card…")).toBeVisible();
  expect(await page.locator(".dashboard-main").evaluate((element) => getComputedStyle(element).scale)).toBe("none");
  release();
  await expect(page.getByText("Sensor 20", { exact: true })).toBeVisible();
  await expectAllVisible(page, 700);
  const sizes = await page.evaluate(() => ({
    remote: document.querySelector('[data-testid="card-async-house"]')!.getBoundingClientRect().height,
    link: document.querySelector('[data-testid="card-small-link"]')!.getBoundingClientRect().height,
    heavySection: document.querySelector('[data-testid="section-section-a"]')!.getBoundingClientRect().height,
    emptySection: document.querySelector('[data-testid="section-section-b"]')!.getBoundingClientRect().height
  }));
  expect(sizes.remote).toBeGreaterThan(sizes.link * 1.5);
  expect(sizes.heavySection).toBeGreaterThan(sizes.emptySection * 2);
  expect(await page.getByText("Sensor 20", { exact: true }).evaluate((element) => element.getBoundingClientRect().bottom <= element.closest(".chroma-link-card")!.getBoundingClientRect().bottom)).toBe(true);
});

test("fits a standings card beside an ordinary card without scaling either", async ({ page, request }) => {
  const { profile } = await (await request.post("http://127.0.0.1:3001/api/profiles", { data: { name: "Standings fit sandbox" } })).json();
  const config = fixtureConfig();
  config.tabs[0].fitViewport = true;
  config.tabs[0].sections[0].layout = { type: "grid", minCardWidth: 180, gap: 12, maxColumns: 1 };
  config.tabs[0].sections[0].cards = [
    { id: "standings-fit", type: "formula-one", label: "F1 championship leaders", icon: { type: "iconify", value: "simple-icons:f1" }, view: "driver-standings", driverCount: 8, refreshMinutes: 60 },
    { ...config.tabs[0].sections[0].cards[0], id: "standings-link", label: "Short link" }
  ];
  await request.put(`http://127.0.0.1:3001/api/profiles/${profile.id}/config`, { data: config });
  await page.addInitScript((id: string) => localStorage.setItem("chroma.active-profile", id), profile.id);
  await page.route("**/api/widgets/formula-one/driver-standings", (route) => route.fulfill({ json: {
    season: "2026", round: "18", fetchedAt: "2026-10-07T12:00:00.000Z", source: "Jolpica F1",
    drivers: Array.from({ length: 8 }, (_, index) => ({ id: `driver-${index}`, code: `D${index}`, givenName: "Test", familyName: `Driver ${index + 1}`, team: "Example Racing", position: index + 1, points: 200 - index * 10, wins: index }))
  } }));
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/");
  await expect(page.getByText(/Test Driver 8/)).toBeVisible();
  await expectAllVisible(page, 700);
  const heights = await page.evaluate(() => ({
    standings: document.querySelector('[data-testid="card-standings-fit"]')!.getBoundingClientRect().height,
    link: document.querySelector('[data-testid="card-standings-link"]')!.getBoundingClientRect().height
  }));
  expect(heights.standings).toBeGreaterThan(heights.link);
});
