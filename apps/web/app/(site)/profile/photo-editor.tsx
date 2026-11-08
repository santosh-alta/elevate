"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { callApi } from "@/components/client/api";
import { uploadFile } from "@/components/client/upload";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui";

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/** Profile photo: shows the current one (e.g. from Google), and lets people upload or remove it. */
export function PhotoEditor({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(avatarUrl ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null) {
    await callApi("PATCH", "/me", { avatarUrl: next });
    setUrl(next);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} url={url} size={72} />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => input.current?.click()}>
            <Camera className="h-4 w-4" />{busy ?? (url ? "Change photo" : "Upload photo")}
          </Button>
          {url && (
            <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={async () => {
              setBusy("Removing…"); setError(null);
              try { await save(null); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
            }}>
              <Trash2 className="h-4 w-4" />Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">A square photo works best. JPEG, PNG or WebP, up to 4 MB.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > MAX_PHOTO_BYTES) { setError("That photo is over 4 MB. Please choose a smaller one."); return; }
          setBusy("Uploading…"); setError(null);
          try {
            const up = await uploadFile("/uploads", file, {}, (pct) => setBusy(`Uploading ${pct}%`));
            await save(up.url);
          } catch (err) { setError((err as Error).message); }
          finally { setBusy(null); }
        }}
      />
    </div>
  );
}
