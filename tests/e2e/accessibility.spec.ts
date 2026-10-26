import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "./support/env";

/** Automated WCAG 2.2 A/AA checks. Automated scans catch only part of WCAG; manual testing is still required. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page, path: string) {
  await page.goto(path);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes, e.g. ${v.nodes[0]?.target.join(" ")})`),
    path,
  ).toEqual([]);
}

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("public pages have no serious accessibility violations", async ({ page }) => {
  const d = JSON.parse(readFileSync("tests/e2e/.data.json", "utf8"));
  for (const path of [
    "/",
    "/cases",
    `/cases/${d.campaignD.publicId}`,
    "/how-it-works",
    "/partners",
    "/register",
    "/login",
    "/complaints/new",
    "/apply/start",
    "/policies/funding",
  ]) {
    await scan(page, path);
  }
});

test("applicant wizard and staff workspace have no serious accessibility violations", async ({ page }) => {
  const d = JSON.parse(readFileSync("tests/e2e/.data.json", "utf8"));
  await login(page, "applicant.g@e2e.test");
  await scan(page, `/apply/${d.appG.reference}`);
  await login(page, "cm1@e2e.test");
  for (const path of [
    "/staff",
    "/staff/applications",
    `/staff/applications/${d.appB.id}`,
    `/staff/campaigns/${d.campaignG.id}`,
  ])
    await scan(page, path);
  await login(page, "finance1@e2e.test");
  await scan(page, "/staff/finance/payments");
});
