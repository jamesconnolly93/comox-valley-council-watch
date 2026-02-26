#!/usr/bin/env node
/**
 * Full pipeline orchestration: scrape Courtenay highlights, then process AI summaries.
 *
 * Usage: node scripts/run-pipeline.mjs
 * Or: npm run pipeline
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function run(script, args = []) {
  const limit = process.env.LIMIT || "10";
  return new Promise((resolve, reject) => {
    const child = spawn("node", [script, ...args], {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, LIMIT: limit },
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  console.error("=== Step 1: Scraping Courtenay highlights ===\n");
  await run(join(ROOT, "scripts", "scrape-courtenay-highlights.mjs"));

  console.error("\n=== Step 2: Scraping Comox council meetings ===\n");
  await run(join(ROOT, "scripts", "scrape-comox.mjs"));

  console.error("\n=== Step 3: Scraping CVRD Board meetings ===\n");
  await run(join(ROOT, "scripts", "scrape-cvrd.mjs"));

  console.error("\n=== Step 4: Processing AI summaries ===\n");
  await run(join(ROOT, "scripts", "process-ai-summaries.mjs"));

  console.error("\n=== Pipeline complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
