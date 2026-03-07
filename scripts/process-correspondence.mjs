#!/usr/bin/env node
/**
 * Automated Correspondence Processor
 *
 * Finds items flagged with contains_correspondence = true that don't yet
 * have a public_feedback row. Downloads the meeting PDF, extracts the
 * correspondence section, and sends it to Claude for sentiment analysis.
 *
 * Falls back to the text-based approach (meetings.raw_feedback) when no
 * PDF is available.
 *
 * Usage: node scripts/process-correspondence.mjs [--dry-run]
 * Env: LIMIT=N
 */

import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/supabase-admin.mjs";
import { parseAiResponse } from "./lib/ai-prompt.mjs";
import {
  downloadPdf,
  getPageTexts,
  extractPages,
  findItemPages,
  findCorrespondencePages,
  clearPdfCache,
} from "./lib/pdf-utils.mjs";

const MODEL = "claude-sonnet-4-5-20250929";
const DELAY_MS = 1000;
const FEEDBACK_SAMPLE_CHARS = 40_000;

// Same prompt as process-feedback.mjs — reused verbatim
const CORRESPONDENCE_PROMPT = `You are analyzing public correspondence submitted to a municipal council meeting in the Comox Valley, BC.

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

const PDF_CORRESPONDENCE_PROMPT = `This PDF contains public correspondence/submissions about a municipal council item in the Comox Valley, BC.

Analyze ALL letters/submissions and return JSON:
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

