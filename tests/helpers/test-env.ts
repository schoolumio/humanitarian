/** Fictional, test-only configuration. No real credentials. */
export const TEST_ENV = {
  NODE_ENV: "test",
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/kindspring_test",
  APP_BASE_URL: "http://localhost:3100",
  AUTH_SECRET: "test-auth-secret-0123456789abcdef0123456789",
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  PAYMENT_PROVIDER: "sandbox",
  SANDBOX_WEBHOOK_SECRET: "test-sandbox-webhook-secret",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: "./storage-test",
  EMAIL_PROVIDER: "log",
  CRON_SECRET: "test-cron-secret-123456",
  STAFF_MFA_REQUIRED: "false",
};
export function applyTestEnv() {
  Object.assign(process.env, TEST_ENV);
}
