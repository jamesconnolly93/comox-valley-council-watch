"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { MUNICIPALITIES, CATEGORIES } from "@/lib/feed";
import { useComplexity } from "@/lib/complexity-context";
import type { Complexity } from "@/lib/complexity-context";

const COMPLEXITY_LEVELS: { value: Complexity; label: string; desc: string }[] = [
  { value: "simple",   label: "Simple",   desc: "Headlines only — tap to read more" },
  { value: "standard", label: "Standard", desc: "Key facts at a glance" },
  { value: "expert",   label: "Expert",   desc: "Full detail inline" },
];

export function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { complexity, setComplexity } = useComplexity();

  const municipality = searchParams.get("municipality") ?? "all";
  const category = searchParams.get("category") ?? "all";
  const sort = searchParams.get("sort") ?? "recent";

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(searchParams);
      for (const [k, v] of Object.entries(updates)) {
        if (v === "all" || !v.trim()) next.delete(k);
        else next.set(k, v);
      }
      startTransition(() => {
        router.push(`/?${next.toString()}`, { scroll: false });
      });
    },
    [router, searchParams]
  );

  return (
    <div className={`flex flex-col gap-2.5 transition-opacity duration-150 ${isPending ? "opacity-60" : ""}`}>

      {/* Row 1: Municipality pills (left) + Sort toggle (right) */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5 overflow-x-auto scrollbar-none">
          {MUNICIPALITIES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => updateParams({ municipality: m.value })}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                municipality === m.value
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent-light)]/30"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Sort — text-only, right-aligned */}
        <div className="flex shrink-0 items-center gap-0.5 border-l border-[var(--border)] pl-3">
          {(["recent", "hot"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => updateParams({ sort: s === "recent" ? "" : s })}
              className={`rounded px-2 py-1 text-xs transition-colors duration-150 ${
                sort === s
                  ? "font-semibold text-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {s === "recent" ? "Recent" : "Top"}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Category pills — full width, horizontally scrollable */}
      <div>
        {/* Mobile: native select */}
        <div className="relative md:hidden">
          <select
            value={category}
            onChange={(e) => updateParams({ category: e.target.value })}
            className="w-full appearance-none rounded-full border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-4 pr-9 text-sm text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value === "all" ? "All categories" : c.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <ChevronDownIcon className="h-4 w-4 text-[var(--text-tertiary)]" />
          </div>
        </div>

        {/* Desktop: scrollable chip strip */}
        <div className="relative hidden md:block">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => updateParams({ category: c.value })}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                  category === c.value
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent-light)]/30"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {/* Fade hint on right edge */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--background)] to-transparent" />
        </div>
      </div>

      {/* Row 3: Reading level — prominent full-width segmented control */}
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-sm text-[var(--text-tertiary)]">Reading level</span>
        <div className="grid flex-1 grid-cols-3 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-0.5">
          {COMPLEXITY_LEVELS.map((level) => (
            <button
              key={level.value}
              type="button"
              onClick={() => setComplexity(level.value)}
              aria-pressed={complexity === level.value}
              title={level.desc}
              className={`rounded-md py-1 text-xs font-medium transition-all duration-150 ${
                complexity === level.value
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {level.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
