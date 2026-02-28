"use client";

import { useState, useEffect } from "react";
import { ItemCard } from "./ItemCard";
import {
  formatMeetingGroupHeader,
  formatMeetingDateShort,
  formatMeetingDate,
  scoreItemForDisplay,
} from "@/lib/feed";
import { useComplexity } from "@/lib/complexity-context";
import type { MeetingWithItems } from "@/lib/feed";

/** Collapse meeting groups with more items than this threshold (Standard mode only) */
const COLLAPSE_THRESHOLD = 4;
/** Number of top-scored items to show when collapsed */
const VISIBLE_COUNT = 3;

export function MeetingGroup({ group }: { group: MeetingWithItems }) {
  const { meeting, items } = group;
  const { complexity } = useComplexity();
  const [showAll, setShowAll] = useState(false);

  const isSimple = complexity === "simple";
  const isExpert = complexity === "expert";
  const isStandard = !isSimple && !isExpert;

  // Collapse only in Standard mode when there are many items
  const shouldCollapse = isStandard && items.length > COLLAPSE_THRESHOLD;
  const hiddenCount = items.length - VISIBLE_COUNT;

  // Sort by score in Standard mode so the most impactful items surface first
  const displayItems = shouldCollapse
    ? [...items].sort((a, b) => scoreItemForDisplay(b) - scoreItemForDisplay(a))
    : items;

  const visibleItems =
    shouldCollapse && !showAll ? displayItems.slice(0, VISIBLE_COUNT) : displayItems;

  // Expand group if the URL hash targets one of our items (handles Spotlight anchor links)
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && items.some((item) => item.id === hash)) {
      setShowAll(true);
    }

    function onHashChange() {
      const newHash = window.location.hash.slice(1);
      if (!newHash) return;
      if (items.some((item) => item.id === newHash)) {
        setShowAll(true);
        setTimeout(() => {
          const el = document.getElementById(newHash);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    }

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [items]);

  const shortName = meeting?.municipalities?.short_name ?? "Unknown";

  let dateLabel: string;
  let headerLabel: string;
  let itemLabel: string;

  if (isSimple) {
    // Minimal: "Feb 11 · Courtenay · 5 items"
    dateLabel = formatMeetingDateShort(meeting?.date);
    headerLabel = shortName;
    itemLabel = `${items.length} item${items.length === 1 ? "" : "s"}`;
  } else if (isExpert) {
    // Detailed: "February 11, 2026 · Courtenay Council Highlights · 5 items discussed"
    dateLabel = formatMeetingDate(meeting?.date);
    headerLabel = formatMeetingGroupHeader(meeting);
    itemLabel = `${items.length} item${items.length === 1 ? "" : "s"} discussed`;
  } else {
    // Standard: "Feb 11 · Courtenay Council Highlights · 5 items"
    dateLabel = formatMeetingDateShort(meeting?.date);
    headerLabel = formatMeetingGroupHeader(meeting);
    itemLabel = `${items.length} item${items.length === 1 ? "" : "s"}`;
  }

  return (
    <section>
      {/* Lightweight date-divider style header */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
        {dateLabel && (
          <>
            <time dateTime={meeting?.date} className="font-medium">
              {dateLabel}
            </time>
            <span aria-hidden>·</span>
          </>
        )}
        <span className="font-medium text-[var(--text-secondary)]">{headerLabel}</span>
        <span aria-hidden>·</span>
        <span>{itemLabel}</span>
      </div>

      <div className="space-y-3">
        {visibleItems.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            showMeetingMeta={false}
            hideMunicipality
          />
        ))}
      </div>

      {/* "Show more / fewer" toggle — Standard mode only, when group is large */}
      {shouldCollapse && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
        >
          {showAll
            ? "Show fewer ▴"
            : `Show ${hiddenCount} more item${hiddenCount === 1 ? "" : "s"} ▾`}
        </button>
      )}
    </section>
  );
}
