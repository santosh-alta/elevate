"use client";

import { useState } from "react";
import { buttonClass } from "../ui/button";

export function PrintButton() {
  return <button type="button" className={buttonClass("outline", "sm", "print:hidden")} onClick={() => window.print()}>Print / Save PDF</button>;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("outline", "sm")}
      onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
