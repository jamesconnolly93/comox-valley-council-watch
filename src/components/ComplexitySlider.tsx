"use client";

import { useComplexity } from "@/lib/complexity-context";
import type { Complexity } from "@/lib/complexity-context";

const LEVELS: { value: Complexity; label: string }[] = [
  { value: "simple", label: "Simple" },
  { value: "standard", label: "Standard" },
  { value: "expert", label: "Expert" },
];

export function ComplexitySlider() {
  const { complexity, setComplexity } = useComplexity();

  const index = LEVELS.findIndex((l) => l.value === complexity);
  const activeIndex = index >= 0 ? index : 1;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-tertiary)]">
          Detail level
        </span>
        <span className="text-xs font-medium text-[var(--accent)]">
          {LEVELS[activeIndex].label}
        </span>
      </div>
      <div className="relative h-2 w-full">
        <div className="absolute inset-0 rounded-full bg-[var(--surface-elevated)]" />
        <div
          className="absolute left-0 top-0 h-2 overflow-hidden rounded-full transition-[width] duration-150 ease-out"
          style={{
            width: `${(activeIndex / (LEVELS.length - 1)) * 100}%`,
          }}
        >
          <div className="h-full w-full min-w-full rounded-full bg-[var(--accent)]" />
        </div>
        <input
          type="range"
          min={0}
          max={LEVELS.length - 1}
          step={1}
          value={activeIndex}
          onChange={(e) =>
            setComplexity(LEVELS[parseInt(e.target.value, 10)].value)
          }
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Summary complexity: Simple to Expert"
        />
      </div>
      <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
        <span>Simple</span>
        <span>Expert</span>
      </div>
    </div>
  );
}
