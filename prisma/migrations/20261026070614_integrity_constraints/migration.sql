-- Database-level integrity controls that complement application checks.
-- These protect financial and audit records even from buggy code or ad-hoc SQL.

-- 1. Append-only tables: journal entries, journal lines and audit logs can never be
--    updated or deleted. Corrections are made with reversing/adjusting entries.
CREATE OR REPLACE FUNCTION ks_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_append_only BEFORE UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION ks_reject_mutation();
CREATE TRIGGER journal_lines_append_only BEFORE UPDATE OR DELETE ON "journal_lines"
  FOR EACH ROW EXECUTE FUNCTION ks_reject_mutation();
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION ks_reject_mutation();
CREATE TRIGGER status_history_append_only BEFORE UPDATE OR DELETE ON "status_history"
  FOR EACH ROW EXECUTE FUNCTION ks_reject_mutation();
CREATE TRIGGER applicant_consents_append_only BEFORE UPDATE OR DELETE ON "applicant_consents"
  FOR EACH ROW EXECUTE FUNCTION ks_reject_mutation();

-- 2. Every journal line is either a debit or a credit, never negative, never both.
ALTER TABLE "journal_lines" ADD CONSTRAINT journal_lines_one_sided CHECK (
  "debitMinor" >= 0 AND "creditMinor" >= 0 AND (("debitMinor" > 0) <> ("creditMinor" > 0))
);

-- 3. Every journal entry must balance (per currency) by the time its transaction commits.
CREATE OR REPLACE FUNCTION ks_check_journal_balanced() RETURNS trigger AS $$
DECLARE
  unbalanced RECORD;
  line_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO line_count FROM "journal_lines" WHERE "entryId" = NEW."entryId";
  IF line_count < 2 THEN
    RAISE EXCEPTION 'Journal entry % must have at least two lines', NEW."entryId" USING ERRCODE = 'check_violation';
  END IF;
  SELECT "currency", SUM("debitMinor") AS d, SUM("creditMinor") AS c INTO unbalanced
    FROM "journal_lines" WHERE "entryId" = NEW."entryId"
    GROUP BY "currency" HAVING SUM("debitMinor") <> SUM("creditMinor") LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Journal entry % does not balance in % (debits %, credits %)',
      NEW."entryId", unbalanced."currency", unbalanced.d, unbalanced.c USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT ON "journal_lines"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ks_check_journal_balanced();

-- 4. Money columns are never negative and refunds can never exceed the payment.
ALTER TABLE "payments" ADD CONSTRAINT payments_amount_positive CHECK ("amountMinor" > 0);
ALTER TABLE "payments" ADD CONSTRAINT payments_fee_nonnegative CHECK ("feeMinor" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT payments_refund_bounds CHECK ("refundedMinor" >= 0 AND "refundedMinor" <= "amountMinor");
ALTER TABLE "refunds" ADD CONSTRAINT refunds_amount_positive CHECK ("amountMinor" > 0);
ALTER TABLE "campaigns" ADD CONSTRAINT campaigns_target_positive CHECK ("targetAmountMinor" > 0);
ALTER TABLE "campaigns" ADD CONSTRAINT campaigns_totals_nonnegative CHECK ("confirmedAmountMinor" >= 0 AND "refundedAmountMinor" >= 0 AND "refundedAmountMinor" <= "confirmedAmountMinor");
ALTER TABLE "campaign_budget_lines" ADD CONSTRAINT budget_lines_amount_positive CHECK ("amountMinor" > 0);
ALTER TABLE "disbursements" ADD CONSTRAINT disbursements_amount_positive CHECK ("amountMinor" > 0);
ALTER TABLE "purchase_requests" ADD CONSTRAINT purchase_requests_amount_positive CHECK ("amountMinor" > 0);
ALTER TABLE "sponsorship_agreements" ADD CONSTRAINT agreements_pledge_nonnegative CHECK ("pledgedAmountMinor" >= 0);

-- 5. Separation of duties at the database level.
ALTER TABLE "disbursements" ADD CONSTRAINT disbursements_independent_approval
  CHECK ("approvedById" IS NULL OR "approvedById" <> "requestedById");
ALTER TABLE "refunds" ADD CONSTRAINT refunds_independent_approval
  CHECK ("approvedById" IS NULL OR "approvedById" <> "requestedById");
ALTER TABLE "budget_change_requests" ADD CONSTRAINT budget_changes_independent_approval
  CHECK ("decidedById" IS NULL OR "decidedById" <> "requestedById");
ALTER TABLE "purchase_requests" ADD CONSTRAINT purchase_requests_independent_approval
  CHECK ("decidedById" IS NULL OR "decidedById" <> "requestedById");
ALTER TABLE "sponsorship_agreements" ADD CONSTRAINT agreements_independent_approval
  CHECK ("approvedById" IS NULL OR "approvedById" <> "preparedById");
ALTER TABLE "payments" ADD CONSTRAINT offline_receipts_independent_confirmation
  CHECK ("confirmedById" IS NULL OR "recordedById" IS NULL OR "confirmedById" <> "recordedById");

-- 6. At most one active investigator assignment per (application, investigator).
CREATE UNIQUE INDEX investigator_assignments_one_active
  ON "investigator_assignments" ("applicationId", "investigatorId") WHERE "active";

-- 7. Chart of accounts (see src/lib/ledger/accounts.ts). Accounts are reference data.
INSERT INTO "ledger_accounts" ("code", "name", "type", "restricted", "description") VALUES
  ('1000', 'Cash held with payment provider and bank', 'ASSET', false, 'Confirmed cash, whether at the payment provider awaiting settlement or in the bank.'),
  ('2000', 'Refunds payable to contributors', 'LIABILITY', false, 'Approved refunds not yet settled by the provider.'),
  ('2100', 'Amounts payable to suppliers', 'LIABILITY', false, 'Approved disbursements not yet paid.'),
  ('4000', 'Restricted donations', 'REVENUE', true, 'Donations restricted to a specific campaign.'),
  ('4010', 'Restricted sponsor funding', 'REVENUE', true, 'Sponsor cash restricted to a specific campaign.'),
  ('4100', 'Platform fee revenue (unrestricted)', 'REVENUE', false, 'Only disclosed platform fees under an approved accounting policy.'),
  ('4900', 'Refunds and chargebacks (contra revenue)', 'EXPENSE', true, 'Reduces a campaign fund when contributions are refunded or charged back.'),
  ('5000', 'Payment processing fees charged to fund', 'EXPENSE', true, 'Provider fees deducted from the campaign fund (disclosed policy).'),
  ('5010', 'Payment processing fees absorbed by platform', 'EXPENSE', false, 'Provider fees paid from unrestricted funds.'),
  ('5100', 'Intervention expenditure', 'EXPENSE', true, 'Approved spending on a campaign intervention.'),
  ('5300', 'Disclosed platform fee charged to fund', 'EXPENSE', true, 'Transfer of a disclosed platform fee from a fund to unrestricted revenue.');
