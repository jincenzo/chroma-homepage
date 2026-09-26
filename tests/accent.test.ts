import { describe, expect, it } from "vitest";
import { dominantAccent, suggestedAccent } from "../src/shared/accent";

describe("automatic accent", () => {
  it("finds the dominant color while ignoring transparent, black and white pixels", () => {
    const pixels = [
      ...Array(50).fill([255, 255, 255, 255]).flat(),
      ...Array(50).fill([0, 255, 0, 0]).flat(),
      ...Array(20).fill([224, 64, 96, 255]).flat(),
      0, 0, 0, 255, 20, 50, 220, 255
    ];
    expect(dominantAccent(pixels)).toBe("#e04060");
  });
  it("lifts dark colors and explicitly reports monochrome images", () => {
    expect(dominantAccent([0, 60, 0, 255])).toBe("#00aa00");
    expect(dominantAccent([128, 128, 128, 255, 255, 255, 255, 255])).toBeUndefined();
    expect(dominantAccent([])).toBeUndefined();
  });
  it("suggests reproducible colors for colorless icons", () => {
    expect(suggestedAccent("lucide:house")).toBe(suggestedAccent("lucide:house"));
    expect(suggestedAccent("lucide:house")).not.toBe(suggestedAccent("lucide:server"));
    expect(suggestedAccent("lucide:house")).toMatch(/^#[0-9a-f]{6}$/);
  });
});
