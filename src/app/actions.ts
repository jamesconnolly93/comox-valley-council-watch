"use server";

import { createClient } from "@/lib/supabase/server";
import type { FeedItem, MeetingWithItems } from "@/lib/feed";
import { groupItemsByMeeting, isActionableImpact } from "@/lib/feed";

/** Deduplicate bylaw items across meetings: keep most recent, attach history to it. */
function applyBylawDeduplication(items: FeedItem[]): FeedItem[] {
  const bylawGroups = new Map<string, FeedItem[]>();
  for (const item of items) {
    if (item.bylaw_number) {
      const existing = bylawGroups.get(item.bylaw_number);
      if (existing) existing.push(item);
      else bylawGroups.set(item.bylaw_number, [item]);
    }
  }

  const suppressedIds = new Set<string>();
  for (const group of bylawGroups.values()) {
    if (group.length < 2) continue;
    // Items are already sorted date-desc, so group[0] is the most recent
    const [mostRecent, ...older] = group;
    mostRecent.bylawHistory = older.map((item) => ({
      date: item.meetings?.date ?? "",
      meetingTitle: item.meetings?.title ?? null,
      meetingId: item.meeting_id,
    }));
    for (const item of older) suppressedIds.add(item.id);
  }

  return items.filter((item) => !suppressedIds.has(item.id));
}

export type FetchFilteredItemsResult = {
  groups: MeetingWithItems[];
  dbEmpty: boolean;
};

export async function fetchFilteredItems(params: {
  search?: string | null;
  municipality?: string | null;
  category?: string | null;
}): Promise<FetchFilteredItemsResult> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true });

  if (count === 0) {
    return { groups: [], dbEmpty: true };
  }

  let meetingIds: string[] | null = null;
  if (params.municipality && params.municipality !== "all") {
    const { data: mun } = await supabase
      .from("municipalities")
      .select("id")
      .eq("short_name", params.municipality)
      .single();
    if (!mun) return { groups: [], dbEmpty: false };
    const { data: meetings } = await supabase
      .from("meetings")
      .select("id")
      .eq("municipality_id", mun.id);
    meetingIds = (meetings ?? []).map((m) => m.id);
    if (meetingIds.length === 0) return { groups: [], dbEmpty: false };
  }

  let query = supabase
    .from("items")
    .select(
      `
      id,
      title,
      description,
      summary,
      summary_simple,
      summary_expert,
      category,
      tags,
      decision,
      impact,
      raw_content,
      is_significant,
      categories,
      bylaw_number,
      meeting_id,
      public_feedback (
        id,
        feedback_count,
        sentiment_summary,
        support_count,
        oppose_count,
        neutral_count,
        positions
      ),
      meetings!inner (
        id,
        date,
        title,
        municipality_id,
        municipalities!inner (
          id,
          name,
          short_name
        )
      )
    `
    );

  if (meetingIds) {
    query = query.in("meeting_id", meetingIds);
  }

  if (params.search?.trim()) {
    const searchTerm = params.search.trim();
    try {
      const { data: ftsData } = await supabase
        .from("items")
        .select("id")
        .textSearch("search_vector", searchTerm, { type: "websearch" });

      if (ftsData && ftsData.length > 0) {
        query = query.in("id", ftsData.map((r) => r.id));
      } else {
        const escaped = searchTerm.replace(/"/g, '\\"');
        const pattern = `%${escaped}%`;
        query = query.or(`title.ilike."${pattern}",summary.ilike."${pattern}"`);
      }
    } catch {
      const escaped = (params.search?.trim() ?? "").replace(/"/g, '\\"');
      const pattern = `%${escaped}%`;
      query = query.or(`title.ilike."${pattern}",summary.ilike."${pattern}"`);
    }
  }

  if (params.category && params.category !== "all") {
    // Match against categories array (all AI-assigned categories), not just primary category
    query = query.contains("categories", [params.category]);
  }

  const { data, error } = await query;

  if (error) throw error;

  const items = (data ?? []) as unknown as FeedItem[];

  // Nullify non-actionable impact server-side so SSR HTML never contains them
  for (const item of items) {
    if (!isActionableImpact(item.impact)) item.impact = null;
  }

  items.sort((a, b) => {
    const dateA = a.meetings?.date ?? "";
    const dateB = b.meetings?.date ?? "";
    const cmp = dateB.localeCompare(dateA);
    if (cmp !== 0) return cmp;
    return 0;
  });

  // Collapse older bylaw readings into the most recent card when viewing all municipalities
  const deduped =
    !params.municipality || params.municipality === "all"
      ? applyBylawDeduplication(items)
      : items;

  const groups = groupItemsByMeeting(deduped);

  return { groups, dbEmpty: false };
}

export type HighlightItem = FeedItem;

/** Fetch curated highlights (is_significant + actionable impact) for "This Week" hero */
export async function getHighlights(limit = 5): Promise<HighlightItem[]> {
  const supabase = await createClient();

  const selectCols = `
    id, title, summary, summary_simple, summary_expert, impact, category, categories,
    is_significant, meeting_id,
    meetings!inner(id, date, title, municipality_id,
      municipalities(id, name, short_name)
    )
  `;

  let { data } = await supabase
    .from("items")
    .select(selectCols)
    .eq("is_significant", true)
    .not("impact", "is", null)
    .limit(limit);

  if (!data || data.length < 3) {
    const { data: fallback } = await supabase
      .from("items")
      .select(selectCols)
      .eq("is_significant", true)
      .limit(limit);
    data = fallback;
  }

  if (!data || data.length < 3) return [];

  const items = data as unknown as HighlightItem[];

  for (const item of items) {
    if (!isActionableImpact(item.impact)) item.impact = null;
  }

  items.sort((a, b) => {
    const dateA = a.meetings?.date ?? "";
    const dateB = b.meetings?.date ?? "";
    return dateB.localeCompare(dateA);
  });

  return items.slice(0, limit);
}
