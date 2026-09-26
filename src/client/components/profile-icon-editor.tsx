import type { IconReference } from "../../shared/config";
import { DEFAULT_PROFILE_ICON } from "../../shared/profiles";
import { IconPicker } from "./icon-picker";
import { Button } from "./ui";

export function ProfileIconEditor({ icon, onChange, onUploadStateChange }: { icon?: IconReference; onChange(icon: IconReference | undefined): void; onUploadStateChange?(busy: boolean): void }) {
  return <fieldset aria-label="Profile avatar" className="grid min-w-0 gap-3">
    <legend className="mb-3 text-sm font-semibold text-slate-200">Profile avatar</legend>
    <IconPicker allowUpload value={icon ?? DEFAULT_PROFILE_ICON} onUploadStateChange={onUploadStateChange} onChange={(value) => onChange(typeof value === "string" ? { type: "iconify", value } : value)} />
    {icon && <Button onClick={() => onChange(undefined)}>Use default avatar</Button>}
  </fieldset>;
}
