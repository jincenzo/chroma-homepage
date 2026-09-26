import { buildIcon, loadIcon } from "@iconify/react";
import type { IconReference } from "../../shared/config";
import { dominantAccent, suggestedAccent } from "../../shared/accent";

export async function accentFromIcon(icon: IconReference | string): Promise<{ color: string; suggested: boolean }> {
  let objectUrl: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  const current = typeof icon === "string" ? { type: "iconify" as const, value: icon } : icon;
  const identity = current.type === "asset" ? current.assetId : current.value;
  try {
    const work = async () => {
      let url: string;
      if (current.type === "asset") url = `/api/assets/${current.assetId}`;
      else {
        const data = await loadIcon(current.value);
        if (finished) throw new Error("Icon loading timed out.");
        const built = buildIcon(data, { width: "48", height: "48" });
        // Use a neutral currentColor: extracting the inherited accent would be circular.
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="${built.attributes.viewBox}" color="#888888">${built.body}</svg>`;
        objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        url = objectUrl;
      }
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve(); img.onerror = () => reject(new Error("Could not read this icon image.")); img.src = url;
      });
      const canvas = document.createElement("canvas"); canvas.width = 48; canvas.height = 48;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Color extraction is unavailable in this browser.");
      context.drawImage(img, 0, 0, 48, 48);
      const color = dominantAccent(context.getImageData(0, 0, 48, 48).data);
      return { color: color ?? suggestedAccent(identity), suggested: !color };
    };
    return await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("The icon took too long to load. Try again.")), 8000); })]);
  } finally {
    finished = true;
    if (timer) clearTimeout(timer);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
