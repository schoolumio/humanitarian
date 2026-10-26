import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

export function hmacHex(algorithm: "sha256" | "sha512", key: string, data: string | Buffer) {
  return createHmac(algorithm, key).update(data).digest("hex");
}

/** Constant-time comparison of two hex/ascii strings. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** AES-256-GCM encryption for small secrets at rest (e.g. TOTP secrets). */
export function encryptSecret(plaintext: string): string {
  const key = Buffer.from(env().DATA_ENCRYPTION_KEY, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unsupported ciphertext");
  const key = Buffer.from(env().DATA_ENCRYPTION_KEY, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Hash an IP address with a server secret so we can rate-limit/audit without storing raw IPs. */
export const hashIp = (ip: string | null | undefined) => (ip ? hmacHex("sha256", env().AUTH_SECRET, ip).slice(0, 32) : null);
