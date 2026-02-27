"use client";

import { useState } from "react";

export type FeedbackPosition = {
  stance: string;
  sentiment: "oppose" | "support" | "neutral";
  count: number;
  detail: string;
};

export type PublicFeedback = {
  id?: string;
  feedback_count: number | null;
  sentiment_summary: string | null;
  support_count: number | null;
  oppose_count: number | null;
  neutral_count: number | null;
  positions?: FeedbackPosition[] | null;
  themes?: string[] | null;
  raw_excerpts?: string[] | null;
};

const POSITION_COLORS = {
  oppose: "#D4726A",
  support: "#7BA887",
  neutral: "#D4A84B",
} as const;

const MAX_VISIBLE_POSITIONS = 5;

export function CommunityVoices({ data }: { data: PublicFeedback }) {
  const [showAllPositions, setShowAllPositions] = useState(false);

  const total =
    (data.support_count ?? 0) + (data.oppose_count ?? 0) + (data.neutral_count ?? 0);
  const supportPct = total > 0 ? (data.support_count ?? 0) / total : 0;
  const opposePct = total > 0 ? (data.oppose_count ?? 0) / total : 0;
  const neutralPct = total > 0 ? (data.neutral_count ?? 0) / total : 0;

  const positions = (data.positions ?? [])
    .filter(
      (p) =>
        p &&
        p.stance &&
        ["oppose", "support", "neutral"].includes(p.sentiment ?? "")
    )
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const visiblePositions =
    showAllPositions || positions.length <= MAX_VISIBLE_POSITIONS
      ? positions
      : positions.slice(0, MAX_VISIBLE_POSITIONS);
  const hasMorePositions = positions.length > MAX_VISIBLE_POSITIONS;

  return (
    <div className="mt-4 border-l-2 border-amber-300 bg-amber-50/50 rounded-r-lg p-4">
      <h4 className="mb-3 flex items-center gap-2 font-fraunces text-sm font-semibold text-[var(--text-primary)]">
        <SpeechBubbleIcon className="h-4 w-4" />
        Community Voices
      </h4>

      <p className="font-source-sans text-sm font-bold text-[var(--text-primary)]">
        {data.feedback_count ?? 0} letters received
      </p>

      {total > 0 && (
        <div className="mt-2">
          <div
            className="flex h-2 w-full overflow-hidden rounded-lg"
            role="presentation"
          >
            {opposePct > 0 && (
              <div
                className="bg-[#D4726A]"
                style={{ width: `${opposePct * 100}%` }}
                title="Opposed"
              />
            )}
            {neutralPct > 0 && (
              <div
                className="bg-[#B8B0A4]"
                style={{ width: `${neutralPct * 100}%` }}
                title="Neutral"
              />
            )}
            {supportPct > 0 && (
              <div
                className="bg-[#7BA887]"
                style={{ width: `${supportPct * 100}%` }}
                title="Support"
              />
            )}
          </div>
          <p className="mt-1.5 font-source-sans text-xs text-[var(--text-tertiary)]">
            {data.oppose_count ?? 0} opposed · {data.support_count ?? 0} support
            · {data.neutral_count ?? 0} neutral
          </p>
        </div>
      )}

      {data.sentiment_summary?.trim() && (
        <p className="mt-3 font-source-sans text-sm leading-relaxed text-[var(--text-secondary)]">
          {data.sentiment_summary}
        </p>
      )}

      {positions.length > 0 && (
        <div className="mt-4">
          <h5 className="mb-2 font-source-sans text-sm font-semibold text-[var(--text-primary)]">
            What residents are saying
          </h5>
          <div className="space-y-3">
            {visiblePositions.map((pos, i) => (
              <div key={i} className="flex gap-2">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      POSITION_COLORS[pos.sentiment as keyof typeof POSITION_COLORS] ??
                      POSITION_COLORS.neutral,
                  }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-source-sans text-sm font-semibold text-[var(--text-primary)]">
                      {pos.stance}
                    </span>
                    <span className="shrink-0 font-source-sans text-xs text-[var(--text-tertiary)]">
                      ~{pos.count} letters
                    </span>
                  </div>
                  {pos.detail?.trim() && (
                    <p
                      className="mt-0.5 line-clamp-2 font-source-sans text-sm text-[var(--text-secondary)]"
                      title={pos.detail}
                    >
                      {pos.detail}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {hasMorePositions && !showAllPositions && (
            <button
              type="button"
              onClick={() => setShowAllPositions(true)}
              className="mt-2 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              Show all ({positions.length} positions)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SpeechBubbleIcon({ className }: { className?: string }) {
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
