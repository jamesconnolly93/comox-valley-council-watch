"use client";

import { useState } from "react";
import type { FeedItem } from "@/lib/feed";
import { categoryLabel } from "@/lib/feed";
import { useComplexity } from "@/lib/complexity-context";

const TAG_LIMIT = 5;

/** Humanize tag for display: development_cost_charges → Development Cost Charges */
function formatTag(tag: string): string {
  return tag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Cleans raw PDF extraction artifacts from description/raw_content before display */
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
    result = result.replace(
      new RegExp(`^${escapedTitle}\\s*$`, "gmi"),
      ""
    ).trim();
  }
  return result;
}

/** Returns true if expanded content is redundant (don't show expand) */
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
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .slice(0, 100);
  const a = normalize(summary);
  const b = normalize(cleaned);
  if (a.length < 40 || b.length < 40) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

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
      className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
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

function getSummaryForComplexity(
  item: FeedItem,
  complexity: "simple" | "standard" | "expert"
): string {
  const fallback = item.summary ?? item.description?.slice(0, 200) ?? "No summary available.";
  if (complexity === "simple" && item.summary_simple?.trim()) {
    return item.summary_simple.trim();
  }
  if (complexity === "expert" && item.summary_expert?.trim()) {
    return item.summary_expert.trim();
  }
  return item.summary?.trim() || fallback;
}

export function ItemCard({
  item,
  showMeetingMeta = true,
}: {
  item: FeedItem;
  showMeetingMeta?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { complexity } = useComplexity();
  const shortName = item.meetings?.municipalities?.short_name ?? "Unknown";

  const badgeClass =
    shortName === "Courtenay"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : shortName === "Comox"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-amber-50 text-amber-700 border-amber-200";

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
  const hasExpandableContent =
    !!expandedContent && !isRedundant;
  const hasMore =
    hasExpandableContent ||
    (!!item.decision && item.decision.length > 120);

  return (
    <article
      onClick={() => hasMore && setExpanded((e) => !e)}
      className={`group relative rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition-all duration-200 hover:shadow-md ${
        item.is_significant ? "bg-[var(--highlight)]/30" : ""
      } ${hasMore ? "cursor-pointer" : ""}`}
    >
      {item.is_significant && (
        <div className="absolute right-4 top-4 text-amber-500">
          <StarIcon className="h-5 w-5" />
        </div>
      )}

      {item.impact?.trim() && (
        <div className="mb-2 flex items-start gap-1.5">
          <UserIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
          <p className="truncate text-sm font-medium text-[var(--accent)] sm:max-w-none sm:overflow-visible sm:whitespace-normal">
            {item.impact.trim()}
          </p>
        </div>
      )}

      {showMeetingMeta && (
        <div className="mb-3">
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
          >
            {shortName}
          </span>
        </div>
      )}

      <h3
        className={`font-fraunces text-lg font-semibold text-[var(--text-primary)] ${showMeetingMeta ? "" : ""}`}
      >
        {item.title}
      </h3>

      <p
        key={complexity}
        className="mt-2 leading-relaxed text-[var(--text-secondary)] transition-opacity duration-150"
        style={{ animation: "fade-in 0.15s ease-out" }}
      >
        {displaySummary}
      </p>

      {item.decision && (
        <div className="mt-3 rounded-lg border-l-2 border-[var(--accent)] bg-[var(--accent-light)]/50 py-2 pl-3 pr-3">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 shrink-0 text-[var(--accent)]">
              <GavelIcon className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-medium text-[var(--accent)]">
                Decision
              </span>
              <p className="mt-0.5 text-sm italic text-[var(--text-primary)]">
                {expanded || item.decision.length <= 120
                  ? item.decision
                  : `${item.decision.slice(0, 120)}…`}
              </p>
            </div>
          </div>
        </div>
      )}

      {expanded && hasExpandableContent && (
        <div
          className="mt-4 overflow-hidden rounded-lg bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-secondary)]"
          style={{ animation: "fade-in 0.2s ease-out" }}
        >
          <h4 className="mb-2 font-medium text-[var(--text-primary)]">
            Full description
          </h4>
          <div className="whitespace-pre-wrap leading-relaxed">
            {cleanContent(expandedContent, item.title || "")}
          </div>
        </div>
      )}

      {(categories.length > 0 || tags.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
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

      {hasMore && (
        <div className="mt-3 flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
          <ChevronIcon expanded={expanded} />
          <span>{expanded ? "Collapse" : "Expand"}</span>
        </div>
      )}
    </article>
  );
}
