import { ItemCard } from "./ItemCard";
import { formatMeetingDate } from "@/lib/feed";
import type { IssueGroup } from "@/lib/feed";

export function IssueGroupSection({ group }: { group: IssueGroup }) {
  return (
    <section className="border-l-2 border-amber-400/60 pl-4 sm:pl-6">
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            Bylaw {group.bylawNum}
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">
            {group.items.length} readings · Latest {formatMeetingDate(group.latestDate)}
          </span>
        </div>
        <h2 className="font-fraunces text-lg font-semibold text-[var(--text-primary)]">
          {group.title}
        </h2>
      </header>

      <div className="space-y-4">
        {group.items.map((item) => (
          <ItemCard key={item.id} item={item} showMeetingMeta />
        ))}
      </div>
    </section>
  );
}
