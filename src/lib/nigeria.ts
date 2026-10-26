export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "Federal Capital Territory", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano",
  "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau",
  "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

/** Normalise a Nigerian phone number to +234XXXXXXXXXX, or null if invalid. */
export function normaliseNigerianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let m = /^\+?234([789]\d{9})$/.exec(digits);
  if (m) return `+234${m[1]}`;
  m = /^0([789]\d{9})$/.exec(digits);
  if (m) return `+234${m[1]}`;
  return null;
}
