import { execSync } from "node:child_process";
import { E2E_ENV } from "./env";
import { assertDisposableTestDatabase } from "../../helpers/safety";

export default function globalSetup() {
  assertDisposableTestDatabase(E2E_ENV.DATABASE_URL);
  const env = { ...process.env, ...E2E_ENV };
  execSync("npx prisma migrate deploy", { stdio: "pipe", env });
  execSync("npx tsx tests/e2e/support/prepare-data.ts", { stdio: "inherit", env });
}
