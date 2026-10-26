import { randomBytes, randomInt } from "node:crypto";

// Crockford-style alphabet without ambiguous characters (0/O, 1/I/L, U).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Applicant-facing application reference, e.g. KS-7Q4M-2KXD. */
export const newApplicationReference = () => `KS-${randomCode(4)}-${randomCode(4)}`;
/** Public campaign id used in URLs; random, unrelated to any internal id. */
export const newCampaignPublicId = () => randomCode(10).toLowerCase();
/** Payment reference sent to the provider. */
export const newPaymentReference = () => `ksp_${randomBytes(12).toString("hex")}`;
export const newComplaintReference = () => `KC-${randomCode(6)}`;
/** Unguessable storage object key. */
export const newStorageKey = () => randomBytes(24).toString("hex");
