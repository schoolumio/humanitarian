"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, inputClass } from "@/components/ui";
import type { FormState } from "@/server/action";

const PRESETS = ["2000", "5000", "10000", "25000"];

export function GiveForm({ action, defaultEmail, defaultName, remainingMajor }: { action: (s: FormState, fd: FormData) => Promise<FormState>; defaultEmail?: string; defaultName?: string; remainingMajor: number }) {
  // One idempotency key per form instance: a double submit reuses the same payment.
  const [key] = useState(() => crypto.randomUUID().replace(/-/g, ""));
  const [amount, setAmount] = useState("");
  return (
    <ActionForm action={action}>
      <input type="hidden" name="idempotencyKey" value={key} />
      <fieldset>
        <legend className="mb-2 font-semibold">Choose an amount (₦)</legend>
        <div className="flex flex-wrap gap-2">
          {PRESETS.filter((p) => Number(p) <= remainingMajor).map((p) => (
            <button type="button" key={p} onClick={() => setAmount(p)} aria-pressed={amount === p} className={`min-h-11 rounded-md border px-4 ${amount === p ? "border-teal bg-teal text-white" : "border-line bg-white"}`}>
              ₦{Number(p).toLocaleString("en-NG")}
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Or enter an amount in naira" name="amount" hint={`Up to ₦${remainingMajor.toLocaleString("en-NG")} is still needed.`}>
        <input id="amount" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} required />
      </Field>
      <Field label="Your name (for the receipt)" name="name">
        <input id="name" name="name" defaultValue={defaultName} autoComplete="name" className={inputClass} required />
      </Field>
      <Field label="Email for your receipt" name="email">
        <input id="email" name="email" type="email" defaultValue={defaultEmail} autoComplete="email" className={inputClass} required />
      </Field>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="anonymous" className="mt-1 h-5 w-5" />
        <span>Do not show my name publicly. <span className="text-sm text-muted">(We still keep a private record for receipts, refunds and legal obligations.)</span></span>
      </label>
      <SubmitButton variant="cta" pendingText="Starting secure checkout…">Continue to secure payment</SubmitButton>
    </ActionForm>
  );
}
