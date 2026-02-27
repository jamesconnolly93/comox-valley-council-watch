#!/usr/bin/env node
/**
 * Backfill/reprocess AI-generated fields for all items.
 * By default only processes items where headline IS NULL (i.e., not yet processed
 * with the new prompt). Use --force to reprocess every item regardless.
 *
 * Usage: node scripts/reprocess-summaries.mjs [--dry-run] [--force]
 * Env: LIMIT=N (default: all eligible items)
 */

import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/supabase-admin.mjs";
import {
  SYSTEM_PROMPT,
  buildUserMessage,
  parseAiResponse,
} from "./lib/ai-prompt.mjs";

const MODEL = "claude-sonnet-4-5-20250929";
const DELAY_MS = 500;
const limit = parseInt(process.env.LIMIT || "9999", 10);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  loadEnv();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not found. Add to .env.local");

  const supabase = createAdminClient();

  // By default, only reprocess items that haven't yet received a headline
  // (i.e., were processed before the new prompt was added).
  // --force reprocesses everything.
  let query = supabase
    .from("items")
    .select("id, title, raw_content, description, decision")
    .not("summary", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!force) {
    query = query.is("headline", null);
  }

  const { data: items, error } = await query;

  if (error) throw new Error(`Query failed: ${error.message}`);
  if (!items?.length) {
    console.error(
      force
        ? "No items with summary found. Nothing to process."
        : "No items with headline IS NULL. All items already processed. Use --force to reprocess."
    );
    return;
  }

  const client = new Anthropic({ apiKey });
  let success = 0;
  let failed = 0;

  console.error(
    `Processing ${items.length} items${force ? " (--force)" : " (headline IS NULL)"}${dryRun ? " (dry-run)" : ""}...`
  );

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.error(`[${i + 1}/${items.length}] ${item.title?.slice(0, 60)}...`);

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildUserMessage({
              ...item,
              description: item.raw_content || item.description,
            }),
          },
        ],
      });

      const textBlock = response.content?.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text in response");
      }

      const parsed = parseAiResponse(textBlock.text);

      const updates = {
        summary_simple: parsed.summary_simple ?? null,
        summary_expert: parsed.summary_expert ?? null,
        impact: parsed.impact ?? null,
        bylaw_number: parsed.bylaw_number ?? null,
        headline: parsed.headline ?? null,
        topic_label: parsed.topic_label ?? null,
        key_stats: Array.isArray(parsed.key_stats) ? parsed.key_stats : [],
        community_signal: parsed.community_signal ?? null,
      };

      if (dryRun) {
        console.error("  → Would update:", {
          headline: updates.headline,
          topic_label: updates.topic_label,
          key_stats: updates.key_stats,
          community_signal: updates.community_signal
            ? `{type:${updates.community_signal.type}, count:${updates.community_signal.participant_count}}`
            : null,
          summary_simple: updates.summary_simple?.slice(0, 60) + "...",
        });
      } else {
        await supabase.from("items").update(updates).eq("id", item.id);
      }
      success++;
    } catch (err) {
      failed++;
      console.error(`  → Error: ${err instanceof Error ? err.message : err}`);
    }

    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.error(
    `\nDone: ${success} processed, ${failed} failed${dryRun ? " (no writes)" : ""}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