Guidelines:
- Count every distinct submission (letter, email, form response)
- Group similar positions together and estimate how many submissions express each one
- Capture the top 3-6 most common positions
- Be specific about what residents want or oppose
- Be factual and balanced. Do not editorialize.`;

// ── Helpers ──────────────────────────────────────────────────────────

function groupByMeeting(items) {
  const map = new Map();
  for (const item of items) {
    const mid = item.meeting_id;
    if (!map.has(mid)) map.set(mid, []);
    map.get(mid).push(item);
  }
  return map;
}

function parseFeedbackResponse(raw) {
  let text = String(raw).trim();
  text = text.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  return JSON.parse(text);
}

/**
 * Match correspondence to a specific item within the meeting.
 * Same logic as process-feedback.mjs.
 */
function matchItemByBylawOrTopic(ref, items) {
  if (!ref || typeof ref !== "string") return null;
  const refTrim = ref.trim().toLowerCase();

  const bylawNum = refTrim.match(/bylaw\s*(?:no\.?)?\s*(\d+)/i)?.[1];
  if (bylawNum) {
    for (const item of items) {
      const title = (item.title || "").toLowerCase();
      if (title.includes("bylaw") && title.includes(bylawNum)) return item;
    }
  }

  const topicWords = refTrim.split(/\s+/).filter((w) => w.length >= 2);
  for (const item of items) {
    const title = (item.title || "").toLowerCase();
    if (topicWords.some((w) => title.includes(w))) return item;
  }

  return null;
}

function sanitisePositions(positions) {
  if (!Array.isArray(positions) || !positions.length) return null;
  return positions
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
    }));
}

// ── PDF-based correspondence processing ──────────────────────────────

async function processWithPdf(client, supabase, meetingId, meetingItems, agendaUrl, dryRun) {
  const municipality = meetingItems[0].meetings?.municipalities?.short_name || "Unknown";
  const isCvrd = municipality === "CVRD";

  let pdfBuffer;
  try {
    pdfBuffer = await downloadPdf(agendaUrl, { allowInsecureSsl: isCvrd });
  } catch (err) {
    console.error(`  PDF download failed: ${err.message}`);
    return false;
  }

  let pageTexts;
  try {
    pageTexts = await getPageTexts(pdfBuffer);
  } catch (err) {
    console.error(`  PDF text extraction failed: ${err.message}`);
    return false;
  }

  const corrPages = findCorrespondencePages(pageTexts);
  if (!corrPages) {
    console.error(`  No correspondence section found in PDF`);
    return false;
  }

  const { base64, pageCount } = await extractPages(
    pdfBuffer,
    corrPages.startPage,
    corrPages.endPage
  );

  console.error(
    `  Correspondence: pages ${corrPages.startPage + 1}-${corrPages.endPage + 1} (${pageCount} pages)`
  );

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          {
            type: "text",
            text: PDF_CORRESPONDENCE_PROMPT,
          },
        ],
      },
    ],
  });

  const textBlock = response.content?.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in Claude response");
  }

  const parsed = parseFeedbackResponse(textBlock.text);
  const targetItem =
    matchItemByBylawOrTopic(parsed.related_bylaw_or_topic ?? null, meetingItems) ??
    meetingItems[0];

  const payload = {
    item_id: targetItem.id,
    meeting_id: meetingId,
    feedback_count: parsed.feedback_count ?? 0,
    sentiment_summary: parsed.sentiment_summary ?? null,
    support_count: parsed.support_count ?? 0,
    oppose_count: parsed.oppose_count ?? 0,
    neutral_count: parsed.neutral_count ?? 0,
    positions: sanitisePositions(parsed.positions),
  };

  if (dryRun) {
    console.error(`  [DRY RUN] Would upsert public_feedback for "${targetItem.title}"`);
    console.error(`  feedback_count: ${payload.feedback_count}`);
    console.error(`  related: ${parsed.related_bylaw_or_topic ?? "(none)"}`);
  } else {
    const { error } = await supabase
      .from("public_feedback")
      .upsert(payload, { onConflict: "item_id" });
    if (error) console.error(`  public_feedback upsert error: ${error.message}`);

    // Store the correspondence attachment metadata
    const { error: attErr } = await supabase
      .from("attachments")
      .upsert(
        {
          item_id: targetItem.id,
          meeting_id: meetingId,
          url: agendaUrl,
          filename: `correspondence-${targetItem.id}.pdf`,
          attachment_type: "correspondence",
          page_start: corrPages.startPage + 1,
          page_end: corrPages.endPage + 1,
          page_count: pageCount,
          processed: true,
        },
        { onConflict: "item_id,attachment_type" }
      );
    if (attErr) console.error(`  Attachment upsert warning: ${attErr.message}`);
  }

  return true;
}

// ── PDF item-page fallback (extract item's pages, look for correspondence) ──

async function processItemPagesFromPdf(client, supabase, meetingId, meetingItems, agendaUrl, dryRun) {
  const municipality = meetingItems[0].meetings?.municipalities?.short_name || "Unknown";
  const isCvrd = municipality === "CVRD";

  let pdfBuffer;
  try {
    pdfBuffer = await downloadPdf(agendaUrl, { allowInsecureSsl: isCvrd });
  } catch (err) {
    console.error(`  PDF download failed: ${err.message}`);
    return false;
  }

  let pageTexts;
  try {
    pageTexts = await getPageTexts(pdfBuffer);
  } catch (err) {
    console.error(`  PDF text extraction failed: ${err.message}`);
    return false;
  }

  // Map each flagged item to its page range in the agenda
  const pageMap = findItemPages(pageTexts, meetingItems);
  if (!pageMap.size) {
    console.error(`  Could not map any items to PDF pages`);
    return false;
  }

  let anySuccess = false;

  for (const item of meetingItems) {
    const range = pageMap.get(item.id);
    if (!range) {
      console.error(`  Could not find pages for "${item.title?.slice(0, 50)}". Skipping.`);
      continue;
    }

    const label = `pages ${range.startPage + 1}-${range.endPage + 1}`;
    console.error(`  [PDF-ITEM] "${item.title?.slice(0, 50)}..." (${label})`);

    try {
      const { base64, pageCount } = await extractPages(
        pdfBuffer,
        range.startPage,
        range.endPage
      );

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              },
              {
                type: "text",
                text: `This PDF contains pages from a municipal council agenda item titled "${item.title}".

