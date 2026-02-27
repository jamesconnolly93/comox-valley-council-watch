#!/usr/bin/env node
/**
 * AI Summary Processor
 *
 * Queries items with summary IS NULL, sends each to Claude for summarization,
 * and writes results back to the database.
 *
 * Usage: node scripts/process-ai-summaries.mjs
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

async function main() {
  loadEnv();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not found. Add to .env.local");
  }

  const supabase = createAdminClient();
  const client = new Anthropic({ apiKey });

  const { data: items, error } = await supabase
    .from("items")
    .select("*")
    .is("summary", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Query failed: ${error.message}`);
  if (!items?.length) {
    console.error("No items with summary IS NULL. Nothing to process.");
    return;
  }

  const total = items.length;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const num = i + 1;
    console.error(`Processing item ${num}/${total}: ${item.title}...`);

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(item) }],
      });

      const textBlock = response.content?.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text in response");
      }

      const parsed = parseAiResponse(textBlock.text);

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

      await supabase
        .from("items")
        .update({
          summary: parsed.summary ?? null,
          summary_simple: parsed.summary_simple ?? null,
          summary_expert: parsed.summary_expert ?? null,
          category: primaryCategory,
          categories: cats.length ? cats : null,
          tags: tags.length ? tags : null,
          is_significant: parsed.is_significant === true,
          impact: parsed.impact ?? null,
          bylaw_number: parsed.bylaw_number ?? null,
          metadata: {
            ...(item.metadata || {}),
            ai_response: parsed,
          },
        })
        .eq("id", item.id);

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
    `\nAI processing complete: ${success} items summarized, ${failed} failures.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
