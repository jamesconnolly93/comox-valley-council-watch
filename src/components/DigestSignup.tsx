"use client";

import { useState } from "react";

type State = "idle" | "loading" | "sent" | "confirmed" | "error";

export function DigestSignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || state === "loading") return;

    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Try again.");
        setState("error");
        return;
      }

      if (data.status === "already_confirmed") {
        setState("confirmed");
      } else {
        setState("sent");
      }
    } catch {
      setErrorMsg("Network error. Check your connection and try again.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-light)]/30 px-4 py-3">
        <MailIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
        <p className="text-sm text-[var(--text-secondary)]">
          Check your inbox — we sent a confirmation link to{" "}
          <span className="font-medium text-[var(--text-primary)]">{email}</span>.
        </p>
      </div>
    );
  }

  if (state === "confirmed") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-light)]/30 px-4 py-3">
        <MailIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
        <p className="text-sm text-[var(--text-secondary)]">
          You&apos;re already subscribed — digest arrives every Monday morning.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <MailIcon className="h-4 w-4 text-[var(--accent)]" />
        <p className="text-sm font-medium text-[var(--text-primary)]">
          Weekly digest — every Monday morning
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="min-w-0 flex-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-light)]"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {state === "loading" ? "Subscribing…" : "Subscribe"}
        </button>
      </form>
      {state === "error" && (
        <p className="mt-2 text-xs text-red-600">{errorMsg}</p>
      )}
      <p className="mt-2 text-xs text-[var(--text-tertiary)]">
        No spam. Unsubscribe anytime.
      </p>
    </div>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
