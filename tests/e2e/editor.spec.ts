import { expect, test, type Page } from "@playwright/test";
import defaultConfig from "../../config/default-config.json" with { type: "json" };
import { fixtureConfig } from "../fixtures";

async function openProfileCreation(page: Page) {
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "New profile", exact: true }).click();
}

async function switchProfile(page: Page, id: string) {
  await page.getByTestId("profile-switcher").click();
  await page.locator(`[role="menuitemradio"][data-profile-id="${id}"]`).click();
}

const historyExport = [
  { order: 1, id: "86039", date: "9/26/2026", time: "8:45:36 PM", title: "Welcome to HistoryOut", url: "chrome-extension://idohnkdgejocejlkihihonhemndpiiei/welcome.html", visitCount: 1, typedCount: 0, transition: "link" },
  { url: "https://github.com/private-repo?token=do-not-send", title: "Private project title", visitCount: 30 },
  { url: "https://github.com/private-repo?token=do-not-send", title: "Private project title", visitCount: 30 },
  { url: "https://wikipedia.org/", title: "Wikipedia", visitCount: 20 },
  { url: "http://nas.local:8080/admin#private", title: "Private console", visitCount: 10 }
];

async function chooseHistoryFile(page: Page, data: unknown) {
  await page.getByLabel("HistoryOut JSON file", { exact: true }).setInputFiles({ name: "historyout.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
}

test("HistoryOut imports a reviewed selection into one profile without sending raw history", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: defaultConfig });
  const original = await (await request.get("http://127.0.0.1:3001/api/config")).json();
  const created = await request.post("http://127.0.0.1:3001/api/profiles", { data: { name: "HistoryOut sandbox" } });
  const { profile } = await created.json();
  const endpoint = `http://127.0.0.1:3001/api/profiles/${profile.id}/config`;
  const before = await (await request.get(endpoint)).json();
  const bodies: string[] = [];
  page.on("request", (req) => { if (req.postData()) bodies.push(req.postData()!); });
  await page.goto("/");
  await switchProfile(page, profile.id);
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByRole("button", { name: "Import HistoryOut", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import HistoryOut", exact: true });
  await chooseHistoryFile(page, historyExport);
  await expect(dialog.getByText("3 selected · Maximum 100 per import")).toBeVisible();
  await expect(dialog).toContainText("1 unsupported/credential URLs skipped");
  await page.getByRole("checkbox", { name: "Select http://nas.local:8080/", exact: true }).uncheck();
  await page.getByLabel("Label for https://github.com/", { exact: true }).fill("Code home");
  await page.getByLabel("New tab name", { exact: true }).fill("Daily browsing");
  await page.getByRole("combobox", { name: "Imported card layout", exact: true }).selectOption("list");
  await page.keyboard.press("Control+s");
  await expect(dialog).toBeVisible();
  expect(bodies).toEqual([]);
  await page.getByRole("button", { name: "Add 2 sites to draft", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Code home", { exact: true })).toBeVisible();
  expect(await (await request.get(endpoint)).json()).toEqual(before);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("Code home", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByText("Code home", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("link", { name: "Code home", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Dashboard tabs" }).getByRole("button", { name: "Daily browsing", exact: true }).click();
  await expect(page.getByRole("link", { name: "Code home", exact: true })).toHaveAttribute("href", "https://github.com/");
  await expect(page.getByRole("link", { name: "Wikipedia", exact: true })).toHaveAttribute("href", "https://wikipedia.org/");
  expect(await (await request.get("http://127.0.0.1:3001/api/config")).json()).toEqual(original);
  const saved = await (await request.get(endpoint)).json();
  expect(saved.tabs[1].sections[0].layout.type).toBe("list");
  expect(bodies.join(" ")).not.toMatch(/do-not-send|private-repo|Private project|86039/);
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByRole("button", { name: "Import HistoryOut", exact: true }).click();
  await chooseHistoryFile(page, historyExport);
  await expect(page.getByRole("checkbox", { name: "Select https://github.com/", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel import", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("HistoryOut rejects malformed input and empty results without touching the draft", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: fixtureConfig() });
  await page.goto("/");
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByRole("button", { name: "Import HistoryOut", exact: true }).click();
  await page.getByLabel("HistoryOut JSON file", { exact: true }).setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from('[{"url":') });
  await expect(page.getByRole("alert")).toContainText("Invalid JSON");
  await chooseHistoryFile(page, { homepage: {} });
  await expect(page.getByRole("alert")).toContainText("JSON array");
  await chooseHistoryFile(page, [historyExport[0]]);
  await expect(page.getByText("No importable HTTP(S) sites found in this file.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add 0 sites to draft", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Import HistoryOut" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await expect(page.getByTestId("card-card-a")).toBeVisible();
});

test("HistoryOut fetches only approved homepages, preserves edited labels and tolerates discovery failures", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: fixtureConfig() });
  const previewRequests: { url: string; allowLocalNetwork: boolean }[] = [];
  await page.route("**/api/link-preview", (route) => {
    const body = route.request().postDataJSON() as { url: string; allowLocalNetwork: boolean };
    previewRequests.push(body);
    return body.url.includes("wikipedia") ? route.fulfill({ status: 422, json: { error: "Unavailable" } }) : route.fulfill({ json: { url: body.url, title: "Detected title", description: "Detected description", icon: { type: "iconify", value: "mdi:github" } } });
  });
  await page.goto("/");
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByRole("button", { name: "Import HistoryOut", exact: true }).click();
  await chooseHistoryFile(page, historyExport);
  await expect(page.getByText("3 selected · Maximum 100 per import")).toBeVisible();
  await page.getByRole("checkbox", { name: "Select http://nas.local:8080/", exact: true }).uncheck();
  await page.getByLabel("Label for https://github.com/", { exact: true }).fill("Keep my label");
  await page.getByRole("checkbox", { name: "Fetch site titles and icons", exact: true }).check();
  await page.getByRole("combobox", { name: "Destination tab", exact: true }).selectOption("tab-b");
  await page.getByRole("button", { name: "Preview site details", exact: true }).click();
  await expect(page.getByText("Site details ready", { exact: true })).toBeVisible();
  await expect(page.getByText(/1 sites had missing or unavailable details/)).toBeVisible();
  expect(previewRequests.map((item) => item.url).sort()).toEqual(["https://github.com/", "https://wikipedia.org/"]);
  expect(previewRequests.every((item) => !item.allowLocalNetwork)).toBe(true);
  await page.getByRole("button", { name: "Add 2 sites to draft", exact: true }).click();
  await expect(page.getByText("Keep my label", { exact: true })).toBeVisible();
  await expect(page.getByText("Wikipedia", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Keep my label", { exact: true })).toBeHidden();
  expect((await (await request.get("http://127.0.0.1:3001/api/config")).json()).tabs).toHaveLength(2);
});

test("homepage settings edits existing identity and cascades accent through tab, section and card", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: fixtureConfig() });
  await page.goto("/");
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Homepage settings", exact: true })).toBeVisible();
  await page.getByLabel("Homepage title / profile name", { exact: true }).fill("My space");
  await page.getByTitle("lucide:server", { exact: true }).click();
  await page.getByLabel("Default accent color", { exact: true }).fill("#00aabb");
  const card = page.getByTestId("card-card-a");
  await expect(card).toHaveCSS("--card-accent", "#00aabb");
  const navigation = page.getByRole("navigation", { name: "Dashboard tabs" });
  await navigation.getByRole("button", { name: "A", exact: true }).click();
  await expect(page.getByLabel("Accent color", { exact: true })).toHaveValue("#00aabb");
  await page.getByLabel("Accent color", { exact: true }).fill("#112233");
  await expect(card).toHaveCSS("--card-accent", "#112233");
  await page.getByRole("heading", { name: "A", exact: true }).click();
  await expect(page.getByLabel("Accent color", { exact: true })).toHaveValue("#112233");
  await page.getByLabel("Accent color", { exact: true }).fill("#445566");
  await expect(card).toHaveCSS("--card-accent", "#445566");
  await card.click();
  await expect(page.getByLabel("Accent color", { exact: true })).toHaveValue("#445566");
  await page.getByLabel("Accent color", { exact: true }).fill("#778899");
  await expect(card).toHaveCSS("--card-accent", "#778899");
  await page.getByRole("button", { name: "Homepage settings", exact: true }).click();
  await page.getByLabel("Default accent color", { exact: true }).fill("#aabbcc");
  await expect(card).toHaveCSS("--card-accent", "#778899");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("heading", { name: "My space", exact: true })).toBeVisible();
  await expect(card).toHaveCSS("--card-accent", "#778899");
  const saved = await (await request.get("http://127.0.0.1:3001/api/config")).json();
  expect(saved.homepage.icon).toEqual({ type: "iconify", value: "lucide:server" });
  expect(saved.homepage.appearance.accent).toBe("#aabbcc");
  expect(saved.tabs[0].appearance.accent).toBe("#112233");
});

test("places tab navigation in a persistent left or right rail outside the dashboard canvas", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: fixtureConfig() });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Dashboard tabs" });
  const canvas = page.getByTestId("canvas-tab-a");
  const position = page.getByRole("combobox", { name: "Tab navigation position" });

  await position.selectOption("left");
  await expect(navigation).toHaveAttribute("data-position", "left");
  await expect.poll(async () => {
    const nav = await navigation.boundingBox(), content = await canvas.boundingBox();
    return Boolean(nav && content && nav.x + nav.width < content.x);
  }).toBe(true);
  await expect.poll(async () => {
    const first = await page.getByTestId("tab-tab-a").boundingBox(), second = await page.getByTestId("tab-tab-b").boundingBox();
    return Boolean(first && second && second.y > first.y + 20);
  }).toBe(true);

  await position.selectOption("right");
  await expect(navigation).toHaveAttribute("data-position", "right");
  await expect.poll(async () => {
    const nav = await navigation.boundingBox(), content = await canvas.boundingBox();
    return Boolean(nav && content && nav.x > content.x + content.width);
  }).toBe(true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await expect(navigation).toHaveAttribute("data-position", "right");
  const saved = await (await request.get("http://127.0.0.1:3001/api/config")).json();
  expect(saved.homepage.tabPosition).toBe("right");

  await page.setViewportSize({ width: 700, height: 900 });
  await expect.poll(async () => {
    const nav = await navigation.boundingBox(), content = await canvas.boundingBox();
    return Boolean(nav && content && nav.y + nav.height < content.y);
  }).toBe(true);
});

test("Inherit removes accent overrides, supports undo and follows homepage changes after reload", async ({ page, request }) => {
  const config = fixtureConfig();
  config.homepage.appearance = { accent: "#00aabb" };
  config.tabs[0].appearance = { accent: "#112233" };
  config.tabs[0].sections[0].appearance = { accent: "#445566" };
  config.tabs[0].sections[0].cards[0].appearance = { accent: "#778899" };
  await request.put("http://127.0.0.1:3001/api/config", { data: config });
  await page.goto("/");
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  const card = page.getByTestId("card-card-a");
  await card.click();
  await page.getByRole("button", { name: "Inherit accent from section", exact: true }).click();
  await expect(card).toHaveCSS("--card-accent", "#445566");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(card).toHaveCSS("--card-accent", "#778899");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("heading", { name: "A", exact: true }).click();
  await page.getByRole("button", { name: "Inherit accent from tab", exact: true }).click();
  await expect(card).toHaveCSS("--card-accent", "#112233");
  await page.getByRole("navigation", { name: "Dashboard tabs" }).getByRole("button", { name: "A", exact: true }).click();
  await page.getByRole("button", { name: "Inherit accent from homepage", exact: true }).click();
  await expect(card).toHaveCSS("--card-accent", "#00aabb");
  await page.getByRole("button", { name: "Homepage settings", exact: true }).click();
  await page.getByLabel("Default accent color", { exact: true }).fill("#ddaa00");
  await expect(card).toHaveCSS("--card-accent", "#ddaa00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
  await page.reload();
  await expect(card).toHaveCSS("--card-accent", "#ddaa00");
  const saved = await (await request.get("http://127.0.0.1:3001/api/config")).json();
  expect(saved.tabs[0].appearance?.accent).toBeUndefined();
  expect(saved.tabs[0].sections[0].appearance?.accent).toBeUndefined();
  expect(saved.tabs[0].sections[0].cards[0].appearance?.accent).toBeUndefined();
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByLabel("Default accent color", { exact: true }).fill("#ff0000");
  await page.getByLabel("Homepage title / profile name", { exact: true }).fill("Discard this name");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(card).toHaveCSS("--card-accent", "#ddaa00");
  await expect(page.getByRole("heading", { name: "Test", exact: true })).toBeVisible();
});

test("profile avatar menu is icon-only, keyboard accessible, and ends with New profile", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: defaultConfig });
  await page.goto("/");
  const trigger = page.getByTestId("profile-switcher");
  await expect(trigger).toHaveText("");
  await expect(page.getByRole("menuitem", { name: "New profile" })).toBeHidden();
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Homepage profiles" });
  await expect(menu).toBeVisible();
  await expect(menu.locator('button[aria-checked="true"]')).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.locator("button").last()).toHaveText("New profile");
  await expect(page.getByRole("menuitem", { name: "New profile" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("heading", { name: "Chroma Homepage", exact: true }).click();
  await expect(menu).toBeHidden();
});

test("profile avatars support creation, image uploads, undo, cancel, save and reload", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: defaultConfig });
  // Keep Iconify rendering deterministic and independent from its public API.
  await page.route("https://api.iconify.design/**", (route) => route.fulfill({ json: {
    prefix: "lucide", width: 24, height: 24,
    icons: { server: { body: '<path d="M4 4h16v16H4z" fill="currentColor"/>' }, house: { body: '<path d="M3 12L12 3l9 9v9H3z" fill="currentColor"/>' } }
  } }));
  await page.goto("/");
  await openProfileCreation(page);
  await page.getByLabel("Profile name", { exact: true }).fill("Avatar test");
  await page.getByTitle("lucide:server", { exact: true }).click();
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  const trigger = page.getByTestId("profile-switcher");
  await expect(trigger).toHaveAccessibleName("Homepage profile: Avatar test");
  const id = (await trigger.getAttribute("data-profile-id"))!;
  const endpoint = `http://127.0.0.1:3001/api/profiles/${id}/config`;
  expect((await (await request.get(endpoint)).json()).homepage.icon).toEqual({ type: "iconify", value: "lucide:server" });
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  const avatarEditor = page.getByRole("group", { name: "Profile avatar", exact: true });
  await avatarEditor.getByLabel("Upload custom image", { exact: true }).setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4xkAAAAASUVORK5CYII=", "base64") });
  await expect(trigger.locator("img")).toBeVisible();
  const src = await trigger.locator("img").getAttribute("src");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(trigger.locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(trigger.locator("img")).toHaveAttribute("src", src!);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(trigger).toBeEnabled();
  await page.reload();
  await expect(trigger.locator("img")).toHaveAttribute("src", src!);
  expect((await (await request.get(endpoint)).json()).homepage.icon.type).toBe("asset");
  await trigger.click();
  await expect(page.locator(`[role="menuitemradio"][data-profile-id="${id}"] img`)).toHaveAttribute("src", src!);
  await page.keyboard.press("Escape");
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByRole("button", { name: "Use default avatar", exact: true }).click();
  await expect(trigger.locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(trigger.locator("img")).toHaveAttribute("src", src!);
  await switchProfile(page, "default");
  await expect(trigger.locator("img")).toHaveCount(0);
  await switchProfile(page, id);
  await expect(trigger.locator("img")).toHaveAttribute("src", src!);
});

test("creates, moves, saves, and reloads a link card", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: defaultConfig });
  await page.goto("/");
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByTestId("section-home-quick-access").click({ position: { x: 12, y: 12 } });
  await page.getByTestId("add-card").click();
  await page.getByLabel("Label").fill("Playwright Link");
  const card = page.getByText("Playwright Link", { exact: true }).locator("xpath=ancestor::article");
  await card.dragTo(page.getByTestId("section-home-smart-home"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
  await page.reload();
  await expect(page.getByText("Playwright Link", { exact: true })).toBeVisible();
});

test("opens and executes a matching card from global typing", async ({ page, request, context }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: defaultConfig });
  await context.route("https://grafana.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>Grafana</title>" }));
  await page.goto("/");

  await page.getByRole("searchbox", { name: "Search Google" }).fill("grafana");
  await expect(page.getByRole("dialog", { name: "Find a card" })).toBeHidden();
  await page.getByRole("searchbox", { name: "Search Google" }).fill("");
  await page.getByRole("heading", { name: "Chroma Homepage" }).click();

  await page.keyboard.type("graf");
  await expect(page.getByRole("dialog", { name: "Find a card" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Grafana/ })).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  await page.keyboard.press("Enter");
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toContain("grafana.com");
  await popup.close();
  await page.getByRole("button", { name: "Infrastructure", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Observability", exact: true })).toBeVisible();
});

