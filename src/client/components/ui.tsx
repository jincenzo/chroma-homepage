import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, PropsWithChildren } from "react";
import { cn } from "../lib/cn";

export function Button({ className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn("inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/7 px-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-40", className)} {...props} />;
}

export function Field({ label, children }: PropsWithChildren<{ label: string }>) {
  return <label className="grid gap-1.5 text-xs font-medium text-slate-400"><span>{label}</span>{children}</label>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/15", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("h-10 w-full rounded-xl border border-white/10 bg-[#141722] px-3 text-sm text-slate-100", className)} {...props} />;
}
