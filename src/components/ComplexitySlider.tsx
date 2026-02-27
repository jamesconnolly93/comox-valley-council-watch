"use client";

import { useComplexity } from "@/lib/complexity-context";
import type { Complexity } from "@/lib/complexity-context";

const LEVELS: { value: Complexity; label: string }[] = [
  { value: "simple", label: "Simple" },
  { value: "standard", label: "Standard" },
  { value: "expert", label: "Expert" },
];

function SegmentedControl() {
  const { complexity, setComplexity } = useComplexity();

  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-xs font-medium text-[var(--text-tertiary)]">
        Reading level
      </span>
      <div className="flex rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] p-0.5">
        {LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            onClick={() => setComplexity(level.value)}
            aria-pressed={complexity === level.value}
            className={`rounded-full px-4 py-1 text-sm font-medium transition-all duration-150 ${
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
  );
}

/**
 * Desktop (md+): renders inline between the filter bar and the feed.
 * Mobile (<md): renders as a fixed floating bar pinned to the viewport bottom.
 */
export function ComplexitySlider() {
  return (
    <>
      {/* Desktop — inline in page flow */}
      <div className="hidden md:block">
        <SegmentedControl />
      </div>

      {/* Mobile — fixed floating bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]/95 px-5 py-3 backdrop-blur-sm md:hidden">
        <SegmentedControl />
      </div>
    </>
  );
}