test("persists section presentation and card overrides, with undo and cancel", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: defaultConfig });
  await page.goto("/");
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByRole("heading", { name: "Smart home", exact: true }).click();
  await page.getByRole("combobox", { name: "Presentation", exact: true }).selectOption("tiles");
  await page.getByRole("combobox", { name: "Section width" }).selectOption("two-thirds");
  await page.getByRole("combobox", { name: "Surface", exact: true }).selectOption("flat");
  await page.getByLabel("Accent color").fill("#ff8800");
  const section = page.getByTestId("section-home-smart-home");
  await expect(section.locator(".layout-tiles")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Accent color")).toHaveValue("#2dd4bf");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel("Accent color")).toHaveValue("#ff8800");
  await page.getByTestId("card-home-assistant").click();
  await page.getByRole("combobox", { name: "Surface", exact: true }).selectOption("minimal");
  await page.getByRole("combobox", { name: "Icon size", exact: true }).selectOption("40");
  await page.getByRole("combobox", { name: "Description visibility" }).selectOption("false");
  await page.getByLabel("Aliases (comma separated)").fill("ha, smart house");
  await page.getByLabel("Tags (comma separated)").fill("automation, favorites");
  await page.keyboard.press("Control+s");
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
  await page.reload();
  const card = page.getByTestId("card-home-assistant");
  await expect(card).toHaveAttribute("data-surface", "minimal");
  await expect(card).toHaveCSS("--card-accent", "#ff8800");
  await expect(card.locator(".chroma-link-description")).toBeHidden();
  await expect(section).toHaveAttribute("data-width", "two-thirds");
  const saved = await (await request.get("http://127.0.0.1:3001/api/config")).json();
  const savedSection = saved.tabs[0].sections.find((item: { id: string }) => item.id === "home-smart-home");
  expect(savedSection.cards[0].aliases).toEqual(["ha", "smart house"]);
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByRole("heading", { name: "Smart home", exact: true }).click();
  await page.getByRole("combobox", { name: "Presentation", exact: true }).selectOption("list");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(section.locator(".layout-tiles")).toBeVisible();
});

