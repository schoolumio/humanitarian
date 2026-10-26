import { z } from "zod";
import { NIGERIAN_STATES, normaliseNigerianPhone } from "@/lib/nigeria";
import { parseMajorToMinor } from "@/lib/money";

const text = (min: number, max: number, msg: string) =>
  z.string().trim().min(min, msg).max(max, `Please keep this under ${max} characters.`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const CONTACT_METHODS = ["PHONE_CALL", "SMS", "WHATSAPP", "EMAIL", "VIDEO_CALL", "IN_PERSON"] as const;
export const CONTACT_METHOD_LABEL: Record<(typeof CONTACT_METHODS)[number], string> = {
  PHONE_CALL: "Phone call",
  SMS: "SMS text message",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  VIDEO_CALL: "Video call",
  IN_PERSON: "In person (through a community contact)",
};

export const stepSchemas = {
  1: z.object({
    fullName: text(2, 120, "Enter your full name."),
    phone: z
      .string()
      .trim()
      .transform((v, ctx) => {
        const n = normaliseNigerianPhone(v);
        if (!n)
          ctx.addIssue({ code: "custom", message: "Enter a Nigerian phone number, e.g. 0803 123 4567." });
        return n ?? v;
      }),
    state: z.enum(NIGERIAN_STATES, { message: "Choose your state." }),
    lga: text(2, 80, "Enter your local government area."),
    community: text(2, 120, "Enter your town or community."),
    householdSize: z.coerce.number({ message: "Enter a number." }).int().min(1, "Enter at least 1.").max(50),
    completedWithHelpFrom: optionalText(200),
  }),
  2: z.object({ categoryId: z.string().min(1, "Choose the type of assistance.") }),
  3: z
    .object({
      whatHappened: text(20, 4000, "Tell us what happened (at least a few sentences)."),
      assistanceNeeded: text(10, 2000, "Describe the assistance you need."),
      whyNow: text(5, 2000, "Tell us why the assistance is needed now."),
      successOutcome: text(5, 2000, "Tell us what successful support would achieve."),
      urgentSafetyConcern: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
      safetyConcernDetails: optionalText(2000),
    })
    .refine((d) => !d.urgentSafetyConcern || !!d.safetyConcernDetails, {
      path: ["safetyConcernDetails"],
      message: "Please describe the safety concern so we can respond appropriately.",
    }),
  4: z.object({
    items: z
      .array(
        z.object({
          description: text(2, 200, "Describe the item."),
          quantity: z.coerce.number({ message: "Enter a quantity." }).int().min(1, "At least 1.").max(10000),
          unitCost: z.string().transform((v, ctx) => {
            const minor = parseMajorToMinor(v);
            if (minor === null || minor <= 0n) {
              ctx.addIssue({ code: "custom", message: "Enter a cost in naira, e.g. 25000." });
              return 0n;
            }
            return minor;
          }),
          sourceNote: optionalText(300),
        }),
      )
      .min(1, "Add at least one item.")
      .max(30, "Please add no more than 30 items."),
    budgetNotes: optionalText(2000),
  }),
  6: z.object({
    contactMethods: z.array(z.enum(CONTACT_METHODS)).min(1, "Choose at least one safe way to contact you."),
    safeContactTimes: optionalText(300),
    contactSafetyNotes: optionalText(1000),
    verificationAlternatives: optionalText(2000),
    referenceContacts: optionalText(1000),
  }),
} as const;

export const STEPS = [
  { n: 1, title: "Your details" },
  { n: 2, title: "Type of assistance" },
  { n: 3, title: "Your situation" },
  { n: 4, title: "Budget" },
  { n: 5, title: "Supporting evidence" },
  { n: 6, title: "Contact & verification" },
  { n: 7, title: "Privacy & consent" },
  { n: 8, title: "Review & submit" },
] as const;

/** Upper bound for a single request (₦50,000,000). Larger needs are handled offline. */
export const MAX_REQUEST_MINOR = 50_000_000n * 100n;

export type SubmissionCheckInput = {
  fullName: string | null;
  phone: string | null;
  state: string | null;
  categoryId: string | null;
  whatHappened: string | null;
  assistanceNeeded: string | null;
  requestedAmountMinor: bigint | null;
  contactMethods: string[];
  budgetItemCount: number;
  assessmentConsent: boolean;
};

/** Pure submission-readiness check (unit tested). Evidence is deliberately NOT required. */
export function submissionProblems(a: SubmissionCheckInput): { step: number; message: string }[] {
  const p: { step: number; message: string }[] = [];
  if (!a.fullName || !a.phone || !a.state) p.push({ step: 1, message: "Complete your details." });
  if (!a.categoryId) p.push({ step: 2, message: "Choose the type of assistance." });
  if (!a.whatHappened || !a.assistanceNeeded)
    p.push({ step: 3, message: "Describe your situation and the help you need." });
  if (a.budgetItemCount === 0 || !a.requestedAmountMinor)
    p.push({ step: 4, message: "Add at least one budget item." });
  if (a.requestedAmountMinor && a.requestedAmountMinor > MAX_REQUEST_MINOR)
    p.push({
      step: 4,
      message: "The total is above what can be requested online. Please contact us for help.",
    });
  if (a.contactMethods.length === 0)
    p.push({ step: 6, message: "Choose at least one safe way to contact you." });
  if (!a.assessmentConsent)
    p.push({ step: 7, message: "We need your permission to use your information to assess the request." });
  return p;
}
