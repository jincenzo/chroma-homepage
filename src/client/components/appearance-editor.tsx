import type { Appearance, IconReference } from "../../shared/config";
import { DEFAULT_APPEARANCE } from "../../shared/presentation";
import { Button, Field, Select } from "./ui";
import { AccentColorEditor } from "./accent-color-editor";

export function AppearanceEditor({ value = {}, onChange, inherited = DEFAULT_APPEARANCE, card = false, icon }: {
  value?: Appearance; inherited?: Appearance; card?: boolean; icon?: IconReference | string; onChange(value: Appearance): void;
}) {
  const update = <K extends keyof Appearance>(key: K, next: Appearance[K]) => {
    const result = { ...value };
    if (next === undefined) delete result[key];
    else result[key] = next;
    onChange(result);
  };
  return <div className="grid gap-4 border-t border-white/10 pt-5">
    <h3 className="text-sm font-semibold text-slate-200">Appearance</h3>
    <p className="text-xs text-slate-400">{card ? "Inherit the section style, or override individual properties." : "Accent inherits from the tab and homepage. Section overrides apply to its cards."}</p>
    <AccentColorEditor icon={icon} value={value.accent} inherited={inherited.accent ?? DEFAULT_APPEARANCE.accent} source={card ? "section" : "tab"} onChange={(accent) => update("accent", accent)} />
    <Field label="Surface"><Select value={value.surface ?? ""} onChange={(event) => update("surface", (event.target.value || undefined) as Appearance["surface"])}>
      <option value="">{card ? "Inherit" : "Default"} ({inherited.surface ?? "glass"})</option>
      <option value="glass">Glass</option><option value="flat">Flat</option><option value="minimal">Minimal</option>
    </Select></Field>
    <Field label="Density"><Select value={value.density ?? ""} onChange={(event) => update("density", (event.target.value || undefined) as Appearance["density"])}>
      <option value="">{card ? "Inherit" : "Default"} ({inherited.density ?? "comfortable"})</option>
      <option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option>
    </Select></Field>
    <Field label="Icon size"><Select value={value.iconSize ?? ""} onChange={(event) => update("iconSize", event.target.value ? Number(event.target.value) : undefined)}>
      <option value="">{card ? "Inherit" : "Default"} ({inherited.iconSize ?? 25}px)</option>
      {[20, 25, 32, 40, 48].map((size) => <option key={size} value={size}>{size}px</option>)}
    </Select></Field>
    <Field label="Description visibility"><Select value={value.showDescription === undefined ? "" : String(value.showDescription)} onChange={(event) => update("showDescription", event.target.value === "" ? undefined : event.target.value === "true")}>
      <option value="">{card ? "Inherit" : "Default"} ({inherited.showDescription === false ? "hidden" : "visible"})</option><option value="true">Visible</option><option value="false">Hidden</option>
    </Select></Field>
    {card && <Button onClick={() => onChange({})}>Reset all to section style</Button>}
  </div>;
}
