import { Suspense } from "react";
import { FilterBar } from "@/components/FilterBar";
import { MeetingGroup } from "@/components/MeetingGroup";
import { FeedSkeleton } from "@/components/FeedSkeleton";
import { fetchFilteredItems } from "./actions";

export const metadata = {
  title: "Comox Valley Council Watch",
  description: "Never miss a decision that matters to you",
};

function MountainIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
    </svg>
  );
}

async function FeedContent({
  search,
  municipality,
  category,
}: {
  search: string | null;
  municipality: string | null;
  category: string | null;
}) {
  const { groups, dbEmpty } = await fetchFilteredItems({
    search,
    municipality,
    category,
  });

  if (dbEmpty) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)]">
          <CalendarIcon className="h-8 w-8" />
        </div>
        <h2 className="font-fraunces text-xl font-semibold text-[var(--text-primary)]">
          No meetings yet
        </h2>
        <p className="mt-2 font-source-sans text-[var(--text-secondary)]">
          No meetings have been processed yet.
        </p>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">
          Run the pipeline to get started:{" "}
          <code className="rounded bg-[var(--surface-elevated)] px-1.5 py-0.5 font-mono text-sm">
            npm run pipeline
          </code>
        </p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)]">
          <SearchEmptyIcon className="h-8 w-8" />
        </div>
        <h2 className="font-fraunces text-xl font-semibold text-[var(--text-primary)]">
          No items match
        </h2>
        <p className="mt-2 font-source-sans text-[var(--text-secondary)]">
          No items match your filters.
        </p>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">
          Try broadening your search.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {groups.map((group, idx) => (
        <div
          key={group.meeting?.id ?? idx}
          className="animate-fade-in"
          style={{ animationDelay: `${idx * 50}ms` }}
        >
          <MeetingGroup group={group} />
        </div>
      ))}
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

function SearchEmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = typeof params?.search === "string" ? params.search : null;
  const municipality =
    typeof params?.municipality === "string" ? params.municipality : null;
  const category =
    typeof params?.category === "string" ? params.category : null;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Subtle top gradient */}
      <div
        className="pointer-events-none fixed left-0 right-0 top-0 h-48 bg-gradient-to-b from-[var(--accent)]/5 to-transparent"
        aria-hidden
      />

      <header className="relative border-b border-[var(--border)] bg-[var(--surface-elevated)]/80 backdrop-blur-sm">
        <div className="mx-auto max-w-[720px] px-5 py-8 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-[var(--accent)]">
              <MountainIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-fraunces text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
                Comox Valley Council Watch
              </h1>
              <p className="mt-1 font-source-sans text-base font-light text-[var(--text-secondary)]">
                Never miss a decision that matters to you
              </p>
              <div className="mt-3 h-0.5 w-12 rounded-full bg-[var(--accent)]" />
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[720px] px-5 py-8 sm:px-6">
        <div className="space-y-8">
          <Suspense
            fallback={
              <div className="h-14 rounded-2xl bg-[var(--surface-elevated)] animate-pulse" />
            }
          >
            <FilterBar />
          </Suspense>

          <Suspense fallback={<FeedSkeleton />}>
            <FeedContent
              search={search}
              municipality={municipality}
              category={category}
            />
          </Suspense>
        </div>
      </main>

      <footer className="mt-16 border-t border-[var(--border)] bg-[var(--surface-elevated)] py-8">
        <div className="mx-auto max-w-[720px] px-5 sm:px-6">
          <p className="font-fraunces text-sm font-medium text-[var(--text-primary)]">
            Built for the Comox Valley community
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a
              href="https://www.courtenay.ca/news"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline hover:no-underline"
            >
              Courtenay
            </a>
            <a
              href="https://www.comox.ca/councilmeetings"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline hover:no-underline"
            >
              Comox
            </a>
          </div>
          <p className="mt-3 text-xs text-[var(--text-tertiary)]">
            Meeting data sourced from public municipal records
          </p>
        </div>
      </footer>
    </div>
  );
}
