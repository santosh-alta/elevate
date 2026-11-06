"use client";

export interface UploadResult { url: string; key?: string; media?: { id: string } }

/**
 * Multipart upload through the same-origin proxy with progress (XHR, since fetch has no upload progress).
 * `path` is an API path such as "/uploads" or "/guest-portal/<token>/upload".
 */
export function uploadFile(
  path: string,
  file: File,
  fields: Record<string, string | undefined> = {},
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== "") fd.append(k, v);
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/proxy${path}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data: unknown = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && data && typeof (data as UploadResult).url === "string") {
        onProgress?.(100);
        resolve(data as UploadResult);
      } else {
        reject(new Error((data as { message?: string } | null)?.message ?? `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(fd);
  });
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
