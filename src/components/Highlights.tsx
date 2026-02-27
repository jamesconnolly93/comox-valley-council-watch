"use client";

import Link from "next/link";
import type { FeedItem } from "@/lib/feed";
import { formatMeetingDate, isActionableImpact, municipalityBadgeClass } from "@/lib/feed";

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function Highlights({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="animate-fade-in">
      <div className="rounded-xl bg-[var(--surface-elevated)] p-4 sm:p-5">
        <h2 className="mb-4 flex items-center gap-2 font-fraunces text-lg font-semibold text-[var(--text-primary)]">
          <BoltIcon className="h-5 w-5 text-[var(--accent)]" />
          This Week
        </h2>

        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory sm:grid sm:grid-cols-3 sm:overflow-visible sm:snap-none">
          {items.map((item, idx) => {
            const shortName =
              item.meetings?.municipalities?.short_name ?? "Unknown";
            const badgeClass = municipalityBadgeClass(shortName);

            return (
              <Link
                key={item.id}
                href={`#${item.id}`}
                className="flex min-w-[280px] snap-center flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition-all duration-150 hover:shadow-md sm:min-w-0"
              >
                <span
                  className={`mb-2 inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
                >
                  {shortName}
                </span>
                <h3 className="font-fraunces text-base font-semibold text-[var(--text-primary)] line-clamp-2">
                  {item.title}
                </h3>
                {item.impact?.trim() && isActionableImpact(item.impact) && (
                  <p className="mt-2 text-sm font-medium text-[var(--accent)] line-clamp-2">
                    {item.impact.trim()}
                  </p>
                )}
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  {formatMeetingDate(item.meetings?.date)}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
