import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as auth from "@/server/services/auth";
import { validateSessionToken } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { resetDb } from "../helpers/factory";

const ctx = { ipHash: "iphash-test", userAgent: "vitest" };

describe("authentication", () => {
  beforeEach(resetDb);

  it("registers only self-service roles and hides existing accounts", async () => {
    const r = await auth.register({ name: "Donor Person", email: "Donor@Example.test", password: "a long memorable phrase", role: "DONOR" }, ctx);
    expect(r.created).toBe(true);
    const again = await auth.register({ name: "Other", email: "donor@example.test", password: "another long phrase", role: "DONOR" }, ctx);
    expect(again.created).toBe(false);
    await expect(auth.register({ name: "X", email: "x@example.test", password: "a long memorable phrase", role: "ADMIN" as never }, ctx)).rejects.toThrow();
    const u = await db.user.findUniqueOrThrow({ where: { email: "donor@example.test" }, include: { roles: true } });
    expect(u.roles.map((x) => x.role)).toEqual(["DONOR"]);
    expect(u.passwordHash.startsWith("$argon2id$")).toBe(true);
  });

  it("logs in, verifies email with a single-use token, and locks after repeated failures", async () => {
    await auth.register({ name: "Applicant", email: "app@example.test", password: "a long memorable phrase", role: "APPLICANT" }, ctx);
    const user = await db.user.findUniqueOrThrow({ where: { email: "app@example.test" } });
    const token = await auth.sendVerificationEmail(user.id);
    await auth.verifyEmail(token!);
    await expect(auth.verifyEmail(token!)).rejects.toThrow(/expired/);

    const s = await auth.login({ email: "APP@example.test", password: "a long memorable phrase" }, ctx);
    expect((await validateSessionToken(s.token))?.userId).toBe(user.id);
    for (let i = 0; i < 8; i++) await expect(auth.login({ email: "app@example.test", password: "wrong password!!" }, { ...ctx, ipHash: `ip${i}` })).rejects.toThrow();
    await expect(auth.login({ email: "app@example.test", password: "a long memorable phrase" }, { ...ctx, ipHash: "other" })).rejects.toThrow(/locked|Too many/);
  });

  it("password reset is single-use and revokes existing sessions", async () => {
    await auth.register({ name: "Person", email: "p@example.test", password: "a long memorable phrase", role: "DONOR" }, ctx);
    const s = await auth.login({ email: "p@example.test", password: "a long memorable phrase" }, ctx);
    const token = await auth.requestPasswordReset("p@example.test", ctx);
    await auth.resetPassword(token!, "a brand new phrase here");
    expect(await validateSessionToken(s.token)).toBeNull();
    await expect(auth.resetPassword(token!, "yet another phrase!!")).rejects.toThrow(/invalid or has expired/);
    expect(await auth.requestPasswordReset("nobody@example.test", ctx)).toBeNull();
  });

  it("rate limits atomically", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeRateLimit("t:key", 5, 60)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });
});
