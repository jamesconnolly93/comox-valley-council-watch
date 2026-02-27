import { Suspense } from "react";
import { FilterBar } from "@/components/FilterBar";
import { MeetingGroup } from "@/components/MeetingGroup";
import { IssueGroupSection } from "@/components/IssueGroupSection";
import { FeedSkeleton } from "@/components/FeedSkeleton";
import { ComplexityProviderWrapper } from "@/components/ComplexityProviderWrapper";
import { fetchFilteredItems, getSpotlightItems } from "./actions";
import { Spotlight } from "@/components/Spotlight";
import { DigestSignup } from "@/components/DigestSignup";

export const metadata = {
  title: "Comox Valley Council Watch",
  description: "AI-powered summaries of council decisions across Courtenay, Comox, Cumberland & CVRD",
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
  sort,
}: {
  search: string | null;
  municipality: string | null;
  category: string | null;
  sort: string | null;
}) {
  const { issueGroups, standaloneGroups, dbEmpty } = await fetchFilteredItems({
    search,
    municipality,
    category,
    sort,
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
        <p className="mt-2 text-[var(--text-secondary)]">
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

  if (issueGroups.length === 0 && standaloneGroups.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)]">
          <SearchEmptyIcon className="h-8 w-8" />
        </div>
        <h2 className="font-fraunces text-xl font-semibold text-[var(--text-primary)]">
          No items match
        </h2>
        <p className="mt-2 text-[var(--text-secondary)]">
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
      {issueGroups.map((group, idx) => (
        <div
          key={group.bylawKey}
          className="animate-fade-in"
          style={{ animationDelay: `${idx * 50}ms` }}
        >
          <IssueGroupSection group={group} />
        </div>
      ))}
      {standaloneGroups.map((group, idx) => (
        <div
          key={group.meeting?.id ?? idx}
          className="animate-fade-in"
          style={{ animationDelay: `${(issueGroups.length + idx) * 50}ms` }}
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
  const sort = typeof params?.sort === "string" ? params.sort : null;

  const showSpotlight =
    (!municipality || municipality === "all") &&
    (!category || category === "all");
  const spotlightItems = showSpotlight ? await getSpotlightItems() : [];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Slim header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface-elevated)]/90 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-5 sm:px-6">
          {/* Title row + subscribe (desktop) */}
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <MountainIcon className="h-5 w-5 shrink-0 text-[var(--accent)]" />
              <span className="font-fraunces text-lg font-semibold text-[var(--text-primary)]">
                Comox Valley Council Watch
              </span>
            </div>
            {/* Inline subscribe — desktop only */}
            <div className="hidden w-72 shrink-0 sm:block">
              <DigestSignup compact />
            </div>
          </div>
          {/* Tagline */}
          <p className="pb-2 text-sm text-[var(--text-tertiary)]">
            AI-powered summaries of council decisions across Courtenay, Comox, Cumberland &amp; CVRD
          </p>
          {/* Subscribe — mobile only, below tagline */}
          <div className="pb-3 sm:hidden">
            <DigestSignup compact />
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-4xl px-5 pt-6 pb-8 sm:px-6">
        <ComplexityProviderWrapper>
          <div className="space-y-6">
            {/* Sticky filter toolbar */}
            <div className="sticky top-0 z-30 -mx-5 border-b border-[var(--border)] bg-[var(--background)] px-5 pt-3 pb-3 shadow-sm sm:-mx-6 sm:px-6">
              <Suspense
                fallback={
                  <div className="h-14 animate-pulse rounded-2xl bg-[var(--surface-elevated)]" />
                }
              >
                <FilterBar />
              </Suspense>
            </div>

            {spotlightItems.length > 0 && <Spotlight items={spotlightItems} />}

            <Suspense fallback={<FeedSkeleton />}>
              <FeedContent
                search={search}
                municipality={municipality}
                category={category}
                sort={sort}
              />
            </Suspense>
          </div>
        </ComplexityProviderWrapper>
      </main>
    </div>
  );
}
