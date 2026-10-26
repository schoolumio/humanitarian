import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ENV, E2E_PASSWORD } from "./support/env";

type Data = {
  appB: { id: string; reference: string };
  appC: { id: string; reference: string };
  appUnassigned: { id: string; reference: string };
  campaignD: { id: string; publicId: string };
  campaignG: { id: string; publicId: string };
  appG: { reference: string };
  interventionG: string;
  disbursementG: string;
  storyG: string;
  evidenceFileD: string;
};
const data = (): Data => JSON.parse(readFileSync("tests/e2e/.data.json", "utf8"));

async function login(page: Page, email: string, password = E2E_PASSWORD) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept()); // confirmation prompts for sensitive actions
});

test("Journey A: an applicant registers, submits a request and checks its status", async ({ page }) => {
  await page.goto("/register?role=APPLICANT");
  await page.getByLabel("Your name").fill("Amaka Fictional");
  await page.getByLabel("Email address").fill("amaka.fictional@e2e.test");
  await page.getByLabel("Password", { exact: true }).fill("a fictional long phrase");
  await page.getByLabel("Confirm password").fill("a fictional long phrase");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status").filter({ hasNotText: "Loading" }).first()).toContainText(
    "sent a confirmation link",
  );

  await login(page, "amaka.fictional@e2e.test", "a fictional long phrase");
  await page.goto("/apply/start");
  await page.getByRole("button", { name: "Start or continue my request" }).click();

  await expect(page.getByRole("heading", { name: /Step 1 of 8/ })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("correct the highlighted fields"); // server-side validation
  await page.getByLabel("Full name").fill("Amaka Fictional Person");
  await page.getByLabel("Phone number").fill("0803 222 3333");
  await page.getByLabel("State").selectOption("Oyo");
  await page.getByLabel("Local government area (LGA)").fill("Ibadan North");
  await page.getByLabel("Town or community").fill("Imaginary Quarters");
  await page.getByLabel("How many people live in your household?").fill("5");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: /Step 2 of 8/ })).toBeVisible();
  await page.getByLabel(/Emergency accommodation and housing/).check();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: /Step 3 of 8/ })).toBeVisible();
  await page
    .getByLabel("What happened?")
    .fill("A fictional storm destroyed the roof of the room we rent, and our belongings were damaged.");
  await page
    .getByLabel("What assistance do you need?")
    .fill("Help with rent for a safe room and new mattresses.");
  await page.getByLabel("Why is the assistance needed now?").fill("The rainy season has started.");
  await page.getByLabel("What would successful support achieve?").fill("A safe, dry place for my children.");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: /Step 4 of 8/ })).toBeVisible();
  await page.locator('input[name="items.0.description"]').fill("Rent for six months");
  await page.locator('input[name="items.0.unitCost"]').fill("180000");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: /Step 5 of 8/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click(); // evidence is optional

  await expect(page.getByRole("heading", { name: /Step 6 of 8/ })).toBeVisible();
  await page.getByLabel("Phone call").check();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: /Step 7 of 8/ })).toBeVisible();
  await page.locator('input[name="ASSESSMENT_DATA_PROCESSING"]').check();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: /Step 8 of 8/ })).toBeVisible();
  await expect(page.getByText("₦180,000").first()).toBeVisible();
  await page.getByRole("button", { name: "Submit my request" }).click();
  await expect(page.getByText("Your request has been submitted")).toBeVisible();
  const reference = (await page.getByRole("heading", { level: 1 }).textContent())!
    .replace("Request ", "")
    .trim();

  await page.goto("/apply");
  await expect(page.getByRole("link", { name: reference })).toBeVisible();
  await expect(page.locator("span.inline-block", { hasText: "Submitted" })).toBeVisible();
});

