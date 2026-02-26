export function FeedSkeleton() {
  return (
    <div className="animate-fade-in space-y-8">
      {[1, 2, 3, 4].map((i) => (
        <section
          key={i}
          className="border-l-2 border-[var(--accent)]/40 pl-4 sm:pl-6"
        >
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="h-6 w-20 animate-pulse rounded-full bg-[var(--surface-elevated)]" />
            <div className="h-6 w-48 animate-pulse rounded bg-[var(--surface-elevated)]" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((j) => (
              <div
                key={j}
                className="animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm"
              >
                <div className="h-5 w-3/4 rounded bg-[var(--surface-elevated)]" />
                <div className="mt-3 h-4 w-full rounded bg-[var(--surface-elevated)]/80" />
                <div className="mt-2 h-4 w-5/6 rounded bg-[var(--surface-elevated)]/60" />
                <div className="mt-4 flex gap-2">
                  <div className="h-6 w-16 rounded-full bg-[var(--surface-elevated)]/80" />
                  <div className="h-6 w-20 rounded-full bg-[var(--surface-elevated)]/80" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