Examine these pages for any public correspondence, letters, submissions, or written feedback from residents. This may appear as a "RECEIVED LOG", "Written Submissions", "Public Input" section, or as individual letters addressed to Mayor/Council.

If public correspondence IS present, analyze ALL letters/submissions and return JSON:
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

Guidelines:
- Count every distinct submission (letter, email, form response)
- Group similar positions together and estimate how many submissions express each one
- Capture the top 3-6 most common positions
- Be specific about what residents want or oppose
- Be factual and balanced. Do not editorialize.

If NO public correspondence is found in these pages, return:
{"feedback_count": 0, "sentiment_summary": null, "support_count": 0, "oppose_count": 0, "neutral_count": 0, "positions": [], "related_bylaw_or_topic": null}`,
              },
            ],
          },
        ],
      });

      const textBlock = response.content?.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text in Claude response");
      }

      const parsed = parseFeedbackResponse(textBlock.text);

      // Skip if Claude found no correspondence in these pages
      if (!parsed.feedback_count || parsed.feedback_count === 0) {
        console.error(`    No correspondence found in item pages`);
        continue;
      }

      const payload = {
        item_id: item.id,
        meeting_id: meetingId,
        feedback_count: parsed.feedback_count ?? 0,
        sentiment_summary: parsed.sentiment_summary ?? null,
        support_count: parsed.support_count ?? 0,
        oppose_count: parsed.oppose_count ?? 0,
        neutral_count: parsed.neutral_count ?? 0,
        positions: sanitisePositions(parsed.positions),
      };

      if (dryRun) {
        console.error(`    [DRY RUN] Would upsert public_feedback for "${item.title}"`);
        console.error(`    feedback_count: ${payload.feedback_count}`);
      } else {
        const { error } = await supabase
          .from("public_feedback")
          .upsert(payload, { onConflict: "item_id" });
        if (error) console.error(`    public_feedback upsert error: ${error.message}`);
      }

      anySuccess = true;
    } catch (err) {
      console.error(`    Item-page processing failed: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  return anySuccess;
}

// ── Text-based fallback (uses meetings.raw_feedback) ─────────────────

