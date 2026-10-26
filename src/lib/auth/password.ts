import { hash, verify } from "@node-rs/argon2";

// Argon2id with OWASP-recommended minimums (m=19 MiB, t=2, p=1).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const hashPassword = (password: string) => hash(password, OPTIONS);

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

const COMMON = new Set([
  "password", "password1", "password123", "123456789", "1234567890", "qwertyuiop", "iloveyou12",
  "kindspring", "kindspring1", "nigeria123", "letmein123", "welcome123", "adminadmin",
]);

/** Returns a user-facing problem, or null if acceptable. Length beats complexity rules (NIST 800-63B). */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "Use at most 200 characters.";
  if (COMMON.has(password.toLowerCase())) return "This password is too common. Choose another.";
  const local = email?.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && password.toLowerCase().includes(local)) {
    return "Do not include your email name in your password.";
  }
  return null;
}
