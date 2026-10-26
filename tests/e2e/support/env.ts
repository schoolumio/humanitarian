/** Fictional, test-only configuration for the e2e server and data setup. */
export const E2E_ENV: Record<string, string> = {
  NODE_ENV: "production",
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/kindspring_e2e_test",
  APP_BASE_URL: "http://localhost:3100",
  AUTH_SECRET: "e2e-only-auth-secret-0123456789abcdef0123456789",
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  PAYMENT_PROVIDER: "sandbox",
  SANDBOX_WEBHOOK_SECRET: "e2e-sandbox-webhook-secret",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: "./storage-e2e",
  EMAIL_PROVIDER: "log",
  CRON_SECRET: "e2e-cron-secret-123456",
  STAFF_MFA_REQUIRED: "false",
  NEXT_TELEMETRY_DISABLED: "1",
};

/** Password for fictional e2e accounts (test database only). */
export const E2E_PASSWORD = "e2e fictional account phrase";