test("launcher supports aliases, fuzzy search, tags, and encoded web shortcuts", async ({ page, request, context }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: defaultConfig });
  await context.route("https://github.com/search**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>Search</title>" }));
  await page.goto("/");
  await page.getByTestId("profile-switcher").waitFor();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("textbox", { name: "Find a card", exact: true });
  await expect(search).toBeFocused();
  await search.fill("ha");
  await expect(page.locator('.chroma-launcher-result[aria-current="true"]')).toContainText("Home Assistant");
  await search.fill("grafnaa");
  await expect(page.locator('.chroma-launcher-result[aria-current="true"]')).toContainText("Grafana");
  await search.fill("#automation");
  await expect(page.getByRole("dialog").getByRole("button", { name: /Home Assistant/ })).toBeVisible();
  await search.fill("gh react & typescript");
  await expect(page.getByRole("button", { name: /Search GitHub/ })).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  await search.press("Enter");
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(new URL(popup.url()).searchParams.get("q")).toBe("react & typescript");
  await popup.close();
  await page.keyboard.press("Control+k");
  await search.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("section widths respond to available canvas space without horizontal overflow", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: defaultConfig });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const smart = page.getByTestId("section-home-smart-home");
  const cloud = page.getByTestId("section-home-personal-cloud");
  await expect(smart).toBeVisible();
  const left = await smart.boundingBox(), right = await cloud.boundingBox();
  expect(Math.abs(left!.y - right!.y)).toBeLessThan(2);
  expect(right!.x).toBeGreaterThan(left!.x + left!.width);
  await page.setViewportSize({ width: 600, height: 900 });
  await expect.poll(async () => {
    const a = await smart.boundingBox(), b = await cloud.boundingBox();
    return b!.y > a!.y + a!.height;
  }).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("pasting a URL fills a new card and persists the suggested metadata", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: defaultConfig });
  const assetId = "7fa61800-3833-4e2d-9df8-929ce87747ac";
  await page.route("**/api/link-preview", (route) => route.fulfill({ json: {
    url: route.request().postDataJSON().url,
    title: "Discovered service", description: "Details from the site",
    icon: { type: "asset", assetId }
  } }));
  await page.route(`**/api/assets/${assetId}`, (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4xkAAAAASUVORK5CYII=", "base64")
  }));
  await page.goto("/");
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByTestId("add-card").click();
  await page.getByLabel("URL", { exact: true }).fill("https://discovered.example/");
  await expect(page.getByLabel("Label", { exact: true })).toHaveValue("Discovered service");
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Details from the site");
  await expect(page.getByText("Added to your draft. Save when you are ready.")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("link", { name: /Discovered service/ })).toBeVisible();
  const saved = await (await request.get("http://127.0.0.1:3001/api/config")).json();
  const found = saved.tabs.flatMap((tab: { sections: { cards: { label: string; icon: unknown }[] }[] }) => tab.sections.flatMap((section) => section.cards)).find((card: { label: string }) => card.label === "Discovered service");
  expect(found.icon).toEqual({ type: "asset", assetId });
});

