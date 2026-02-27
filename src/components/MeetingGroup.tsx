import { ItemCard } from "./ItemCard";
import { formatMeetingDate, municipalityBadgeClass } from "@/lib/feed";
import type { MeetingWithItems } from "@/lib/feed";

export function MeetingGroup({ group }: { group: MeetingWithItems }) {
  const { meeting, items } = group;
  const shortName = meeting?.municipalities?.short_name ?? "Unknown";

  const badgeClass = municipalityBadgeClass(shortName);

  return (
    <section className="border-l-2 border-[var(--accent)] pl-4 sm:pl-6">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <span
            className={`inline-flex w-fit rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}
          >
            {shortName}
          </span>
          <h2 className="font-fraunces text-lg font-semibold text-[var(--text-primary)]">
            {meeting?.title ?? "Regular Council Meeting"}
          </h2>
        </div>
        <div className="flex items-center gap-3 text-sm text-[var(--text-tertiary)]">
          <time
            dateTime={meeting?.date}
            className="font-fraunces font-medium text-[var(--text-secondary)]"
          >
            {formatMeetingDate(meeting?.date)}
          </time>
          <span>
            {items.length} item{items.length === 1 ? "" : "s"} discussed
          </span>
        </div>
      </header>

      <div className="space-y-4">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} showMeetingMeta={false} />
        ))}
      </div>
    </section>
  );
}
