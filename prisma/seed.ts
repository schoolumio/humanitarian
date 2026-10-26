/**
 * Development seed. Creates reference data (support categories) and, when
 * SEED_DEMO_PASSWORD is set, clearly fictional demo accounts and one demo case.
 *
 * - Refuses to run when NODE_ENV=production.
 * - Never contains a hard-coded password: demo accounts use SEED_DEMO_PASSWORD.
 * - All people, places and stories are fictional.
 */
import { PrismaClient, type Role } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const db = new PrismaClient();

const CATEGORIES = [
  { slug: "emergency-accommodation", name: "Emergency accommodation and housing", description: "Short-term rent, safe accommodation and essential repairs for people who have lost their home or face imminent loss of it.", checklist: [{ key: "cat_landlord", label: "Confirm rent amount and tenancy with the landlord or agent", stage: "REMOTE" }, { key: "cat_property", label: "Confirm the property is safe and suitable", stage: "FIELD" }] },
  { slug: "food-and-essentials", name: "Food and essential household items", description: "Food, bedding, cooking items and other essentials for households in acute need.", checklist: [{ key: "cat_household", label: "Confirm household size and immediate needs", stage: "REMOTE" }] },
  { slug: "livelihood-recovery", name: "Small-business recovery and livelihoods", description: "Restocking, repairs and tools to restart a small business or income source.", checklist: [{ key: "cat_business", label: "Confirm the business existed and what was lost", stage: "REMOTE" }, { key: "cat_supplier_quotes", label: "Obtain supplier quotes for equipment or stock", stage: "REMOTE" }] },
  { slug: "education-and-training", name: "Education and vocational training", description: "School fees, materials, and vocational or skills training with a recognised provider.", checklist: [{ key: "cat_institution", label: "Confirm enrolment and fees directly with the institution", stage: "REMOTE" }] },
  { slug: "work-equipment", name: "Work equipment and tools", description: "Equipment and tools that enable someone to earn a living.", checklist: [{ key: "cat_equipment_quote", label: "Obtain a quote from a verified supplier", stage: "REMOTE" }] },
  { slug: "community-projects", name: "Community improvement projects", description: "Projects that benefit a community, such as water points or repairs to shared facilities.", checklist: [{ key: "cat_community_leaders", label: "Confirm support from community leadership", stage: "REMOTE" }, { key: "cat_site_visit", label: "Site visit to confirm need and feasibility", stage: "FIELD" }] },
  { slug: "other-needs", name: "Other humanitarian needs", description: "Other genuine needs assessed case by case.", checklist: [] },
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  for (const [i, c] of CATEGORIES.entries()) {
    await db.caseCategory.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, name: c.name, description: c.description, verificationChecklist: c.checklist, sortOrder: i },
      update: { name: c.name, description: c.description, verificationChecklist: c.checklist, sortOrder: i },
    });
  }
  console.log(`Seeded ${CATEGORIES.length} support categories.`);

  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) {
    console.log("SEED_DEMO_PASSWORD not set: skipping demo accounts. Create your first administrator with `npm run admin:create`.");
    return;
  }
  if (password.length < 12) throw new Error("SEED_DEMO_PASSWORD must be at least 12 characters.");
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const people: [string, string, Role[]][] = [
    ["superadmin@demo.kindspring.test", "Demo Super Admin", ["SUPER_ADMIN"]],
    ["admin@demo.kindspring.test", "Demo Administrator", ["ADMIN"]],
    ["casemanager1@demo.kindspring.test", "Demo Case Manager One", ["CASE_MANAGER"]],
    ["casemanager2@demo.kindspring.test", "Demo Case Manager Two", ["CASE_MANAGER"]],
    ["investigator@demo.kindspring.test", "Demo Investigator", ["INVESTIGATOR"]],
    ["finance1@demo.kindspring.test", "Demo Finance Officer One", ["FINANCE_OFFICER"]],
    ["finance2@demo.kindspring.test", "Demo Finance Officer Two", ["FINANCE_OFFICER"]],
    ["editor1@demo.kindspring.test", "Demo Media Editor One", ["MEDIA_EDITOR"]],
    ["editor2@demo.kindspring.test", "Demo Media Editor Two", ["MEDIA_EDITOR"]],
    ["safeguarding@demo.kindspring.test", "Demo Safeguarding Officer", ["SAFEGUARDING_OFFICER"]],
    ["applicant@demo.kindspring.test", "Demo Applicant", ["APPLICANT"]],
    ["donor@demo.kindspring.test", "Demo Donor", ["DONOR"]],
    ["sponsor@demo.kindspring.test", "Demo Sponsor Representative", ["SPONSOR"]],
  ];
  for (const [email, name, roles] of people) {
    const u = await db.user.upsert({ where: { email }, create: { email, name, passwordHash, emailVerifiedAt: new Date() }, update: { passwordHash } });
    for (const role of roles) await db.userRole.upsert({ where: { userId_role: { userId: u.id, role } }, create: { userId: u.id, role }, update: {} });
  }
  console.log(`Seeded ${people.length} demo accounts (@demo.kindspring.test) using SEED_DEMO_PASSWORD.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
