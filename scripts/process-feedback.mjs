#!/usr/bin/env node
/**
 * Public Feedback Processor (Community Voices)
 *
 * For each meeting with raw_feedback, sends correspondence to Claude for
 * sentiment analysis. Matches feedback to items by related_bylaw_or_topic
 * and stores results in public_feedback.
 *
 * Usage: node scripts/process-feedback.mjs [--dry-run]
 * Env: LIMIT=N (default: no limit) - max meetings to process
 */

import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/supabase-admin.mjs";

const MODEL = "claude-sonnet-4-5-20250929";
const DELAY_MS = 500;

const FEEDBACK_PROMPT_BASE = `You are analyzing public correspondence submitted to a municipal council meeting in the Comox Valley, BC.

Extract 3-6 distinct POSITIONS that residents are taking. A position is a specific thing people want or oppose — not just a topic.

Good position: "Limit building heights to 3-4 storeys"
Bad position: "Building heights" (this is a topic, not a position)

Good position: "Require neighbourhood consultation before densification"
Bad position: "Inadequate public consultation" (too vague)

For each position, estimate how many letters express that view. Counts should roughly add up to the total (some letters express multiple positions).
Order positions by count, highest first.

Produce a JSON response:
{
  "feedback_count": <number of distinct letters/submissions>,
  "sentiment_summary": "<2-3 sentences summarizing the overall tone and key concerns. Start with the count. Be specific about what residents said.>",
  "support_count": <approximate number supporting the proposal>,
  "oppose_count": <approximate number opposing>,
  "neutral_count": <approximate number neutral or mixed>,
  "positions": [
    {
      "stance": "Short imperative describing what people want",
      "sentiment": "oppose" | "support" | "neutral",
      "count": 40,
      "detail": "One sentence explaining the argument behind this position. Be specific — mention street names, bylaw sections, comparisons residents made."
    }
  ],
  "related_bylaw_or_topic": "<the bylaw number or topic these letters are about, e.g. 'Bylaw 2056' or 'OCP'>"
}

Be factual and balanced. Do not editorialize. Paraphrase rather than quote directly.
Note: The text may contain page footers like "February 18, 2026 Regular Council MeetingPage 20-115" — ignore these.`;

const FEEDBACK_SAMPLE_CHARS = 40000;

function getFeedbackContentAndHint(rawFeedback) {
  if (!rawFeedback || typeof rawFeedback !== "string") {
    return { content: null, letterCountHint: "" };
  }
  let content;
  let letterCount = null;
  let maxPage = null;
  if (rawFeedback.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(rawFeedback);
      content =
        parsed.sample ??
        parsed.rawText?.slice(0, FEEDBACK_SAMPLE_CHARS) ??
        rawFeedback.slice(0, FEEDBACK_SAMPLE_CHARS);
      letterCount = parsed.letterCount;
      maxPage = parsed.maxPage;
    } catch {
      content = rawFeedback.slice(0, FEEDBACK_SAMPLE_CHARS);
    }
  } else {
    content = rawFeedback.slice(0, FEEDBACK_SAMPLE_CHARS);
  }
  const letterCountHint =
    letterCount != null && maxPage != null
      ? `\nThe public hearing correspondence spans ${maxPage} pages. Many submissions are scanned handwritten letters that cannot be extracted as text. Based on page count and markers, approximately ${letterCount} distinct submissions were received. Analyze the sentiment and themes from the readable text provided, and use the count estimate for feedback_count.\n`
      : letterCount != null
        ? `\nThe scraper identified approximately ${letterCount} distinct letters in this section. Use this as a baseline count but adjust if your analysis suggests a different number.\n`
        : "";
  return { content, letterCountHint };
}

function parseFeedbackResponse(raw) {
  let text = String(raw).trim();
  text = text.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  return JSON.parse(text);
}

