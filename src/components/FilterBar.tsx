"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { MUNICIPALITIES, CATEGORIES } from "@/lib/feed";
import { ComplexitySlider } from "./ComplexitySlider";

const SEARCH_DEBOUNCE_MS = 300;

export function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(
    () => searchParams.get("search") ?? ""
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const search = searchParams.get("search") ?? "";
  const municipality = searchParams.get("municipality") ?? "all";
  const category = searchParams.get("category") ?? "all";
  const sort = searchParams.get("sort") ?? "recent";

  useEffect(() => {
    setSearchInput(searchParams.get("search") ?? "");
  }, [searchParams]);

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

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateParams({ search: value });
      }, SEARCH_DEBOUNCE_MS);
    },
    [updateParams]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--accent)]">
          <SearchIcon className="h-4 w-4" />
        </span>
        <input
          type="search"
          placeholder="Search titles, summaries, tags…"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full rounded-full border border-[var(--border)] bg-[var(--surface)] py-3 pl-11 pr-4 text-[var(--text-primary)] shadow-sm placeholder:text-[var(--text-tertiary)] transition-shadow duration-150 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-light)]"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap gap-2">
          <span className="mr-1 self-center text-xs font-medium text-[var(--text-tertiary)]">
            Municipality
          </span>
          {MUNICIPALITIES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => updateParams({ municipality: m.value })}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 ${
                municipality === m.value
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent-light)]/30"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div className="w-[160px] shrink-0">
            <ComplexitySlider />
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none sm:overflow-visible">
          <span className="shrink-0 text-xs font-medium text-[var(--text-tertiary)]">
            Category
          </span>
          <div className="flex gap-2">
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
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--text-tertiary)]">Sort</span>
        {(["recent", "hot"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => updateParams({ sort: s === "recent" ? "" : s })}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150 capitalize ${
              sort === s
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent-light)]/30"
            }`}
          >
            {s === "recent" ? "Recent" : "Most discussed"}
          </button>
        ))}
      </div>

      {isPending && (
        <span className="text-xs text-[var(--text-tertiary)]">
          Updating…
        </span>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
