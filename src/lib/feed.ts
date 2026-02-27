export type FeedbackPosition = {
  stance: string;
  sentiment: "oppose" | "support" | "neutral";
  count: number;
  detail: string;
};

export type PublicFeedbackRow = {
  id: string;
  feedback_count: number | null;
  sentiment_summary: string | null;
  support_count: number | null;
  oppose_count: number | null;
  neutral_count: number | null;
  positions?: FeedbackPosition[] | null;
  themes?: string[] | null;
  raw_excerpts?: string[] | null;
};

export type FeedItem = {
  id: string;
  title: string;
  description: string | null;
  summary: string | null;
  summary_simple: string | null;
  summary_expert: string | null;
  category: string | null;
  categories: string[] | null;
  tags: string[] | null;
  decision: string | null;
  impact: string | null;
  raw_content: string | null;
  is_significant: boolean | null;
  bylaw_number?: string | null;
  meeting_id: string;
  public_feedback?: PublicFeedbackRow | PublicFeedbackRow[] | null;
  meetings: {
    id: string;
    date: string;
    title: string | null;
    municipality_id: string;
    municipalities: {
      id: string;
      name: string;
      short_name: string;
    } | null;
  } | null;
};

/** A bylaw/topic that has appeared in 2+ meetings — the "issue thread". */
export type IssueGroup = {
  /** Namespaced key: "{shortName}_{bylawNum}" */
  bylawKey: string;
  /** Bare bylaw number for display (e.g. "2056") */
  bylawNum: string;
  /** Title from the most recent item */
  title: string;
  /** All items, sorted date descending */
  items: FeedItem[];
  latestDate: string;
  /** All municipalities that discussed this bylaw (deduped) */
  municipalities: string[];
  /** Total public letters/feedback across all items in thread */
  totalFeedbackCount: number;
};

export type MeetingWithItems = {
  meeting: FeedItem["meetings"];
  items: FeedItem[];
};

export const MUNICIPALITIES = [
  { value: "all", label: "All" },
  { value: "Courtenay", label: "Courtenay" },
  { value: "Comox", label: "Comox" },
  { value: "CVRD", label: "CVRD" },
  { value: "Cumberland", label: "Cumberland" },
] as const;

export const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "development", label: "Development" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "finance", label: "Finance" },
  { value: "housing", label: "Housing" },
  { value: "environment", label: "Environment" },
  { value: "parks_recreation", label: "Parks & Recreation" },
  { value: "governance", label: "Governance" },
  { value: "community", label: "Community" },
  { value: "safety", label: "Safety" },
  { value: "other", label: "Other" },
] as const;

