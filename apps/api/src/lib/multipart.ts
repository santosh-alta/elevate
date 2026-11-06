import "@fastify/multipart";
import type { FastifyRequest } from "fastify";
import { badRequest } from "./errors";

export interface UploadPart {
  buffer: Buffer;
  filename: string;
  fields: Record<string, string>;
}

/** Reads a multipart request with one `file` part plus text fields (fields may come before or after the file). */
export async function readUpload(req: FastifyRequest): Promise<UploadPart> {
  if (!req.isMultipart()) throw badRequest("Send the file as multipart/form-data in a field called \"file\"");
  const fields: Record<string, string> = {};
  let file: { buffer: Buffer; filename: string } | null = null;
  for await (const part of req.parts()) {
    if (part.type === "file") {
      const buffer = await part.toBuffer(); // throws 413 above the size limit
      if (!file) file = { buffer, filename: part.filename };
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }
  if (!file) throw badRequest("No file received");
  return { ...file, fields };
}
