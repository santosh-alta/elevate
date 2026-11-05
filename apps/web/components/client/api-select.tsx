"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi } from "./api";
import { Select } from "../ui/input";

/** Select that PATCHes { [field]: value } on change — for statuses, assignees, etc. */
export function ApiSelect({
  path, field, value, options, method = "PATCH", className, placeholder,
}: {
  path: string; field: string; value: string | null | undefined; options: { value: string; label: string }[];
  method?: string; className?: string; placeholder?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState(value ?? "");
  const [err, setErr] = useState(false);
  return (
    <Select
      className={`${className ?? ""} ${err ? "border-red-500" : ""} h-8 py-1 text-xs`}
      value={v}
      onChange={async (e) => {
        const next = e.target.value;
        const prev = v;
        setV(next); setErr(false);
        try {
          await callApi(method, path, { [field]: next || null });
          router.refresh();
        } catch {
          setV(prev); setErr(true);
        }
      }}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
}