test("Journey B: an investigator reviews an assigned case and records findings", async ({ page }) => {
  const d = data();
  await login(page, "investigator@e2e.test");
  await page.goto("/staff/investigations");
  await expect(page.getByRole("link", { name: d.appB.reference })).toBeVisible();
  await expect(page.getByText("Conflict declaration needed")).toBeVisible();
  await page.getByRole("link", { name: d.appB.reference }).click();

  await page.getByRole("button", { name: "Submit declaration" }).click();
  await expect(page.getByText("You can now work on this case.")).toBeVisible();

  await page.locator("summary", { hasText: "Update" }).first().click();
  await page.getByLabel("Check status").first().selectOption("DONE");
  await page.getByLabel("Outcome note").first().fill("Applicant confirmed details by phone.");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Check updated.")).toBeVisible();

  await page.getByLabel("Add a note").fill("Landlord confirmed the rent amount by phone.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Landlord confirmed the rent amount by phone.")).toBeVisible();

  await page.locator("summary", { hasText: "Submit investigation report" }).click();
  await page.getByLabel("Summary").fill("Remote verification complete.");
  await page.getByLabel("Findings").fill("Need confirmed with landlord; costs match local prices.");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText("Investigation report submitted.")).toBeVisible();
  await expect(page.getByText("Recommendation:").first()).toBeVisible();

  // The investigator cannot open a case that is not assigned to them.
  // (Streaming responses commit a 200 status before rendering, so assert on content.)
  await page.goto(`/staff/applications/${d.appUnassigned.id}`);
  await expect(page.getByText("Page not found")).toBeVisible();
  await expect(page.getByText(d.appUnassigned.reference)).toHaveCount(0);
});