function matchItemByBylawOrTopic(ref, items) {
  if (!ref || typeof ref !== "string") return null;
  const refTrim = ref.trim().toLowerCase();

  // Extract bylaw number if present
  const bylawNum = refTrim.match(/bylaw\s*(?:no\.?)?\s*(\d+)/i)?.[1];
  if (bylawNum) {
    for (const item of items) {
      const title = (item.title || "").toLowerCase();
      if (title.includes("bylaw") && title.includes(bylawNum)) return item;
    }
  }

  // Try partial match on topic (e.g. "OCP", "zoning")
  const topicWords = refTrim.split(/\s+/).filter((w) => w.length >= 2);
  for (const item of items) {
    const title = (item.title || "").toLowerCase();
    if (topicWords.some((w) => title.includes(w))) return item;
  }

  return null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = parseInt(process.env.LIMIT || "0", 10) || null;

  loadEnv();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not found. Add to .env.local");
  }

  const supabase = createAdminClient();
  const client = new Anthropic({ apiKey });

  let { data: meetings, error: meetErr } = await supabase
    .from("meetings")
    .select("id, date, raw_feedback")
    .not("raw_feedback", "is", null)
    .order("date", { ascending: false });

  if (meetErr) throw new Error(`Meetings query failed: ${meetErr.message}`);
  if (!meetings?.length) {
    console.error("No meetings with raw_feedback. Run: npm run scrape:comox");
    return;
  }

  if (limit) {
    meetings = meetings.slice(0, limit);
  }

  console.error(
    `Processing ${meetings.length} meeting(s) with raw_feedback${dryRun ? " [DRY RUN]" : ""}`
  );

  let success = 0;
  let failed = 0;

  for (const meeting of meetings) {
    const { data: items, error: itemsErr } = await supabase
      .from("items")
      .select("id, title")
      .eq("meeting_id", meeting.id);

    if (itemsErr || !items?.length) {
      console.error(`  Skipping meeting ${meeting.date}: no items`);
      continue;
    }

    console.error(`\nMeeting ${meeting.date} (${items.length} items)...`);

    try {
      const { content, letterCountHint } = getFeedbackContentAndHint(
        meeting.raw_feedback
      );
      if (!content) {
        console.error(`  No content for meeting ${meeting.id}, skipping`);
        continue;
      }

      const prompt = `${FEEDBACK_PROMPT_BASE}${letterCountHint}\n\n---\n\nCorrespondence/Public Input text:\n\n${content}`;

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content?.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text in response");
      }

      const parsed = parseFeedbackResponse(textBlock.text);
      const item = matchItemByBylawOrTopic(
        parsed.related_bylaw_or_topic ?? null,
        items
      ) ?? items[0];

      const positions =
        Array.isArray(parsed.positions) && parsed.positions.length > 0
          ? parsed.positions
              .filter(
                (p) =>
                  p &&
                  typeof p.stance === "string" &&
                  ["oppose", "support", "neutral"].includes(p.sentiment ?? "")
              )
              .map((p) => ({
                stance: String(p.stance).trim(),
                sentiment: p.sentiment,
                count: Math.max(0, Number(p.count) || 0),
                detail: String(p.detail ?? "").trim(),
              }))
          : null;

      const payload = {
        item_id: item.id,
        meeting_id: meeting.id,
        feedback_count: parsed.feedback_count ?? 0,
        sentiment_summary: parsed.sentiment_summary ?? null,
        support_count: parsed.support_count ?? 0,
        oppose_count: parsed.oppose_count ?? 0,
        neutral_count: parsed.neutral_count ?? 0,
        positions,
      };

      if (dryRun) {
        console.error(
          `  [DRY RUN] Would upsert public_feedback for item "${item.title}"`
        );
        console.error(`  feedback_count: ${payload.feedback_count}`);
        console.error(
          `  related_bylaw_or_topic: ${parsed.related_bylaw_or_topic ?? "(none)"}`
        );
      } else {
        const { data, error } = await supabase
          .from("public_feedback")
          .upsert(payload, { onConflict: "item_id" });
        console.log(
          "Upsert result:",
          JSON.stringify({
            data,
            error: error ? { message: error.message } : error,
          })
        );
      }

      success++;
    } catch (err) {
      failed++;
      console.error(`  → Error: ${err instanceof Error ? err.message : err}`);
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.error(
    `\nFeedback processing complete: ${success} processed, ${failed} failed.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