/** Tailwind classes for municipality badge pill */
export function municipalityBadgeClass(shortName: string): string {
  switch (shortName) {
    case "Courtenay": return "bg-blue-50 text-blue-700 border-blue-200";
    case "Comox":     return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "CVRD":      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Cumberland":return "bg-violet-50 text-violet-700 border-violet-200";
    default:          return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

export function categoryLabel(slug: string): string {
  const c = CATEGORIES.find((x) => x.value === slug);
  return c?.label ?? slug;
}

/** Only show impactful callouts; hide generic "no impact" variants */
export function isActionableImpact(impact: string | null | undefined): boolean {
  if (!impact) return false;
  const normalized = impact.trim().toLowerCase();
  if (normalized.startsWith("no direct impact")) return false;
  if (normalized.startsWith("no immediate impact")) return false;
  if (normalized.startsWith("no impact")) return false;
  return true;
}

/**
 * Extract a bare bylaw number from a title string.
 * Handles: "Bylaw No. 2056", "Bylaw No. 2056 –", "Bylaw 2025-3"
 */
export function extractBylawFromTitle(title: string): string | null {
  const m = title.match(/Bylaw\s+No\.?\s*(\d[\w-]*)/i);
  return m?.[1] ?? null;
}

/** Helper to normalise public_feedback regardless of whether it's array or object */
export function normaliseFeedback(
  pf: FeedItem["public_feedback"]
): PublicFeedbackRow | null {
  if (!pf) return null;
  return Array.isArray(pf) ? (pf[0] ?? null) : pf;
}

/**
 * Separate items into issue threads (bylaw appears in 2+ meetings) and
 * standalone items (no bylaw match or only one meeting for that bylaw).
 * Bylaws are scoped per municipality so e.g. Comox Bylaw 50 ≠ Courtenay Bylaw 50.
 */
export function groupItemsByIssue(items: FeedItem[]): {
  issueGroups: IssueGroup[];
  standaloneItems: FeedItem[];
} {
  const bylawMap = new Map<string, FeedItem[]>();

  for (const item of items) {
    const shortName = item.meetings?.municipalities?.short_name ?? "Unknown";
    const bylawNum = item.bylaw_number || extractBylawFromTitle(item.title ?? "");
    if (!bylawNum) continue;
    const key = `${shortName}_${bylawNum}`;
    const existing = bylawMap.get(key);
    if (existing) existing.push(item);
    else bylawMap.set(key, [item]);
  }

  const threadedIds = new Set<string>();
  const issueGroups: IssueGroup[] = [];

  for (const [bylawKey, groupItems] of bylawMap.entries()) {
    if (groupItems.length < 2) continue; // single occurrence → standalone

    groupItems.sort(
      (a, b) => (b.meetings?.date ?? "").localeCompare(a.meetings?.date ?? "")
    );

    const mostRecent = groupItems[0];
    const municipalities = [
      ...new Set(
        groupItems.map((i) => i.meetings?.municipalities?.short_name ?? "Unknown")
      ),
    ];
    const totalFeedbackCount = groupItems.reduce((sum, item) => {
      const pf = normaliseFeedback(item.public_feedback);
      return sum + (pf?.feedback_count ?? 0);
    }, 0);

    const bylawNum = bylawKey.replace(/^[^_]+_/, "");

    issueGroups.push({
      bylawKey,
      bylawNum,
      title: mostRecent.title,
      items: groupItems,
      latestDate: mostRecent.meetings?.date ?? "",
      municipalities,
      totalFeedbackCount,
    });

    for (const item of groupItems) threadedIds.add(item.id);
  }

  // Sort issue groups: most recently active first
  issueGroups.sort((a, b) => b.latestDate.localeCompare(a.latestDate));

  const standaloneItems = items.filter((item) => !threadedIds.has(item.id));

  return { issueGroups, standaloneItems };
}

export function groupItemsByMeeting(items: FeedItem[]): MeetingWithItems[] {
  const byMeeting = new Map<string, FeedItem[]>();
  const meetingOrder: string[] = [];

  for (const item of items) {
    const mid = item.meeting_id;
    if (!byMeeting.has(mid)) {
      byMeeting.set(mid, []);
      meetingOrder.push(mid);
    }
    byMeeting.get(mid)!.push(item);
  }

  return meetingOrder.map((mid) => {
    const meetingItems = byMeeting.get(mid) ?? [];
    return {
      meeting: meetingItems[0]?.meetings ?? null,
      items: meetingItems,
    };
  });
}

/**
 * Derive a short status string for a bylaw reading, used in thread child cards.
 * Checks decision, raw_content, description, and summary in order of reliability.
 */
export function deriveReadingStatus(item: FeedItem): string {
  const decision = (item.decision ?? "").toLowerCase();
  const raw = (item.raw_content ?? "").toLowerCase();
  const desc = (item.description ?? "").toLowerCase();
  const summary = (item.summary ?? "").toLowerCase();

  // Helper: search across a given text blob
  function check(t: string): string | null {
    if (!t) return null;
    // "Adopted" wins over just "third reading"
    if (
      (t.includes("third reading") || t.includes("3rd reading")) &&
      (t.includes("adopted") || t.includes("finally passed"))
    ) return "Adopted";
    if (t.includes("adopted") || t.includes("finally passed")) return "Adopted";
    if (t.includes("third reading") || t.includes("3rd reading")) return "Third reading";
    if (
      t.includes("first and second reading") ||
      t.includes("1st and 2nd reading") ||
      t.includes("first & second reading") ||
      t.includes("initial readings") ||
      (t.includes("first reading") && t.includes("second reading"))
    ) return "First & second reading";
    if (t.includes("second reading") || t.includes("2nd reading")) return "Second reading";
    if (t.includes("first reading") || t.includes("1st reading")) return "First reading";
    if (t.includes("public hearing")) return "Public hearing";
    if (t.includes("received for information")) return "Received for information";
    if (t.includes("referred") || t.includes("referral")) return "Referred";
    if (t.includes("tabled") || t.includes("deferred")) return "Deferred";
    return null;
  }

  return (
    check(decision) ??
    check(raw) ??
    check(desc) ??
    check(summary) ??
    (() => {
      const text = item.summary ?? item.description ?? "";
      return text.length > 80 ? text.slice(0, 80).trimEnd() + "\u2026" : text || item.title || "";
    })()
  );
}

/** Medium date: "Feb 18, 2026" — month abbreviation + day + year */
export function formatMeetingDateMedium(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const datePart = dateStr.slice(0, 10);
  const parts = datePart.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return "";
  const [year, month, day] = parts;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (month < 1 || month > 12) return "";
  return `${months[month - 1]} ${day}, ${year}`;
}

/** Abbreviated date for inline use, e.g. "Jan 21" */
export function formatMeetingDateShort(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const datePart = dateStr.slice(0, 10);
  const parts = datePart.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return "";
  const [, month, day] = parts;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (month < 1 || month > 12) return "";
  return `${months[month - 1]} ${day}`;
}

/** Parse YYYY-MM-DD directly to avoid timezone conversion (e.g. 2026-02-18 → February 18, 2026) */
export function formatMeetingDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const datePart = dateStr.slice(0, 10);
  const parts = datePart.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return "";
  const [year, month, day] = parts;
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  if (month < 1 || month > 12) return "";
  return `${months[month - 1]} ${day}, ${year}`;
}
