#!/usr/bin/env node
/**
 * Test script for the AI summarization/classification pipeline.
 * Sends a single scraped council item to Claude for processing.
 *
 * Usage:
 *   echo '<paste single item JSON here>' | node scripts/test-ai-pipeline.mjs
 *   node scripts/test-ai-pipeline.mjs --file sample-item.json
 */

import { readFileSync, existsSync } from "fs";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "./lib/env.mjs";
import { SYSTEM_PROMPT, buildUserMessage, parseAiResponse } from "./lib/ai-prompt.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    const rl = createInterface({ input: process.stdin });
    rl.on("line", (line) => chunks.push(line));
    rl.on("close", () => resolve(chunks.join("\n")));
  });
}

async function main() {
  loadEnv();

  let itemJson;
  const fileArg = process.argv.find((a) => a === "--file" || a.startsWith("--file="));
  if (fileArg) {
    const path =
      fileArg === "--file"
        ? process.argv[process.argv.indexOf("--file") + 1]
        : fileArg.slice(7);
    if (!path) {
      console.error("Usage: node test-ai-pipeline.mjs --file <path>");
      process.exit(1);
    }
    const resolved = path.startsWith("/") ? path : join(process.cwd(), path);
    if (!existsSync(resolved)) {
      console.error(`File not found: ${resolved}`);
      process.exit(1);
    }
    itemJson = readFileSync(resolved, "utf8");
  } else {
    itemJson = await readStdin();
  }

  const item = JSON.parse(itemJson);
  const userMessage = buildUserMessage(item);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY not found. Add it to .env.local (see .env.example)."
    );
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content?.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.error("No text in response");
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseAiResponse(textBlock.text);
  } catch {
    console.error("Response was not valid JSON:");
    console.log(String(textBlock.text));
    process.exit(1);
  }

  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
