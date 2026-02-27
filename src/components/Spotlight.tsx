"use client";

import Link from "next/link";
import type { FeedItem, KeyStat, CommunitySignal } from "@/lib/feed";
import {
  isActionableImpact,
  municipalityBadgeClass,
  normaliseFeedback,
  categoryLabel,
  extractBylawFromTitle,
} from "@/lib/feed";
import { useComplexity } from "@/lib/complexity-context";
import { StructuredFindings } from "./StructuredFindings";

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

/**
 * Abbreviation-safe first-sentence extractor.
 * Protects "Bylaw No.", "Dr.", "St." etc. from false splits.
 */
function getFirstSentence(text: string): string {
  if (!text) return "";
  // Replace known abbreviations with a protected form (zero-width space before the period)
  const guarded = text
    .replace(/\bNo\./g, "No\u200B.")
    .replace(/\bDr\./g, "Dr\u200B.")
    .replace(/\bSt\./g, "St\u200B.")
    .replace(/\bMr\./g, "Mr\u200B.")
    .replace(/\bMs\./g, "Ms\u200B.")
    .replace(/\bvs\./g, "vs\u200B.")
    .replace(/\be\.g\./g, "e\u200Bg.")
    .replace(/\bi\.e\./g, "i\u200Be.");
  // Split on sentence-ending punctuation followed by whitespace + uppercase letter
  const m = guarded.match(/^(.+?[.!?])\s+[A-Z]/);
  const sentence = m ? m[1] : guarded.slice(0, 200);
  // Remove zero-width spaces and trim
  return sentence.replace(/\u200B/g, "").trim();
}

/** Derive the static editorial headline with fallback chain */
function deriveHeadline(item: FeedItem): string {
  if (item.headline?.trim()) return item.headline.trim();
  const impactText = isActionableImpact(item.impact) ? item.impact!.trim() : null;
  if (impactText) return impactText;
  return getFirstSentence(item.summary ?? item.description?.slice(0, 200) ?? item.title ?? "")
    || (item.title ?? "");
}

/**
 * The complexity-aware summary sentence shown in Line 3.
 * Changes with reading level; animates on transition.
 */
function getSummaryLine(item: FeedItem, complexity: "simple" | "standard" | "expert"): string {
  const summary = getSummaryForComplexity(item, complexity);
  return getFirstSentence(summary) || (item.summary ?? "").slice(0, 200);
}

function statPillClass(type: KeyStat["type"]): string {
  switch (type) {
    case "money":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "percentage":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "count":
      return "bg-blue-50 text-blue-700 border-blue-200";
    default:
      return "bg-[var(--surface-elevated)] text-[var(--text-secondary)] border-[var(--border)]";
  }
}


