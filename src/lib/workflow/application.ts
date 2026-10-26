import type { ApplicationStatus } from "@prisma/client";
import type { TransitionTable } from "./machine";

/**
 * Application ("case") workflow. Kept separate from the public campaign workflow:
 * an application can be APPROVED internally without ever being published.
 */
export const APPLICATION_TRANSITIONS: TransitionTable<ApplicationStatus> = {
  DRAFT: { SUBMITTED: ["OWNER"], WITHDRAWN: ["OWNER"] },
  SUBMITTED: {
    INITIAL_REVIEW: ["application.triage"],
    WITHDRAWN: ["OWNER"],
  },
  INITIAL_REVIEW: {
    ADDITIONAL_INFORMATION_REQUIRED: ["application.triage"],
    VERIFICATION_IN_PROGRESS: ["application.triage"],
    PENDING_APPROVAL: ["application.triage"],
    DECLINED: ["case.decide"],
    CLOSED: ["application.triage"], // e.g. confirmed duplicate
    WITHDRAWN: ["OWNER"],
  },
  ADDITIONAL_INFORMATION_REQUIRED: {
    INITIAL_REVIEW: ["OWNER", "application.triage"], // applicant responded
    VERIFICATION_IN_PROGRESS: ["application.triage"],
    CLOSED: ["application.triage"],
    WITHDRAWN: ["OWNER"],
  },
  VERIFICATION_IN_PROGRESS: {
    FIELD_VISIT_REQUIRED: ["application.triage", "investigation.record"],
    ADDITIONAL_INFORMATION_REQUIRED: ["application.triage", "investigation.record"],
    PENDING_APPROVAL: ["application.triage"],
    DECLINED: ["case.decide"],
    WITHDRAWN: ["OWNER"],
  },
  FIELD_VISIT_REQUIRED: {
    VERIFICATION_IN_PROGRESS: ["application.triage", "investigation.record"],
    ADDITIONAL_INFORMATION_REQUIRED: ["application.triage", "investigation.record"],
    PENDING_APPROVAL: ["application.triage"],
    DECLINED: ["case.decide"],
    WITHDRAWN: ["OWNER"],
  },
  PENDING_APPROVAL: {
    APPROVED: ["case.decide"],
    DECLINED: ["case.decide"],
    VERIFICATION_IN_PROGRESS: ["case.decide", "case.review"], // further investigation recommended
  },
  APPROVED: {
    CLOSED: ["case.decide"],
    VERIFICATION_IN_PROGRESS: ["case.decide"], // reopened on new evidence (only before publication; enforced in service)
  },
  DECLINED: {
    INITIAL_REVIEW: ["case.decide"], // justified reopening, reason required
  },
  WITHDRAWN: {},
  CLOSED: {},
};

/** States in which the applicant can still edit their submission. */
export const APPLICANT_EDITABLE: readonly ApplicationStatus[] = ["DRAFT"];

/** Statuses where the case requires staff attention (dashboard queue). */
export const OPEN_REVIEW_STATUSES: readonly ApplicationStatus[] = [
  "SUBMITTED",
  "INITIAL_REVIEW",
  "ADDITIONAL_INFORMATION_REQUIRED",
  "VERIFICATION_IN_PROGRESS",
  "FIELD_VISIT_REQUIRED",
  "PENDING_APPROVAL",
];

/** Plain-language status for applicants (no internal detail). */
export const APPLICANT_STATUS_TEXT: Record<ApplicationStatus, { label: string; explanation: string }> = {
  DRAFT: {
    label: "Draft",
    explanation: "Your request has not been submitted yet. You can continue where you left off.",
  },
  SUBMITTED: {
    label: "Submitted",
    explanation: "We have received your request. A member of our team will begin an initial review.",
  },
  INITIAL_REVIEW: {
    label: "Initial review",
    explanation: "Our team is reviewing your request and the information you sent.",
  },
  ADDITIONAL_INFORMATION_REQUIRED: {
    label: "More information needed",
    explanation: "We need a little more information before we can continue. Please see the request below.",
  },
  VERIFICATION_IN_PROGRESS: {
    label: "Verification in progress",
    explanation: "We are verifying your request. We may contact you using the methods you chose.",
  },
  FIELD_VISIT_REQUIRED: {
    label: "Visit being arranged",
    explanation:
      "A KindSpring investigator may arrange a visit. We will contact you first using the methods you chose.",
  },
  PENDING_APPROVAL: {
    label: "Awaiting decision",
    explanation: "Verification is complete and your request is awaiting a decision.",
  },
  APPROVED: {
    label: "Approved",
    explanation:
      "Your request has been approved for support. Approval does not guarantee funding. We will keep you informed about next steps.",
  },
  DECLINED: {
    label: "Not approved",
    explanation: "We were not able to approve this request. See the explanation below.",
  },
  WITHDRAWN: { label: "Withdrawn", explanation: "This request was withdrawn." },
  CLOSED: { label: "Closed", explanation: "This request is closed." },
};
