"use client";

import { useComplexity } from "@/lib/complexity-context";
import type { Complexity } from "@/lib/complexity-context";

export const COMPLEXITY_LEVELS: { value: Complexity; label: string }[] = [
  { value: "simple", label: "Simple" },
  { value: "standard", label: "Standard" },
  { value: "expert", label: "Expert" },
];

/** Inline three-button segmented control for reading level. */
export function ComplexitySlider() {
  const { complexity, setComplexity } = useComplexity();

  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-xs font-medium text-[var(--text-tertiary)]">
        Reading level
      </span>
      <div className="flex rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] p-0.5">
        {COMPLEXITY_LEVELS.map((level) => (
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
