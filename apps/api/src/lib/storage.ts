import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { badRequest } from "./errors";
import { apiBaseUrl } from "./brand";

/**
 * File storage behind a small driver interface.
 * - "local" (default): files live under STORAGE_DIR and are served by GET /v1/files/<key>.
 * - "s3": TODO — implement with @aws-sdk/client-s3 (PutObject / GetObject) against S3 or Cloudflare R2,
 *   and return the bucket's public URL from url(). Keys and validation stay the same.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  url(key: string): string;
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "application/pdf": "pdf",
} as const;
export type AllowedMime = keyof typeof TYPES;

const EXT_TO_MIME: Record<string, AllowedMime> = Object.fromEntries(
  Object.entries(TYPES).map(([mime, ext]) => [ext, mime as AllowedMime]),
);

/** Detects the real type from magic bytes (never trust the client's declared mime type alone). */
export function sniffMime(buf: Buffer): AllowedMime | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(buf.subarray(8, 12).toString("ascii"))) {
    return "image/heic";
  }
  return null;
}

export function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

// tenant-slug/yyyy/mm/<32 hex>.<ext>
const KEY_RE = /^[a-z0-9-]{1,64}\/\d{4}\/\d{2}\/[a-f0-9]{32}\.(jpg|png|webp|gif|heic|pdf)$/;

export function isValidKey(key: string): boolean {
  return KEY_RE.test(key);
}

export function mimeForKey(key: string): AllowedMime {
  return EXT_TO_MIME[key.split(".").pop()!];
}

function newKey(prefix: string, mime: AllowedMime): string {
  const now = new Date();
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64) || "misc";
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${safePrefix}/${now.getUTCFullYear()}/${mm}/${randomBytes(16).toString("hex")}.${TYPES[mime]}`;
}

class LocalDriver implements StorageDriver {
  private root = path.resolve(process.env.STORAGE_DIR ?? "./storage");

  private pathFor(key: string): string {
    if (!isValidKey(key)) throw badRequest("Invalid file key");
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw badRequest("Invalid file key");
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.pathFor(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch {
      return null;
    }
  }

  url(key: string): string {
    return `${apiBaseUrl()}/v1/files/${key}`;
  }
}

function createDriver(): StorageDriver {
  const kind = process.env.STORAGE_DRIVER ?? "local";
  if (kind === "local") return new LocalDriver();
  if (kind === "s3") throw new Error("STORAGE_DRIVER=s3 is not implemented yet (see src/lib/storage.ts)");
  throw new Error(`Unknown STORAGE_DRIVER "${kind}"`);
}

export const storage: StorageDriver = createDriver();

export interface StoredFile {
  key: string;
  url: string;
  mimeType: AllowedMime;
  sizeBytes: number;
}

/** Validates the bytes and stores them under a random key. */
export async function storeUpload(
  prefix: string,
  data: Buffer,
  opts: { imagesOnly?: boolean } = {},
): Promise<StoredFile> {
  if (!data.length) throw badRequest("The file is empty");
  if (data.length > MAX_UPLOAD_BYTES) throw badRequest("Files can be at most 15 MB");
  const mime = sniffMime(data);
  if (!mime) throw badRequest("Only JPEG, PNG, WebP, GIF, HEIC images and PDF files are allowed");
  if (opts.imagesOnly && !isImage(mime)) throw badRequest("Please upload an image");
  const key = newKey(prefix, mime);
  await storage.put(key, data, mime);
  return { key, url: storage.url(key), mimeType: mime, sizeBytes: data.length };
}
