import { UserRound } from "lucide-react";
import type { IconReference } from "../../shared/config";
import { VisualIcon } from "./visual-icon";

export function ProfileAvatar({ icon }: { icon?: IconReference }) {
  return <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-400/25 to-cyan-400/15 text-violet-200 ring-1 ring-inset ring-white/15 [&>img]:size-full [&>img]:rounded-none [&>svg]:size-6">
    {icon ? <VisualIcon icon={icon} /> : <UserRound className="size-6" />}
  </span>;
}
