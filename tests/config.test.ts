import { describe, expect, it } from "vitest";
import { configSchema, parseConfig, stickyNoteCardSchema } from "../src/shared/config";
import { createStickyNoteCard } from "../src/shared/operations";
import { CURRENT_SCHEMA_VERSION, migrateConfig, registeredMigrationVersions } from "../src/shared/migrations";
import { fixtureConfig } from "./fixtures";

describe("configuration schema", () => {
  it("accepts a valid hierarchical document", () => {
    expect(parseConfig(fixtureConfig()).tabs).toHaveLength(2);
  });

  it("round-trips note content and colors and validates imported notes", () => {
    const config = fixtureConfig();
    const note = { ...createStickyNoteCard(), content: "A reminder\n<script>plain text</script>", color: "pink" as const };
    config.tabs[0].sections[0].cards.push(note);
    expect(parseConfig(JSON.parse(JSON.stringify(config))).tabs[0].sections[0].cards.at(-1)).toEqual(note);
    expect(stickyNoteCardSchema.safeParse({ ...note, color: "unknown" }).success).toBe(false);
    expect(stickyNoteCardSchema.safeParse({ ...note, content: "x".repeat(10001) }).success).toBe(false);
    const minimal = { ...note, color: undefined, content: undefined };
    expect(stickyNoteCardSchema.parse(minimal)).toMatchObject({ color: "yellow", content: "" });
  });

  it("defaults legacy tab navigation to the top and accepts both side rails", () => {
    const legacy = structuredClone(fixtureConfig()) as unknown as { homepage: Record<string, unknown> };
    delete legacy.homepage.tabPosition;
    expect(parseConfig(legacy).homepage.tabPosition).toBe("top");
    for (const position of ["left", "right"] as const) {
      const config = fixtureConfig();
      config.homepage.tabPosition = position;
      expect(parseConfig(config).homepage.tabPosition).toBe(position);
    }
  });

  it("rejects duplicate IDs and invalid default tabs", () => {
    const config = fixtureConfig();
    config.tabs[1].id = "tab-a";
    config.homepage.defaultTabId = "missing";
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([expect.stringContaining("Duplicate id"), expect.stringContaining("defaultTabId")]));
  });

  it("rejects executable URLs and embedded credentials in imported link cards", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/private", "https://user:password@example.com/"]) {
      const config = fixtureConfig();
      const card = config.tabs[0].sections[0].cards[0];
      if (card.type !== "link") throw new Error("Expected a link fixture");
      card.url = url;
      expect(configSchema.safeParse(config).success).toBe(false);
    }
  });

  it("accepts Formula 1 cards without allowing credentials into the document", () => {
    const config = fixtureConfig();
    config.tabs[0].sections[0].cards.push({
      id: "f1-card", type: "formula-one", view: "next-race", driverCount: 3, label: "Next race", refreshMinutes: 60,
      icon: { type: "iconify", value: "simple-icons:f1" }
    });
    const input = structuredClone(config) as unknown as { tabs: Array<{ sections: Array<{ cards: Array<Record<string, unknown>> }> }> };
    input.tabs[0].sections[0].cards[1].apiKey = "must-not-survive";
    const parsed = parseConfig(input);
    expect(parsed.tabs[0].sections[0].cards[1]).toMatchObject({ type: "formula-one", view: "next-race", driverCount: 3, refreshMinutes: 60 });
    expect(parsed.tabs[0].sections[0].cards[1]).not.toHaveProperty("apiKey");
  });
});

describe("migrations", () => {
  it("returns current documents unchanged after validation", () => {
    expect(migrateConfig(fixtureConfig())).toEqual(fixtureConfig());
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    expect(registeredMigrationVersions()).toEqual([]);
  });

  it("rejects documents from an unsupported future schema", () => {
    expect(() => migrateConfig({ ...fixtureConfig(), schemaVersion: 99 })).toThrow("newer than supported");
  });
});
