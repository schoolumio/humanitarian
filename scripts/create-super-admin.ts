/**
 * Bootstrap the first super administrator (production-safe).
 * Usage: ADMIN_EMAIL=you@org.ng ADMIN_NAME="Your Name" ADMIN_PASSWORD='…' npm run admin:create
 * The password is read from the environment so it never appears in shell history arguments;
 * clear it from the environment afterwards. MFA must be enabled at first sign-in.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const db = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !name || !password) throw new Error("Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD.");
  if (password.length < 14)
    throw new Error("Use a password of at least 14 characters for administrator accounts.");
  if (await db.userRole.count({ where: { role: "SUPER_ADMIN" } }))
    throw new Error("A super administrator already exists. Grant further roles from the admin interface.");
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const user = await db.user.upsert({
    where: { email },
    create: { email, name, passwordHash },
    update: { passwordHash },
  });
  await db.userRole.create({ data: { userId: user.id, role: "SUPER_ADMIN" } });
  await db.auditLog.create({
    data: { actorId: null, action: "bootstrap.super_admin", entityType: "User", entityId: user.id },
  });
  console.log(
    `Super administrator created for ${email}. Sign in, confirm your email via password reset if needed, and enable two-step verification immediately.`,
  );
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
