import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { buildActor, type Actor } from "@/server/actor";
import { randomCode } from "@/lib/ids";
import { assertDisposableTestDatabase } from "./safety";

/**
 * Test data factory. All people and places are fictional.
 * Append-only tables are cleared with TRUNCATE (which does not fire row-level triggers).
 */
export async function resetDb() {
  assertDisposableTestDatabase(process.env.DATABASE_URL);
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'ledger_accounts')`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export async function makeUser(roles: Role[], name = `Test ${randomCode(4)}`): Promise<Actor> {
  const u = await db.user.create({
    data: {
      email: `${name.toLowerCase().replace(/\W+/g, ".")}.${randomCode(6).toLowerCase()}@example.test`,
      name,
      passwordHash: "!test",
      emailVerifiedAt: new Date(),
      roles: { create: roles.map((role) => ({ role })) },
    },
    include: { roles: true },
  });
  return buildActor(u);
}

export async function makeCategory() {
  return db.caseCategory.create({
    data: {
      slug: `cat-${randomCode(5).toLowerCase()}`,
      name: "Emergency accommodation",
      description: "Short-term housing support for people displaced from their homes.",
      verificationChecklist: [{ key: "landlord_quote", label: "Confirm rent quote with landlord", stage: "REMOTE" }],
    },
  });
}
