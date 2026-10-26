/**
 * Transactional email templates. Emails never contain confidential application
 * details – they tell the recipient something changed and link back to the signed-in
 * portal. Params must be non-confidential (references, first names, public titles, amounts
 * the recipient themself paid).
 */
export type TemplateName =
  | "verify_email"
  | "password_reset"
  | "application_submitted"
  | "information_requested"
  | "application_status_changed"
  | "application_decided"
  | "campaign_published"
  | "contribution_received"
  | "payment_failed"
  | "refund_update"
  | "sponsor_enquiry_received"
  | "sponsor_status_changed"
  | "intervention_milestone"
  | "complaint_received"
  | "consent_withdrawn_review"
  | "staff_alert";

type Params = Record<string, string>;
type Rendered = { subject: string; text: string };

const footer = (base: string) =>
  `\n\n— KindSpring\nReal People. Verified Needs. Lasting Change.\n${base}\n\nIf you did not expect this email, you can ignore it or contact us at ${base}/contact.`;

export function renderTemplate(name: TemplateName, p: Params, baseUrl: string): Rendered & { html: string } {
  const r = render(name, p, baseUrl);
  const text = r.text + footer(baseUrl);
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#252B2A;background:#F7F5EF;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;padding:24px;border-radius:8px"><h1 style="color:#123C3A;font-size:20px">KindSpring</h1>${text
    .split("\n")
    .map((l) => (l ? `<p>${escapeHtml(l).replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>` : ""))
    .join("")}</div></body></html>`;
  return { subject: r.subject, text, html };
}

function render(name: TemplateName, p: Params, base: string): Rendered {
  switch (name) {
    case "verify_email":
      return {
        subject: "Confirm your email address",
        text: `Hello ${p.name},\n\nPlease confirm your email address by opening this link (valid for 24 hours):\n${p.url}`,
      };
    case "password_reset":
      return {
        subject: "Reset your KindSpring password",
        text: `Hello ${p.name},\n\nUse this link to choose a new password. It expires in 1 hour and can be used once:\n${p.url}\n\nIf you did not ask for this, no action is needed.`,
      };
    case "application_submitted":
      return {
        subject: `Request received – ${p.reference}`,
        text: `Hello ${p.name},\n\nWe have received your request for assistance. Your reference is ${p.reference}.\n\nWhat happens next: a member of our team will review it. We may contact you using the methods you chose. Submitting a request does not guarantee approval.\n\nYou can check its status at any time: ${base}/apply`,
      };
    case "information_requested":
      return {
        subject: `More information needed – ${p.reference}`,
        text: `Hello ${p.name},\n\nWe need a little more information about your request ${p.reference}. Please sign in to read our message and reply:\n${base}/apply/${p.reference}`,
      };
    case "application_status_changed":
      return {
        subject: `Update on your request ${p.reference}`,
        text: `Hello ${p.name},\n\nThere is an update on your request ${p.reference}. Please sign in to see the details:\n${base}/apply/${p.reference}`,
      };
    case "application_decided":
      return {
        subject: `Decision on your request ${p.reference}`,
        text: `Hello ${p.name},\n\nA decision has been recorded on your request ${p.reference}. Please sign in to read it:\n${base}/apply/${p.reference}`,
      };
    case "campaign_published":
      return {
        subject: "Your support campaign is now live",
        text: `Hello ${p.name},\n\nThe anonymised campaign for your request ${p.reference} is now published. Sign in to see it:\n${base}/apply/${p.reference}`,
      };
    case "contribution_received":
      return {
        subject: `Thank you – contribution ${p.reference} confirmed`,
        text: `Hello ${p.name},\n\nYour contribution of ${p.amount} to "${p.campaignTitle}" has been confirmed by our payment provider.\nReference: ${p.reference}\n\nView your receipt: ${base}/donor/receipts/${p.reference}`,
      };
    case "payment_failed":
      return {
        subject: "Your contribution was not completed",
        text: `Hello ${p.name},\n\nYour contribution (reference ${p.reference}) was not completed and you have not been charged by KindSpring. You can try again from the campaign page.`,
      };
    case "refund_update":
      return {
        subject: `Refund update – ${p.reference}`,
        text: `Hello ${p.name},\n\nYour refund of ${p.amount} for contribution ${p.reference} is now: ${p.status}.\nBanks can take several working days to show refunds.`,
      };
    case "sponsor_enquiry_received":
      return {
        subject: "We received your sponsorship enquiry",
        text: `Hello ${p.name},\n\nThank you for your interest in sponsoring with KindSpring. Our partnerships team will respond. Track it here: ${base}/sponsor`,
      };
    case "sponsor_status_changed":
      return {
        subject: "Update on your KindSpring partnership",
        text: `Hello ${p.name},\n\nThere is an update on your organisation's partnership with KindSpring. Sign in to view it: ${base}/sponsor`,
      };
    case "intervention_milestone":
      return {
        subject: "Progress update on a case you support",
        text: `Hello ${p.name},\n\nThere is a new verified update on "${p.campaignTitle}". View it: ${base}/cases/${p.publicId}`,
      };
    case "complaint_received":
      return {
        subject: `We received your complaint – ${p.reference}`,
        text: `Hello ${p.name},\n\nThank you for contacting us. Your complaint reference is ${p.reference}. It will be reviewed by an appropriate member of staff. If someone is in immediate danger, contact the emergency services (112 in Nigeria).`,
      };
    case "consent_withdrawn_review":
      return {
        subject: "Consent withdrawn – publication review required",
        text: `A beneficiary has withdrawn a media consent for case ${p.reference}. Affected publications have been moved to review. Open the media workspace: ${base}/staff/media`,
      };
    case "staff_alert":
      return {
        subject: `KindSpring alert: ${p.title}`,
        text: `${p.title}\n\n${p.body}\n\n${base}${p.path ?? "/staff"}`,
      };
  }
}

export function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
