import { execSync } from "node:child_process";
import { TEST_ENV } from "./test-env";
import { assertDisposableTestDatabase } from "./safety";

/** Apply pending migrations (non-destructive) to the dedicated test database once per run. */
export default function setup() {
  assertDisposableTestDatabase(TEST_ENV.DATABASE_URL);
  try {
    execSync("npx prisma migrate deploy", {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: TEST_ENV.DATABASE_URL },
    });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `prisma migrate deploy failed:\n${err.stdout?.toString() ?? ""}\n${err.stderr?.toString() ?? ""}`,
    );
  }
}
