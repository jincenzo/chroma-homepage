import { test, expect, type Page } from "@playwright/test";
import { fixtureConfig } from "../fixtures";

test.beforeEach(async ({ page, request }) => {
  const response = await request.post("http://127.0.0.1:3001/api/profiles", { data: { name: "Post-it tests" } });
  const { profile } = await response.json();
  const config = fixtureConfig();
  config.tabs.push({ id: "empty", label: "Empty", icon: "lucide:sticky-note", sections: [] });
  await request.put(`http://127.0.0.1:3001/api/profiles/${profile.id}/config`, { data: config });
  await page.addInitScript((id) => localStorage.setItem("chroma.active-profile", id), profile.id);
  await page.goto("/");
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
});

async function saved(page: Page) {
  const id = await page.evaluate(() => localStorage.getItem("chroma.active-profile"));
  return (await page.request.get(`http://127.0.0.1:3001/api/profiles/${id}/config`)).json();
}

test("sections collapse without editing and remember their state across tabs and reloads", async ({ page }) => {
  await page.getByRole("button", { name: "Collapse A", exact: true }).click();
  await expect(page.getByTestId("card-card-a")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Expand A", exact: true })).toHaveAttribute("aria-expanded", "false");
  await page.getByTestId("tab-tab-b").click();
  await page.getByTestId("tab-tab-a").click();
  await expect(page.getByTestId("card-card-a")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand A", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expand A", exact: true }).click();
  await expect(page.getByTestId("card-card-a")).toBeVisible();
  expect(await saved(page)).toEqual({ ...fixtureConfig(), tabs: [...fixtureConfig().tabs, { id: "empty", label: "Empty", icon: "lucide:sticky-note", sections: [] }] });
});

test("the add popup dismisses with Escape without starting an edit", async ({ page }) => {
  const add = page.getByRole("button", { name: "Add new item", exact: true });
  await add.click();
  await expect(page.getByRole("dialog", { name: "What would you like to add?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(add).toBeFocused();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
});

test("a board supports text, colors, quick additions, undo and saving", async ({ page }) => {
  await page.getByRole("button", { name: "Add new item", exact: true }).click();
  await page.getByTestId("add-post-it-board").click();
  await page.getByLabel("Label", { exact: true }).fill("Ideas");
  await page.locator('[data-card-type="sticky-note"]').click();
  await page.getByLabel("Title", { exact: true }).fill("Remember");
  await page.getByLabel("Note", { exact: true }).fill("Call tomorrow\nBring the sketches");
  await page.getByRole("button", { name: "Mint post-it", exact: true }).click();
  await expect(page.locator(".sticky-note-content")).toHaveCSS("background-color", "rgb(191, 230, 199)");
  await page.getByRole("button", { name: "Quick add post-it", exact: true }).click();
  await expect(page.locator('[data-card-type="sticky-note"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator('[data-card-type="sticky-note"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Another idea");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
  await page.reload();
  await page.getByRole("button", { name: "Ideas", exact: true }).click();
  await expect(page.locator('[data-card-type="sticky-note"]')).toHaveCount(2);
  await expect(page.locator(".sticky-note-body").first()).toHaveText("Call tomorrow\nBring the sketches");
  const board = (await saved(page)).tabs.at(-1);
  expect(board.sections[0].cards[0]).toMatchObject({ type: "sticky-note", label: "Remember", content: "Call tomorrow\nBring the sketches", color: "mint" });
  await page.getByRole("button", { name: "Edit post-it Remember", exact: true }).click();
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Call tomorrow\nBring the sketches");
});

test("section quick add expands the target and Cancel discards the note", async ({ page }) => {
  await page.getByRole("button", { name: "Collapse B", exact: true }).click();
  await page.getByRole("button", { name: "Add post-it to B", exact: true }).click();
  await expect(page.getByTestId("section-section-b").locator('[data-card-type="sticky-note"]')).toBeVisible();
  await page.getByLabel("Note", { exact: true }).fill("Temporary idea");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator('[data-card-type="sticky-note"]')).toHaveCount(0);
  expect((await saved(page)).tabs[0].sections[1].cards).toHaveLength(0);
});

test("adding a card through the popup to an empty tab creates a section", async ({ page }) => {
  await page.getByTestId("tab-empty").click();
  await page.getByRole("button", { name: "Add new item", exact: true }).click();
  await page.getByTestId("add-post-it").click();
  await expect(page.locator('[data-card-type="sticky-note"]')).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("This tab has no sections yet.")).toBeVisible();
});