test("metadata suggestions preserve existing custom fields until applied and can be undone", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: defaultConfig });
  await page.route("**/api/link-preview", (route) => route.fulfill({ json: {
    url: route.request().postDataJSON().url,
    title: "Suggested title", description: "Suggested description",
    warning: "No usable favicon found. Your current icon will be kept."
  } }));
  await page.goto("/");
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByTestId("card-home-assistant").click();
  await page.getByLabel("URL", { exact: true }).fill("https://changed.example/");
  await expect(page.getByRole("button", { name: "Use detected details" })).toBeVisible();
  await expect(page.getByLabel("Label", { exact: true })).toHaveValue("Home Assistant");
  await page.getByRole("button", { name: "Use detected details" }).click();
  await expect(page.getByLabel("Label", { exact: true })).toHaveValue("Suggested title");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Label", { exact: true })).toHaveValue("Home Assistant");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("link", { name: /Home Assistant/ })).toHaveAttribute("href", "https://home-assistant.io");
});

test("creates an independent homepage, protects drafts, saves and remembers the selected profile", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: defaultConfig });
  const original = await (await request.get("http://127.0.0.1:3001/api/config")).json();
  await page.goto("/");
  const selector = page.getByTestId("profile-switcher");
  await expect(selector).toHaveAttribute("data-profile-id", "default");
  await openProfileCreation(page);
  await page.getByLabel("Profile name", { exact: true }).fill("History sandbox");
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "History sandbox", exact: true })).toBeVisible();
  const id = (await selector.getAttribute("data-profile-id"))!;
  expect(id).not.toBe("default");
  await expect(page.getByRole("link", { name: /Home Assistant/ })).toBeHidden();
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await expect(selector).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "New profile", exact: true })).toBeHidden();
  await page.getByLabel("Homepage title / profile name", { exact: true }).fill("History workspace");
  await page.getByTestId("add-card").click();
  await page.getByLabel("Label", { exact: true }).fill("Only in sandbox");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(selector).toBeEnabled();
  await page.reload();
  await expect(selector).toHaveAttribute("data-profile-id", id);
  await expect(selector).toHaveAccessibleName("Homepage profile: History workspace");
  await expect(page.getByRole("link", { name: /Only in sandbox/ })).toBeVisible();
  await switchProfile(page, "default");
  await expect(page.getByRole("link", { name: /Home Assistant/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Only in sandbox/ })).toBeHidden();
  expect(await (await request.get("http://127.0.0.1:3001/api/config")).json()).toEqual(original);
  await switchProfile(page, id);
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  await page.getByTestId("add-card").click();
  await page.getByLabel("Label", { exact: true }).fill("Discard this");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await switchProfile(page, "default");
  await switchProfile(page, id);
  await expect(page.getByRole("link", { name: /Discard this/ })).toBeHidden();
});

