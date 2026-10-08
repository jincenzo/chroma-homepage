import { expect, test } from "@playwright/test";
import { fixtureConfig } from "../fixtures";

test("adds MotoGP and persists race, leaders and favourite-rider settings", async ({ page, request }) => {
  const { profile } = await (await request.post("http://127.0.0.1:3001/api/profiles", { data: { name: "MotoGP sandbox" } })).json();
  const endpoint = `http://127.0.0.1:3001/api/profiles/${profile.id}/config`;
  await request.put(endpoint, { data: fixtureConfig() });
  await page.addInitScript((id: string) => localStorage.setItem("chroma.active-profile", id), profile.id);
  await page.route("**/api/widgets/motogp/next-race", (route) => route.fulfill({ json: {
    season: 2026, source: "MotoGP", fetchedAt: "2026-09-27T12:00:00.000Z",
    race: { id: "japan", name: "Grand Prix of Japan", circuit: "Mobility Resort Motegi", country: "Japan", date: "2026-10-04T05:00:00.000Z", weekendStart: "2026-10-02", weekendEnd: "2026-10-04", status: "Scheduled" }
  } }));
  await page.route("**/api/widgets/motogp/rider-standings", (route) => route.fulfill({ json: {
    season: 2026, source: "MotoGP", fetchedAt: "2026-09-27T12:00:00.000Z",
    riders: Array.from({ length: 6 }, (_, index) => ({ id: `rider-${index}`, name: `Rider ${index + 1}`, team: "Test Team", manufacturer: "Ducati", position: index + 1, points: 300 - index * 10, raceWins: 5, sprintWins: 6 }))
  } }));
  await page.goto("/");
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByRole("button", { name: "Add new item", exact: true }).click();
  await page.getByTestId("add-motogp-card").click();
  await expect(page.getByText("Grand Prix of Japan", { exact: true })).toBeVisible();
  await expect(page.getByText("Mobility Resort Motegi · Japan", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Data shown" }).selectOption("rider-standings");
  await expect(page.getByText("Rider 3", { exact: true })).toBeVisible();
  await expect(page.getByText("Rider 4", { exact: true })).toBeHidden();
  await page.getByRole("spinbutton", { name: "Riders shown" }).fill("6");
  await expect(page.getByText("Rider 6", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Data shown" }).selectOption("favorite-rider");
  await page.getByRole("combobox", { name: "Favourite rider" }).selectOption("rider-2");
  await expect(page.getByText("Rider 3", { exact: true })).toBeVisible();
  await expect(page.getByText("P3", { exact: true })).toBeVisible();
  await expect(page.getByText("5 GP wins", { exact: true })).toBeVisible();
  await expect(page.getByText("6 Sprint wins", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeHidden();
  const saved = await (await request.get(endpoint)).json();
  expect(saved.tabs[0].sections[0].cards.at(-1)).toMatchObject({ type: "motogp", view: "favorite-rider", riderId: "rider-2", riderCount: 6 });
  await page.reload();
  await expect(page.getByText("Rider 3", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
