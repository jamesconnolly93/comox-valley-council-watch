import { ItemCard } from "./ItemCard";
import { formatMeetingGroupHeader, formatMeetingDateShort } from "@/lib/feed";
import type { MeetingWithItems } from "@/lib/feed";

export function MeetingGroup({ group }: { group: MeetingWithItems }) {
  const { meeting, items } = group;

  const headerLabel = formatMeetingGroupHeader(meeting);
  const dateLabel = formatMeetingDateShort(meeting?.date);

  return (
    <section>
      {/* Lightweight date-divider style header */}
      <div className="mb-3 flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
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
        <span>{items.length} item{items.length === 1 ? "" : "s"}</span>
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
