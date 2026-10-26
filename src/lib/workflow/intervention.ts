import type { InterventionStatus } from "@prisma/client";

export const INTERVENTION_TRANSITIONS: Record<InterventionStatus, readonly InterventionStatus[]> = {
  PLANNING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["DELIVERED", "PARTIALLY_DELIVERED", "UNSUCCESSFUL", "CANCELLED"],
  PARTIALLY_DELIVERED: ["IN_PROGRESS", "DELIVERED", "OUTCOME_REVIEW", "UNSUCCESSFUL"],
  DELIVERED: ["OUTCOME_REVIEW"],
  OUTCOME_REVIEW: ["COMPLETED", "IN_PROGRESS", "UNSUCCESSFUL"],
  COMPLETED: [],
  UNSUCCESSFUL: [],
  CANCELLED: [],
};

export const canMoveIntervention = (from: InterventionStatus, to: InterventionStatus) =>
  INTERVENTION_TRANSITIONS[from].includes(to);

export const DEFAULT_COMPLETION_CHECKLIST = [
  { key: "scope_delivered", label: "Approved scope delivered or variance documented", done: false },
  { key: "delivery_evidence", label: "Delivery evidence recorded", done: false },
  { key: "invoices_matched", label: "All disbursements matched to invoices/receipts", done: false },
  { key: "beneficiary_confirmed", label: "Beneficiary confirmed receipt", done: false },
  { key: "feedback_recorded", label: "Beneficiary feedback recorded (or refusal noted)", done: false },
] as const;

export type ChecklistItem = { key: string; label: string; done: boolean };

/**
 * A completion requires: all checklist items done, at least one delivery evidence record,
 * and no disbursement left in REQUESTED/APPROVED (unpaid) state.
 */
export function completionBlockers(input: {
  checklist: ChecklistItem[];
  deliveryEvidenceCount: number;
  openDisbursements: number;
}): string[] {
  const blockers: string[] = [];
  for (const item of input.checklist) if (!item.done) blockers.push(`Checklist item not complete: ${item.label}`);
  if (input.deliveryEvidenceCount === 0) blockers.push("No delivery evidence has been recorded.");
  if (input.openDisbursements > 0) blockers.push("There are disbursements still awaiting approval or payment.");
  return blockers;
}
