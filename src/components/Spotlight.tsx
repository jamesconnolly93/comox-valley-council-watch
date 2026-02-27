"use client";

import Link from "next/link";
import type { FeedItem } from "@/lib/feed";
import {
  isHighImpact,
  isActionableImpact,
  municipalityBadgeClass,
  normaliseFeedback,
  categoryLabel,
  extractBylawFromTitle,
} from "@/lib/feed";
import { useComplexity } from "@/lib/complexity-context";
import { COMPLEXITY_LEVELS } from "./ComplexitySlider";

function getSummaryForComplexity(
  item: FeedItem,
  complexity: "simple" | "standard" | "expert"
): string {
  const fallback = item.summary ?? item.description?.slice(0, 200) ?? "";
  if (complexity === "simple" && item.summary_simple?.trim())
    return item.summary_simple.trim();
  if (complexity === "expert" && item.summary_expert?.trim())
    return item.summary_expert.trim();
  return item.summary?.trim() || fallback;
}

function firstSentence(text: string): string {
  const m = text.match(/^[^.!?]+[.!?]/);
  return m ? m[0].trim() : text.slice(0, 160).trim();
}

function ReadingLevelToggle() {
  const { complexity, setComplexity } = useComplexity();
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-xs font-medium text-[var(--text-tertiary)]">
        Reading level
      </span>
      <div className="flex rounded-full border border-amber-200/80 bg-white/60 p-0.5">
        {COMPLEXITY_LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            onClick={() => setComplexity(level.value)}
            aria-pressed={complexity === level.value}
            className={`rounded-full px-3 py-0.5 text-xs font-medium transition-all duration-150 ${
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
  );
}

function CommunityBar({ item }: { item: FeedItem }) {
  const feedback = normaliseFeedback(item.public_feedback);
  if (!feedback?.feedback_count) return null;

  const total =
    (feedback.support_count ?? 0) +
    (feedback.oppose_count ?? 0) +
    (feedback.neutral_count ?? 0);
  const supportPct = total > 0 ? (feedback.support_count ?? 0) / total : 0;
  const opposePct = total > 0 ? (feedback.oppose_count ?? 0) / total : 0;
  const neutralPct = total > 0 ? (feedback.neutral_count ?? 0) / total : 0;

  const positions = (feedback.positions ?? [])
    .filter(
      (p) =>
        p &&
        p.stance &&
        ["oppose", "support", "neutral"].includes(p.sentiment ?? "")
    )
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 2);

  let dominant = "";
  if (total > 0) {
    if (opposePct >= supportPct && opposePct >= neutralPct)
      dominant = "mostly opposed";
    else if (supportPct > opposePct && supportPct >= neutralPct)
      dominant = "mostly support";
    else dominant = "mixed views";
  }

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {feedback.feedback_count} community letters
        </span>
        {dominant && (
          <span className="text-xs text-[var(--text-tertiary)]">
            — {dominant}
          </span>
        )}
      </div>

      {total > 0 && (
        <div
          className="flex h-1.5 w-full overflow-hidden rounded-full"
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
      )}

      {positions.length > 0 && (
        <ul className="mt-1 space-y-1">
          {positions.map((pos, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 text-xs text-[var(--text-secondary)]"
            >
              <span
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    pos.sentiment === "oppose"
                      ? "#D4726A"
                      : pos.sentiment === "support"
                      ? "#7BA887"
                      : "#B8B0A4",
                }}
                aria-hidden
              />
              <span>
                <span className="font-medium text-[var(--text-primary)]">
                  {pos.stance}
                </span>
                {pos.count > 0 && (
                  <span className="text-[var(--text-tertiary)]">
                    {" "}
                    (~{pos.count})
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SpotlightStory({ item }: { item: FeedItem }) {
  const { complexity } = useComplexity();

  const shortName = item.meetings?.municipalities?.short_name ?? "Unknown";
  const badgeClass = municipalityBadgeClass(shortName);
  const summary = getSummaryForComplexity(item, complexity);
  const headline = firstSentence(summary);

  const bylawNum = item.bylaw_number || extractBylawFromTitle(item.title ?? "");
  const anchor = bylawNum ? `#${shortName}_${bylawNum}` : `#${item.id}`;
  const ctaLabel = bylawNum ? "Read full thread" : "Read more";

  const impactText = isActionableImpact(item.impact)
    ? item.impact!.trim()
    : null;
  const highImpact = isHighImpact(item.impact);

  const feedback = normaliseFeedback(item.public_feedback);
  const hasCommunitySignal = (feedback?.feedback_count ?? 0) > 0;

  const catLabel =
    item.categories?.[0] ? categoryLabel(item.categories[0]) : null;

  return (
    <div className="px-4 py-4 sm:px-5">
      {/* Badges row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
        >
          {shortName}
        </span>
        {bylawNum && (
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-100/60 px-2 py-0.5 text-xs font-medium text-amber-700">
            Bylaw {bylawNum}
          </span>
        )}
        {!bylawNum && catLabel && (
          <span className="text-xs text-[var(--text-tertiary)]">{catLabel}</span>
        )}
      </div>

      {/* Headline */}
      <h3
        key={complexity}
        className="font-fraunces text-base font-semibold leading-snug text-[var(--text-primary)]"
        style={{ animation: "fade-in 0.15s ease-out" }}
      >
        {headline}
      </h3>

      {/* Impact callout — only for high-impact items without community letters */}
      {highImpact && !hasCommunitySignal && impactText && (
        <p className="mt-2 text-sm font-medium text-[var(--accent)]">
          {impactText}
        </p>
      )}

      {/* Community bar — replaces impact callout when there are letters */}
      {hasCommunitySignal && <CommunityBar item={item} />}

      {/* CTA */}
      <div className="mt-3">
        <Link
          href={anchor}
          className="text-sm font-medium text-[var(--accent)] hover:underline"
        >
          {ctaLabel} →
        </Link>
      </div>
    </div>
  );
}

export function Spotlight({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="animate-fade-in">
      <div className="rounded-xl border border-amber-200/60 bg-amber-50/40">
        {/* Header: label + reading level toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/40 px-4 py-3 sm:px-5">
          <h2 className="font-fraunces text-base font-semibold text-[var(--text-primary)]">
            Spotlight
          </h2>
          <ReadingLevelToggle />
        </div>

        {/* Stories */}
        <div className="divide-y divide-amber-200/40">
          {items.map((item) => (
            <SpotlightStory key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
