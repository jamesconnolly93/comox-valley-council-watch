#!/usr/bin/env node
/**
 * AI Item Processor (PDF Vision + Text Fallback)
 *
 * For items with a meeting PDF: downloads PDF, extracts per-item pages,
 * sends to Claude as a document content block for visual understanding.
 * Falls back to text-based processing when no PDF is available.
 *
 * Usage: node scripts/process-items.mjs [--force] [--dry-run] [--text-only]
 * Env: LIMIT=N (default: all eligible items)
 */

import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/supabase-admin.mjs";
import {
  SYSTEM_PROMPT,
  buildUserMessage,
  buildPdfUserMessage,
  parseAiResponse,
} from "./lib/ai-prompt.mjs";
import {
  downloadPdf,
  getPageTexts,
  extractPages,
  findItemPages,
  clearPdfCache,
} from "./lib/pdf-utils.mjs";

const MODEL = "claude-sonnet-4-5-20250929";
const DELAY_MS = 5000;

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

/**
 * Save all AI-extracted fields to the items table.
 * Mirrors the update logic from process-ai-summaries.mjs.
 */
async function saveItemFields(supabase, itemId, parsed, processingMethod, existingMetadata) {
  const cats = Array.isArray(parsed.categories)
    ? parsed.categories
    : typeof parsed.categories === "string"
      ? (() => {
          try {
            const p = JSON.parse(parsed.categories);
            return Array.isArray(p) ? p : [];
          } catch {
            return parsed.categories ? [parsed.categories] : [];
          }
        })()
      : [];

  const primaryCategory = cats[0] ?? null;
  const tags = Array.isArray(parsed.tags) ? parsed.tags : [];

  const { error } = await supabase
    .from("items")
    .update({
      summary: parsed.summary ?? null,
      summary_simple: parsed.summary_simple ?? null,
      summary_expert: parsed.summary_expert ?? null,
      headline: parsed.headline ?? null,
      topic_label: parsed.topic_label ?? null,
      key_stats: Array.isArray(parsed.key_stats) ? parsed.key_stats : [],
      community_signal: parsed.community_signal ?? null,
      category: primaryCategory,
      categories: cats.length ? cats : null,
      tags: tags.length ? tags : null,
      is_significant: parsed.is_significant === true,
      impact: parsed.impact ?? null,
      bylaw_number: parsed.bylaw_number ?? null,
      decision: parsed.decision ?? null,
      contains_correspondence: parsed.contains_correspondence === true,
      processing_method: processingMethod,
      metadata: {
        ...(existingMetadata || {}),
        ai_response: parsed,
      },
    })
    .eq("id", itemId);

  if (error) {
    console.error(`    DB update error: ${error.message}`);
  }
}

// ── PDF-based processing ─────────────────────────────────────────────

async function processItemWithPdf(client, supabase, item, pdfBuffer, pageRange, agendaUrl, dryRun) {
  const label = `pages ${pageRange.startPage + 1}-${pageRange.endPage + 1}`;
  console.error(`  [PDF] ${item.title?.slice(0, 60)}... (${label})`);

  try {
    const { base64, pageCount } = await extractPages(
      pdfBuffer,
      pageRange.startPage,
      pageRange.endPage
    );

    // Store the per-item PDF extract for potential reprocessing
    if (!dryRun) {
      const { error: attErr } = await supabase
        .from("attachments")
        .upsert(
          {
            item_id: item.id,
            meeting_id: item.meeting_id,
            url: agendaUrl,
            filename: `item-${item.id}-${label.replace(/\s+/g, "")}.pdf`,
            attachment_type: "agenda_extract",
            page_start: pageRange.startPage + 1,
            page_end: pageRange.endPage + 1,
            page_count: pageCount,
            processed: false,
          },
          { onConflict: "item_id,attachment_type" }
        );
      if (attErr) console.error(`    Attachment upsert warning: ${attErr.message}`);
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
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
              text: buildPdfUserMessage(item),
            },
          ],
        },
      ],
    });

    const textBlock = response.content?.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text in Claude response");
    }

    const parsed = parseAiResponse(textBlock.text);

    if (dryRun) {
      console.error(`    [DRY RUN] headline: ${parsed.headline}`);
      console.error(`    [DRY RUN] contains_correspondence: ${parsed.contains_correspondence}`);
    } else {
      await saveItemFields(supabase, item.id, parsed, "pdf_vision", item.metadata);
      await supabase
        .from("attachments")
        .update({ processed: true })
        .eq("item_id", item.id)
        .eq("attachment_type", "agenda_extract");
    }

    return true;
  } catch (err) {
    console.error(`    PDF processing failed: ${err.message}`);
    return false;
  }
}

