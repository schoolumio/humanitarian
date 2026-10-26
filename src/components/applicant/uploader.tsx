"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui";

/** Uploads one file at a time to /api/upload (private storage) and refreshes the page. */
export function Uploader({ purpose, applicationId, label = "Upload a file", onUploaded }: { purpose: string; applicationId?: string; label?: string; onUploaded?: (id: string) => void }) {
  const [status, setStatus] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const id = `file-${purpose}`;

  async function upload() {
    const file = input.current?.files?.[0];
    if (!file) return setStatus({ tone: "error", text: "Choose a file first." });
    if (file.size > 4 * 1024 * 1024) return setStatus({ tone: "error", text: "This file is larger than 4 MB. Please choose a smaller photo or PDF." });
    setBusy(true);
    setStatus(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("purpose", purpose);
    if (applicationId) fd.set("applicationId", applicationId);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed.");
      setStatus({ tone: "ok", text: `Uploaded ${body.file.originalName}.` });
      if (input.current) input.current.value = "";
      onUploaded?.(body.file.id);
      router.refresh();
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof Error ? e.message : "Upload failed. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-semibold">{label}</label>
      <p className="text-sm text-muted">Photos (JPEG, PNG, WebP) or PDF, up to 4 MB each.</p>
      <input id={id} ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,text/plain" className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-teal-50 file:px-4 file:font-semibold file:text-teal" />
      <div>
        <button type="button" onClick={upload} disabled={busy} className={buttonClass("secondary")}>{busy ? "Uploading…" : "Upload"}</button>
      </div>
      <p role="status" aria-live="polite" className={status?.tone === "error" ? "text-sm font-medium text-coral-700" : "text-sm text-teal"}>{status?.text}</p>
    </div>
  );
}