async function processWithRawFeedback(client, supabase, meetingId, meetingItems, dryRun) {
  const { data: meeting } = await supabase
    .from("meetings")
    .select("raw_feedback")
    .eq("id", meetingId)
    .single();

  if (!meeting?.raw_feedback) {
    console.error(`  No raw_feedback text for meeting. Skipping.`);
    return false;
  }

  // Same content extraction as process-feedback.mjs
  let content;
  let letterCountHint = "";
  const raw = meeting.raw_feedback;

  if (typeof raw === "string" && raw.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      content =
        parsed.sample ??
        parsed.rawText?.slice(0, FEEDBACK_SAMPLE_CHARS) ??
        raw.slice(0, FEEDBACK_SAMPLE_CHARS);
      const lc = parsed.letterCount;
      const mp = parsed.maxPage;
      if (lc != null && mp != null) {
        letterCountHint = `\nThe public hearing correspondence spans ${mp} pages. Approximately ${lc} distinct submissions were received.\n`;
      } else if (lc != null) {
        letterCountHint = `\nApproximately ${lc} distinct letters were identified.\n`;
      }
    } catch {
      content = raw.slice(0, FEEDBACK_SAMPLE_CHARS);
    }
  } else {
    content = String(raw).slice(0, FEEDBACK_SAMPLE_CHARS);
  }

  if (!content) {
    console.error(`  Empty raw_feedback content. Skipping.`);
    return false;
  }

  console.error(`  Using text fallback (raw_feedback, ${content.length} chars)`);

  const prompt = `${CORRESPONDENCE_PROMPT}${letterCountHint}\n\n---\n\nCorrespondence/Public Input text:\n\n${content}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content?.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in Claude response");
  }

  const parsed = parseFeedbackResponse(textBlock.text);
  const targetItem =
    matchItemByBylawOrTopic(parsed.related_bylaw_or_topic ?? null, meetingItems) ??
    meetingItems[0];

  const payload = {
    item_id: targetItem.id,
    meeting_id: meetingId,
    feedback_count: parsed.feedback_count ?? 0,
    sentiment_summary: parsed.sentiment_summary ?? null,
    support_count: parsed.support_count ?? 0,
    oppose_count: parsed.oppose_count ?? 0,
    neutral_count: parsed.neutral_count ?? 0,
    positions: sanitisePositions(parsed.positions),
  };

  if (dryRun) {
    console.error(`  [DRY RUN] Would upsert public_feedback for "${targetItem.title}"`);
    console.error(`  feedback_count: ${payload.feedback_count}`);
  } else {
    const { error } = await supabase
      .from("public_feedback")
      .upsert(payload, { onConflict: "item_id" });
    if (error) console.error(`  public_feedback upsert error: ${error.message}`);
  }

  return true;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = parseInt(process.env.LIMIT || "0", 10) || null;

  loadEnv();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not found. Add to .env.local");

  const supabase = createAdminClient();
  const client = new Anthropic({ apiKey });

  // Find items flagged as containing correspondence
  const { data: items, error } = await supabase
    .from("items")
    .select(
      `id, title, meeting_id, bylaw_number,
       meetings!inner(id, agenda_url, municipality_id,
         municipalities!inner(short_name)
       )`
    )
    .eq("contains_correspondence", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Query failed: ${error.message}`);
  if (!items?.length) {
    console.error("No items flagged with contains_correspondence. Nothing to process.");
    return;
  }

  // Filter out items that already have public_feedback
  const { data: existingFeedback } = await supabase
    .from("public_feedback")
    .select("item_id")
    .in(
      "item_id",
      items.map((i) => i.id)
    );

  const processedIds = new Set((existingFeedback ?? []).map((f) => f.item_id));
  let toProcess = items.filter((i) => !processedIds.has(i.id));

  if (!toProcess.length) {
    console.error("All flagged items already have public_feedback records.");
    return;
  }

  if (limit) {
    toProcess = toProcess.slice(0, limit);
  }

  console.error(
    `Processing ${toProcess.length} item(s) with correspondence${dryRun ? " [DRY RUN]" : ""}`
  );

  const byMeeting = groupByMeeting(toProcess);
  let success = 0;
  let failed = 0;

  for (const [meetingId, meetingItems] of byMeeting) {
    const meeting = meetingItems[0].meetings;
    const agendaUrl = meeting?.agenda_url;
    const municipality = meeting?.municipalities?.short_name || "Unknown";

    console.error(
      `\nMeeting ${meetingId} (${municipality}, ${meetingItems.length} flagged items):`
    );

    let ok = false;

    const hasPdf = agendaUrl && agendaUrl.toLowerCase().endsWith(".pdf");

    // 1. Try dedicated correspondence section in PDF (RECEIVED LOG, etc.)
    if (hasPdf) {
      try {
        ok = await processWithPdf(client, supabase, meetingId, meetingItems, agendaUrl, dryRun);
      } catch (err) {
        console.error(`  PDF correspondence section failed: ${err.message}`);
        ok = false;
      }
    }

    // 2. Fall back: extract each item's page range from the PDF and look for correspondence
    if (!ok && hasPdf) {
      try {
        ok = await processItemPagesFromPdf(client, supabase, meetingId, meetingItems, agendaUrl, dryRun);
      } catch (err) {
        console.error(`  PDF item-page fallback failed: ${err.message}`);
        ok = false;
      }
    }

    // 3. Final fallback: use raw_feedback text if available
    if (!ok) {
      try {
        ok = await processWithRawFeedback(client, supabase, meetingId, meetingItems, dryRun);
      } catch (err) {
        console.error(`  Text correspondence processing failed: ${err.message}`);
        ok = false;
      }
    }

    if (ok) success++;
    else failed++;

    clearPdfCache();
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.error(
    `\nCorrespondence processing complete: ${success} succeeded, ${failed} failed.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
