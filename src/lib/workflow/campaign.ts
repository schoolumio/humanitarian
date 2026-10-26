import type { CampaignStatus } from "@prisma/client";
import type { TransitionTable } from "./machine";

/**
 * Public campaign workflow.
 *  PUBLISHED            live, no confirmed funds yet
 *  FUNDING_IN_PROGRESS  live, some confirmed funds
 *  FULLY_FUNDED         confirmed funds >= target; new donations closed
 *  PARTIALLY_FUNDED     funding closed below target; intervention may proceed with reduced/phased scope
 * Reaching the target never implies the intervention is complete.
 */
export const CAMPAIGN_TRANSITIONS: TransitionTable<CampaignStatus> = {
  DRAFT: { READY_FOR_PUBLICATION: ["campaign.manage"], CANCELLED: ["campaign.manage"] },
  READY_FOR_PUBLICATION: {
    DRAFT: ["campaign.manage", "campaign.publish"],
    PUBLISHED: ["campaign.publish"],
    CANCELLED: ["campaign.manage"],
  },
  PUBLISHED: {
    FUNDING_IN_PROGRESS: ["SYSTEM"],
    FULLY_FUNDED: ["SYSTEM"],
    CANCELLED: ["campaign.manage"],
  },
  FUNDING_IN_PROGRESS: {
    PUBLISHED: ["SYSTEM"], // all confirmed funds refunded
    FULLY_FUNDED: ["SYSTEM"],
    PARTIALLY_FUNDED: ["campaign.manage"],
    CANCELLED: ["campaign.manage"],
  },
  FULLY_FUNDED: {
    FUNDING_IN_PROGRESS: ["SYSTEM"], // refund/chargeback took it below target
    INTERVENTION_IN_PROGRESS: ["intervention.manage"],
    CANCELLED: ["campaign.manage"],
  },
  PARTIALLY_FUNDED: {
    FUNDING_IN_PROGRESS: ["campaign.manage"], // funding reopened
    INTERVENTION_IN_PROGRESS: ["intervention.manage"],
    CANCELLED: ["campaign.manage"],
  },
  INTERVENTION_IN_PROGRESS: {
    OUTCOME_REVIEW: ["intervention.manage"],
    CANCELLED: ["campaign.manage"],
  },
  OUTCOME_REVIEW: {
    INTERVENTION_IN_PROGRESS: ["intervention.outcome_review"],
    COMPLETED: ["intervention.outcome_review"],
  },
  COMPLETED: {},
  CANCELLED: {},
};

export const PUBLIC_CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  "PUBLISHED",
  "FUNDING_IN_PROGRESS",
  "PARTIALLY_FUNDED",
  "FULLY_FUNDED",
  "INTERVENTION_IN_PROGRESS",
  "OUTCOME_REVIEW",
  "COMPLETED",
];

/** Statuses in which the public can contribute money. */
export const DONATABLE_STATUSES: readonly CampaignStatus[] = ["PUBLISHED", "FUNDING_IN_PROGRESS"];

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: "Draft",
  READY_FOR_PUBLICATION: "Ready for publication",
  PUBLISHED: "Open for support",
  FUNDING_IN_PROGRESS: "Funding in progress",
  PARTIALLY_FUNDED: "Partially funded",
  FULLY_FUNDED: "Fully funded",
  INTERVENTION_IN_PROGRESS: "Support being delivered",
  OUTCOME_REVIEW: "Outcome under review",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * Status implied by confirmed net funding, for SYSTEM transitions driven by payments.
 * Only applies while the campaign is in a funding phase.
 */
export function fundingStatusFor(
  current: CampaignStatus,
  netConfirmed: bigint,
  target: bigint,
): CampaignStatus {
  const fundingPhase: readonly CampaignStatus[] = ["PUBLISHED", "FUNDING_IN_PROGRESS", "FULLY_FUNDED"];
  if (!fundingPhase.includes(current)) return current;
  if (netConfirmed >= target) return "FULLY_FUNDED";
  if (netConfirmed > 0n) return "FUNDING_IN_PROGRESS";
  return current === "FULLY_FUNDED" ? "FUNDING_IN_PROGRESS" : "PUBLISHED";
}
