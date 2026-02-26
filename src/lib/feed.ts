export type FeedItem = {
  id: string;
  title: string;
  description: string | null;
  summary: string | null;
  category: string | null;
  categories: string[] | null;
  tags: string[] | null;
  decision: string | null;
  raw_content: string | null;
  is_significant: boolean | null;
  meeting_id: string;
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

export function categoryLabel(slug: string): string {
  const c = CATEGORIES.find((x) => x.value === slug);
  return c?.label ?? slug;
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
