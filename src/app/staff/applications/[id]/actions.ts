"use server";

import { revalidatePath } from "next/cache";
import type { ApplicationStatus, ConsentType, Recommendation } from "@prisma/client";
import { runAction, str, type FormState } from "@/server/action";
import { getActor } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import * as cases from "@/server/services/cases";
import { createSafeguardingRecord } from "@/server/services/complaints";

const done = (id: string, msg: string) => {
  revalidatePath(`/staff/applications/${id}`);
  return msg;
};
const me = async () => requireActor(await getActor());

export async function transitionAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await cases.transitionCase(await me(), id, str(fd, "to") as ApplicationStatus, str(fd, "reason"));
    return done(id, "Status updated.");
  });
}
export async function requestInfoAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await cases.requestInformation(await me(), id, str(fd, "message"));
    return done(id, "Request sent to the applicant.");
  });
}
export async function assignAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const follow = str(fd, "followUpAt");
    await cases.assignInvestigator(await me(), id, str(fd, "investigatorId"), Number(str(fd, "priority") || 2), follow ? new Date(follow) : null);
    return done(id, "Investigator assigned.");
  });
}
export async function endAssignmentAction(id: string, assignmentId: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await cases.endAssignment(await me(), assignmentId, str(fd, "reason") || "Reassigned");
    return done(id, "Assignment ended.");
  });
}
export async function conflictAction(id: string, assignmentId: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const has = str(fd, "hasConflict") === "yes";
    await cases.declareConflict(await me(), assignmentId, has, str(fd, "details"));
    return done(id, has ? "Conflict recorded. You have been removed from this case." : "Thank you. You can now work on this case.");
  });
}
export async function taskAction(id: string, taskId: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await cases.updateTask(await me(), id, taskId, str(fd, "status") as "DONE", str(fd, "note"));
    return done(id, "Check updated.");
  });
}
export async function noteAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await cases.addNote(await me(), id, str(fd, "body"), fd.get("restricted") === "on");
    return done(id, "Note added.");
  });
}
export async function fieldVisitRequestAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await cases.requestFieldVisit(await me(), id, str(fd, "reason"), str(fd, "estimatedCost"));
    return done(id, "Field visit requested.");
  });
}
export async function fieldVisitUpdateAction(id: string, visitId: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const when = str(fd, "scheduledFor");
    await cases.updateFieldVisit(await me(), visitId, {
      status: str(fd, "status") as "SCHEDULED",
      scheduledFor: when ? new Date(when) : null,
      actualCost: str(fd, "actualCost"),
      notes: str(fd, "notes"),
      investigatorId: str(fd, "investigatorId") || undefined,
    });
    return done(id, "Field visit updated.");
  });
}
export async function reportAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await cases.submitInvestigationReport(await me(), id, Object.fromEntries(fd));
    return done(id, "Investigation report submitted.");
  });
}
export async function reviewAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await cases.submitReview(await me(), id, str(fd, "recommendation") as Recommendation, str(fd, "comments"));
    return done(id, "Review recorded.");
  });
}
export async function decisionAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await cases.decideCase(await me(), id, Object.fromEntries(fd));
    return done(id, "Decision recorded and the applicant notified.");
  });
}
export async function reopenAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await cases.reopenCase(await me(), id, str(fd, "reason"));
    return done(id, "Case reopened.");
  });
}
export async function consentOnBehalfAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await cases.recordConsentOnBehalf(await me(), id, str(fd, "type") as ConsentType, str(fd, "granted") === "yes", str(fd, "method") as "WRITTEN_FORM", str(fd, "notes"));
    return done(id, "Consent recorded.");
  });
}
export async function safeguardingAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await createSafeguardingRecord(await me(), { ...Object.fromEntries(fd), applicationId: id });
    return done(id, "Safeguarding record created.");
  });
}
