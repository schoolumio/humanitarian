import type { ConsentType, PublicationChannel } from "@prisma/client";

/**
 * Consent model.
 * - ASSESSMENT_DATA_PROCESSING is the only consent required to apply.
 * - Every publication channel needs its own explicit consent; granting one never implies another.
 * - Consents are append-only rows; the newest row for a type is the effective value.
 */
export const REQUIRED_TO_APPLY: readonly ConsentType[] = ["ASSESSMENT_DATA_PROCESSING"];

export const OPTIONAL_CONSENTS: readonly ConsentType[] = [
  "CONTACT_REFERENCES",
  "PUBLIC_CAMPAIGN_PAGE",
  "FILMING_AND_PHOTOGRAPHY",
  "SOCIAL_MEDIA",
  "PAID_ADVERTISING",
  "SPONSOR_REPORTING",
  "THIRD_PARTY_BRAND_REUSE",
];

export const CHANNEL_CONSENT: Record<PublicationChannel, ConsentType | null> = {
  CAMPAIGN_PAGE: "PUBLIC_CAMPAIGN_PAGE",
  SOCIAL_MEDIA: "SOCIAL_MEDIA",
  PAID_ADVERTISING: "PAID_ADVERTISING",
  SPONSOR_REPORT: "SPONSOR_REPORTING",
  THIRD_PARTY_BRAND: "THIRD_PARTY_BRAND_REUSE",
  INTERNAL_ONLY: null,
};

export const CONSENT_TEXT: Record<ConsentType, { title: string; description: string }> = {
  ASSESSMENT_DATA_PROCESSING: {
    title: "Use my information to assess my request (required)",
    description:
      "KindSpring staff and assigned investigators may use the information and documents you provide to verify and assess your request. It is not published.",
  },
  CONTACT_REFERENCES: {
    title: "Contact the references I listed",
    description:
      "We may contact the people you named (for example a community leader) to help verify your request.",
  },
  PUBLIC_CAMPAIGN_PAGE: {
    title: "Publish an anonymised summary on a public campaign page",
    description:
      "If approved, a short summary of your need (no full name, address or documents) may appear on the KindSpring website so the public can contribute.",
  },
  FILMING_AND_PHOTOGRAPHY: {
    title: "Photograph or film me",
    description:
      "KindSpring may take photographs or video for documenting the support. Nothing is published without the separate consents below.",
  },
  SOCIAL_MEDIA: {
    title: "Share my story on KindSpring social media",
    description: "Approved photos, videos or text may be posted on KindSpring's social media accounts.",
  },
  PAID_ADVERTISING: {
    title: "Use my story in paid advertising",
    description: "Approved material may be used in paid adverts promoting KindSpring.",
  },
  SPONSOR_REPORTING: {
    title: "Share progress with sponsors",
    description:
      "Sponsors who fund your support may receive anonymised progress reports and approved photographs.",
  },
  THIRD_PARTY_BRAND_REUSE: {
    title: "Allow sponsors to reuse my story in their own communications",
    description:
      "A sponsoring company may reuse approved material in its own communications, under a written agreement.",
  },
  GUARDIAN_CONSENT_FOR_MINOR: {
    title: "Parent or guardian consent for a child",
    description:
      "Required, together with a safeguarding review, before any identifiable image or story of a child is published.",
  },
};

export type ConsentRow = { type: ConsentType; granted: boolean; createdAt: Date };

/** Reduce the append-only consent log to the effective state per type. */
export function effectiveConsents(rows: readonly ConsentRow[]): Map<ConsentType, boolean> {
  const latest = new Map<ConsentType, ConsentRow>();
  for (const r of rows) {
    const cur = latest.get(r.type);
    if (!cur || r.createdAt >= cur.createdAt) latest.set(r.type, r);
  }
  return new Map([...latest].map(([k, v]) => [k, v.granted]));
}

export type PublicationCheckInput = {
  channel: PublicationChannel;
  consents: Map<ConsentType, boolean>;
  media: {
    depictsBeneficiary: boolean;
    depictsMinor: boolean;
    status: string;
    safeguardingCleared: boolean;
  }[];
  openSafeguardingRestriction: boolean;
};

/** Returns the reasons a publication is blocked (empty = allowed). */
export function publicationBlockers(input: PublicationCheckInput): string[] {
  const reasons: string[] = [];
  if (input.openSafeguardingRestriction && input.channel !== "INTERNAL_ONLY") {
    reasons.push("An open safeguarding record restricts publication for this case.");
  }
  const required = CHANNEL_CONSENT[input.channel];
  if (required && input.consents.get(required) !== true) {
    reasons.push(`The beneficiary has not consented to: ${CONSENT_TEXT[required].title}.`);
  }
  for (const m of input.media) {
    if (m.status !== "APPROVED") reasons.push("All attached media must be editorially approved.");
    if (m.depictsBeneficiary && input.consents.get("FILMING_AND_PHOTOGRAPHY") !== true) {
      reasons.push("Attached media shows the beneficiary but photography/filming consent is not in place.");
    }
    if (m.depictsMinor) {
      if (input.consents.get("GUARDIAN_CONSENT_FOR_MINOR") !== true)
        reasons.push("Media depicts a child: guardian consent is required.");
      if (!m.safeguardingCleared)
        reasons.push("Media depicts a child: a safeguarding review must clear it first.");
    }
  }
  return [...new Set(reasons)];
}
