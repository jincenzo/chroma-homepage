import { Button, Field, Input } from "./ui";
import type { IconReference } from "../../shared/config";
import { AutoAccentButton } from "./auto-accent-button";

export function AccentColorEditor({ value, inherited, source, label = "Accent color", icon, onChange }: {
  icon?: IconReference | string;
  value?: string; inherited: string; source: string; label?: string; onChange(value: string | undefined): void;
}) {
  return <div className="grid gap-2">
    <div className="flex items-end gap-2">
      <Field label={label}><Input type="color" value={value ?? inherited} onChange={(event) => onChange(event.target.value)} /></Field>
      <Button aria-label={`Inherit accent from ${source}`} disabled={!value} onClick={() => onChange(undefined)}>Inherit</Button>
    </div>
    <p className="text-xs leading-relaxed text-slate-400">{value ? "Custom color" : `Inherited from ${source}`} · <span className="font-mono">{value ?? inherited}</span></p>
    {icon && <AutoAccentButton key={JSON.stringify(icon)} icon={icon} onChange={onChange} />}
  </div>;
}
