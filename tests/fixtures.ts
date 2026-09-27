import type { ChromaConfig } from "../src/shared/config";

export function fixtureConfig(): ChromaConfig {
  return {
    schemaVersion: 1,
    homepage: { title: "Test", defaultTabId: "tab-a", tabPosition: "top" },
    theme: { mode: "dark", background: { type: "gradient" }, glass: { opacity: 0.5, blur: 18, borderOpacity: 0.15 } },
    tabs: [
      { id: "tab-a", label: "A", icon: "lucide:house", sections: [
        { id: "section-a", title: "A", layout: { type: "grid", minCardWidth: 180, gap: 16 }, cards: [
          { id: "card-a", type: "link", label: "A", url: "https://example.com/a", openInNewTab: true, icon: { type: "iconify", value: "lucide:link" } }
        ] },
        { id: "section-b", title: "B", layout: { type: "grid", minCardWidth: 180, gap: 16 }, cards: [] }
      ] },
      { id: "tab-b", label: "B", icon: "lucide:server", sections: [
        { id: "section-c", title: "C", layout: { type: "grid", minCardWidth: 180, gap: 16 }, cards: [] }
      ] }
    ]
  };
}
