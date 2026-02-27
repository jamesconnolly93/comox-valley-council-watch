"use client";

import { useState } from "react";
import Link from "next/link";
import type { FeedItem } from "@/lib/feed";
import {
  categoryLabel,
  isActionableImpact,
  municipalityBadgeClass,
  normaliseFeedback,
  deriveReadingStatus,
  formatMeetingDate,
} from "@/lib/feed";
import { useComplexity } from "@/lib/complexity-context";
import { CommunityVoices } from "./CommunityVoices";
import { ReactionButton } from "./ReactionButton";

const TAG_LIMIT = 5;

function formatTag(tag: string): string {
  return tag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanContent(text: string, title: string): string {
  if (!text) return "";
  let result = text
    .replace(
      /\w+ \d{1,2},?\s*\d{4},?\s*(?:Regular |Strategic )?(?:Council |Planning )?(?:Meeting|Committee)\s*(?:Agenda|Meeting)?(?:\s*Page)?\s*\d*/gi,
      ""
    )
    .replace(
      /Town of Comox\s+Bylaw No\.\s*\d+\s*[–-]\s*[^\n]+Page\s*\d+/gi,
      ""
    )
    .replace(/^[.\s…]{10,}$/gm, "")
    .replace(/STRATEGIC PLAN LINKAGE[\s\S]*?(?=\n\n|\n[A-Z])/gi, "")
    .replace(/Strategic Priority\s+Areas of Focus[\s\S]*?(?=\n\n)/gi, "")
    .replace(/Core Services\s*•[^\n]*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (title.trim()) {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result
      .replace(new RegExp(`^${escapedTitle}\\s*$`, "gmi"), "")
      .trim();
  }
  return result;
}

function isContentRedundant(
  summary: string | null,
  expanded: string | null,
  title: string
): boolean {
  if (!summary || !expanded) return false;
  const cleaned = cleanContent(expanded, title);
  if (cleaned.length < 80) return true;
  const summaryLen = summary.trim().length;
  const expandedLen = cleaned.length;
  if (summaryLen > 0 && expandedLen < summaryLen * 1.5) return true;
  const normalize = (s: string) =>
    s.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);
  const a = normalize(summary);
  const b = normalize(cleaned);
  if (a.length < 40 || b.length < 40) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function getSummaryForComplexity(
  item: FeedItem,
  complexity: "simple" | "standard" | "expert"
): string {
  const fallback =
    item.summary ?? item.description?.slice(0, 200) ?? "No summary available.";
  if (complexity === "simple" && item.summary_simple?.trim())
    return item.summary_simple.trim();
  if (complexity === "expert" && item.summary_expert?.trim())
    return item.summary_expert.trim();
  return item.summary?.trim() || fallback;
}

/** First sentence of impact text for collapsed preview */
function firstSentence(text: string): string {
  const m = text.match(/^[^.!?]+[.!?]/);
  return m ? m[0].trim() : text.slice(0, 120).trim();
}

// ---- Icons ----

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
        expanded ? "rotate-180" : ""
      }`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
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

function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
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
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" x2="12" y1="2" y2="15" />
    </svg>
  );
}

function SpeechBubbleSmall({ className }: { className?: string }) {
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

export function ItemCard({
  item,
  showMeetingMeta = true,
  isThreadChild = false,
}: {
  item: FeedItem;
  showMeetingMeta?: boolean;
  isThreadChild?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { complexity } = useComplexity();
  const shortName = item.meetings?.municipalities?.short_name ?? "Unknown";
  const badgeClass = municipalityBadgeClass(shortName);
  const feedback = normaliseFeedback(item.public_feedback);
  const feedbackCount = feedback?.feedback_count ?? 0;

  const categories = item.categories ?? (item.category ? [item.category] : []);
  const tags = item.tags ?? [];
  const visibleTags = tags.slice(0, TAG_LIMIT);
  const remaining = tags.length - TAG_LIMIT;

  const displaySummary = getSummaryForComplexity(item, complexity);
  const expandedContent = item.raw_content || item.description || "";
  const isRedundant = isContentRedundant(
    displaySummary,
    expandedContent,
    item.title || ""
  );
  const hasExpandableContent = !!expandedContent && !isRedundant;

  const impactText = isActionableImpact(item.impact) ? item.impact!.trim() : null;

  // What shows in the collapsed subtitle row
  const collapsedSubtitle = isThreadChild
    ? deriveReadingStatus(item)
    : impactText
    ? firstSentence(impactText)
    : null;

  // Primary label for thread child collapsed row (date + meeting title)
  const meetingDateLabel = formatMeetingDate(item.meetings?.date);
  const meetingTitle = item.meetings?.title;
  const threadPrimaryLabel = meetingTitle
    ? `${meetingDateLabel} — ${meetingTitle}`
    : meetingDateLabel;

  return (
    <article
      id={item.id}
      className={`group relative scroll-mt-24 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm transition-shadow duration-200 hover:shadow-md ${
        item.is_significant && !isThreadChild ? "border-amber-200/60" : ""
      }`}
    >
      {/* Collapsed header — always visible */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) =>
          (e.key === "Enter" || e.key === " ") && setExpanded((v) => !v)
        }
        className="flex cursor-pointer flex-col gap-1 px-4 py-3 select-none"
      >
        {/* Row 1: badge + title/date + star + chevron */}
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
          >
            {shortName}
          </span>

          <div className="min-w-0 flex-1 overflow-hidden">
            {isThreadChild ? (
              <span className="block truncate text-sm font-medium text-[var(--text-secondary)]">
                {threadPrimaryLabel}
              </span>
            ) : (
              <h3 className="truncate font-fraunces text-base font-semibold leading-snug text-[var(--text-primary)]">
                {item.title}
              </h3>
            )}
          </div>

          {item.is_significant && !isThreadChild && (
            <StarIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          )}
          <ChevronIcon expanded={expanded} />
        </div>

        {/* Row 2: subtitle + community badge */}
        {(collapsedSubtitle || feedbackCount > 0) && (
          <div className="flex min-w-0 items-center gap-3">
            {collapsedSubtitle && (
              <span
                className={`min-w-0 flex-1 truncate text-sm ${
                  isThreadChild
                    ? "font-medium text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                {collapsedSubtitle}
              </span>
            )}
            {feedbackCount > 0 && (
              <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-[var(--text-tertiary)]">
                <SpeechBubbleSmall className="h-3 w-3" />
                {feedbackCount} letters
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expanded body — grid-row animation */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[var(--border)] px-4 pb-4 pt-4 space-y-3">
            {/* Impact callout (regular cards only) */}
            {!isThreadChild && impactText && (
              <div className="flex items-start gap-1.5">
                <UserIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                <p className="text-sm font-medium text-[var(--accent)]">
                  {impactText}
                </p>
              </div>
            )}

            {/* Summary */}
            <p
              key={complexity}
              className="leading-relaxed text-[var(--text-secondary)]"
              style={{ animation: "fade-in 0.15s ease-out" }}
            >
              {displaySummary}
            </p>

            {/* Raw content (when not redundant with summary) */}
            {hasExpandableContent && (
              <div className="rounded-lg bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-secondary)]">
                <h4 className="mb-2 font-medium text-[var(--text-primary)]">
                  Full description
                </h4>
                <div className="whitespace-pre-wrap leading-relaxed">
                  {cleanContent(expandedContent, item.title || "")}
                </div>
              </div>
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
                      {item.decision}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Reaction button */}
            <div onClick={(e) => e.stopPropagation()}>
              <ReactionButton itemId={item.id} />
            </div>

            {/* Community Voices */}
            {feedback && <CommunityVoices data={feedback} />}

            {/* Category + tag pills */}
            {(categories.length > 0 || tags.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {categories.map((cat, i) => (
                  <span
                    key={cat}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      i === 0
                        ? "bg-[var(--accent-light)] text-[var(--accent)]"
                        : "bg-[var(--surface-elevated)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {categoryLabel(cat)}
                  </span>
                ))}
                {visibleTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 text-xs text-[var(--text-tertiary)]"
                  >
                    {formatTag(tag)}
                  </span>
                ))}
                {remaining > 0 && (
                  <span className="text-xs text-[var(--text-tertiary)]">
                    +{remaining} more
                  </span>
                )}
              </div>
            )}

            {/* Share link */}
            <div className="flex justify-end">
              <Link
                href={`/item/${item.id}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]"
                title="Share this item"
              >
                <ShareIcon className="h-3.5 w-3.5" />
                Share
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
