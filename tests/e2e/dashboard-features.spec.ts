import { test, expect, type Page, type Locator } from "@playwright/test";
import { fixtureConfig } from "../fixtures";
import type { ChromaConfig } from "../../src/shared/config";

test.beforeEach(async ({ page, request }) => {
  const result = await request.post("http://127.0.0.1:3001/api/profiles", { data: { name: "Dashboard interaction tests" } });
  const { profile } = await result.json();
  const config = fixtureConfig();
  config.tabs.push({ id: "empty-tab", label: "Empty", icon: "lucide:house", sections: [] });
  await request.put(`http://127.0.0.1:3001/api/profiles/${profile.id}/config`, { data: config });
  await page.addInitScript((id: string) => localStorage.setItem("chroma.active-profile", id), profile.id);
  await page.goto("/");
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
});

async function point(page: Page, target: Locator) {
  const rect = await target.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2, { steps: 12 });
}

async function startDrag(page: Page, target: Locator) {
  // Wait for edit-mode layout transitions before grabbing a small handle.
  await target.hover();
  await page.mouse.down();
  const rect = (await target.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2 + 12, rect.y + rect.height / 2 + 10, { steps: 3 });
}

async function savedConfig(page: Page): Promise<ChromaConfig> {
  const id = await page.evaluate(() => localStorage.getItem("chroma.active-profile"));
  return (await page.request.get(`http://127.0.0.1:3001/api/profiles/${id}/config`)).json();
}

test("card drag survives hovering another tab and commits once with undo/redo", async ({ page }) => {
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await startDrag(page, page.getByTestId("card-card-a"));
  await point(page, page.getByTestId("tab-tab-b"));
  await expect(page.getByTestId("tab-tab-b")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("card-drag-overlay")).toBeVisible();
  await point(page, page.getByTestId("section-section-c"));
  await page.mouse.up();
  await expect(page.getByTestId("section-section-c").getByTestId("card-card-a")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("card-card-a")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("card-card-a")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
  await page.reload();
  await page.getByTestId("tab-tab-b").click();
  await expect(page.getByTestId("section-section-c").getByTestId("card-card-a")).toBeVisible();
});

test("whole sections can be dragged into empty tabs and moved back from the inspector", async ({ page }) => {
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await startDrag(page, page.getByTestId("section-section-a").getByRole("button", { name: "Drag section", exact: true }));
  await expect(page.getByTestId("section-drag-overlay")).toBeVisible();
  await point(page, page.getByTestId("tab-empty-tab"));
  await expect(page.getByTestId("tab-empty-tab")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("section-drag-overlay")).toBeVisible();
  await point(page, page.getByTestId("canvas-empty-tab"));
  await page.mouse.up();
  await expect(page.getByTestId("section-section-a").getByTestId("card-card-a")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("section-section-a")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("combobox", { name: "Move section to tab", exact: true }).selectOption("tab-b");
  await expect(page.getByTestId("tab-tab-b")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("section-section-a").getByTestId("card-card-a")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
  expect((await savedConfig(page)).tabs[1].sections.map((section) => section.id)).toEqual(["section-c", "section-a"]);
});

test("card drops on an empty tab create a destination section; cancel never moves data", async ({ page }) => {
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await startDrag(page, page.getByTestId("card-card-a"));
  await point(page, page.getByTestId("tab-tab-b"));
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("card-drag-overlay")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await page.getByTestId("tab-tab-a").click();
  await startDrag(page, page.getByTestId("card-card-a"));
  await point(page, page.getByTestId("tab-empty-tab"));
  await expect(page.getByTestId("tab-empty-tab")).toHaveAttribute("aria-current", "page");
  await page.mouse.up();
  await expect(page.getByTestId("card-card-a")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("card-card-a")).toHaveCount(0);
  await expect(page.getByText("This tab has no sections yet.")).toBeVisible();
});

test("accent from an image is undoable and saves only on Save", async ({ page }) => {
  const uploaded = await page.request.post("http://127.0.0.1:3001/api/assets", { multipart: { file: {
    name: "accent.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#e04060"/></svg>')
  } } });
  expect(uploaded.status()).toBe(201);
  const { id: assetId } = await uploaded.json();
  const config = await savedConfig(page);
  config.tabs[0].sections[0].cards[0].icon = { type: "asset", assetId };
  const id = await page.evaluate(() => localStorage.getItem("chroma.active-profile"));
  await page.request.put(`http://127.0.0.1:3001/api/profiles/${id}/config`, { data: config });
  await page.reload();
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByTestId("card-card-a").click();
  await page.getByRole("button", { name: "Accent from icon", exact: true }).click();
  await expect(page.getByLabel("Accent color", { exact: true })).toHaveValue("#e04060");
  expect((await savedConfig(page)).tabs[0].sections[0].cards[0].appearance).toBeUndefined();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Accent color", { exact: true })).not.toHaveValue("#e04060");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
  expect((await savedConfig(page)).tabs[0].sections[0].cards[0].appearance?.accent).toBe("#e04060");
});

test("header keeps logo, search, clock and actions on one row on desktop and tablet", async ({ page }) => {
  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const search = (await page.getByRole("searchbox", { name: "Search Google" }).boundingBox())!;
    for (const item of [page.getByRole("img", { name: "Chroma Homepage", exact: true }), page.getByTestId("header-clock"), page.getByTestId("profile-switcher")]) {
      const rect = (await item.boundingBox())!;
      expect(Math.abs((rect.y + rect.height / 2) - (search.y + search.height / 2))).toBeLessThan(4);
    }
    await page.getByTestId("profile-switcher").click();
    await expect(page.getByRole("menuitem", { name: "New profile", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  expect(await page.locator('link[rel="icon"]').getAttribute("href")).toBe("/chroma.svg");
});

test("Iconify colors work for tab accents and monochrome homepage icons receive an explicit suggestion", async ({ page }) => {
  await page.route("**/chroma-test.json?*", (route) => route.fulfill({ json: {
    prefix: "chroma-test", width: 24, height: 24,
    icons: { colored: { body: '<path fill="#00bb88" d="M0 0h24v24H0z"/>' }, mono: { body: '<path fill="currentColor" d="M0 0h24v24H0z"/>' } }
  } }));
  const config = await savedConfig(page);
  config.homepage.icon = { type: "iconify", value: "chroma-test:mono" };
  config.tabs[0].icon = "chroma-test:colored";
  const id = await page.evaluate(() => localStorage.getItem("chroma.active-profile"));
  await page.request.put(`http://127.0.0.1:3001/api/profiles/${id}/config`, { data: config });
  await page.reload();
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByTestId("tab-tab-a").click();
  await page.getByRole("button", { name: "Accent from icon", exact: true }).click();
  await expect(page.getByLabel("Accent color", { exact: true })).toHaveValue("#00bb88");
  await page.getByRole("button", { name: "Homepage settings", exact: true }).click();
  await page.getByRole("button", { name: "Accent from icon", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "No intrinsic color found" })).toBeVisible();
  await expect(page.getByLabel("Default accent color", { exact: true })).not.toHaveValue("#a78bfa");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await savedConfig(page)).homepage.appearance).toBeUndefined();
});
