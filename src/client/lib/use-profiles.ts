import { useCallback, useEffect, useRef, useState } from "react";
import type { CreateProfile, Profile } from "../../shared/profiles";
import { createProfile, listProfiles, loadConfig } from "./api";
import { useEditorStore } from "../store/editor-store";
import type { ChromaConfig } from "../../shared/config";

const preferenceKey = "chroma.active-profile";
function remember(id: string) {
  try { localStorage.setItem(preferenceKey, id); } catch { /* Storage can be disabled. */ }
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState("default");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const available = await listProfiles();
        let preferred: string | null = null;
        try { preferred = localStorage.getItem(preferenceKey); } catch { /* Use the original profile. */ }
        const id = available.some((profile) => profile.id === preferred) ? preferred! : "default";
        const config = await loadConfig(id);
        if (cancelled) return;
        setProfiles(available);
        setActiveId(id);
        useEditorStore.getState().load(config);
        remember(id);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load profiles");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  async function changeProfile(action: string | CreateProfile): Promise<boolean> {
    if (pending.current || loading || useEditorStore.getState().editMode) return false;
    pending.current = true;
    setLoading(true); setError(null);
    try {
      if (typeof action === "string") {
        const config = await loadConfig(action);
        useEditorStore.getState().load(config);
        setActiveId(action);
        remember(action);
      } else {
        const result = await createProfile(action);
        setProfiles((current) => [...current, result.profile]);
        useEditorStore.getState().load(result.config);
        setActiveId(result.profile.id);
        remember(result.profile.id);
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not switch profiles");
      return false;
    } finally { pending.current = false; setLoading(false); }
  }

  const updateProfile = useCallback((id: string, homepage: ChromaConfig["homepage"]) => {
    setProfiles((current) => current.map((profile) => profile.id === id ? { ...profile, name: homepage.title, icon: homepage.icon } : profile));
  }, []);

  return { profiles, activeId, loading, error, changeProfile, updateProfile };
}
