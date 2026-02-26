#!/usr/bin/env node
/**
 * Backfill impact column for items with null or missing impact.
 * Uses a minimal Claude call (title + raw_content → impact only) to keep cost low.
 *
 * Usage: node scripts/reprocess-impacts.mjs
 * Env: LIMIT=N (default: all items with impact IS NULL)
 */

import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/supabase-admin.mjs";

const IMPACT_SYSTEM_PROMPT = `You are a municipal government analyst for the Comox Valley, BC.

Given a council meeting item, return ONLY a JSON object: { "impact": "..." }

The impact must be: One punchy sentence starting with 'You' or 'Your' that tells a resident why this matters to them personally. Be specific with numbers when available.

Examples:
- "Your property taxes are going up ~7% this year."
- "New fees of $X per unit if you're building a home."
- "Your water bill may increase $29-33/year."
- "No direct impact — this is an internal governance matter."

If the item doesn't directly affect residents, say so. Be concrete and resident-focused.`;

const MODEL = "claude-sonnet-4-5-20250929";
const DELAY_MS = 400;
const limit = parseInt(process.env.LIMIT || "9999", 10);

async function main() {
  loadEnv();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not found. Add to .env.local");

  const supabase = createAdminClient();

  const { data: items, error } = await supabase
    .from("items")
    .select("id, title, raw_content, description")
    .is("impact", null)
    .not("summary", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Query failed: ${error.message}`);
  if (!items?.length) {
    console.error("No items with impact IS NULL and summary present. Nothing to process.");
    return;
  }

  const client = new Anthropic({ apiKey });
  let success = 0;
  let failed = 0;

  console.error(`Processing ${items.length} items for impact backfill...`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.error(`[${i + 1}/${items.length}] ${item.title?.slice(0, 50)}...`);

    try {
      const content = item.raw_content || item.description || "";
      const userMessage = `Title: ${item.title || ""}\n\nContent: ${content.slice(0, 4000)}`;

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        system: IMPACT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const textBlock = response.content?.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text in response");
      }

      let parsed;
      try {
        const text = String(textBlock.text).trim();
        const cleaned = text.replace(/^```json\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error("Invalid JSON in response");
      }

      const impact = parsed.impact ? String(parsed.impact).trim() : null;

      await supabase.from("items").update({ impact }).eq("id", item.id);
      success++;
      if (impact) console.error(`  → ${impact.slice(0, 60)}...`);
    } catch (err) {
      failed++;
      console.error(`  → Error: ${err instanceof Error ? err.message : err}`);
    }

    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.error(`\nDone: ${success} updated, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
