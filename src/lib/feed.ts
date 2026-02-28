export type FeedbackPosition = {
  stance: string;
  sentiment: "oppose" | "support" | "neutral";
  count: number;
  detail: string;
};

export type KeyStat = {
  label: string;
  value: string;
  type: "money" | "percentage" | "count" | "other";
};

export type CommunitySignalPosition = {
  label: string;
  detail: string;
  metric: string | null;
  stance: "support" | "oppose" | "neutral" | "finding";
};

export type CommunitySignal = {
  type:
    | "letters"
    | "survey"
    | "delegation"
    | "petition"
    | "public_hearing"
    | "engagement"
    | "service_delivery"
    | "other";
  participant_count: number | null;
  summary: string | null;
  sentiment: "mixed" | "mostly_support" | "mostly_oppose" | "neutral" | null;
  positions?: CommunitySignalPosition[] | null;
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
  headline?: string | null;
  topic_label?: string | null;
  key_stats?: KeyStat[] | null;
  community_signal?: CommunitySignal | null;
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
  /** AI-generated topic label (e.g. "Comox Zoning Update"), if available */
  topicLabel: string | null;
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
  { value: "parks_recreation", label: "Parks & Rec" },
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

/**
 * True when impact text is personal or financial: starts with "Your"/"If you"
 * or contains "$" or "%". Used to drive visual hierarchy and spotlight scoring.
 */
export function isHighImpact(impact: string | null | undefined): boolean {
  if (!impact) return false;
  const t = impact.trim();
  return (
    t.startsWith("Your") ||
    t.startsWith("If you") ||
    t.includes("$") ||
    t.includes("%")
  );
}

/** Pluralize a count + noun: pluralize(1, 'letter') → '1 letter'; pluralize(3, 'letter') → '3 letters' */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural ?? singular + "s"}`;
}

/** Items that appeared on the agenda but have no useful content */
export function isPlaceholderItem(item: FeedItem): boolean {
  const markers = [
    "no attached text",
    "no information about it",
    "placeholder",
    "no substantive discussion",
    "no details available",
    "appears on the agenda as a placeholder",
  ];
  const text = ((item.summary_simple || item.summary) ?? "").toLowerCase();
  return markers.some((m) => text.includes(m));
}

/** Client-side score for sorting items within meeting groups (no reactions needed). */
export function scoreItemForDisplay(item: FeedItem): number {
  let score = 0;
  const fb = normaliseFeedback(item.public_feedback);
  const impact = item.impact?.trim() ?? "";

  if (fb?.feedback_count) score += fb.feedback_count * 2;
  if (isHighImpact(impact)) score += 50;
  if (impact.includes("$") && /\d/.test(impact)) score += 40;
  if (impact.startsWith("Your")) score += 30;

  const impactLower = impact.toLowerCase();
  if (
    impactLower.startsWith("no direct impact") ||
    impactLower.startsWith("no immediate impact")
  )
    score -= 20;

  const signal = item.community_signal;
  if (signal) {
    const count = signal.participant_count ?? 0;
    switch (signal.type) {
      case "public_hearing":
      case "letters":
        score += Math.min(count, 100) + 25;
        break;
      case "survey":
      case "engagement":
        score += Math.min(count, 100) + 20;
        break;
      case "delegation":
      case "service_delivery":
        score += 15;
        break;
      default:
        score += 10;
    }
  }

  if (Array.isArray(item.key_stats) && item.key_stats.length > 0) score += 10;
  if (item.is_significant) score += 15;

  return score;
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
      topicLabel: mostRecent.topic_label ?? null,
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
 * Checks decision first (authoritative); falls back to summary only.
 * Never checks raw_content or description — too much PDF boilerplate noise.
 */
export function deriveReadingStatus(item: FeedItem): string {
  const decision = (item.decision ?? "").toLowerCase().trim();

  if (decision) {
    const hasFirst = decision.includes("first reading") || decision.includes("1st reading");
    const hasSecond = decision.includes("second reading") || decision.includes("2nd reading");
    const hasThird = decision.includes("third reading") || decision.includes("3rd reading");
    const hasAdopted = decision.includes("adopted") || decision.includes("finally passed");

    // "First & second reading" check must come before "Adopted" so a decision that
    // says "first and second reading … adopted as amended" doesn't falsely show "Adopted".
    if (
      decision.includes("first and second reading") ||
      decision.includes("1st and 2nd reading") ||
      decision.includes("first & second reading") ||
      decision.includes("initial readings") ||
      (hasFirst && hasSecond)
    ) return "First & second reading";

    // Adopted = third reading explicitly passed — but NOT if first/second stage is mentioned
    if (hasAdopted && !hasFirst && !hasSecond) {
      if (hasThird || !decision.includes("reading")) return "Adopted";
    }

    if (hasThird) return "Third reading";
    if (hasSecond) return "Second reading";
    if (hasFirst) return "First reading";
    if (decision.includes("public hearing")) return "Public hearing";
    if (decision.includes("received for information")) return "Received for information";
    if (decision.includes("referred") || decision.includes("referral")) return "Referred";
    if (decision.includes("tabled") || decision.includes("deferred")) return "Deferred";
  }

  // Fall through to summary only (never raw_content/description — too noisy)
  const summary = (item.summary ?? "").toLowerCase();
  if (summary) {
    if (summary.includes("public hearing")) return "Public hearing";
    if (summary.includes("third reading")) return "Third reading";
    if (
      summary.includes("initial readings") ||
      summary.includes("first and second reading") ||
      summary.includes("first & second reading")
    ) return "First & second reading";
    if (summary.includes("first reading")) return "First reading";
    if (summary.includes("referred") || summary.includes("referral")) return "Referred";
    if (summary.includes("received for information")) return "Received for information";
    if (summary.includes("tabled") || summary.includes("deferred")) return "Deferred";
  }

  // No recognised stage found — return empty so thread child rows show nothing in collapsed subtitle
  return "";
}

/**
 * Strip "Bylaw No. XXXX – " or "Bylaw No. XXXX Being '..." prefix from item titles
 * and fix title casing on the remaining descriptive text.
 * Examples:
 *   "Bylaw No. 2056 – Zoning Bylaw" → "Zoning Bylaw"
 *   "Bylaw No. 890 Being 'flood Hazard Area Land Use Management Bylaw No. 890, 2026'" → "Flood Hazard Area Land Use Management"
 */
export function cleanItemTitle(title: string): string {
  if (!title) return title;

  let cleaned = title
    // Strip "Bylaw No. XXXX – " or "Bylaw No. XXXX - " prefix (em-dash or hyphen)
    .replace(/^Bylaw No\.?\s*[\w-]+\s*[–\-]+\s*/i, "")
    // Strip "Being '" or 'Being "' prefix (e.g. Cumberland bylaw titles)
    .replace(/^Being\s+['"]?/i, "")
    // Strip trailing " Bylaw No. XXX, YYYY'" suffix
    .replace(/\s*Bylaw No\.?\s*[\w-]+,?\s*\d{4}'?\s*$/i, "")
    // Strip trailing ", YYYY'" remnant
    .replace(/,?\s*\d{4}'?\s*$/, "")
    .trim();

  if (!cleaned || cleaned === title) return title;

  // Capitalise first letter (fixes "flood Hazard" → "Flood Hazard")
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
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

const _MONTHS_RE = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";

/**
 * Produce a short, clean meeting group header name from a meeting object.
 * Strips date noise, normalises "meeting highlights" → "Highlights",
 * and prepends the municipality short name if not already present.
 * Examples:
 *   "Courtenay Council meeting highlights for February 11, 2026" → "Courtenay Council Highlights"
 *   "February 11, 2026 Strategic Planning Committee Meeting"     → "Comox Strategic Planning Committee Meeting"
 *   "CVRD Board Meeting – February 24, 2026"                    → "CVRD Board Meeting"
 *   "Council Meeting February 23, 2026"                         → "Cumberland Council Meeting"
 */
export function formatMeetingGroupHeader(meeting: FeedItem["meetings"]): string {
  const title = meeting?.title ?? "";
  const shortName = meeting?.municipalities?.short_name ?? "";

  const originalHasHighlights = /highlights/i.test(title);

  let cleaned = title
    // Leading "Month DD, YYYY " prefix
    .replace(new RegExp(`^${_MONTHS_RE}\\s+\\d{1,2}[,\\s]+\\d{4}\\s*`, "i"), "")
    // Trailing " – Month DD, YYYY" or " - Month DD, YYYY"
    .replace(new RegExp(`\\s*[–\\-]\\s*${_MONTHS_RE}\\s+\\d{1,2}[,\\s]+\\d{4}$`, "i"), "")
    // " for Month DD, YYYY" anywhere (Courtenay highlights style)
    .replace(new RegExp(`\\s*\\bfor\\s+${_MONTHS_RE}\\s+\\d{1,2}[,\\s]+\\d{4}\\b`, "i"), "")
    // Trailing bare "Month DD, YYYY" (Cumberland/Comox: "Council Meeting February 23, 2026")
    .replace(new RegExp(`\\s+${_MONTHS_RE}\\s+\\d{1,2}[,\\s]+\\d{4}$`, "i"), "")
    .trim();

  // Only normalise "meeting highlights" → "Highlights" when the original title contained "highlights"
  if (originalHasHighlights) {
    cleaned = cleaned.replace(/\bmeeting highlights\b/gi, "Highlights");
  }

  if (!cleaned) cleaned = "Council Meeting";

  // Prepend municipality short name if not already present
  if (shortName && !cleaned.toLowerCase().startsWith(shortName.toLowerCase())) {
    cleaned = `${shortName} ${cleaned}`;
  }

  return cleaned;
}

/**
 * Strip date noise from a meeting title for use as a compact thread child header label.
 * Unlike formatMeetingGroupHeader, this REMOVES the municipality prefix (since
 * thread child cards show the municipality badge separately).
 * Also strips trailing bare dates like "Council Meeting February 23, 2026".
 * Examples:
 *   "February 18, 2026 Regular Council Meeting" → "Regular Council Meeting"
 *   "CVRD Board Meeting – February 24, 2026"    → "Board Meeting"
 *   "Council Meeting February 23, 2026"          → "Council Meeting"
 *   "Courtenay Regular Council Meeting"          → "Regular Council Meeting"
 */
export function cleanMeetingTitle(title: string): string {
  return title
    // Leading "Month DD, YYYY " prefix
    .replace(new RegExp(`^${_MONTHS_RE}\\s+\\d{1,2}[,\\s]+\\d{4}\\s*`, "i"), "")
    // Trailing " – Month DD, YYYY" or " - Month DD, YYYY"
    .replace(new RegExp(`\\s*[–\\-]\\s*${_MONTHS_RE}\\s+\\d{1,2}[,\\s]+\\d{4}$`, "i"), "")
    // " for Month DD, YYYY" anywhere (Courtenay highlights style)
    .replace(new RegExp(`\\s*\\bfor\\s+${_MONTHS_RE}\\s+\\d{1,2}[,\\s]+\\d{4}\\b`, "i"), "")
    // Trailing bare "Month DD, YYYY" without separator (Cumberland: "Council Meeting February 23, 2026")
    .replace(new RegExp(`\\s+${_MONTHS_RE}\\s+\\d{1,2}[,\\s]+\\d{4}$`, "i"), "")
    // Leading municipality name + optional separator
    .replace(/^(?:Courtenay|Comox|CVRD|Cumberland)\s*(?:[–\-]\s*)?/i, "")
    // Leading "– " or "- " remnants
    .replace(/^[–\-]\s*/, "")
    .trim();
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
