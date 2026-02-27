"use server";

import { createClient } from "@/lib/supabase/server";
import type { FeedItem, IssueGroup, MeetingWithItems } from "@/lib/feed";
import {
  groupItemsByMeeting,
  groupItemsByIssue,
  isActionableImpact,
  isHighImpact,
  normaliseFeedback,
  extractBylawFromTitle,
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
      headline,
      topic_label,
      key_stats,
      community_signal,
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

/** Score an item for spotlight selection.
 * NOTE: must be called before impact nullification so isHighImpact works. */
function spotlightScore(item: FeedItem, reactionCounts: Map<string, number>): number {
  let score = 0;
  const fb = normaliseFeedback(item.public_feedback);
  const impact = item.impact?.trim() ?? "";

  // Community voices — the strongest signal
  if (fb?.feedback_count) score += fb.feedback_count * 2;

  // Reactions
  score += (reactionCounts.get(item.id) ?? 0) * 5;

  // High-impact bonus (personal or financial)
  if (isHighImpact(impact)) score += 50;

  // Direct financial impact: "$" + a digit in the impact text
  if (impact.includes("$") && /\d/.test(impact)) score += 40;

  // Personally addressed ("Your ...")
  if (impact.startsWith("Your")) score += 30;

  // Deprioritise non-impactful items (these will NOT be nullified yet at scoring time)
  const impactLower = impact.toLowerCase();
  if (
    impactLower.startsWith("no direct impact") ||
    impactLower.startsWith("no immediate impact")
  )
    score -= 20;

  // Lightweight community signal — weighted by type, capped so service_delivery counts
  // (e.g. 1,306 calls) don't dominate over genuine community engagement
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
        score += 15;
        break;
      case "service_delivery":
        score += 15;
        break;
      default:
        score += 10;
    }
  }

  // Concrete data bonus
  if (Array.isArray(item.key_stats) && item.key_stats.length > 0) score += 10;

  return score;
}

/**
 * Select the top 1-2 editorially significant items for the Spotlight section.
 * Scored by: community letters + reactions×5 + high-impact bonus.
 * Only items from the last 30 days; bylaw thread siblings deduplicated.
 */
export async function getSpotlightItems(limit = 2): Promise<FeedItem[]> {
  const supabase = await createClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Find recent meetings
  const { data: recentMeetings } = await supabase
    .from("meetings")
    .select("id")
    .gte("date", cutoffStr);

  const meetingIds = (recentMeetings ?? []).map((m) => m.id);

  const selectCols = `
    id, title, summary, summary_simple, summary_expert,
    headline, topic_label, key_stats, community_signal,
    impact, category, categories, bylaw_number, meeting_id,
    public_feedback(id, feedback_count, sentiment_summary, support_count, oppose_count, neutral_count, positions),
    meetings!inner(id, date, title, municipality_id,
      municipalities(id, name, short_name)
    )
  `;

  let query = supabase.from("items").select(selectCols).limit(300);
  if (meetingIds.length > 0) {
    query = query.in("meeting_id", meetingIds);
  }

  const { data } = await query;
  if (!data?.length) return [];

  const items = data as unknown as FeedItem[];

  // Fetch reaction counts for scoring (before nullification so isHighImpact works correctly)
  const itemIds = items.map((i) => i.id);
  const { data: reactions } = await supabase
    .from("reactions")
    .select("item_id")
    .in("item_id", itemIds);

  const reactionCounts = new Map<string, number>();
  for (const r of reactions ?? []) {
    reactionCounts.set(r.item_id, (reactionCounts.get(r.item_id) ?? 0) + 1);
  }

  // Sort by score descending (uses raw impact text before nullification)
  items.sort((a, b) => spotlightScore(b, reactionCounts) - spotlightScore(a, reactionCounts));

  // Nullify non-actionable impacts after scoring (so UI never shows "No direct impact..." callouts)
  for (const item of items) {
    if (!isActionableImpact(item.impact)) item.impact = null;
  }

  // Pick top N, deduplicating bylaw thread siblings
  const selectedBylawKeys = new Set<string>();
  const spotlight: FeedItem[] = [];

  for (const item of items) {
    if (spotlight.length >= limit) break;
    const shortName = item.meetings?.municipalities?.short_name ?? "Unknown";
    const bylawNum = item.bylaw_number || extractBylawFromTitle(item.title ?? "");
    const bylawKey = bylawNum ? `${shortName}_${bylawNum}` : null;

    if (bylawKey && selectedBylawKeys.has(bylawKey)) continue;
    if (bylawKey) selectedBylawKeys.add(bylawKey);

    spotlight.push(item);
  }

  return spotlight;
}

export type HighlightItem = FeedItem;

/** Fetch curated highlights (is_significant) for "This Week" hero */
export async function getHighlights(limit = 5): Promise<HighlightItem[]> {
  const supabase = await createClient();

  const selectCols = `
    id, title, summary, summary_simple, summary_expert,
    headline, topic_label, key_stats, community_signal,
    impact, category, categories, is_significant, meeting_id,
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
