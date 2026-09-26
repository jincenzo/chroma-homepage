import { parseConfig, type ChromaConfig, type Section } from "../src/shared/config";

/** Build a showcase from the provided document; never reads private runtime data. */
export function withShowcase(input: ChromaConfig): ChromaConfig {
  if (input.tabs.some((tab) => tab.label === "Style studio")) return input;
  const config = structuredClone(input);
  const source = config.tabs.flatMap((tab) => tab.sections).flatMap((section) => section.cards);
  if (!source.length) throw new Error("Add some links before generating the showcase.");
  const sample = (offset: number, count: number) => Array.from({ length: count }, (_, index) => ({
    ...structuredClone(source[(offset + index) % source.length]),
    id: crypto.randomUUID(),
    appearance: undefined,
    aliases: undefined,
    tags: ["showcase"]
  }));
  const sections: Section[] = [
    { id: crypto.randomUUID(), title: "Icon tiles · full width", width: "full", layout: { type: "tiles", minCardWidth: 150, gap: 16, maxColumns: 6 }, appearance: { accent: "#a78bfa", surface: "glass", iconSize: 32 }, cards: sample(0, 6) },
    { id: crypto.randomUUID(), title: "Horizontal cards · half width", width: "half", layout: { type: "grid", minCardWidth: 220, gap: 16, maxColumns: 2 }, appearance: { accent: "#2dd4bf", surface: "glass" }, cards: sample(6, 4) },
    { id: crypto.randomUUID(), title: "Compact list · half width", width: "half", layout: { type: "list", minCardWidth: 180, gap: 8 }, appearance: { accent: "#60a5fa", surface: "minimal", density: "compact" }, cards: sample(10, 4) },
    ...(["glass", "flat", "minimal"] as const).map((surface, index): Section => ({
      id: crypto.randomUUID(), title: `${surface[0].toUpperCase()}${surface.slice(1)} · one third`, width: "third",
      layout: { type: "tiles", minCardWidth: 150, gap: 12, maxColumns: 2 },
      appearance: { accent: ["#fbbf24", "#fb7185", "#22d3ee"][index], surface, density: "compact", iconSize: 32 },
      cards: sample(14 + index * 2, 2)
    }))
  ];
  config.tabs.push({ id: crypto.randomUUID(), label: "Style studio", icon: "lucide:palette", sections });
  return parseConfig(config);
}
