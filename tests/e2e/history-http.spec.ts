import { expect, test } from "@playwright/test";
import { parseConfig } from "../../src/shared/config";

for (const fetchDetails of [false, true]) {
  test(`HistoryOut final add works without randomUUID, metadata ${fetchDetails ? "on" : "off"}`, async ({ page, request }) => {
    const created = await request.post("http://127.0.0.1:3001/api/profiles", { data: { name: "HTTP history regression" } });
    const { profile } = await created.json();
    const endpoint = `http://127.0.0.1:3001/api/profiles/${profile.id}/config`;
    // localhost is a secure context; simulate the missing API on HTTP LAN hosts.
    await page.addInitScript((profileId: string) => {
      localStorage.setItem("chroma.active-profile", profileId);
      Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    }, profile.id);
    await page.route("**/api/link-preview", (route) => route.fulfill({ json: { url: route.request().postDataJSON().url, title: "Discovered website", description: "Website details" } }));
    await page.goto("/");
    await page.getByTestId("edit-button").click();
    await page.getByRole("button", { name: "Import HistoryOut", exact: true }).click();
    // Optional local reproduction file is never copied into the repository.
    await page.getByLabel("HistoryOut JSON file", { exact: true }).setInputFiles(process.env.HISTORYOUT_TEST_FILE ?? {
      name: "history-export.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(Array.from({ length: 305 }, (_, index) => ({
        url: `https://site-${index % 30}.example/page-${index}`, title: "A private page title", visitCount: index + 1
      }))))
    });
    await expect(page.getByText("20 selected · Maximum 100 per import")).toBeVisible();
    if (fetchDetails) {
      await page.getByRole("checkbox", { name: "Fetch site titles and icons", exact: true }).check();
      await page.getByRole("button", { name: "Preview site details", exact: true }).click();
      await expect(page.getByText("Site details ready", { exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Add 20 sites to draft", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Import HistoryOut", exact: true })).toBeHidden();
    await expect(page.locator('[data-testid^="card-"]')).toHaveCount(20);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("edit-button")).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-testid^="card-"]')).toHaveCount(20);
    const saved = parseConfig(await (await request.get(endpoint)).json());
    const imported = saved.tabs.at(-1)!;
    expect(imported.sections.flatMap((section) => section.cards)).toHaveLength(20);
    expect(imported.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
}
