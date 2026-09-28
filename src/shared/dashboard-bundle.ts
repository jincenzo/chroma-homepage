import type { ChromaConfig, IconReference } from "./config";

export const MAX_BUNDLE_BYTES = 55 * 1024 * 1024;
export const MAX_BUNDLE_CONTENT_BYTES = 50 * 1024 * 1024;
export const MAX_BUNDLE_ASSETS = 500;
export const MAX_CONFIG_BYTES = 1024 * 1024;
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

export function assetReferences(config: ChromaConfig): Extract<IconReference, { type: "asset" }>[] {
  const icons = [config.homepage.icon, ...config.tabs.flatMap((tab) => tab.sections.flatMap((section) => section.cards.map((card) => card.icon)))];
  return icons.filter((icon): icon is Extract<IconReference, { type: "asset" }> => icon?.type === "asset");
}

export function referencedAssetIds(config: ChromaConfig): string[] {
  return [...new Set(assetReferences(config).map((icon) => icon.assetId))];
}
