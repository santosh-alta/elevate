"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "../ui/cn";

const KEY = "theme";

/** Runs in <head> before the page paints, so a saved night theme never flashes white first. Day is the default. */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("${KEY}")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

/** Day / night switch. The choice is remembered on this device. */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.dataset.theme === "dark"); }, []);

  function toggle() {
    const next = !dark;
    const root = document.documentElement;
    root.classList.add("theme-switching");
    if (next) root.dataset.theme = "dark";
    else delete root.dataset.theme;
    try { localStorage.setItem(KEY, next ? "dark" : "light"); } catch { /* private mode: still switches for this visit */ }
    setDark(next);
    window.setTimeout(() => root.classList.remove("theme-switching"), 350);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to day theme" : "Switch to night theme"}
      title={dark ? "Day theme" : "Night theme"}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-full text-fg/75 transition hover:bg-fg/5 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      <Sun className={cn("absolute h-[18px] w-[18px] transition duration-300", dark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")} />
      <Moon className={cn("absolute h-[18px] w-[18px] transition duration-300", dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0")} />
    </button>
  );
}
