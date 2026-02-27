"use server";

import { createClient } from "@/lib/supabase/server";
import type { FeedItem, IssueGroup, MeetingWithItems } from "@/lib/feed";
import {
  groupItemsByMeeting,
  groupItemsByIssue,
  isActionableImpact,
  normaliseFeedback,
} from "@/lib/feed";

export type FetchFilteredItemsResult = {
  issueGroups: IssueGroup[];
  standaloneGroups: MeetingWithItems[];
  dbEmpty: boolean;
};

export async function fetchFilteredItems(params: {
  search?: string | null;
  municipality?: string | null;
  category?: string | null;
  sort?: string | null;
}): Promise<FetchFilteredItemsResult> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true });

  if (count === 0) {
    return { issueGroups: [], standaloneGroups: [], dbEmpty: true };
  }

  let meetingIds: string[] | null = null;
  if (params.municipality && params.municipality !== "all") {
    const { data: mun } = await supabase
      .from("municipalities")
      .select("id")
      .eq("short_name", params.municipality)
      .single();
    if (!mun) return { issueGroups: [], standaloneGroups: [], dbEmpty: false };
    const { data: meetings } = await supabase
      .from("meetings")
      .select("id")
      .eq("municipality_id", mun.id);
    meetingIds = (meetings ?? []).map((m) => m.id);
    if (meetingIds.length === 0) return { issueGroups: [], standaloneGroups: [], dbEmpty: false };
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
    query = query.contains("categories", [params.category]);
  }

  const { data, error } = await query;

  if (error) throw error;

  const items = (data ?? []) as unknown as FeedItem[];

  // Nullify non-actionable impact server-side so SSR HTML never contains them
  for (const item of items) {
    if (!isActionableImpact(item.impact)) item.impact = null;
  }

  // Default sort: most recent meeting first
  items.sort((a, b) => {
    const dateA = a.meetings?.date ?? "";
    const dateB = b.meetings?.date ?? "";
    return dateB.localeCompare(dateA);
  });

  const { issueGroups, standaloneItems } = groupItemsByIssue(items);

  // "Hot" sort: order by community engagement (public feedback count)
  if (params.sort === "hot") {
    issueGroups.sort(
      (a, b) =>
        b.totalFeedbackCount - a.totalFeedbackCount ||
        b.latestDate.localeCompare(a.latestDate)
    );
    standaloneItems.sort((a, b) => {
      const aCount = normaliseFeedback(a.public_feedback)?.feedback_count ?? 0;
      const bCount = normaliseFeedback(b.public_feedback)?.feedback_count ?? 0;
      return (
        bCount - aCount ||
        (b.meetings?.date ?? "").localeCompare(a.meetings?.date ?? "")
      );
    });
  }

  const standaloneGroups = groupItemsByMeeting(standaloneItems);

  return { issueGroups, standaloneGroups, dbEmpty: false };
}

export type HighlightItem = FeedItem;

/** Fetch curated highlights (is_significant) for "This Week" hero */
export async function getHighlights(limit = 5): Promise<HighlightItem[]> {
  const supabase = await createClient();

  const selectCols = `
    id, title, summary, summary_simple, summary_expert, impact, category, categories,
    is_significant, meeting_id,
    meetings!inner(id, date, title, municipality_id,
      municipalities(id, name, short_name)
    )
  `;

  // Fetch a larger candidate pool — no DB-level ordering on joined columns,
  // so we fetch many and sort/slice in JS to get the most recent `limit` items.
  const CANDIDATE_LIMIT = limit * 8;

  let { data } = await supabase
    .from("items")
    .select(selectCols)
    .eq("is_significant", true)
    .not("impact", "is", null)
    .limit(CANDIDATE_LIMIT);

  // Fallback: any significant items regardless of impact text
  if (!data?.length) {
    const { data: fallback } = await supabase
      .from("items")
      .select(selectCols)
      .eq("is_significant", true)
      .limit(CANDIDATE_LIMIT);
    data = fallback;
  }

  if (!data?.length) return [];

  const items = data as unknown as HighlightItem[];

  for (const item of items) {
    if (!isActionableImpact(item.impact)) item.impact = null;
  }

  // Sort by meeting date descending so the most recent items surface first
  items.sort((a, b) => {
    const dateA = a.meetings?.date ?? "";
    const dateB = b.meetings?.date ?? "";
    return dateB.localeCompare(dateA);
  });

  return items.slice(0, limit);
}
