#!/usr/bin/env node
/**
 * Courtenay Council Meeting Highlights Scraper
 *
 * Fetches and parses council meeting highlights from courtenay.ca.
 * With --dry-run: prints JSON to stdout (no DB). Without: writes to Supabase.
 *
 * Usage: node scripts/scrape-courtenay-highlights.mjs [--dry-run]
 */

import * as cheerio from "cheerio";
import { loadEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/supabase-admin.mjs";

const NEWS_LISTING_URL = "https://www.courtenay.ca/news";
const BASE_URL = "https://www.courtenay.ca";
const USER_AGENT =
  "ComoxValleyCouncilWatch/1.0 (LocalGovMonitor; +mailto:info@example.com)";

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (res.ok) return res.text();
    if (res.status === 404) throw new Error(`Not found: ${url}`);
    if (i < retries) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

function extractMeetingDateFromUrl(url) {
  const match = url.match(
    /courtenay-council-meeting-highlights-([a-z]+)-(\d+)-(\d+)/i
  );
  if (match) {
    const [, month, day, year] = match;
    const monthNum = new Date(`${month} 1, 2000`).getMonth() + 1;
    return `${year}-${String(monthNum).padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return null;
}

function extractPublishDateFromUrl(url) {
  const match = url.match(/\/news\/(\d{4}-\d{2}-\d{2})\//);
  return match ? match[1] : null;
}

/**
 * Extract decision from "Actions:" line only.
 * Matches "Actions:" (with optional leading space/newline, optional space after colon).
 * Extracts text from "Actions:" to end of that paragraph or next section heading.
 * Returns null if no "Actions:" line is present.
 */
function extractDecisionFromActions(content) {
  if (!content || typeof content !== "string") return null;
  const match = content.match(/Actions:\s*([\s\S]*?)(?=\n\s*\n|$)/i);
  return match ? match[1].trim() || null : null;
}

function parseHighlightsPage(html, pageUrl) {
  const $ = cheerio.load(html);
  const meetingDate = extractMeetingDateFromUrl(pageUrl) ?? "unknown";
  const publishDate = extractPublishDateFromUrl(pageUrl) ?? "unknown";

  const items = [];
  const seenTitles = new Set();

  const contentSelectors = [
    "article",
    "[role='main']",
    ".content",
    ".main-content",
    "main",
    ".node__content",
    "#block-mainpagecontent",
    ".field--name-body",
  ];

  let $content = $("");
  for (const sel of contentSelectors) {
    $content = $(sel).first();
    if ($content.length && $content.text().trim().length > 100) break;
  }

  if (!$content.length || $content.text().trim().length < 100) {
    $content = $("body");
  }

  $content.find("nav, footer, aside, .sidebar, .menu, script, style").remove();

  const headings = $content.find("h2, h3").toArray();

  for (const headingEl of headings) {
    const $heading = $(headingEl);
    const title = $heading.text().trim();
    if (!title || title.length < 3) continue;

    const skipPatterns = [
      /^council meeting highlights/i,
      /^related links/i,
      /^share/i,
      /^contact/i,
      /^quick links/i,
    ];
    if (skipPatterns.some((p) => p.test(title))) continue;

    const normTitle = title.toLowerCase().replace(/\s+/g, " ");
    if (seenTitles.has(normTitle)) continue;
    seenTitles.add(normTitle);

    const parts = [];
    let $next = $heading.next();

    while ($next.length && !$next.is("h2, h3")) {
      const text = $next.text().trim();
      if (text) parts.push(text);
      $next = $next.next();
    }

    const description = parts.join("\n\n").trim();
    const rawContent = description || title;
    const decision = extractDecisionFromActions(rawContent);

    items.push({
      title,
      description: description || title,
      decision,
      rawContent,
    });
  }

  if (items.length === 0) {
    $content.find("p").each((_, el) => {
      const text = $(el).text().trim();
      if (
        text.length > 50 &&
        !/^(Council meeting|For more information|Contact)/i.test(text)
      ) {
        const firstSentence = text.split(/[.!?]/)[0];
        items.push({
          title:
            firstSentence.length > 80
              ? firstSentence.slice(0, 77) + "..."
              : firstSentence,
          description: text,
          decision: extractDecisionFromActions(text),
          rawContent: text,
        });
      }
    });
  }

  return {
    url: pageUrl,
    pageTitle: null,
    meetingDate,
    publishDate,
    itemCount: items.length,
    items,
  };
}

async function findHighlightsLinks() {
  const html = await fetchWithRetry(NEWS_LISTING_URL);
  const $ = cheerio.load(html);
  const links = [];

  $('a[href*="council-meeting-highlights"]').each((_, el) => {
    const $el = $(el);
    let href = $el.attr("href") || "";
    const text = $el.text().trim();
    if (!href || !text) return;
    if (!href.startsWith("http")) {
      href = href.startsWith("/") ? BASE_URL + href : BASE_URL + "/" + href;
    }
    links.push({ href, text });
  });

  const seen = new Set();
  return links.filter(({ href }) => {
    if (seen.has(href)) return false;
    seen.add(href);
    return true;
  });
}

async function storeResults(supabase, results, municipalityId) {
  let totalItemsFound = 0;
  let totalItemsNew = 0;

  const { data: runRow, error: runInsertErr } = await supabase
    .from("scrape_runs")
    .insert({
      municipality_id: municipalityId,
      source_type: "highlights",
      status: "running",
    })
    .select("id")
    .single();

  if (runInsertErr) {
    throw new Error(`Failed to create scrape run: ${runInsertErr.message}`);
  }
  const runId = runRow.id;

  try {
    for (const parsed of results) {
      const meetingDate = parsed.meetingDate;
      if (meetingDate === "unknown") continue;

      const dateIso = `${meetingDate}T00:00:00Z`;

      const { data: meeting, error: meetingErr } = await supabase
        .from("meetings")
        .upsert(
          {
            municipality_id: municipalityId,
            meeting_type: "regular",
            date: dateIso,
            title: parsed.pageTitle ?? parsed.url?.split("/").pop() ?? "Council Meeting Highlights",
            status: "completed",
            highlights_url: parsed.url,
          },
          {
            onConflict: "municipality_id,date,meeting_type",
          }
        )
        .select("id")
        .single();

      if (meetingErr) throw new Error(`Meeting upsert failed: ${meetingErr.message}`);
      const meetingId = meeting.id;

      for (const item of parsed.items) {
        totalItemsFound++;
        const { data: existing } = await supabase
          .from("items")
          .select("id")
          .eq("meeting_id", meetingId)
          .eq("title", item.title)
          .maybeSingle();

        if (existing) {
          await supabase.from("items").update({
            description: item.description,
            decision: item.decision,
            raw_content: item.rawContent,
          }).eq("id", existing.id);
        } else {
          totalItemsNew++;
          await supabase.from("items").insert({
            meeting_id: meetingId,
            title: item.title,
            description: item.description,
            decision: item.decision,
            source_type: "highlights",
            raw_content: item.rawContent,
          });
        }
      }
    }

    await supabase
      .from("scrape_runs")
      .update({
        status: "completed",
        items_found: totalItemsFound,
        items_new: totalItemsNew,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
  } catch (err) {
    await supabase
      .from("scrape_runs")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    throw err;
  }

  return { totalItemsFound, totalItemsNew };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = parseInt(process.env.LIMIT || "3", 10);

  console.error("Fetching news listing...");
  const links = await findHighlightsLinks();
  console.error(`Found ${links.length} council meeting highlights links`);

  const results = [];

  for (let i = 0; i < Math.min(links.length, limit); i++) {
    const { href, text } = links[i];
    console.error(
      `\nScraping (${i + 1}/${Math.min(links.length, limit)}): ${text}`
    );
    await new Promise((r) => setTimeout(r, 1500));

    try {
      const html = await fetchWithRetry(href);
      const parsed = parseHighlightsPage(html, href);
      parsed.pageTitle = text;
      results.push(parsed);
      console.error(`  → ${parsed.itemCount} items extracted`);
    } catch (err) {
      console.error(`  → Error: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (dryRun) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  loadEnv();
  const supabase = createAdminClient();

  const { data: mun } = await supabase
    .from("municipalities")
    .select("id")
    .eq("short_name", "Courtenay")
    .single();

  if (!mun) {
    throw new Error("Courtenay municipality not found. Run db:seed first.");
  }

  const { totalItemsFound, totalItemsNew } = await storeResults(
    supabase,
    results,
    mun.id
  );
  const existing = totalItemsFound - totalItemsNew;
  console.error(
    `\nScrape complete: ${results.length} meetings processed, ${totalItemsNew} new items stored, ${existing} items already existed.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
