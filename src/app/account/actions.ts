"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { runAction, str, withRedirect, type FormState } from "@/server/action";
import { getActor } from "@/server/current-user";
import { requireActor } from "@/server/actor";
import * as auth from "@/server/services/auth";
import { deleteOwnAccount } from "@/server/services/admin";
import { SESSION_COOKIE } from "@/lib/auth/session";

export async function beginMfaAction(): Promise<FormState> {
  return runAction(async () => {
    await auth.beginMfaSetup(requireActor(await getActor()));
    revalidatePath("/account");
  });
}

export async function confirmMfaAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await auth.confirmMfaSetup(requireActor(await getActor()), str(fd, "code"));
    revalidatePath("/account");
    return "Two-step verification is now on.";
  });
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    await auth.changePassword(requireActor(await getActor()), str(fd, "current"), str(fd, "password"));
    return "Your password was changed. Other devices have been signed out.";
  });
}

export async function resendVerificationAction(): Promise<FormState> {
  return runAction(async () => {
    const a = requireActor(await getActor());
    await auth.sendVerificationEmail(a.userId);
    return "We sent a new confirmation link.";
  });
}

export async function deleteAccountAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await runAction(async () => {
    if (str(fd, "confirm") !== "DELETE") throw new (await import("@/lib/errors")).AppError("Type DELETE to confirm.", "VALIDATION");
    await deleteOwnAccount(requireActor(await getActor()));
    (await cookies()).delete(SESSION_COOKIE);
  });
  return withRedirect(r, "/");
}
