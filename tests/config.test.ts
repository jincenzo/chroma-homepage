import { describe, expect, it } from "vitest";
import { configSchema, parseConfig } from "../src/shared/config";
import { CURRENT_SCHEMA_VERSION, migrateConfig, registeredMigrationVersions } from "../src/shared/migrations";
import { fixtureConfig } from "./fixtures";

describe("configuration schema", () => {
  it("accepts a valid hierarchical document", () => {
    expect(parseConfig(fixtureConfig()).tabs).toHaveLength(2);
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
      config.tabs[0].sections[0].cards[0].url = url;
      expect(configSchema.safeParse(config).success).toBe(false);
    }
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
