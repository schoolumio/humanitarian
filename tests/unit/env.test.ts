import { afterEach, describe, expect, it } from "vitest";
import { env, resetEnvCache } from "@/lib/env";

describe("server configuration", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
  });

  it("treats empty optional values as unset", () => {
    process.env.CRON_SECRET = "";
    process.env.PAYSTACK_SECRET_KEY = "";
    resetEnvCache();
    expect(env().CRON_SECRET).toBeUndefined();
  });

  it("names the missing required settings", () => {
    process.env.AUTH_SECRET = "";
    process.env.DATA_ENCRYPTION_KEY = "";
    resetEnvCache();
    expect(() => env()).toThrow(/AUTH_SECRET[\s\S]*DATA_ENCRYPTION_KEY/);
  });
});
