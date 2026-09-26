import { WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { IconReference } from "../../shared/config";
import { accentFromIcon } from "../lib/icon-accent";
import { Button } from "./ui";

export function AutoAccentButton({ icon, onChange }: { icon: IconReference | string; onChange(color: string): void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const alive = useRef(true);
  const change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return <div className="grid gap-2">
    <Button disabled={busy} onClick={async () => {
      setBusy(true); setMessage("");
      try {
        const result = await accentFromIcon(icon);
        if (!alive.current) return;
        change.current(result.color);
        setMessage(result.suggested ? "No intrinsic color found. Applied a suggested accent." : "Accent extracted from the icon.");
      } catch (error) { if (alive.current) setMessage(error instanceof Error ? error.message : "Could not extract the color."); }
      finally { if (alive.current) setBusy(false); }
    }}><WandSparkles className="size-4" />{busy ? "Reading icon…" : "Accent from icon"}</Button>
    {message && <p role="status" className="text-xs text-slate-400">{message}</p>}
  </div>;
}