// ── Text-based processing (fallback) ─────────────────────────────────

async function processItemWithText(client, supabase, item, dryRun) {
  console.error(`  [TEXT] ${item.title?.slice(0, 60)}...`);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(item) }],
    });

    const textBlock = response.content?.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text in Claude response");
    }

    const parsed = parseAiResponse(textBlock.text);

    if (dryRun) {
      console.error(`    [DRY RUN] headline: ${parsed.headline}`);
    } else {
      await saveItemFields(supabase, item.id, parsed, "text_fallback", item.metadata);
    }

    return true;
  } catch (err) {
    console.error(`    Text processing failed: ${err.message}`);
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const textOnly = process.argv.includes("--text-only");
  const limit = parseInt(process.env.LIMIT || "0", 10) || null;

  loadEnv();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not found. Add to .env.local");

  const supabase = createAdminClient();
  const client = new Anthropic({ apiKey });

  // Query items needing processing, joined with meeting/municipality info
  let query = supabase
    .from("items")
    .select(
      `id, title, description, raw_content, decision, meeting_id, metadata,
       meetings!inner(id, agenda_url, municipality_id,
         municipalities!inner(short_name)
       )`
    )
    .order("created_at", { ascending: true });

  if (force) {
    query = query.not("summary", "is", null);
  } else {
    query = query.is("summary", null);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data: items, error } = await query;
  if (error) throw new Error(`Query failed: ${error.message}`);
  if (!items?.length) {
    console.error(
      force
        ? "No items with existing summaries to reprocess."
        : "No items with summary IS NULL. Nothing to process."
    );
    return;
  }

  console.error(
    `Processing ${items.length} item(s)${dryRun ? " [DRY RUN]" : ""}${textOnly ? " [TEXT ONLY]" : ""}${force ? " [FORCE]" : ""}`
  );

  const byMeeting = groupByMeeting(items);
  let success = 0;
  let failed = 0;
  let pdfCount = 0;
  let textCount = 0;

  for (const [meetingId, meetingItems] of byMeeting) {
    const meeting = meetingItems[0].meetings;
    const agendaUrl = meeting?.agenda_url;
    const municipality = meeting?.municipalities?.short_name || "Unknown";

    console.error(
      `\nMeeting ${meetingId} (${municipality}, ${meetingItems.length} items):`
    );

    let pageMap = null;
    let pdfBuffer = null;

    // Attempt PDF download and page mapping unless text-only mode
    if (!textOnly && agendaUrl && agendaUrl.toLowerCase().endsWith(".pdf")) {
      try {
        const isCvrd = municipality === "CVRD";
        pdfBuffer = await downloadPdf(agendaUrl, { allowInsecureSsl: isCvrd });
        const pageTexts = await getPageTexts(pdfBuffer);
        pageMap = findItemPages(pageTexts, meetingItems);
        console.error(
          `  PDF: ${pageTexts.length} pages, mapped ${pageMap.size}/${meetingItems.length} items`
        );
      } catch (err) {
        console.error(`  PDF download/parse failed: ${err.message}. Using text fallback.`);
        pdfBuffer = null;
        pageMap = null;
      }
    } else if (!textOnly && agendaUrl) {
      console.error(`  Agenda URL is not a PDF (${agendaUrl?.slice(-20)}). Using text.`);
    } else if (!textOnly) {
      console.error(`  No agenda URL. Using text.`);
    }

    // Process each item in this meeting
    for (const item of meetingItems) {
      const itemPageRange = pageMap?.get(item.id);

      let ok = false;
      if (pdfBuffer && itemPageRange) {
        ok = await processItemWithPdf(
          client, supabase, item, pdfBuffer, itemPageRange, agendaUrl, dryRun
        );
        if (ok) {
          pdfCount++;
        } else {
          // PDF failed for this item — wait before text fallback to avoid rate limits
          await new Promise((r) => setTimeout(r, 5000));
          ok = await processItemWithText(client, supabase, item, dryRun);
          if (ok) textCount++;
        }
      } else {
        ok = await processItemWithText(client, supabase, item, dryRun);
        if (ok) textCount++;
      }

      if (ok) success++;
      else failed++;

      await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    clearPdfCache();
  }

  console.error(
    `\nProcessing complete: ${success} succeeded (${pdfCount} PDF, ${textCount} text), ${failed} failed.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
