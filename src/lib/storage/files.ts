import type { FilePurpose } from "@prisma/client";

/** Upload limits. Requests through the app are capped at 4 MB (serverless body limit). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type SniffedType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "video/mp4" | "text/plain";

const IMAGE: SniffedType[] = ["image/jpeg", "image/png", "image/webp"];

export const ALLOWED_TYPES: Record<FilePurpose, SniffedType[]> = {
  APPLICATION_EVIDENCE: [...IMAGE, "application/pdf"],
  VERIFICATION_EVIDENCE: [...IMAGE, "application/pdf"],
  DELIVERY_EVIDENCE: [...IMAGE, "application/pdf"],
  INVOICE: [...IMAGE, "application/pdf"],
  MEDIA_ORIGINAL: [...IMAGE, "video/mp4", "text/plain"],
  MEDIA_PUBLIC: [...IMAGE, "video/mp4"],
};

/**
 * Detect the real file type from magic bytes. The client-declared MIME type and file
 * extension are never trusted.
 */
export function sniffFileType(buf: Uint8Array): SniffedType | null {
  const b = (i: number) => buf[i];
  if (buf.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (buf.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b(i) === v)) return "image/png";
  if (buf.length >= 12 && ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 5 && ascii(buf, 0, 5) === "%PDF-") return "application/pdf";
  if (buf.length >= 12 && ascii(buf, 4, 8) === "ftyp") {
    const brand = ascii(buf, 8, 12);
    if (["isom", "iso2", "mp41", "mp42", "avc1", "M4V "].includes(brand)) return "video/mp4";
  }
  if (buf.length > 0 && looksLikeUtf8Text(buf.subarray(0, 4096))) return "text/plain";
  return null;
}

function ascii(buf: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...buf.subarray(start, end));
}

function looksLikeUtf8Text(buf: Uint8Array) {
  for (const c of buf) if (c === 0 || (c < 0x09) || (c > 0x0d && c < 0x20 && c !== 0x1b)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

export const EXTENSION_FOR: Record<SniffedType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "text/plain": "txt",
};

/** Strip path components and unsafe characters from a client file name (display only). */
export function safeDisplayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\- ()]/g, "_").replace(/^\.+/, "").slice(0, 120);
  return cleaned || "file";
}
