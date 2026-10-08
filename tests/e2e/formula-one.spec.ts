import { expect, test } from "@playwright/test";
import { fixtureConfig } from "../fixtures";

test("adds a live Formula 1 card and manages its server-side credential", async ({ page, request }) => {
  const created = await request.post("http://127.0.0.1:3001/api/profiles", { data: { name: "Formula 1 sandbox" } });
  const { profile } = await created.json();
  await request.put(`http://127.0.0.1:3001/api/profiles/${profile.id}/config`, { data: fixtureConfig() });
  await request.delete("http://127.0.0.1:3001/api/integrations/api-sports-formula-one");
  await page.addInitScript((id: string) => localStorage.setItem("chroma.active-profile", id), profile.id);
  await page.route("**/api/widgets/formula-one/next-race", (route) => route.fulfill({ json: {
    fetchedAt: "2026-09-27T12:00:00.000Z",
    race: {
      id: 321, name: "Italian Grand Prix", circuit: "Autodromo Nazionale Monza",
      city: "Monza", country: "Italy", date: "2026-10-04T13:00:00.000Z", status: "Scheduled"
    }
  } }));
  await page.route("**/api/widgets/formula-one/driver-standings", (route) => route.fulfill({ json: {
    season: "2026", round: "18", fetchedAt: "2026-09-27T12:00:00.000Z", source: "Jolpica F1",
    drivers: [
      { id: "norris", code: "NOR", givenName: "Lando", familyName: "Norris", number: "4", nationality: "British", team: "McLaren", position: 1, points: 310, wins: 7 },
      { id: "piastri", code: "PIA", givenName: "Oscar", familyName: "Piastri", number: "81", nationality: "Australian", team: "McLaren", position: 2, points: 295, wins: 6 }
    ]
  } }));

  await page.goto("/");
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByRole("button", { name: "Add new item", exact: true }).click();
  await page.getByTestId("add-f1-card").click();
  const card = page.getByText("Italian Grand Prix", { exact: true });
  await expect(card).toBeVisible();
  await expect(page.getByText("Autodromo Nazionale Monza · Monza, Italy", { exact: true })).toBeVisible();
  await expect(page.getByText("Not configured", { exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Data shown" }).selectOption("driver-standings");
  await page.getByRole("spinbutton", { name: "Drivers shown" }).fill("1");
  await expect(page.getByText(/Lando Norris/)).toBeVisible();
  await expect(page.getByText(/Oscar Piastri/)).toBeHidden();
  await page.getByRole("spinbutton", { name: "Drivers shown" }).fill("2");
  await expect(page.getByText(/Oscar Piastri/)).toBeVisible();
  await page.getByRole("combobox", { name: "Data shown" }).selectOption("favorite-driver");
  await page.getByRole("combobox", { name: "Favourite driver" }).selectOption("norris");
  await expect(page.getByText("Lando Norris", { exact: true })).toBeVisible();
  await expect(page.getByText("McLaren · British", { exact: true })).toBeVisible();

  await page.getByPlaceholder("Paste your API key", { exact: true }).fill("e2e-placeholder-key");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await expect(page.getByText("Key saved", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Enter a new key", { exact: true })).toHaveValue("");
  const status = await request.get("http://127.0.0.1:3001/api/integrations/api-sports-formula-one");
  expect(await status.json()).toEqual({ configured: true });
  expect(await status.text()).not.toContain("e2e-placeholder-key");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await (await request.get(`http://127.0.0.1:3001/api/profiles/${profile.id}/config`)).json();
  const f1 = saved.tabs.flatMap((tab: { sections: Array<{ cards: unknown[] }> }) => tab.sections).flatMap((section: { cards: unknown[] }) => section.cards).find((item: { type?: string }) => item.type === "formula-one");
  expect(f1).toMatchObject({ label: "Favourite F1 driver", view: "favorite-driver", driverId: "norris", driverCount: 2, refreshMinutes: 60 });
  expect(JSON.stringify(saved)).not.toContain("e2e-placeholder-key");
  await request.delete("http://127.0.0.1:3001/api/integrations/api-sports-formula-one");
});
