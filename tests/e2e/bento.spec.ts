import { expect, test, type Page } from "@playwright/test";
import { fixtureConfig } from "../fixtures";

async function edit(page: Page) {
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByTestId("section-section-a").getByRole("heading", { name: "A", exact: true }).click();
}

test.beforeEach(async ({ page, request }) => {
  const response = await request.post("http://127.0.0.1:3001/api/profiles", { data: { name: "Bento test" } });
  const { profile } = await response.json();
  const config = fixtureConfig();
  const cards = config.tabs[0].sections[0].cards;
  cards.push(...["B", "C", "D"].map((label) => ({ ...cards[0], id: `card-${label}`, label })));
  expect((await request.put(`http://127.0.0.1:3001/api/profiles/${profile.id}/config`, { data: config })).ok()).toBeTruthy();
  await page.addInitScript((id: string) => localStorage.setItem("chroma.active-profile", id), profile.id);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
});

test("Bento studio sizes boxes, applies atomically, saves and remains responsive", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await edit(page);
  await page.getByRole("combobox", { name: "Presentation", exact: true }).selectOption("bento");
  await page.getByRole("button", { name: "Open Bento studio" }).click();
  const studio = page.getByRole("dialog", { name: "Bento studio" });
  await expect(studio.locator(".layout-bento")).toHaveCSS("--bento-columns", "4");
  await studio.getByRole("button", { name: "Feature 2 × 2", exact: true }).click();
  await studio.getByRole("combobox", { name: "Box", exact: true }).selectOption("card-D");
  await studio.getByRole("button", { name: "Wide 2 × 1", exact: true }).click();
  await studio.getByLabel("Row height (px)").fill("170");
  await studio.getByRole("button", { name: "Apply to draft" }).click();
  const first = page.getByTestId("card-card-a");
  await expect(first).toHaveCSS("grid-row-end", "auto");
  await expect(first).toHaveCSS("grid-row-start", "span 2");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(first).toHaveCSS("grid-row-start", "span 1");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(first).toHaveCSS("grid-row-start", "span 2");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
  await page.reload();
  await expect(first).toHaveCSS("grid-row-start", "span 2");
  const id = await page.evaluate(() => localStorage.getItem("chroma.active-profile"));
  const saved = await (await page.request.get(`/api/profiles/${id}/config`)).json();
  expect(saved.tabs[0].sections[0]).toMatchObject({ layout: { type: "bento", columns: 4, rowHeight: 170 }, cards: [{ bento: { width: 2, height: 2 } }, {}, {}, { bento: { width: 2, height: 1 } }] });
  const small = page.getByTestId("card-card-B");
  await expect.poll(async () => {
    const box = (await first.boundingBox())!, other = (await small.boundingBox())!;
    return Math.abs(box.width - (other.width * 2 + 16));
  }).toBeLessThan(1);
  await expect.poll(async () => {
    const box = (await first.boundingBox())!, other = (await small.boundingBox())!;
    return Math.abs(box.height - (other.height * 2 + 16));
  }).toBeLessThan(1);
  await page.screenshot({ path: "test-results/bento-dashboard.png", fullPage: true });
  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => first.evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(first.getByRole("link")).toBeVisible();
  }
  // Duplicate keeps sizes; cancelling the editor discards the duplicate.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await edit(page);
  await first.click(); await page.keyboard.press("Control+d");
  await expect(page.getByTestId("section-section-a").locator("article")).toHaveCount(5);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("studio cancellation, keyboard isolation and validation never leak into the draft", async ({ page }) => {
  await edit(page);
  await page.getByRole("combobox", { name: "Presentation", exact: true }).selectOption("bento");
  await page.getByRole("button", { name: "Open Bento studio" }).click();
  const studio = page.getByRole("dialog", { name: "Bento studio" });
  await studio.getByLabel("Box width", { exact: true }).fill("13");
  await expect(studio.getByRole("button", { name: "Apply to draft" })).toBeDisabled();
  await expect(studio.getByRole("alert")).toBeVisible();
  await studio.getByRole("button", { name: "Tall 1 × 2", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect(studio).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(studio).toBeHidden();
  await expect(page.getByRole("button", { name: "Open Bento studio" })).toBeFocused();
  await expect(page.getByTestId("card-card-a")).toHaveCSS("grid-row-start", "span 1");
  await page.getByRole("button", { name: "Open Bento studio" }).click();
  await expect(studio.getByLabel("Box height", { exact: true })).toHaveValue("1");
  await expect(studio.locator(".layout-bento")).toHaveCSS("--bento-columns", "4");
  await page.screenshot({ path: "test-results/bento-studio.png", fullPage: true });
  await studio.getByRole("button", { name: "Cancel studio" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".layout-bento")).toHaveCount(0);
});

test("mixed-size bento cards can be reordered and moved across sections and tabs", async ({ page }) => {
  await edit(page);
  await page.getByRole("combobox", { name: "Presentation", exact: true }).selectOption("bento");
  await page.getByRole("button", { name: "Open Bento studio" }).click();
  await page.getByRole("button", { name: "Feature 2 × 2", exact: true }).click();
  await page.getByRole("button", { name: "Apply to draft" }).click();
  const source = page.getByTestId("card-card-a");
  async function drag(target: ReturnType<Page["getByTestId"]>, hoverTab?: string) {
    await source.hover();
    const from = (await source.boundingBox())!;
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 15, from.y + from.height / 2, { steps: 3 });
    if (hoverTab) {
      await page.getByTestId(hoverTab).hover();
      await expect(page.getByTestId(hoverTab)).toHaveAttribute("aria-current", "page");
    }
    await target.hover(); await page.mouse.up();
  }
  await drag(page.getByTestId("card-card-B"));
  await expect(page.getByTestId("section-section-a").locator("article").first()).toHaveAttribute("data-testid", "card-card-B");
  await drag(page.getByTestId("section-section-b"));
  await expect(page.getByTestId("section-section-b").getByTestId("card-card-a")).toBeVisible();
  await expect(source).toHaveCSS("grid-row-start", "auto");
  await drag(page.getByTestId("section-section-c"), "tab-tab-b");
  await expect(page.getByTestId("section-section-c").getByTestId("card-card-a")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
  const id = await page.evaluate(() => localStorage.getItem("chroma.active-profile"));
  const saved = await (await page.request.get(`/api/profiles/${id}/config`)).json();
  expect(saved.tabs[1].sections[0].cards[0].bento).toEqual({ width: 2, height: 2 });
});
