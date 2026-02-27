import { ItemCard } from "./ItemCard";
import type { IssueGroup } from "@/lib/feed";

/** Number of whole months between two ISO date strings */
function monthSpan(earliest: string, latest: string): number {
  const a = earliest.slice(0, 10).split("-").map(Number);
  const b = latest.slice(0, 10).split("-").map(Number);
  if (a.length < 3 || b.length < 3) return 0;
  return (b[0] - a[0]) * 12 + (b[1] - a[1]);
}

function threadSummaryLine(group: IssueGroup): string {
  const count = group.items.length;
  const earliest = group.items[group.items.length - 1]?.meetings?.date ?? "";
  const span = monthSpan(earliest, group.latestDate);

  if (span >= 1) {
    return `${count} reading${count === 1 ? "" : "s"} across ${span} month${span === 1 ? "" : "s"}`;
  }
  return `Discussed at ${count} meeting${count === 1 ? "" : "s"}`;
}

export function IssueGroupSection({ group }: { group: IssueGroup }) {
  const summary = threadSummaryLine(group);

  return (
    <section className="border-l-2 border-amber-400/60 pl-4 sm:pl-6">
      <header className="mb-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            Bylaw {group.bylawNum}
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">{summary}</span>
        </div>
        <h2 className="font-fraunces text-lg font-semibold text-[var(--text-primary)]">
          {group.title}
        </h2>
      </header>

      <div className="space-y-3">
        {group.items.map((item) => (
          <ItemCard key={item.id} item={item} isThreadChild />
        ))}
      </div>
    </section>
  );
}
