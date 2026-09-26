/** Ignore transparent/neutral pixels and find the strongest color cluster. */
export function dominantAccent(pixels: ArrayLike<number>): string | undefined {
  const buckets = new Map<string, { weight: number; r: number; g: number; b: number }>();
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const [r, g, b, alpha] = [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const saturation = max ? (max - min) / max : 0;
    if (alpha < 128 || max < 30 || saturation < 0.2) continue;
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const weight = alpha / 255 * saturation;
    const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 };
    bucket.weight += weight; bucket.r += r * weight; bucket.g += g * weight; bucket.b += b * weight;
    buckets.set(key, bucket);
  }
  const best = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
  if (!best) return;
  const rgb = [best.r, best.g, best.b].map((value) => value / best.weight);
  // Keep the hue, but lift dark brand colors for the dark dashboard surface.
  const scale = Math.max(1, 170 / Math.max(...rgb));
  return `#${rgb.map((value) => Math.round(Math.min(255, value * scale)).toString(16).padStart(2, "0")).join("")}`;
}

/** A stable suggestion for monochrome icons, not a claimed brand color. */
export function suggestedAccent(identity: string): string {
  let hash = 0;
  for (const char of identity) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  const hue = (hash >>> 0) % 360;
  const saturation = 0.68, lightness = 0.65;
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (lightness - saturation * Math.min(lightness, 1 - lightness) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${[0, 8, 4].map((n) => channel(n).toString(16).padStart(2, "0")).join("")}`;
}
