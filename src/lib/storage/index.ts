import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FileVisibility } from "@prisma/client";
import { env } from "../env";
import { hmacHex, safeEqual } from "../crypto";

/**
 * Object storage abstraction.
 * - PRIVATE objects (evidence, invoices, original media) live in a private bucket and are
 *   only reachable through short-lived signed URLs issued after an authorisation check.
 * - PUBLIC objects (editorially approved media) live in a separate public bucket. A file
 *   only becomes public when an editor approves it and the service copies it across.
 */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string, visibility: FileVisibility): Promise<void>;
  get(key: string, visibility: FileVisibility): Promise<Buffer>;
  delete(key: string, visibility: FileVisibility): Promise<void>;
  signedDownloadUrl(key: string, opts: { filename: string; contentType: string; ttlSeconds: number }): Promise<string>;
  publicUrl(key: string): string;
}

export const SIGNED_URL_TTL_SECONDS = 120;

const KEY_RE = /^[a-f0-9]{48}$/;
function assertKey(key: string) {
  // Keys are generated server-side; this also blocks any path traversal attempt.
  if (!KEY_RE.test(key)) throw new Error("Invalid storage key");
}

class LocalDriver implements StorageDriver {
  private dir(v: FileVisibility) {
    return path.resolve(env().LOCAL_STORAGE_DIR, v === "PUBLIC" ? "public" : "private");
  }
  async put(key: string, body: Buffer, _ct: string, v: FileVisibility) {
    assertKey(key);
    await mkdir(this.dir(v), { recursive: true });
    await writeFile(path.join(this.dir(v), key), body, { flag: "wx" });
  }
  async get(key: string, v: FileVisibility) {
    assertKey(key);
    return readFile(path.join(this.dir(v), key));
  }
  async delete(key: string, v: FileVisibility) {
    assertKey(key);
    await rm(path.join(this.dir(v), key), { force: true });
  }
  async signedDownloadUrl(key: string, opts: { filename: string; contentType: string; ttlSeconds: number }) {
    assertKey(key);
    const exp = Math.floor(Date.now() / 1000) + opts.ttlSeconds;
    const params = new URLSearchParams({ k: key, exp: String(exp), ct: opts.contentType, fn: opts.filename });
    params.set("sig", signLocal(params));
    return `/api/files/local?${params.toString()}`;
  }
  publicUrl(key: string) {
    assertKey(key);
    return `/api/files/public/${key}`;
  }
}

function signLocal(params: URLSearchParams) {
  const payload = ["k", "exp", "ct", "fn"].map((k) => `${k}=${params.get(k) ?? ""}`).join("&");
  return hmacHex("sha256", env().AUTH_SECRET, `local-file:${payload}`);
}

/** Verifies a local signed URL's parameters. Returns the key if valid. */
export function verifyLocalSignature(params: URLSearchParams): string | null {
  const sig = params.get("sig");
  const key = params.get("k");
  const exp = Number(params.get("exp"));
  if (!sig || !key || !KEY_RE.test(key) || !Number.isFinite(exp)) return null;
  if (exp < Math.floor(Date.now() / 1000)) return null;
  return safeEqual(sig, signLocal(params)) ? key : null;
}

class S3Driver implements StorageDriver {
  private client: S3Client;
  constructor() {
    const e = env();
    this.client = new S3Client({
      region: e.OBJECT_STORAGE_REGION,
      endpoint: e.OBJECT_STORAGE_ENDPOINT || undefined,
      forcePathStyle: !!e.OBJECT_STORAGE_ENDPOINT,
      credentials: { accessKeyId: e.OBJECT_STORAGE_ACCESS_KEY_ID!, secretAccessKey: e.OBJECT_STORAGE_SECRET_ACCESS_KEY! },
    });
  }
  private bucket(v: FileVisibility) {
    return v === "PUBLIC" ? env().OBJECT_STORAGE_PUBLIC_BUCKET! : env().OBJECT_STORAGE_PRIVATE_BUCKET!;
  }
  async put(key: string, body: Buffer, contentType: string, v: FileVisibility) {
    assertKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket(v), Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" }),
    );
  }
  async get(key: string, v: FileVisibility) {
    assertKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket(v), Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  async delete(key: string, v: FileVisibility) {
    assertKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket(v), Key: key }));
  }
  async signedDownloadUrl(key: string, opts: { filename: string; contentType: string; ttlSeconds: number }) {
    assertKey(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket("PRIVATE"),
        Key: key,
        ResponseContentDisposition: `attachment; filename="${opts.filename.replace(/"/g, "")}"`,
        ResponseContentType: opts.contentType,
      }),
      { expiresIn: opts.ttlSeconds },
    );
  }
  publicUrl(key: string) {
    assertKey(key);
    return `${env().OBJECT_STORAGE_PUBLIC_BASE_URL!.replace(/\/$/, "")}/${key}`;
  }
}

let driver: StorageDriver | undefined;
export function storage(): StorageDriver {
  if (!driver) driver = env().STORAGE_DRIVER === "s3" ? new S3Driver() : new LocalDriver();
  return driver;
}
