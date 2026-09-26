import { Icon } from "@iconify/react";
import { ImageUp, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { IconReference } from "../../shared/config";
import { uploadAsset } from "../lib/api";
import { Button, Field, Input } from "./ui";
import { VisualIcon } from "./visual-icon";

const popularIcons = ["lucide:house", "lucide:link", "lucide:server", "lucide:layout-dashboard", "mdi:home-assistant", "mdi:github", "simple-icons:grafana", "simple-icons:proxmox", "simple-icons:n8n", "mdi:file-document-multiple-outline"];

export function IconPicker({ value, onChange, allowUpload = false, onUploadStateChange }: { value: IconReference | string; onChange(value: IconReference | string): void; allowUpload?: boolean; onUploadStateChange?(busy: boolean): void }) {
  const current = typeof value === "string" ? { type: "iconify" as const, value } : value;
  const [query, setQuery] = useState("");
  const [icons, setIcons] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadSequence = useRef(0);
  useEffect(() => () => { uploadSequence.current++; onUploadStateChange?.(false); }, [onUploadStateChange]);

  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=32`, { signal: controller.signal });
        const result = await response.json() as { icons?: string[] };
        setIcons(result.icons ?? []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setIcons([]);
      }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [query]);
  const visibleIcons = query.trim() ? icons : popularIcons;

  const choose = (icon: string) => onChange(typeof value === "string" ? icon : { type: "iconify", value: icon });
  const upload = async (file: File | undefined) => {
    if (!file || typeof value === "string") return;
    const sequence = ++uploadSequence.current;
    setUploading(true);
    setUploadError(null);
    onUploadStateChange?.(true);
    try {
      const asset = await uploadAsset(file);
      if (sequence === uploadSequence.current) onChange({ type: "asset", assetId: asset.id });
    } catch (error) {
      if (sequence === uploadSequence.current) setUploadError(error instanceof Error ? error.message : "Could not upload the image");
    } finally {
      if (sequence === uploadSequence.current) { setUploading(false); onUploadStateChange?.(false); }
    }
  };

  return <div className="grid gap-3">
    <Field label="Icon">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300"><VisualIcon icon={value} /><span className="min-w-0 truncate">{current.type === "iconify" ? current.value : "Custom image"}</span></div>
    </Field>
    <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search icons" className="pl-9" /></div>
    <div className="grid max-h-40 grid-cols-6 gap-1 overflow-y-auto rounded-xl border border-white/8 bg-black/15 p-2">
      {visibleIcons.map((icon) => <button key={icon} type="button" title={icon} disabled={uploading} onClick={() => choose(icon)} className="grid aspect-square place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"><Icon icon={icon} className="size-5" /></button>)}
      {visibleIcons.length === 0 && <span className="col-span-6 p-3 text-center text-xs text-slate-500">No icons found</span>}
    </div>
    {allowUpload && <Button className="relative overflow-hidden" disabled={uploading}><ImageUp className="size-4" />{uploading ? "Uploading…" : "Upload custom image"}<input aria-label="Upload custom image" disabled={uploading} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></Button>}
    {uploadError && <p role="alert" className="text-xs text-rose-300">{uploadError}</p>}
  </div>;
}
