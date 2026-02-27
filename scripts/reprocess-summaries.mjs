#!/usr/bin/env node
/**
 * Backfill summary_simple and summary_expert for complexity slider.
 * Uses full AI prompt; updates summary_simple, summary_expert, impact.
 * Keeps existing summary unchanged (already good).
 *
 * Usage: node scripts/reprocess-summaries.mjs [--dry-run]
 * Env: LIMIT=N (default: all items with summary)
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
  loadEnv();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not found. Add to .env.local");

  const supabase = createAdminClient();

  const { data: items, error } = await supabase
    .from("items")
    .select("id, title, raw_content, description, decision")
    .not("summary", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Query failed: ${error.message}`);
  if (!items?.length) {
    console.error("No items with summary. Nothing to process.");
    return;
  }

  const client = new Anthropic({ apiKey });
  let success = 0;
  let failed = 0;

  console.error(
    `Processing ${items.length} items for summary levels${dryRun ? " (dry-run)" : ""}...`
  );

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.error(`[${i + 1}/${items.length}] ${item.title?.slice(0, 50)}...`);

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
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
      };

      if (dryRun) {
        console.error("  → Would update:", {
          summary_simple: updates.summary_simple?.slice(0, 60) + "...",
          summary_expert: updates.summary_expert?.slice(0, 60) + "...",
          impact: updates.impact?.slice(0, 50) + "...",
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
