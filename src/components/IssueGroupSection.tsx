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
  return `${count} meeting${count === 1 ? "" : "s"}`;
}

function LettersIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97-1.94.284-3.916.455-5.922.505a.803.803 0 0 0-.921.804l.008 3.086a.75.75 0 0 0 1.248.608l1.18-1.18c.954-.954.99-2.507.07-3.527C19.335 14.03 21 12.247 21 10.24V6.26c0-2.98-2.19-5.067-5.152-5.475A47.787 47.787 0 0 0 12 3.75c-2.32 0-4.634.167-6.852.475C2.19 4.193 0 6.28 0 9.26v6.02c0 2.98 2.19 5.067 5.152 5.475.386.063.777.124 1.17.178l.076.01a.75.75 0 0 0 .683-.745V14.9a.802.802 0 0 0-.722-.801 47.723 47.723 0 0 1-3.8-.387Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IssueGroupSection({ group }: { group: IssueGroup }) {
  const summary = threadSummaryLine(group);
  const totalLetters = group.totalFeedbackCount;

  return (
    <section id={group.bylawKey} data-item-id={group.bylawKey} className="scroll-mt-24 border-l-2 border-amber-400/60 pl-4 sm:pl-6">
      <header className="mb-4">
        {group.topicLabel ? (
          /* New: topic label as primary, bylaw/meta as a muted single row */
          <>
            <h2 className="font-fraunces text-lg font-semibold text-[var(--text-primary)]">
              {group.topicLabel}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[var(--text-tertiary)]">
              <span>Bylaw {group.bylawNum}</span>
              <span>·</span>
              <span>{summary}</span>
              {totalLetters > 0 && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5 text-amber-700">
                    <LettersIcon className="h-3 w-3" />
                    {totalLetters} community letters
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          /* Fallback: original badge layout when topic_label not yet populated */
          <>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                Bylaw {group.bylawNum}
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">{summary}</span>

              {totalLetters > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  <LettersIcon className="h-3 w-3" />
                  {totalLetters} community letters
                </span>
              )}
            </div>
            <h2 className="font-fraunces text-lg font-semibold text-[var(--text-primary)]">
              {group.items[0]?.headline ?? group.title}
            </h2>
          </>
        )}
      </header>

      <div className="space-y-3">
        {group.items.map((item) => (
          <ItemCard key={item.id} item={item} isThreadChild />
        ))}
      </div>
    </section>
  );
}
