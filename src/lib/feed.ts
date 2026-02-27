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
  /** Populated server-side when older meetings discussed the same bylaw */
  bylawHistory?: Array<{ date: string; meetingTitle: string | null; meetingId: string }>;
  meeting_id: string;
  public_feedback?: PublicFeedbackRow | null;
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
    case "Comox": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "CVRD": return "bg-amber-50 text-amber-700 border-amber-200";
    case "Cumberland": return "bg-violet-50 text-violet-700 border-violet-200";
    default: return "bg-gray-50 text-gray-700 border-gray-200";
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
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  if (month < 1 || month > 12) return "";
  return `${months[month - 1]} ${day}, ${year}`;
}