test("copies a profile and imports JSON only into that profile, with undo and validation", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: defaultConfig });
  const original = await (await request.get("http://127.0.0.1:3001/api/config")).json();
  await page.goto("/");
  await openProfileCreation(page);
  await page.getByLabel("Profile name", { exact: true }).fill("My copy");
  await page.getByRole("combobox", { name: "Start with", exact: true }).selectOption("copy");
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My copy", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Home Assistant/ })).toBeVisible();
  const selector = page.getByTestId("profile-switcher");
  const id = (await selector.getAttribute("data-profile-id"))!;
  await page.getByTestId("profile-switcher").click();
  await page.getByRole("menuitem", { name: "Homepage settings", exact: true }).click();
  const fileInput = page.getByRole("button", { name: "Import configuration", exact: true }).locator('input[type="file"]');
  page.once("dialog", (dialog) => dialog.accept());
  await fileInput.setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"invalid":true}') });
  await expect(page.getByRole("heading", { name: "My copy", exact: true })).toBeVisible();
  const imported = structuredClone(defaultConfig);
  imported.homepage.title = "Imported profile";
  await fileInput.setInputFiles({ name: "import.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.getByRole("heading", { name: "Imported profile", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My copy", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(selector).toBeEnabled();
  await expect(selector).toHaveAccessibleName("Homepage profile: Imported profile");
  await page.reload();
  await expect(selector).toHaveAttribute("data-profile-id", id);
  await expect(page.getByRole("heading", { name: "Imported profile", exact: true })).toBeVisible();
  expect(await (await request.get("http://127.0.0.1:3001/api/config")).json()).toEqual(original);
});

test("a failed profile switch leaves the current homepage selected and editable", async ({ page, request }) => {
  await request.put("http://127.0.0.1:3001/api/config", { data: defaultConfig });
  const result = await request.post("http://127.0.0.1:3001/api/profiles", { data: { name: "Unavailable" } });
  const { profile } = await result.json();
  await page.goto("/");
  await page.route(`**/api/profiles/${profile.id}/config`, (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  const selector = page.getByTestId("profile-switcher");
  await switchProfile(page, profile.id);
  await expect(page.getByRole("alert")).toContainText("Could not load");
  await expect(selector).toHaveAttribute("data-profile-id", "default");
  await expect(page.getByRole("link", { name: /Home Assistant/ })).toBeVisible();
  await expect(page.getByTestId("profile-switcher")).toBeEnabled();
});
