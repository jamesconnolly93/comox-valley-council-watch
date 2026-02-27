"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fingerprint: hash of stable browser signals — no PII, no tracking cookies.
 * Approximates unique browser for reaction dedup. Not cryptographically strong,
 * just good enough to prevent casual double-clicking.
 */
function getFingerprint(): string {
  const raw = [
    navigator.userAgent,
    String(screen.width),
    String(screen.height),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join("|");

  // djb2-style hash → base36 string (alphanumeric, matches API regex)
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).slice(0, 12);
}

const STORAGE_PREFIX = "cvtw-reaction-";

interface Props {
  itemId: string;
}

export function ReactionButton({ itemId }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const [reacted, setReacted] = useState(false);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // Restore cached reacted state immediately (prevents flicker)
    const cached = localStorage.getItem(STORAGE_PREFIX + itemId);
    if (cached !== null) setReacted(cached === "1");

    const fp = getFingerprint();
    fetch(`/api/react?item_id=${encodeURIComponent(itemId)}&fingerprint=${fp}`)
      .then((r) => r.json())
      .then((data: { count: number; reacted: boolean }) => {
        setCount(data.count);
        setReacted(data.reacted);
        localStorage.setItem(STORAGE_PREFIX + itemId, data.reacted ? "1" : "0");
      })
      .catch(() => {
        // Server unavailable — silently fail, show nothing
        setCount(null);
      });
  }, [itemId]);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation(); // don't expand the card
    if (loading) return;

    const fp = getFingerprint();
    const nextReacted = !reacted;
    const nextCount = Math.max(0, (count ?? 0) + (nextReacted ? 1 : -1));

    // Optimistic update
    setReacted(nextReacted);
    setCount(nextCount);
    localStorage.setItem(STORAGE_PREFIX + itemId, nextReacted ? "1" : "0");
    setLoading(true);

    try {
      const res = await fetch("/api/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, fingerprint: fp }),
      });
      if (res.status === 429) {
        // Rate limited — revert
        setReacted(!nextReacted);
        setCount(count);
        localStorage.setItem(STORAGE_PREFIX + itemId, (!nextReacted) ? "1" : "0");
        return;
      }
      const data: { count: number; reacted: boolean } = await res.json();
      setCount(data.count);
      setReacted(data.reacted);
      localStorage.setItem(STORAGE_PREFIX + itemId, data.reacted ? "1" : "0");
    } catch {
      // Network error — revert optimistic update
      setReacted(!nextReacted);
      setCount(count);
    } finally {
      setLoading(false);
    }
  }

  // Don't render until we have count data (avoids layout shift)
  // Exception: if reacted is known from localStorage, show immediately
  const showCount = count !== null && count > 0;
  const prominent = (count ?? 0) > 10;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-pressed={reacted}
      aria-label={
        reacted
          ? `You reacted — ${count ?? 0} resident${(count ?? 0) === 1 ? "" : "s"} said this affects them`
          : "This affects me"
      }
      className={`
        group/btn inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium
        transition-all duration-150 select-none
        ${reacted
          ? "bg-[var(--accent)] text-white shadow-sm"
          : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
        }
        ${prominent && !reacted ? "border-[var(--accent)]/30 bg-[var(--accent-light)]/20" : ""}
        ${loading ? "opacity-70 cursor-wait" : "cursor-pointer"}
      `}
    >
      <PinIcon
        className={`h-3 w-3 shrink-0 transition-transform duration-150 ${
          reacted ? "scale-110" : "group-hover/btn:scale-110"
        }`}
        filled={reacted}
      />
      <span>
        {showCount ? (
          <>
            <span className={prominent ? "font-semibold" : ""}>{count}</span>
            {" "}
            {count === 1 ? "resident" : "residents"}
            {" · "}
          </>
        ) : null}
        This affects me
      </span>
    </button>
  );
}

function PinIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="12" x2="12" y1="17" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}
