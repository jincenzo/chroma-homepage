import { describe, expect, it } from "vitest";
import { analyzeHistoryOut, appendHistorySites, HISTORY_ROW_LIMIT, siteHomepage } from "../src/shared/history-import";
import { parseConfig } from "../src/shared/config";
import { useEditorStore } from "../src/client/store/editor-store";
import { fixtureConfig } from "./fixtures";

const row = (url: string, visitCount = 1, title = "Page title") => ({ order: 1, id: "86038", date: "9/26/2026", time: "8:45:27 PM", title, url, visitCount, typedCount: 0, transition: "link" });

describe("HistoryOut analysis", () => {
  it("accepts the supplied export shape, filters internal URLs and only returns site homepages", () => {
    const result = analyzeHistoryOut([
      row("chrome-extension://idohnkdgejocejlkihihonhemndpiiei/welcome.html"),
      row("https://chromewebstore.google.com/detail/historyout-export-browser/idohnkdgejocejlkihihonhemndpiiei?utm_source=historyout&pli=1")
    ]);
    expect(result).toMatchObject({ total: 2, unsupported: 1, invalid: 0 });
    expect(result.sites).toEqual([{ url: "https://chromewebstore.google.com/", label: "chromewebstore.google.com", score: 1, pages: 1 }]);
    expect(JSON.stringify(result)).not.toContain("utm_source");
    expect(JSON.stringify(result)).not.toContain("86038");
  });

  it("deduplicates cumulative page counts, strips tracking variants and sorts by score", () => {
    const result = analyzeHistoryOut([
      row("https://example.org/page?utm_source=a", 10),
      row("https://example.org/page?utm_source=b#private", 12),
      row("https://example.org/other", 3),
      row("https://example.org/", 2, "  Example   & Friends  "),
      row("https://other.org/path?token=secret", 4, "Private customer record")
    ]);
    expect(result.duplicates).toBe(1);
    expect(result.sites[0]).toEqual({ url: "https://example.org/", label: "Example & Friends", score: 17, pages: 3 });
    expect(result.sites[1].label).toBe("other.org");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("Private customer");
  });

  it("preserves distinct schemes, subdomains, IPv6 hosts and service ports", () => {
    const urls = ["http://nas.local:8080/", "http://nas.local:9090/", "https://nas.local:8080/", "http://app.nas.local/", "http://[::1]:3000/"];
    expect(analyzeHistoryOut(urls.map((url) => row(url))).sites.map((site) => site.url).sort()).toEqual(urls.sort());
    expect(siteHomepage("https://user:password@example.org/private")).toBeUndefined();
    for (const url of ["javascript:alert(1)", "file:///tmp/secret", "chrome://history", "about:blank", "data:text/html,test"]) expect(siteHomepage(url)).toBeUndefined();
  });

  it("reports invalid rows and rejects incompatible or oversized exports", () => {
    expect(analyzeHistoryOut([null, {}, row("not a URL"), row("https://example.org", -1), row("https://example.org", 1.5), { url: "https://valid.org" }])).toMatchObject({ total: 6, invalid: 5, sites: [{ url: "https://valid.org/", score: 1 }] });
    expect(analyzeHistoryOut([]).sites).toEqual([]);
    expect(() => analyzeHistoryOut({ history: [] })).toThrow("JSON array");
    expect(() => analyzeHistoryOut(new Array(HISTORY_ROW_LIMIT + 1))).toThrow("100,000");
  });
});

describe("history document import", () => {
  const destination = { newTabLabel: "Browsing", layout: "tiles" as const };

  it("appends UUID cards and sections without replacing identity or original content", () => {
    const config = fixtureConfig();
    config.homepage.appearance = { accent: "#112233" };
    const before = structuredClone(config);
    const links = Array.from({ length: 25 }, (_, index) => ({ label: `Site ${index}`, url: `https://site-${index}.example/private?q=secret` }));
    const result = appendHistorySites(config, links, destination);
    expect(config).toEqual(before);
    expect(result.config.homepage).toEqual(before.homepage);
    expect(result.config.tabs.slice(0, 2)).toEqual(before.tabs);
    const tab = result.config.tabs[2];
    expect(tab.sections.map((section) => section.cards.length)).toEqual([12, 12, 1]);
    expect(tab.sections[0].layout.type).toBe("tiles");
    expect(tab.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(tab.sections[0].cards[0]).toMatchObject({ url: "https://site-0.example/", openInNewTab: true });
    expect(tab.sections[0].cards[0].appearance).toBeUndefined();
    expect(parseConfig(result.config)).toEqual(result.config);
    expect(JSON.stringify(result.config)).not.toContain("secret");
    const asDefault = appendHistorySites(config, links, { ...destination, makeDefault: true });
    expect(asDefault.config.homepage.defaultTabId).toBe(asDefault.tabId);
    expect(config.homepage.defaultTabId).toBe(before.homepage.defaultTabId);
  });

  it("deduplicates sites against all existing cards and rejects missing destinations", () => {
    const config = fixtureConfig();
    const result = appendHistorySites(config, [
      { url: "https://example.com/", label: "Already linked by path" },
      { url: "https://new.example/", label: "New" }, { url: "https://new.example/second", label: "Duplicate" }
    ], { ...destination, tabId: "tab-b" });
    expect(result).toMatchObject({ added: 1, skipped: 2, tabId: "tab-b" });
    expect(result.config.tabs).toHaveLength(2);
    expect(() => appendHistorySites(result.config, [{ url: "https://new.example/", label: "Again" }], destination)).toThrow("already linked");
    expect(() => appendHistorySites(config, [{ url: "https://new.example", label: "New" }], { ...destination, tabId: "missing" })).toThrow("no longer exists");
    expect(() => appendHistorySites(config, [{ url: "javascript:alert(1)", label: "Unsafe" }], destination)).toThrow("HTTP");
  });

  it("imports as one undoable snapshot and Cancel restores the original profile", () => {
    const config = fixtureConfig();
    useEditorStore.getState().load(config);
    useEditorStore.getState().beginEdit();
    const result = appendHistorySites(config, [{ url: "https://new.example/", label: "New" }], destination);
    useEditorStore.getState().replaceDraft(result.config);
    expect(useEditorStore.getState().history).toHaveLength(1);
    expect(useEditorStore.getState().persisted).toEqual(config);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().draft).toEqual(config);
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().draft).toEqual(result.config);
    useEditorStore.getState().cancelEdit();
    expect(useEditorStore.getState().draft).toBeNull();
    expect(useEditorStore.getState().persisted).toEqual(config);
  });
});
