import { DEFAULT_APPEARANCE } from "../../shared/presentation";
import { useEditorStore } from "../store/editor-store";
import { AccentColorEditor } from "./accent-color-editor";
import { LauncherSettings } from "./launcher-settings";
import { ProfileIconEditor } from "./profile-icon-editor";
import { Field, Input, Select } from "./ui";

export function HomepageSettings() {
  const { draft, updateDraft } = useEditorStore();
  if (!draft) return null;
  return <div className="grid gap-6">
    <p className="text-xs leading-relaxed text-slate-400">Edit this homepage's name, avatar, and default color. Changes stay in your draft until Save.</p>
    <Field label="Homepage title / profile name"><Input maxLength={120} value={draft.homepage.title} onChange={(event) => updateDraft((config) => { config.homepage.title = event.target.value; })} /></Field>
    <Field label="Tab navigation position"><Select value={draft.homepage.tabPosition} onChange={(event) => updateDraft((config) => { config.homepage.tabPosition = event.target.value as "top" | "left" | "right"; })}>
      <option value="top">Top</option><option value="left">Left sidebar</option><option value="right">Right sidebar</option>
    </Select></Field>
    <div className="grid gap-2">
      <AccentColorEditor icon={draft.homepage.icon} label="Default accent color" value={draft.homepage.appearance?.accent} inherited={DEFAULT_APPEARANCE.accent} source="app default" onChange={(accent) => updateDraft((config) => {
        if (accent) config.homepage.appearance = { accent };
        else delete config.homepage.appearance;
      })} />
      <p className="text-xs leading-relaxed text-slate-400">Homepage → Tab → Section → Card. Existing overrides keep their own colors. Use Inherit on an override to follow its parent again.</p>
    </div>
    <ProfileIconEditor icon={draft.homepage.icon} onChange={(icon) => updateDraft((config) => { if (icon) config.homepage.icon = icon; else delete config.homepage.icon; })} />
    <div className="border-t border-white/10 pt-5"><LauncherSettings /></div>
  </div>;
}
