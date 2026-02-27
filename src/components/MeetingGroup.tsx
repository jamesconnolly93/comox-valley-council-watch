"use client";

import { ItemCard } from "./ItemCard";
import {
  formatMeetingGroupHeader,
  formatMeetingDateShort,
  formatMeetingDate,
} from "@/lib/feed";
import { useComplexity } from "@/lib/complexity-context";
import type { MeetingWithItems } from "@/lib/feed";

export function MeetingGroup({ group }: { group: MeetingWithItems }) {
  const { meeting, items } = group;
  const { complexity } = useComplexity();

  const shortName = meeting?.municipalities?.short_name ?? "Unknown";

  let dateLabel: string;
  let headerLabel: string;
  let itemLabel: string;

  if (complexity === "simple") {
    // Minimal: "Feb 11 · Courtenay · 5 items"
    dateLabel = formatMeetingDateShort(meeting?.date);
    headerLabel = shortName;
    itemLabel = `${items.length} item${items.length === 1 ? "" : "s"}`;
  } else if (complexity === "expert") {
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
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            showMeetingMeta={false}
            hideMunicipality
          />
        ))}
      </div>
    </section>
  );
}
