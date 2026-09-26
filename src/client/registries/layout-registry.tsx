import type { CSSProperties, ComponentType, PropsWithChildren } from "react";
import type { Layout } from "../../shared/config";
import { Field, Input, Select } from "../components/ui";

interface LayoutViewProps extends PropsWithChildren { layout: Layout }
interface LayoutEditorProps { layout: Layout; onChange(layout: Layout): void }
interface LayoutDefinition {
  label: string;
  Renderer: ComponentType<LayoutViewProps>;
  Editor: ComponentType<LayoutEditorProps>;
}

function GridLayout({ layout, children }: LayoutViewProps) {
  const style = {
    "--card-min": `${layout.minCardWidth}px`,
    "--grid-gap": `${layout.gap}px`,
    "--max-columns": layout.maxColumns ?? 12
  } as CSSProperties;
  return <div className={`card-grid layout-${layout.type}`} style={style}>{children}</div>;
}

function ListLayout({ layout, children }: LayoutViewProps) {
  return <div className="card-list layout-list" style={{ gap: layout.gap }}>{children}</div>;
}

function GridLayoutEditor({ layout, onChange }: LayoutEditorProps) {
  const update = (patch: Partial<Layout>) => onChange({ ...layout, ...patch });
  return <div className="grid gap-4">
    <Field label="Presentation"><Select value={layout.type} onChange={(event) => onChange({ ...layout, type: event.target.value as Layout["type"] })}>
      {Object.entries(LayoutTypeRegistry).map(([type, definition]) => <option key={type} value={type}>{definition.label}</option>)}
    </Select></Field>
    {layout.type !== "list" && <Field label="Minimum card width"><Input type="number" min={120} max={600} value={layout.minCardWidth} onChange={(event) => update({ minCardWidth: Number(event.target.value) })} /></Field>}
    <Field label="Gap"><Input type="number" min={4} max={64} value={layout.gap} onChange={(event) => update({ gap: Number(event.target.value) })} /></Field>
    {layout.type !== "list" && <Field label="Maximum columns (optional)"><Input type="number" min={1} max={12} value={layout.maxColumns ?? ""} placeholder="Auto" onChange={(event) => update({ maxColumns: event.target.value ? Number(event.target.value) : undefined })} /></Field>}
  </div>;
}

export const LayoutTypeRegistry: Record<Layout["type"], LayoutDefinition> = {
  grid: { label: "Horizontal cards", Renderer: GridLayout, Editor: GridLayoutEditor },
  tiles: { label: "Icon tiles", Renderer: GridLayout, Editor: GridLayoutEditor },
  list: { label: "Compact list", Renderer: ListLayout, Editor: GridLayoutEditor }
};

export function LayoutRenderer({ layout, children }: LayoutViewProps) {
  const definition = LayoutTypeRegistry[layout.type];
  return <definition.Renderer layout={layout}>{children}</definition.Renderer>;
}
