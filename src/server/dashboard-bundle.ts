import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, mkdtemp, open, readdir, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Unzip, UnzipInflate, zipSync } from "fflate";
import { z } from "zod";
import { parseConfig, type ChromaConfig } from "../shared/config";
import { assetReferences, referencedAssetIds, MAX_ASSET_BYTES, MAX_BUNDLE_ASSETS, MAX_BUNDLE_BYTES, MAX_BUNDLE_CONTENT_BYTES, MAX_CONFIG_BYTES } from "../shared/dashboard-bundle";

const assetPath = /^assets\/([0-9a-f-]{36})\.(png|jpg|jpeg|webp|gif|svg|ico)$/i;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const manifestSchema = z.object({
  format: z.literal("chroma-dashboard"), version: z.literal(1),
  configSha256: z.string().regex(/^[a-f0-9]{64}$/),
  assets: z.array(z.object({ id: z.string().uuid(), file: z.string().regex(assetPath), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).max(MAX_BUNDLE_ASSETS)
}).strict();

export class DashboardBundleError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}

/** Only explicitly referenced, regular local image files are eligible; never read the data directory wholesale. */
async function readAssets(config: ChromaConfig, directory: string) {
  const ids = referencedAssetIds(config);
  if (ids.length > MAX_BUNDLE_ASSETS) throw new DashboardBundleError("A dashboard export can include at most 500 images.", 413);
  const filenames = await readdir(directory);
  const assets: { id: string; filename: string; data: Buffer }[] = [];
  let total = 0;
  for (const id of ids) {
    const matches = filenames.filter((name) => name.startsWith(`${id}.`) && assetPath.test(`assets/${name}`));
    if (matches.length !== 1) throw new DashboardBundleError(`Image ${id} is missing or ambiguous. Restore it on the source server and export again. A JSON-only export does not contain image files.`, 409);
    const filename = matches[0];
    const file = await open(path.join(directory, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > MAX_ASSET_BYTES) throw new DashboardBundleError("An image is not a regular file or exceeds 5 MB.", 413);
      total += info.size;
      if (total > MAX_BUNDLE_CONTENT_BYTES - MAX_CONFIG_BYTES) throw new DashboardBundleError("Dashboard images exceed the 50 MB export limit.", 413);
      // Fixed-size read prevents a concurrently growing file from bypassing the size bound.
      const data = Buffer.alloc(info.size);
      let offset = 0;
      while (offset < data.length) {
        const { bytesRead } = await file.read(data, offset, data.length - offset, offset);
        if (!bytesRead) throw new DashboardBundleError("An image changed during export. Please try again.", 409);
        offset += bytesRead;
      }
      assets.push({ id, filename, data });
    } finally { await file.close(); }
  }
  return assets;
}

export async function exportDashboard(input: unknown, directory: string): Promise<Buffer> {
  const config = parseConfig(input); // strips unknown fields, including accidental credential properties
  const configBytes = Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
  if (configBytes.length > MAX_CONFIG_BYTES) throw new DashboardBundleError("The dashboard configuration exceeds 1 MB.", 413);
  const assets = await readAssets(config, directory);
  const manifest = { format: "chroma-dashboard", version: 1, configSha256: digest(configBytes),
    assets: assets.map((asset) => ({ id: asset.id, file: `assets/${asset.filename}`, sha256: digest(asset.data) })) };
  const files: Record<string, Uint8Array> = { "manifest.json": Buffer.from(JSON.stringify(manifest)), "config.json": configBytes };
  for (const asset of assets) files[`assets/${asset.filename}`] = asset.data;
  if (Object.values(files).reduce((size, bytes) => size + bytes.length, 0) > MAX_BUNDLE_CONTENT_BYTES) throw new DashboardBundleError("The complete dashboard exceeds the 50 MB export limit.", 413);
  return Buffer.from(zipSync(files, { level: 0 })); // images are already compressed
}

function unpack(input: Buffer): Map<string, Buffer> {
  if (input.length > MAX_BUNDLE_BYTES) throw new DashboardBundleError("The ZIP exceeds 55 MB.", 413);
  // Require an ordinary single-disk ZIP with an intact end record; ZIP64 is unnecessary at our limits.
  let end = -1;
  for (let i = input.length - 22; i >= Math.max(0, input.length - 65557); i--) {
    if (input.readUInt32LE(i) === 0x06054b50 && i + 22 + input.readUInt16LE(i + 20) === input.length) { end = i; break; }
  }
  if (end < 0 || input.readUInt16LE(end + 4) || input.readUInt16LE(end + 6) || input.readUInt16LE(end + 8) !== input.readUInt16LE(end + 10) || input.readUInt32LE(end + 12) + input.readUInt32LE(end + 16) !== end) throw new DashboardBundleError("The ZIP is incomplete or unsupported.");
  const count = input.readUInt16LE(end + 10);
  if (count > MAX_BUNDLE_ASSETS + 2) throw new DashboardBundleError("The ZIP contains too many files.", 413);
  const files = new Map<string, Buffer>();
  const names = new Set<string>();
  let total = 0;
  const unzip = new Unzip((file) => {
    if (names.has(file.name) || (!assetPath.test(file.name) && !["config.json", "manifest.json"].includes(file.name))) throw new DashboardBundleError("The ZIP contains duplicate or unexpected file paths.");
    names.add(file.name);
    if (names.size > MAX_BUNDLE_ASSETS + 2) throw new DashboardBundleError("The ZIP contains too many files.", 413);
    const limit = file.name.endsWith(".json") ? MAX_CONFIG_BYTES : MAX_ASSET_BYTES;
    if ((file.originalSize ?? 0) > limit || ![0, 8].includes(file.compression)) throw new DashboardBundleError("A ZIP entry is too large or uses unsupported compression.", 413);
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, bytes, final) => {
      if (error) throw new DashboardBundleError("An image or configuration in the ZIP is corrupt.");
      size += bytes.length; total += bytes.length;
      if (size > limit || total > MAX_BUNDLE_CONTENT_BYTES) throw new DashboardBundleError("The expanded ZIP exceeds the import limits.", 413);
      chunks.push(bytes);
      if (final) files.set(file.name, Buffer.concat(chunks));
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  // Feed small chunks: a forged size in a compressed ZIP must not cause unbounded allocation.
  for (let offset = 0; offset < input.length; offset += 1024) unzip.push(input.subarray(offset, offset + 1024), offset + 1024 >= input.length);
  if (files.size !== names.size || files.size !== count) throw new DashboardBundleError("The ZIP is incomplete.");
  return files;
}

export async function importDashboard(input: Buffer, directory: string): Promise<{ config: ChromaConfig; assetCount: number }> {
  let config: ChromaConfig;
  let assets: { id: string; extension: string; data: Buffer }[];
  try {
    if (input[0] !== 0x50 || input[1] !== 0x4b) {
      if (input.length > MAX_CONFIG_BYTES) throw new DashboardBundleError("JSON configurations must be under 1 MB.", 413);
      config = parseConfig(JSON.parse(input.toString("utf8").replace(/^\uFEFF/, "")));
      await readAssets(config, directory); // legacy JSON works only when its referenced images already exist
      return { config, assetCount: 0 };
    }
    const files = unpack(input);
    const manifest = manifestSchema.parse(JSON.parse(files.get("manifest.json")?.toString("utf8") ?? "null"));
    const configBytes = files.get("config.json");
    if (!configBytes || digest(configBytes) !== manifest.configSha256) throw new DashboardBundleError("The ZIP configuration is missing or damaged.");
    config = parseConfig(JSON.parse(configBytes.toString("utf8")));
    const needed = new Set(referencedAssetIds(config));
    if (manifest.assets.length !== needed.size || files.size !== needed.size + 2) throw new DashboardBundleError("The ZIP does not contain exactly the dashboard’s referenced images.");
    const seen = new Set<string>();
    assets = manifest.assets.map((asset) => {
      const match = assetPath.exec(asset.file)!;
      const data = files.get(asset.file);
      if (!needed.has(asset.id) || seen.has(asset.id) || match[1] !== asset.id || !data || digest(data) !== asset.sha256) throw new DashboardBundleError("An image is missing, duplicated or damaged in the ZIP.");
      seen.add(asset.id);
      return { id: asset.id, extension: match[2].toLowerCase(), data };
    });
  } catch (error) {
    if (error instanceof DashboardBundleError) throw error;
    throw new DashboardBundleError("This is not a valid Chroma dashboard ZIP or JSON configuration.");
  }

  // All validation happens before touching assets; link exclusively to fresh IDs and roll back failures.
  const staging = await mkdtemp(path.join(directory, ".dashboard-import-"));
  const created: string[] = [];
  const mapping = new Map<string, string>();
  try {
    for (const asset of assets) {
      const id = randomUUID();
      const filename = `${id}.${asset.extension}`;
      const temporary = path.join(staging, filename);
      await writeFile(temporary, asset.data, { flag: "wx", mode: 0o600 });
      const destination = path.join(directory, filename);
      await link(temporary, destination);
      created.push(destination);
      mapping.set(asset.id, id);
    }
    for (const icon of assetReferences(config)) icon.assetId = mapping.get(icon.assetId)!;
    return { config, assetCount: assets.length };
  } catch {
    await Promise.all(created.map((filename) => unlink(filename)));
    throw new DashboardBundleError("Could not restore the images. Your saved dashboard was not changed.", 500);
  } finally { await rm(staging, { recursive: true, force: true }); }
}