function CommunityBar({ feedback }: { feedback: NonNullable<ReturnType<typeof normaliseFeedback>> }) {
  if (!feedback.feedback_count) return null;

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
          <span className="text-xs text-[var(--text-tertiary)]">— {dominant}</span>
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
                  <span className="text-[var(--text-tertiary)]"> (~{pos.count})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LightweightSignal({ signal }: { signal: CommunitySignal }) {
  // If signal has structured positions, delegate to StructuredFindings
  const hasPositions = Array.isArray(signal.positions) && signal.positions.length > 0;
  return (
    <div className="mt-3">
      {hasPositions ? (
        <StructuredFindings signal={signal} />
      ) : signal.summary ? (
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">
            {signal.participant_count ? `${signal.participant_count.toLocaleString()} ` : ""}
            {signal.type === "survey"
              ? "survey respondents"
              : signal.type === "delegation"
              ? "delegations"
              : signal.type === "petition"
              ? "petition signatures"
              : signal.type === "service_delivery"
              ? "calls/events"
              : "participants"}
            :
          </span>{" "}
          {signal.summary}
        </p>
      ) : null}
    </div>
  );
}

function SpotlightStory({ item }: { item: FeedItem }) {
  const { complexity } = useComplexity();

  const shortName = item.meetings?.municipalities?.short_name ?? "Unknown";
  const badgeClass = municipalityBadgeClass(shortName);

  const headline = deriveHeadline(item);
  const impactText = isActionableImpact(item.impact) ? item.impact!.trim() : null;

  const bylawNum = item.bylaw_number || extractBylawFromTitle(item.title ?? "");
  const anchor = bylawNum ? `#${shortName}_${bylawNum}` : `#${item.id}`;
  const ctaLabel = bylawNum ? "Read full thread" : "Read more";

  const topicLabel =
    item.topic_label ??
    (bylawNum ? `Bylaw ${bylawNum}` : null) ??
    (item.categories?.[0] ? categoryLabel(item.categories[0]) : null);

  const keyStats: KeyStat[] = Array.isArray(item.key_stats) ? item.key_stats : [];
  const feedback = normaliseFeedback(item.public_feedback);
  const hasFeedback = (feedback?.feedback_count ?? 0) > 0;
  const signal: CommunitySignal | null = item.community_signal ?? null;

  const badgesRow = (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
        {shortName}
      </span>
      {topicLabel && (
        <span className="text-xs font-medium text-[var(--text-tertiary)]">{topicLabel}</span>
      )}
    </div>
  );

  const cta = (
    <div className="mt-3">
      <Link href={anchor} className="text-sm font-medium text-[var(--accent)] hover:underline">
        {ctaLabel} →
      </Link>
    </div>
  );

  // ── Simple: just headline + compact data (no summary paragraph) ──
  if (complexity === "simple") {
    return (
      <div className="px-4 py-3 sm:px-5">
        {badgesRow}
        <h3 className="font-fraunces text-lg font-semibold leading-snug text-[var(--text-primary)]">
          {headline}
        </h3>
        {/* Key stats as pills */}
        {keyStats.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {keyStats.map((stat, i) => (
              <span
                key={i}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statPillClass(stat.type)}`}
              >
                {stat.value} {stat.label}
              </span>
            ))}
          </div>
        )}
        {/* Compact community count */}
        {hasFeedback && feedback?.feedback_count ? (
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            {feedback.feedback_count} community letters
          </p>
        ) : signal?.participant_count ? (
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            {signal.participant_count.toLocaleString()} {signal.type === "survey" ? "survey responses" : "participants"}
          </p>
        ) : null}
        {cta}
      </div>
    );
  }

  // ── Expert: full summary (not just first sentence) + complete community section ──
  if (complexity === "expert") {
    const fullSummary = getSummaryForComplexity(item, "expert");
    return (
      <div className="px-4 py-4 sm:px-5">
        {badgesRow}
        <h3 className="font-fraunces text-lg font-semibold leading-snug text-[var(--text-primary)]">
          {headline}
        </h3>
        {impactText && (
          <p className="mt-1 text-sm font-medium text-[var(--accent)]">{impactText}</p>
        )}
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
          {fullSummary}
        </p>
        {keyStats.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {keyStats.map((stat, i) => (
              <span
                key={i}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statPillClass(stat.type)}`}
              >
                {stat.value} {stat.label}
              </span>
            ))}
          </div>
        )}
        {hasFeedback && feedback && <CommunityBar feedback={feedback} />}
        {!hasFeedback && signal && <LightweightSignal signal={signal} />}
        {cta}
      </div>
    );
  }

  // ── Standard (default): headline + impact + first-sentence summary ──
  const summaryLine = getSummaryLine(item, complexity);
  return (
    <div className="px-4 py-4 sm:px-5">
      {badgesRow}
      <h3 className="font-fraunces text-lg font-semibold leading-snug text-[var(--text-primary)]">
        {headline}
      </h3>
      {impactText && (
        <p className="mt-1 text-sm font-medium text-[var(--accent)]">{impactText}</p>
      )}
      <p
        key={complexity}
        className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]"
        style={{ animation: "fade-in 0.15s ease-out" }}
      >
        {summaryLine}
      </p>
      {keyStats.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {keyStats.map((stat, i) => (
            <span
              key={i}
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statPillClass(stat.type)}`}
            >
              {stat.value} {stat.label}
            </span>
          ))}
        </div>
      )}
      {hasFeedback && feedback && <CommunityBar feedback={feedback} />}
      {!hasFeedback && signal && <LightweightSignal signal={signal} />}
      {cta}
    </div>
  );
}

export function Spotlight({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="animate-fade-in">
      <div className="rounded-xl border border-amber-200/60 bg-amber-50/40">
        {/* Header */}
        <div className="border-b border-amber-200/40 px-4 py-3 sm:px-5">
          <h2 className="font-fraunces text-base font-semibold text-[var(--text-primary)]">
            Spotlight
          </h2>
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
