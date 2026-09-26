import { mkdir, readFile } from "node:fs/promises";
import { chromium, expect, type Page } from "@playwright/test";
import { preview } from "vite";
import { parseConfig } from "../src/shared/config";
import { withShowcase } from "./showcase";

// Only this checked-in demo fixture is allowed; no runtime/profile/history input.
const config = withShowcase(parseConfig(JSON.parse(await readFile("config/default-config.json", "utf8"))));
const showcase = config.tabs.find((tab) => tab.label === "Style studio")!;
const directory = "docs/screenshots";
await mkdir(directory, { recursive: true });
const server = await preview({ preview: { host: "127.0.0.1", port: 4174, strictPort: true, open: false } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, locale: "en-US", timezoneId: "UTC" });
  await page.clock.setFixedTime(new Date("2026-09-26T09:41:00Z"));
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") throw new Error("Screenshots must never write to an API.");
    if (pathname === "/api/profiles") return route.fulfill({ json: [{ id: "default", name: config.homepage.title }] });
    if (pathname === "/api/profiles/default/config") return route.fulfill({ json: config });
    throw new Error(`Unexpected API access in screenshot capture: ${pathname}`);
  });
  await page.goto("http://127.0.0.1:4174");
  await expect(page.getByTestId("edit-button")).toBeVisible();
  await ready(page);
  await page.screenshot({ path: `${directory}/homepage.png`, animations: "disabled" });

  await page.setViewportSize({ width: 1600, height: 1180 });
  await page.getByTestId(`tab-${showcase.id}`).click();
  await page.getByTestId("edit-button").click();
  const section = page.getByTestId(`section-${showcase.sections[0].id}`);
  await section.getByRole("heading").click();
  await expect(page.getByRole("combobox", { name: "Presentation", exact: true })).toHaveValue("tiles");
  await ready(page);
  await page.screenshot({ path: `${directory}/editor.png`, animations: "disabled" });
  console.info("Captured two documentation screenshots from demo data only.");
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // Fail instead of silently publishing empty icons when the icon CDN is unavailable.
  await expect.poll(() => page.locator(".chroma-link-icon").evaluateAll((nodes) => nodes.every((node) => node.querySelector("svg, img"))), { timeout: 20_000 }).toBe(true);
}
