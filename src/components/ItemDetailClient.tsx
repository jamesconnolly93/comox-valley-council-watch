"use client";

import { useState } from "react";
import type { FeedItem, KeyStat, CommunitySignal } from "@/lib/feed";
import {
  isPlaceholderItem,
  isActionableImpact,
  categoryLabel,
  normaliseFeedback,
  cleanItemTitle,
} from "@/lib/feed";
import { useComplexity } from "@/lib/complexity-context";
import type { Complexity } from "@/lib/complexity-context";
import { CommunityVoices } from "./CommunityVoices";
import { StructuredFindings } from "./StructuredFindings";
import { ReactionButton } from "./ReactionButton";

const COMPLEXITY_LEVELS: { value: Complexity; label: string; desc: string }[] = [
  { value: "simple",   label: "Simple",   desc: "Headlines only" },
  { value: "standard", label: "Standard", desc: "Key facts at a glance" },
  { value: "expert",   label: "Expert",   desc: "Full council briefing" },
];

const PILL_LIMIT = 5;
const DECISION_TRUNCATE = 200;

function formatTag(tag: string): string {
  return tag.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSummaryForComplexity(item: FeedItem, complexity: Complexity): string {
  const fallback = item.summary ?? item.description?.slice(0, 200) ?? "";
  if (complexity === "simple" && item.summary_simple?.trim())
    return item.summary_simple.trim();
  if (complexity === "expert" && item.summary_expert?.trim())
    return item.summary_expert.trim();
  return item.summary?.trim() || fallback;
}

function GavelIcon({ className }: { className?: string }) {
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
      <path d="m14 13-7.5 7.5c-.83-.83-.83-2.17 0-3l3-3Z" />
      <path d="m16 16 6-6" />
      <path d="m8 8 3-3 5 5-3 3Z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
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
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function ItemDetailClient({ item }: { item: FeedItem }) {
  const { complexity, setComplexity } = useComplexity();
  const [showFullDecision, setShowFullDecision] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  const isPlaceholder = isPlaceholderItem(item);
  const impactText = isActionableImpact(item.impact) ? item.impact!.trim() : null;
  const displaySummary = getSummaryForComplexity(item, complexity);
  const feedback = normaliseFeedback(item.public_feedback);
  const hasFeedback = (feedback?.feedback_count ?? 0) > 0;
  const communitySignal: CommunitySignal | null = item.community_signal ?? null;
  const keyStats: KeyStat[] = Array.isArray(item.key_stats) ? item.key_stats : [];

  const categories = item.categories ?? (item.category ? [item.category] : []);
  const tags = item.tags ?? [];
  const allPills = [
    ...categories.map((c) => ({ kind: "category" as const, value: c })),
    ...tags.map((t) => ({ kind: "tag" as const, value: t })),
  ];
  const visiblePills = showAllTags ? allPills : allPills.slice(0, PILL_LIMIT);
  const hiddenPillCount = allPills.length - PILL_LIMIT;

  const isLongDecision = (item.decision?.length ?? 0) > DECISION_TRUNCATE;
  const displayDecision =
    isLongDecision && !showFullDecision
      ? item.decision!.slice(0, DECISION_TRUNCATE).trimEnd() + "…"
      : item.decision;

  const headline =
    item.headline?.trim() || cleanItemTitle(item.title ?? "") || (item.title ?? "");

  return (
    <div className="space-y-5">
      {/* Reading level toggle */}
      <div>
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-sm text-[var(--text-tertiary)]">Detail</span>
          <div className="grid flex-1 grid-cols-3 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-0.5">
            {COMPLEXITY_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => setComplexity(level.value)}
                aria-pressed={complexity === level.value}
                className={`rounded-md py-1 text-xs font-medium transition-all duration-150 ${
                  complexity === level.value
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-[var(--text-tertiary)]">
          {COMPLEXITY_LEVELS.find((l) => l.value === complexity)?.desc}
        </p>
      </div>

      {/* Headline */}
      <h1 className="font-fraunces text-2xl font-semibold leading-snug text-[var(--text-primary)]">
        {headline}
      </h1>

      {/* Placeholder message */}
      {isPlaceholder && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          This item was listed on the agenda but no detailed minutes are available yet.
        </p>
      )}

      {!isPlaceholder && (
        <>
          {/* Impact callout */}
          {impactText && (
            <div className="flex items-start gap-2 rounded-lg bg-[var(--accent-light)]/40 px-4 py-3">
              <UserIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
              <p className="text-sm font-medium text-[var(--accent)]">{impactText}</p>
            </div>
          )}

          {/* Summary */}
          <p
            key={complexity}
            className="text-base leading-relaxed text-[var(--text-secondary)]"
            style={{ animation: "fade-in 0.15s ease-out" }}
          >
            {displaySummary}
          </p>

          {/* Key stats */}
          {keyStats.length > 0 && (
            <p className="text-sm text-[var(--text-tertiary)]">
              {keyStats.map((stat, i) => (
                <span key={i}>
                  {i > 0 && <span className="mx-1.5 select-none">·</span>}
                  <span className="font-medium text-[var(--text-secondary)]">
                    {stat.value}
                  </span>{" "}
                  {stat.label}
                </span>
              ))}
            </p>
          )}

          {/* Decision */}
          {item.decision && (
            <div className="rounded-lg border-l-2 border-[var(--accent)] bg-[var(--accent-light)]/50 py-2 pl-3 pr-3">
              <div className="flex items-start gap-2">
                <GavelIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                <div>
                  <span className="text-xs font-medium text-[var(--accent)]">
                    Decision
                  </span>
                  <p className="mt-0.5 text-sm italic text-[var(--text-primary)]">
                    {displayDecision}
                  </p>
                  {isLongDecision && !showFullDecision && (
                    <button
                      type="button"
                      onClick={() => setShowFullDecision(true)}
                      className="mt-1 text-xs text-[var(--accent)] hover:underline"
                    >
                      Show full decision
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Community voices */}
          {feedback && <CommunityVoices data={feedback} />}
          {!hasFeedback && communitySignal && (
            <StructuredFindings signal={communitySignal} />
          )}

          {/* Reaction */}
          <div>
            <ReactionButton itemId={item.id} />
          </div>

          {/* Tags */}
          {allPills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {visiblePills.map((pill, i) => (
                <span
                  key={`${pill.kind}-${pill.value}`}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    pill.kind === "category" && i === 0
                      ? "bg-[var(--accent-light)] text-[var(--accent)]"
                      : pill.kind === "category"
                      ? "bg-[var(--surface-elevated)] text-[var(--text-secondary)]"
                      : "bg-[var(--surface-elevated)] px-2 text-[var(--text-tertiary)]"
                  }`}
                >
                  {pill.kind === "category"
                    ? categoryLabel(pill.value)
                    : formatTag(pill.value)}
                </span>
              ))}
              {!showAllTags && hiddenPillCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllTags(true)}
                  className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                >
                  +{hiddenPillCount} more
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
