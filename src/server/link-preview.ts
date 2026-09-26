import { Parser } from "htmlparser2";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { LinkPreview } from "../shared/link-preview";
import { fetchRemotePage, PreviewError, validateRemoteUrl } from "./remote-page";

const cleanText = (value: string, length: number) =>
  value.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim().slice(0, length);

/** Parse inert HTML only. No scripts, styles, or browser session are executed. */
export function extractPageMetadata(html: string, pageUrl: string) {
  let title = "", ogTitle = "", description = "", ogDescription = "", inTitle = false;
  let base: string | undefined;
  const icons: { href: string; priority: number }[] = [];
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === "title") inTitle = true;
      if (name === "base" && attributes.href && !base) base = attributes.href;
      if (name === "meta") {
        const key = (attributes.property ?? attributes.name ?? "").toLowerCase();
        const content = attributes.content ?? "";
        if (key === "og:title" && !ogTitle) ogTitle = content;
        if (key === "og:description" && !ogDescription) ogDescription = content;
        if (key === "description" && !description) description = content;
      }
      if (name === "link" && attributes.href) {
        const rel = (attributes.rel ?? "").toLowerCase().split(/\s+/);
        if (rel.includes("apple-touch-icon") || rel.includes("icon")) {
          icons.push({ href: attributes.href, priority: rel.includes("apple-touch-icon") ? 2 : 1 });
        }
      }
    },
    ontext(text) { if (inTitle) title += text; },
    onclosetag(name) { if (name === "title") inTitle = false; }
  }, { decodeEntities: true });
  parser.end(html);
  let baseUrl = pageUrl;
  try { if (base) baseUrl = validateRemoteUrl(new URL(base, pageUrl).href).href; } catch { /* Ignore invalid bases. */ }
  const iconUrls = icons.sort((a, b) => b.priority - a.priority).flatMap(({ href }) => {
    try { return [validateRemoteUrl(new URL(href, baseUrl).href).href]; } catch { return []; }
  });
  return {
    title: cleanText(ogTitle || title, 120) || new URL(pageUrl).hostname,
    description: cleanText(ogDescription || description, 240) || undefined,
    icons: [...new Set([...iconUrls.slice(0, 3), new URL("/favicon.ico", pageUrl).href])]
  };
}

/** Auto-import raster/ICO images only; never serve downloaded active HTML or SVG. */
export function detectIconExtension(body: Buffer): string | undefined {
  if (body.length < 12) return;
  if (body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ".png";
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return ".jpg";
  if (["GIF87a", "GIF89a"].includes(body.toString("ascii", 0, 6))) return ".gif";
  if (body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP") return ".webp";
  if (body.readUInt32LE(0) === 65536 && body.readUInt16LE(4) > 0) return ".ico";
}

export async function discoverLink(input: { url: string; allowLocalNetwork: boolean }, assetsPath: string): Promise<LinkPreview> {
  const signal = AbortSignal.timeout(12_000);
  try {
    const page = await fetchRemotePage(input.url, { allowLocalNetwork: input.allowLocalNetwork, maxBytes: 1024 * 1024, signal });
    if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(page.contentType)) {
      throw new PreviewError("This URL is not an HTML page. You can still enter details manually.");
    }
    const charset = page.contentType.match(/charset=["']?([^;"'\s]+)/i)?.[1] ?? "utf-8";
    let html: string;
    try { html = new TextDecoder(charset).decode(page.body); } catch { html = page.body.toString("utf8"); }
    const metadata = extractPageMetadata(html, page.url.href);
    const preview: LinkPreview = { url: input.url, title: metadata.title, description: metadata.description };
    for (const iconUrl of metadata.icons) {
      if (signal.aborted) break;
      try {
        const icon = await fetchRemotePage(iconUrl, { allowLocalNetwork: input.allowLocalNetwork, maxBytes: 512 * 1024, signal: AbortSignal.any([signal, AbortSignal.timeout(2500)]) });
        const extension = detectIconExtension(icon.body);
        if (!extension) continue;
        const assetId = randomUUID();
        await writeFile(path.join(assetsPath, `${assetId}${extension}`), icon.body, { flag: "wx" });
        preview.icon = { type: "asset", assetId };
        break;
      } catch { /* A missing icon must not discard a usable page title. */ }
    }
    if (!preview.icon) preview.warning = "No usable favicon found. Your current icon will be kept.";
    return preview;
  } catch (error) {
    if (error instanceof PreviewError) throw error;
    if (signal.aborted) throw new PreviewError("The site took too long to respond. Try again or enter details manually.", 504);
    throw new PreviewError("Could not reach this site. Check its address and TLS certificate, or enter details manually.");
  }
}
