import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { FeedItem } from "@/lib/feed";
import { isActionableImpact, formatMeetingDate } from "@/lib/feed";
import { ItemCard } from "@/components/ItemCard";
import { ComplexityProviderWrapper } from "@/components/ComplexityProviderWrapper";
import Link from "next/link";

async function getItem(id: string): Promise<FeedItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select(
      `
      id, title, description, summary, summary_simple, summary_expert,
      category, categories, tags, decision, impact, raw_content,
      is_significant, bylaw_number, meeting_id,
      public_feedback (
        id, feedback_count, sentiment_summary,
        support_count, oppose_count, neutral_count, positions
      ),
      meetings!inner (
        id, date, title, municipality_id,
        municipalities!inner (id, name, short_name)
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !data) return null;

  const item = data as unknown as FeedItem;
  if (!isActionableImpact(item.impact)) item.impact = null;
  return item;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) return { title: "Item not found" };

  const municipality = item.meetings?.municipalities?.short_name ?? "Comox Valley";
  const description =
    item.summary ??
    item.description?.slice(0, 200) ??
    "Council agenda item from Comox Valley Council Watch";
  const title = `${item.title} — ${municipality} | Comox Valley Council Watch`;
  const ogImageUrl = `/item/${id}/opengraph-image`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/item/${id}`,
      siteName: "Comox Valley Council Watch",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: item.title }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const shortName = item.meetings?.municipalities?.short_name ?? "Unknown";
  const meetingDate = formatMeetingDate(item.meetings?.date);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface-elevated)]/80 backdrop-blur-sm">
        <div className="mx-auto max-w-[720px] px-5 py-5 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Back to feed
          </Link>
          <div className="mt-3">
            <p className="text-xs text-[var(--text-tertiary)]">
              {shortName} &middot; {meetingDate}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-5 py-8 sm:px-6">
        <ComplexityProviderWrapper>
          <ItemCard item={item} showMeetingMeta />
        </ComplexityProviderWrapper>
      </main>
    </div>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
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
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
