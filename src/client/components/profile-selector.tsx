import { Check, Plus, Settings2, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { CreateProfile, Profile } from "../../shared/profiles";
import type { ChromaConfig, IconReference } from "../../shared/config";
import { Button, Field, Input, Select } from "./ui";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileIconEditor } from "./profile-icon-editor";

export function ProfileSelector({ profiles, activeId, homepage, disabled, editing, loading, onChange, onEdit }: {
  profiles: Profile[]; activeId: string; homepage: ChromaConfig["homepage"]; disabled: boolean; editing: boolean; loading: boolean;
  onChange(action: string | CreateProfile): Promise<boolean>;
  onEdit(): void;
}) {
  const [panel, setPanel] = useState<"menu" | "create" | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<IconReference>();
  const [copyCurrent, setCopyCurrent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = panel !== null && !editing;

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setPanel(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); };
  }, [open]);

  useEffect(() => {
    if (panel === "menu" && open) menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [panel, open]);

  const close = () => { setPanel(null); trigger.current?.focus(); };
  const menuKeydown = (event: KeyboardEvent) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let index: number | undefined;
    if (event.key === "ArrowDown") index = (current + 1) % items.length;
    if (event.key === "ArrowUp") index = (current - 1 + items.length) % items.length;
    if (event.key === "Home") index = 0;
    if (event.key === "End") index = items.length - 1;
    if (index !== undefined) { event.preventDefault(); items[index]?.focus(); }
    // Do not open the global card launcher while navigating the profile menu.
    if (event.key.length === 1) event.stopPropagation();
  };

  return <div ref={root} className="relative" onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <button ref={trigger} type="button" data-testid="profile-switcher" data-profile-id={activeId}
      aria-label={`Homepage profile: ${homepage.title}`} aria-haspopup={panel === "create" ? "dialog" : "menu"} aria-expanded={open}
      title={editing ? `${homepage.title} — Save or cancel before switching profiles` : homepage.title}
      disabled={disabled} aria-busy={loading} onClick={() => setPanel(open ? null : "menu")}
      onKeyDown={(event) => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setPanel("menu"); } }}
      className="grid size-12 place-items-center rounded-full border border-white/10 bg-white/5 transition hover:border-violet-300/50 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300 disabled:cursor-not-allowed disabled:opacity-60">
      <ProfileAvatar icon={homepage.icon} />
    </button>
    {open && <div className="absolute right-0 top-full z-50 mt-3 w-80 max-w-[calc(100vw-48px)] overflow-hidden rounded-3xl border border-white/15 bg-[#141722] p-2 shadow-2xl shadow-black/40">
      {panel === "menu" && <div ref={menu} role="menu" aria-label="Homepage profiles" onKeyDown={menuKeydown}>
        <p className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Your homepages</p>
        <div className="max-h-[50vh] overflow-y-auto">
          {profiles.map((profile) => <button key={profile.id} type="button" role="menuitemradio" aria-checked={profile.id === activeId} data-profile-id={profile.id} tabIndex={-1} disabled={loading}
            onClick={() => { if (profile.id === activeId) close(); else void onChange(profile.id).then((success) => { if (success) close(); }); }}
            className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left text-sm text-slate-100 outline-none transition hover:bg-white/7 focus-visible:bg-violet-400/15 ${profile.id === activeId ? "bg-violet-400/10" : ""}`}>
            <ProfileAvatar icon={profile.icon} /><span className="min-w-0 flex-1 break-words font-medium">{profile.name}</span>
            {profile.id === activeId && <Check aria-hidden="true" className="size-4 shrink-0 text-violet-300" />}
          </button>)}
        </div>
        <div role="separator" className="mx-3 my-2 h-px bg-white/10" />
        <button type="button" role="menuitem" tabIndex={-1} disabled={loading} onClick={() => { close(); onEdit(); }} className="flex w-full items-center gap-3 rounded-2xl p-3 text-sm font-medium text-slate-200 outline-none transition hover:bg-white/7 focus-visible:bg-violet-400/15">
          <span className="grid size-10 place-items-center"><Settings2 className="size-5" /></span>Homepage settings
        </button>
        <button type="button" role="menuitem" tabIndex={-1} disabled={loading} onClick={() => setPanel("create")} className="flex w-full items-center gap-3 rounded-2xl p-3 text-sm font-medium text-violet-200 outline-none transition hover:bg-white/7 focus-visible:bg-violet-400/15">
          <span className="grid size-10 place-items-center rounded-full border border-dashed border-violet-300/30"><Plus className="size-5" /></span>New profile
        </button>
      </div>}
      {panel === "create" && <section role="dialog" aria-label="New homepage profile" className="max-h-[calc(100dvh-140px)] overflow-y-auto p-3">
        <form aria-label="Create profile" className="grid gap-4" onSubmit={(event) => {
          event.preventDefault();
          if (uploading || disabled) return;
          void onChange({ name: name.trim(), ...(icon ? { icon } : {}), ...(copyCurrent ? { sourceProfileId: activeId } : {}) }).then((success) => {
            if (success) { close(); setName(""); setIcon(undefined); setCopyCurrent(false); }
          });
        }}>
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-white">New homepage profile</h2><Button aria-label="Close profile form" disabled={disabled} onClick={close} className="shrink-0"><X className="size-4 shrink-0" /></Button></div>
          <Field label="Profile name"><Input autoFocus required maxLength={120} value={name} disabled={disabled} onChange={(event) => setName(event.target.value)} placeholder="Personal, Work, Discovery…" /></Field>
          <Field label="Start with"><Select value={copyCurrent ? "copy" : "empty"} disabled={disabled} onChange={(event) => setCopyCurrent(event.target.value === "copy")}><option value="empty">Empty homepage</option><option value="copy">Copy current homepage</option></Select></Field>
          <fieldset disabled={disabled}><ProfileIconEditor icon={icon} onChange={setIcon} onUploadStateChange={setUploading} /></fieldset>
          <p className="text-xs leading-relaxed text-slate-400">Your current homepage stays unchanged. You can also change the avatar later in Edit mode.</p>
          <Button type="submit" disabled={disabled || uploading || !name.trim()} className="bg-violet-500/20">Create profile</Button>
        </form>
      </section>}
    </div>}
  </div>;
}
