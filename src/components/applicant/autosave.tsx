"use client";

import { useEffect } from "react";

/**
 * Keeps an unsent copy of text fields in this browser (sessionStorage) so a dropped
 * connection or accidental reload does not lose typing. The server remains the source of
 * truth: values are only restored into empty fields and are cleared on successful save.
 */
export function Autosave({ formId, storageKey }: { formId: string; storageKey: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    let saved: Record<string, string> = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
    } catch {
      saved = {};
    }
    for (const [name, value] of Object.entries(saved)) {
      const el = form.elements.namedItem(name);
      if ((el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) && el.type !== "checkbox" && !el.value) el.value = value;
    }
    const onInput = () => {
      const data: Record<string, string> = {};
      for (const el of Array.from(form.elements)) {
        if ((el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && ["text", "tel", "number"].includes(el.type))) && el.name) data[el.name] = el.value;
      }
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(data));
      } catch {
        /* storage unavailable */
      }
    };
    form.addEventListener("input", onInput);
    return () => form.removeEventListener("input", onInput);
  }, [formId, storageKey]);
  return null;
}

export function clearAutosave(storageKey: string) {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}
