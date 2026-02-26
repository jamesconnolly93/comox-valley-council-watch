#!/usr/bin/env node
/**
 * One-time migration: fix category column storing JSON array string.
 * Parses existing category values, writes categories[0] to category,
 * stores full array in categories text[] column.
 *
 * Usage: node scripts/fix-categories.mjs
 */

import { loadEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/supabase-admin.mjs";

function parseCategoryValue(val) {
  if (val == null) return { primary: null, all: [] };
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return { primary: null, all: [] };
    if (trimmed.startsWith("[")) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) {
          const slugs = arr.filter((x) => typeof x === "string");
          return { primary: slugs[0] ?? null, all: slugs };
        }
      } catch {
        return { primary: trimmed, all: [trimmed] };
      }
    }
    return { primary: trimmed, all: [trimmed] };
  }
  if (Array.isArray(val)) {
    const slugs = val.filter((x) => typeof x === "string");
    return { primary: slugs[0] ?? null, all: slugs };
  }
  return { primary: null, all: [] };
}

async function main() {
  loadEnv();
  const supabase = createAdminClient();

  const { data: items, error } = await supabase
    .from("items")
    .select("id, category, categories");

  if (error) throw new Error(`Query failed: ${error.message}`);

  let updated = 0;
  for (const item of items ?? []) {
    const { primary, all } = parseCategoryValue(item.category);
    const willSetCategory = primary;
    const willSetCategories = all.length ? all : null;
    const needsFix =
      item.category !== willSetCategory ||
      JSON.stringify(item.categories ?? []) !== JSON.stringify(willSetCategories ?? []);

    if (!needsFix) continue;

    const { error: updErr } = await supabase
      .from("items")
      .update({
        category: primary,
        categories: all.length ? all : null,
      })
      .eq("id", item.id);

    if (updErr) {
      console.error(`Failed to update item ${item.id}: ${updErr.message}`);
      continue;
    }
    updated++;
    console.error(`Fixed: ${item.id} -> category="${primary}", categories=[${all.join(", ")}]`);
  }

  console.error(`\nFix complete: ${updated} items updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
