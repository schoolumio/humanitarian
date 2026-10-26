import { describe, expect, it } from "vitest";
import { base32Encode, hotp, totp, verifyTotp } from "@/lib/auth/totp";
import { sniffFileType, safeDisplayName } from "@/lib/storage/files";
import { passwordProblem } from "@/lib/auth/password";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { redactForLog } from "@/lib/logger";
import { sanitizePayload } from "@/lib/payments/types";

describe("TOTP (RFC 4226/6238 test vectors)", () => {
  const secret = Buffer.from("12345678901234567890");
  it("matches RFC 4226 HOTP vectors", () => {
    expect(["755224", "287082", "359152"]).toEqual([0, 1, 2].map((c) => hotp(secret, c)));
  });
  it("matches RFC 6238 at T=59s", () => {
    expect(totp(base32Encode(secret), 59_000, 30, 6)).toBe("287082");
  });
  it("accepts ±1 step and rejects others", () => {
    const b32 = base32Encode(secret);
    const now = 1_700_000_000_000;
    expect(verifyTotp(b32, totp(b32, now - 30_000), now)).toBe(true);
    expect(verifyTotp(b32, totp(b32, now - 90_000), now)).toBe(false);
    expect(verifyTotp(b32, "abc", now)).toBe(false);
  });
});

describe("file type sniffing", () => {
  it("detects real types regardless of extension", () => {
    expect(sniffFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffFileType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffFileType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]))).toBeNull(); // Windows executable
  });
  it("strips path traversal from display names", () => {
    expect(safeDisplayName("../../etc/passwd")).toBe("passwd");
    expect(safeDisplayName("..\\..\\evil<script>.pdf")).toBe("evil_script_.pdf");
  });
});

describe("passwords, encryption and redaction", () => {
  it("enforces length and blocks common passwords", () => {
    expect(passwordProblem("short")).toMatch(/10/);
    expect(passwordProblem("password123")).toMatch(/common/);
    expect(passwordProblem("a long memorable phrase")).toBeNull();
  });
  it("round-trips AES-GCM secrets and detects tampering", () => {
    const enc = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(enc)).toBe("JBSWY3DPEHPK3PXP");
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
  it("redacts secrets and sensitive narratives from logs", () => {
    expect(redactForLog({ password: "x", token: "y", whatHappened: "z", ok: 1 })).toEqual({ password: "[redacted]", token: "[redacted]", whatHappened: "[redacted]", ok: 1 });
  });
  it("removes card and customer data from provider payloads", () => {
    const s = sanitizePayload({ data: { amount: 1, authorization: { last4: "4081" }, customer: { email: "e" } } }) as { data: Record<string, unknown> };
    expect(s.data.authorization).toBe("[removed]");
    expect(s.data.customer).toBe("[removed]");
    expect(s.data.amount).toBe(1);
  });
});
