import { z } from "zod";

/**
 * Server-side configuration. Parsed lazily so that `next build` does not require
 * runtime secrets, and validated on first use so misconfiguration fails loudly.
 * Nothing in here may be exposed to the browser (no NEXT_PUBLIC_ prefix).
 */
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    APP_BASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    DATA_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "DATA_ENCRYPTION_KEY must be 32 bytes, base64"),

    PAYMENT_PROVIDER: z.enum(["sandbox", "paystack"]).default("sandbox"),
    PAYSTACK_SECRET_KEY: z.string().optional(),
    PAYSTACK_PUBLIC_KEY: z.string().optional(),
    PAYMENTS_LIVE_MODE_APPROVED: z.enum(["true", "false"]).default("false"),
    SANDBOX_WEBHOOK_SECRET: z.string().optional(),
    // Fee policy – see docs/payments.md. PLATFORM_FEE_BPS defaults to 0 (no platform fee).
    PROCESSING_FEE_POLICY: z.enum(["CHARGED_TO_FUND", "ABSORBED_BY_PLATFORM"]).default("CHARGED_TO_FUND"),
    PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(2000).default(0),

    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    LOCAL_STORAGE_DIR: z.string().default("./storage"),
    OBJECT_STORAGE_ENDPOINT: z.string().optional(),
    OBJECT_STORAGE_REGION: z.string().default("auto"),
    OBJECT_STORAGE_PRIVATE_BUCKET: z.string().optional(),
    OBJECT_STORAGE_PUBLIC_BUCKET: z.string().optional(),
    OBJECT_STORAGE_PUBLIC_BASE_URL: z.string().optional(),
    OBJECT_STORAGE_ACCESS_KEY_ID: z.string().optional(),
    OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
    MALWARE_SCAN_MODE: z.enum(["none-dev", "external"]).default("none-dev"),

    EMAIL_PROVIDER: z.enum(["log", "resend"]).default("log"),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM_ADDRESS: z.string().default("KindSpring <no-reply@example.org>"),

    CRON_SECRET: z.string().min(16).optional(),
    ERROR_MONITORING_DSN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.PAYMENT_PROVIDER === "paystack" && !env.PAYSTACK_SECRET_KEY) {
      ctx.addIssue({ code: "custom", path: ["PAYSTACK_SECRET_KEY"], message: "required when PAYMENT_PROVIDER=paystack" });
    }
    if (
      env.PAYMENT_PROVIDER === "paystack" &&
      env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") &&
      env.PAYMENTS_LIVE_MODE_APPROVED !== "true"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYSTACK_SECRET_KEY"],
        message: "live Paystack key supplied but PAYMENTS_LIVE_MODE_APPROVED is not 'true' (see docs/launch-checklist.md)",
      });
    }
    if (env.PAYMENT_PROVIDER === "sandbox" && env.NODE_ENV === "production" && env.PAYMENTS_LIVE_MODE_APPROVED === "true") {
      ctx.addIssue({ code: "custom", path: ["PAYMENT_PROVIDER"], message: "sandbox provider cannot be used in live mode" });
    }
    if (env.STORAGE_DRIVER === "s3") {
      for (const k of [
        "OBJECT_STORAGE_PRIVATE_BUCKET",
        "OBJECT_STORAGE_PUBLIC_BUCKET",
        "OBJECT_STORAGE_ACCESS_KEY_ID",
        "OBJECT_STORAGE_SECRET_ACCESS_KEY",
      ] as const) {
        if (!env[k]) ctx.addIssue({ code: "custom", path: [k], message: "required when STORAGE_DRIVER=s3" });
      }
    }
    // Real deployments (served over HTTPS in production) must not use development-only drivers.
    const realDeployment = env.NODE_ENV === "production" && env.APP_BASE_URL.startsWith("https://");
    if (realDeployment && env.STORAGE_DRIVER === "local") {
      ctx.addIssue({ code: "custom", path: ["STORAGE_DRIVER"], message: "local storage is for development only; use s3 in deployed environments" });
    }
    if (realDeployment && env.MALWARE_SCAN_MODE !== "external") {
      ctx.addIssue({ code: "custom", path: ["MALWARE_SCAN_MODE"], message: "deployed environments must use an external malware scanner (see docs/security.md)" });
    }
    if (env.MALWARE_SCAN_MODE === "external" && !process.env.SCAN_WEBHOOK_SECRET) {
      ctx.addIssue({ code: "custom", path: ["SCAN_WEBHOOK_SECRET"], message: "required when MALWARE_SCAN_MODE=external" });
    }
    if (realDeployment && !env.CRON_SECRET) {
      ctx.addIssue({ code: "custom", path: ["CRON_SECRET"], message: "required in deployed environments" });
    }
    if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "required when EMAIL_PROVIDER=resend" });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid server configuration: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = undefined;
}

export const isProduction = () => env().NODE_ENV === "production";
