import { Icon } from "@iconify/react";
import type { IconReference } from "../../shared/config";
import { cn } from "../lib/cn";

export function VisualIcon({ icon, className }: { icon: IconReference | string; className?: string }) {
  if (typeof icon === "string") return <Icon icon={icon} className={cn("size-5", className)} />;
  if (icon.type === "asset") return <img src={`/api/assets/${icon.assetId}`} alt="" className={cn("size-6 rounded-md object-cover", className)} />;
  return <Icon icon={icon.value} className={cn("size-6", className)} />;
}
