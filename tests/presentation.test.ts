import { describe, expect, it } from "vitest";
import { configSchema } from "../src/shared/config";
import { DEFAULT_APPEARANCE, resolveAppearance, resolveSectionAppearance, resolveTabAppearance } from "../src/shared/presentation";
import { moveCard } from "../src/shared/operations";
import { fixtureConfig } from "./fixtures";

describe("presentation document", () => {
  it("reads old documents and resolves section defaults with independent card overrides", () => {
    const config = configSchema.parse(fixtureConfig());
    const section = config.tabs[0].sections[0];
    const card = section.cards[0];
    expect(resolveAppearance(card, section).surface).toBe("glass");
    section.appearance = { accent: "#123456", density: "compact", showDescription: false };
    card.appearance = { surface: "minimal", showDescription: true };
    expect(resolveAppearance(card, section)).toMatchObject({
      accent: "#123456", density: "compact", surface: "minimal", showDescription: true
    });
  });

  it("round-trips layouts and styles and rejects invalid values", () => {
    const config = fixtureConfig();
    const section = config.tabs[0].sections[0];
    for (const type of ["grid", "tiles", "list"] as const) {
      section.layout.type = type;
      section.width = "third";
      section.appearance = { accent: "#fb7185", iconSize: 40, surface: "flat" };
      expect(configSchema.parse(JSON.parse(JSON.stringify(config)))).toEqual(config);
    }
    section.width = "two-thirds";
    expect(configSchema.parse(JSON.parse(JSON.stringify(config))).tabs[0].sections[0].width).toBe("two-thirds");
    section.appearance = { accent: "red", iconSize: 500 };
    expect(configSchema.safeParse(config).success).toBe(false);
  });

  it("validates shortcut destinations and unique keywords", () => {
    const config = fixtureConfig();
    config.homepage.searchShortcuts = [
      { id: "s1", keyword: "g", label: "Unsafe", urlTemplate: "javascript:{query}", openInNewTab: true }
    ];
    expect(configSchema.safeParse(config).success).toBe(false);
    config.homepage.searchShortcuts[0].urlTemplate = "https://example.com/?q={query}";
    expect(configSchema.safeParse(config).success).toBe(true);
    config.homepage.searchShortcuts.push({ ...config.homepage.searchShortcuts[0], id: "s2" });
    expect(configSchema.safeParse(config).success).toBe(false);
  });

  it("cascades accent from homepage to tab, section and card without copying inherited values", () => {
    const config = fixtureConfig(), tab = config.tabs[0], section = tab.sections[0], card = section.cards[0];
    const accent = () => resolveAppearance(card, section, tab, config.homepage).accent;
    expect(accent()).toBe(DEFAULT_APPEARANCE.accent);
    config.homepage.appearance = { accent: "#123456" };
    expect(accent()).toBe("#123456");
    tab.appearance = { accent: "#234567" };
    expect(accent()).toBe("#234567");
    section.appearance = { accent: "#345678", surface: "minimal" };
    expect(accent()).toBe("#345678");
    card.appearance = { accent: "#456789" };
    expect(accent()).toBe("#456789");
    config.homepage.appearance.accent = "#567890";
    expect(accent()).toBe("#456789");
    delete card.appearance.accent;
    expect(accent()).toBe("#345678");
    delete section.appearance.accent;
    expect(accent()).toBe("#234567");
    delete tab.appearance.accent;
    expect(accent()).toBe("#567890");
    expect(card.appearance.accent).toBeUndefined();
    expect(resolveAppearance(card, section, tab, config.homepage).surface).toBe("minimal");
    expect(resolveSectionAppearance(section, tab, config.homepage).accent).toBe("#567890");
    expect(resolveTabAppearance(tab, config.homepage).accent).toBe("#567890");
  });

  it("adopts a destination tab's accent when moved unless the card overrides it", () => {
    const config = fixtureConfig();
    config.homepage.appearance = { accent: "#112233" };
    config.tabs[1].appearance = { accent: "#abcdef" };
    const moved = moveCard(config, "card-a", "tab-b", "section-c");
    const tab = moved.tabs[1], section = tab.sections[0], card = section.cards[0];
    expect(resolveAppearance(card, section, tab, moved.homepage).accent).toBe("#abcdef");
    expect(card.appearance).toBeUndefined();
    card.appearance = { accent: "#778899" };
    const back = moveCard(moved, "card-a", "tab-a", "section-b");
    expect(resolveAppearance(back.tabs[0].sections[1].cards[0], back.tabs[0].sections[1], back.tabs[0], back.homepage).accent).toBe("#778899");
  });

  it("round-trips homepage and tab accents and rejects invalid colors", () => {
    const config = fixtureConfig();
    config.homepage.appearance = { accent: "#abcdef" };
    config.tabs[0].appearance = { accent: "#123456" };
    expect(configSchema.parse(JSON.parse(JSON.stringify(config)))).toEqual(config);
    config.homepage.appearance.accent = "red";
    expect(configSchema.safeParse(config).success).toBe(false);
    config.homepage.appearance.accent = "#abcdef";
    config.tabs[0].appearance.accent = "#xyzxyz";
    expect(configSchema.safeParse(config).success).toBe(false);
  });
});
