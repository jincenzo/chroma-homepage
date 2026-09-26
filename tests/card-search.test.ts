import { describe, expect, it } from "vitest";
import { resolveSearchShortcut, searchCards } from "../src/client/lib/card-search";
import { fixtureConfig } from "./fixtures";

describe("card search", () => {
  it("finds typos, transpositions, aliases, and tags across tabs", () => {
    const config = fixtureConfig();
    const card = config.tabs[0].sections[0].cards[0];
    card.label = "Home Assistant";
    card.aliases = ["ha"];
    card.tags = ["automation"];
    expect(searchCards(config, "ha")[0].card.id).toBe(card.id);
    expect(searchCards(config, "home assitant")[0].card.id).toBe(card.id);
    expect(searchCards(config, "home assitsant")[0].card.id).toBe(card.id);
    expect(searchCards(config, "#automation")[0].card.id).toBe(card.id);
    expect(searchCards(config, "#missing")).toEqual([]);
    expect(searchCards(config, "unrelated")).toEqual([]);
  });

  it("encodes web queries and allows custom or disabled shortcuts", () => {
    const config = fixtureConfig();
    expect(resolveSearchShortcut(config, "gh react & typescript")?.url)
      .toBe("https://github.com/search?q=react%20%26%20typescript");
    expect(resolveSearchShortcut(config, "gh ")).toBeUndefined();
    config.homepage.searchShortcuts = [];
    expect(resolveSearchShortcut(config, "gh react")).toBeUndefined();
    config.homepage.searchShortcuts = [{ id: "docs", keyword: "docs", label: "Docs", urlTemplate: "https://example.com/?q={query}", openInNewTab: false }];
    expect(resolveSearchShortcut(config, "docs a#b")).toMatchObject({ url: "https://example.com/?q=a%23b", openInNewTab: false });
  });
  it("matches labels, descriptions, locations, and URLs", () => {
    const config = fixtureConfig();
    config.tabs[0].sections[0].cards[0].description = "Monitoring console";
    expect(searchCards(config, "A")[0].card.id).toBe("card-a");
    expect(searchCards(config, "monitoring")[0].card.id).toBe("card-a");
    expect(searchCards(config, "section-a")).toHaveLength(0);
    expect(searchCards(config, "example.com")[0].card.id).toBe("card-a");
  });

  it("prioritizes label prefixes and respects the result limit", () => {
    const results = searchCards(fixtureConfig(), "A", 1);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThanOrEqual(80);
  });
});