test("Journey C: an authorised reviewer approves a case and a case manager prepares it for publication", async ({
  page,
}) => {
  const d = data();
  await login(page, "cm2@e2e.test");
  await page.goto(`/staff/applications/${d.appC.id}`);
  await page.locator("summary", { hasText: "Record final decision" }).click();
  await page.getByLabel("Decision", { exact: true }).selectOption("APPROVED");
  await page.getByLabel("Approved amount (₦, if approving)").fill("250000");
  await page
    .getByLabel("Reasons (internal record)")
    .fill("Verified need within policy; independent review recommends approval.");
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText("Decision recorded and the applicant notified.")).toBeVisible();

  await login(page, "cm1@e2e.test");
  await page.goto(`/staff/campaigns/new?application=${d.appC.id}`);
  await page.getByLabel("Public title").fill("Safe accommodation for a family of three");
  await page
    .getByLabel("Approved summary")
    .fill(
      "A family in Lagos State lost their rented room to flooding. Support will cover rent and bedding so they can stay together safely.",
    );
  await page.getByLabel("General location").fill("Ikorodu, Lagos State");
  await page.getByLabel("Requested intervention").fill("Rent paid to the landlord and replacement bedding.");
  await page
    .getByLabel("Public verification explanation")
    .fill("Verified by phone, landlord confirmation and an independently reviewed investigation.");
  await page.getByRole("button", { name: "Create draft campaign" }).click();
  await page.waitForURL(/\/staff\/campaigns\/(?!new)/);
  await page.getByRole("button", { name: "Mark ready for publication" }).click();
  await expect(page.getByText("A different staff member must publish it.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("different staff member must publish");
  const campaignUrl = page.url();

  await login(page, "cm2@e2e.test");
  await page.goto(campaignUrl);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published.")).toBeVisible();
  await page.getByRole("link", { name: "public page" }).click();
  await expect(page.getByRole("heading", { name: "Safe accommodation for a family of three" })).toBeVisible();
  await expect(page.getByText("Example Close")).toHaveCount(0); // exact community never published
});

test("Journey D & E: a visitor makes a test-mode contribution confirmed exactly once by webhook", async ({
  page,
  request,
}) => {
  const d = data();
  await page.context().clearCookies();
  await page.goto("/cases");
  await page.getByRole("link", { name: "Safe housing for a family in Ikorodu" }).click();
  await expect(page.getByText("Mode: Sandbox (no real money)")).toBeVisible();
  await page.getByLabel("Or enter an amount in naira").fill("10000");
  await page.getByLabel("Your name (for the receipt)").fill("Visitor Fictional");
  await page.getByLabel("Email for your receipt").fill("visitor@e2e.test");
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await page.waitForURL(/\/sandbox\/checkout\//);
  const reference = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByText("Thank you – your contribution is confirmed")).toBeVisible();

  await page.goto(`/cases/${d.campaignD.publicId}`);
  await expect(page.getByText("₦10,000").first()).toBeVisible();
  await expect(page.getByText("1 confirmed contribution.")).toBeVisible();

  // Journey E: a forged webhook is rejected; a genuine duplicate is accepted but changes nothing.
  const raw = JSON.stringify({ event: "charge.success", id: "evt_e2e_replay", data: { reference } });
  const forged = await request.post("/api/webhooks/sandbox", {
    data: raw,
    headers: { "content-type": "application/json", "x-sandbox-signature": "f".repeat(128) },
  });
  expect(forged.status()).toBe(401);
  const sig = createHmac("sha512", E2E_ENV.SANDBOX_WEBHOOK_SECRET!).update(raw).digest("hex");
  for (let i = 0; i < 2; i++) {
    const ok = await request.post("/api/webhooks/sandbox", {
      data: raw,
      headers: { "content-type": "application/json", "x-sandbox-signature": sig },
    });
    expect(ok.status()).toBe(200);
  }
  await page.reload();
  await expect(page.getByText("1 confirmed contribution.")).toBeVisible();
  await expect(page.getByText(/₦10,000\s*confirmed/)).toBeVisible();
});

test("Journey F: a sponsor submits an enquiry and gains access to the sponsorship workflow after review", async ({
  page,
}) => {
  await login(page, "sponsor@e2e.test");
  await page.goto("/sponsor");
  await page.getByLabel("Organisation name").fill("Fictional Foods Ltd");
  await page.getByLabel("Contact email").fill("csr@fictionalfoods.test");
  await page.getByLabel(/I am authorised to sign/).check();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Your organisation is awaiting review")).toBeVisible();
  await page
    .getByLabel("Send a general enquiry")
    .fill("We would like to sponsor housing cases in Lagos State.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("our partnerships team will reply")).toBeVisible();
  await page.goto("/sponsor/cases");
  await expect(page).toHaveURL(/\/sponsor$/); // no case access before approval

  await login(page, "cm1@e2e.test");
  await page.goto("/staff/sponsors");
  await page.locator("summary", { hasText: "Review" }).first().click();
  await page.getByLabel("Outcome").selectOption("APPROVED");
  await page.getByLabel("Notes").fill("CAC registration and representative identity checked.");
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByText("Organisation updated.")).toBeVisible();

  await login(page, "sponsor@e2e.test");
  await page.goto("/sponsor/cases");
  await page.getByRole("link", { name: "Safe housing for a family in Ikorodu" }).click();
  await page.getByLabel("Proposal type").selectOption("PARTIAL_CASH_SPONSORSHIP");
  await page.getByLabel("Proposed amount (₦, optional)").fill("100000");
  await page.getByLabel("Message").fill("We would like to fund the bedding and part of the rent.");
  await page.getByRole("button", { name: "Submit proposal" }).click();
  await expect(page.getByText("Proposal submitted.")).toBeVisible();
  await expect(page.getByText("Fictional")).toHaveCount(0); // no applicant personal data on sponsor view
});

test("Journey I: a finance officer cannot approve their own disbursement; a second officer approves it", async ({
  page,
}) => {
  await login(page, "finance1@e2e.test");
  await page.goto("/staff/finance/disbursements");
  await expect(page.getByText("Awaiting another officer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

  await login(page, "finance2@e2e.test");
  await page.goto("/staff/finance/disbursements");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved and posted to the ledger.")).toBeVisible();
  await page.getByLabel("Payment reference").fill("BANK-E2E-0001");
  await page.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByText("Marked as paid.")).toBeVisible();
  await page.goto("/staff/finance/ledger");
  await expect(page.getByText("✓ balanced")).toBeVisible();
});

test("Journey G: delivery is evidenced, the outcome independently reviewed, and an editor publishes the report", async ({
  page,
}) => {
  const d = data();
  await login(page, "cm1@e2e.test");
  await page.goto(`/staff/interventions/${d.interventionG}`);
  await page
    .getByLabel("What was delivered, to whom, and in what condition?")
    .fill("Rent paid to the landlord and bedding delivered; the beneficiary confirmed receipt.");
  await page.getByLabel("Delivery date").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Record delivery" }).click();
  await expect(page.getByText("Delivery recorded; supporters notified.")).toBeVisible();
  await page.getByLabel("Next status").selectOption("DELIVERED");
  await page.getByLabel("Reason").first().fill("All items delivered");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Updated.")).toBeVisible();
  await page.getByLabel("Next status").selectOption("OUTCOME_REVIEW");
  await page.getByLabel("Reason").first().fill("Ready for review");
  await page.getByRole("button", { name: "Update" }).click();
  for (const box of await page.locator('input[name="done"]').all()) await box.check();
  await page.getByRole("button", { name: "Save checklist" }).click();
  await expect(page.getByText("Checklist saved.")).toBeVisible();

  await login(page, "cm2@e2e.test");
  await page.goto(`/staff/interventions/${d.interventionG}`);
  await page
    .getByLabel("Verified outcome summary")
    .fill("The family moved into a safe, dry room and confirmed they received the bedding.");
  await page.getByRole("button", { name: "Record outcome review" }).click();
  await expect(page.getByText("Outcome review recorded.")).toBeVisible();

  await login(page, "editor1@e2e.test");
  await page.goto("/staff/media");
  await page.locator("summary", { hasText: "Draft a new story or update" }).click();
  await page.locator("#campaignId").selectOption({ label: "Rebuilding after a flood in Ikorodu" });
  await page.getByLabel("Type").selectOption("COMPLETION_REPORT");
  await page.getByLabel("Channel").selectOption("CAMPAIGN_PAGE");
  await page.getByLabel("Title", { exact: true }).fill("Support delivered");
  await page
    .getByLabel("Text", { exact: true })
    .fill("Rent was paid directly to the landlord and new bedding was delivered.");
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.waitForURL(/\/staff\/media\/stories\//);
  const storyUrl = page.url();
  await page.getByRole("button", { name: "Submit for editorial review" }).click();
  await expect(page.getByText("Submitted for review.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0); // authors cannot approve

  await login(page, "editor2@e2e.test");
  await page.goto(storyUrl);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published.")).toBeVisible();

  await page.context().clearCookies();
  await page.goto(`/cases/${d.campaignG.publicId}`);
  await expect(page.getByRole("heading", { name: "Support delivered" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outcome report" })).toBeVisible();
});

test("Journey H: unauthorised users are denied private applicant documents", async ({ page, request }) => {
  const d = data();
  const anon = await request.get(`/api/files/${d.evidenceFileD}`, { maxRedirects: 0 });
  expect(anon.status()).toBe(401);

  await login(page, "outsider@e2e.test");
  const denied = await page.request.get(`/api/files/${d.evidenceFileD}`, { maxRedirects: 0 });
  expect(denied.status()).toBe(404);
  await login(page, "sponsor@e2e.test");
  expect((await page.request.get(`/api/files/${d.evidenceFileD}`, { maxRedirects: 0 })).status()).toBe(404);
  await login(page, "editor1@e2e.test");
  expect((await page.request.get(`/api/files/${d.evidenceFileD}`, { maxRedirects: 0 })).status()).toBe(404);

  await login(page, "cm1@e2e.test");
  const allowed = await page.request.get(`/api/files/${d.evidenceFileD}`, { maxRedirects: 0 });
  expect(allowed.status()).toBe(302);
  const signed = allowed.headers()["location"]!;
  const tampered = signed.replace(/sig=[a-f0-9]+/, `sig=${"0".repeat(64)}`);
  expect((await page.request.get(tampered)).status()).toBe(403);

  // Staff pages are not reachable by applicants.
  await login(page, "outsider@e2e.test");
  await page.goto("/staff/finance");
  await expect(page).toHaveURL(/\/forbidden/);
});

test("Journey J: a beneficiary withdraws media consent and the publication review workflow is triggered", async ({
  page,
}) => {
  const d = data();
  await login(page, "applicant.g@e2e.test");
  await page.goto(`/apply/${d.appG.reference}`);
  await page.getByLabel("Share my story on KindSpring social media").uncheck();
  await page.getByRole("button", { name: "Save my choices" }).click();
  await expect(page.getByText("we have stopped using material that depends on it")).toBeVisible();

  await login(page, "editor1@e2e.test");
  await page.goto(`/staff/media/stories/${d.storyG}`);
  await expect(page.getByText("Consent review required")).toBeVisible();
  await expect(page.getByText(/not consented to: Share my story on KindSpring social media/)).toBeVisible();
});
