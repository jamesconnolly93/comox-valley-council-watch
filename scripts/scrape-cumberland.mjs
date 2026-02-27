#!/usr/bin/env node
/**
 * Cumberland Council Meeting Scraper
 *
 * Scrapes Village of Cumberland council meetings from cumberland.ca.
 * Meetings are listed at /meetings/ and detail pages link to agenda PDFs.
 *
 * With --dry-run: prints JSON to stdout (no DB). Without: writes to Supabase.
 * Usage: node scripts/scrape-cumberland.mjs [--dry-run]
 * Env: LIMIT=N (default 3) - max meetings to scrape
 */

import * as cheerio from "cheerio";
import { loadEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/supabase-admin.mjs";

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const LISTING_URL = "https://cumberland.ca/meetings/";
const BASE_URL = "https://cumberland.ca";
const USER_AGENT =
  "ComoxValleyCouncilWatch/1.0 (LocalGovMonitor; +mailto:info@example.com)";
const PAGE_DELAY_MS = 2000;
const PDF_DELAY_MS = 1000;
const MIN_DESCRIPTION_LENGTH = 80;
const MAX_CONTENT_LENGTH = 2000;

async function fetchWithRetry(url, opts = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: opts.binary
          ? "application/pdf,*/*"
          : "text/html,application/xhtml+xml",
      },
      ...opts,
    });
    if (res.ok) return opts.binary ? res.arrayBuffer() : res.text();
    if (res.status === 404) throw new Error(`Not found: ${url}`);
    if (i < retries) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

function resolveUrl(href) {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  const base = BASE_URL.endsWith("/") ? BASE_URL.slice(0, -1) : BASE_URL;
  return href.startsWith("/") ? base + href : base + "/" + href;
}

/**
 * Parse a date string like "January 26, 2026" from meeting link text.
 * Link text format: "Regular Council Meeting: January 26, 2026"
 */
function parseDateFromLinkText(text) {
  const match = text.match(
    /(\w+)\s+(\d{1,2}),?\s+(\d{4})/
  );
  if (!match) return null;
  const [, monthStr, day, year] = match;
  const d = new Date(`${monthStr} ${day}, ${year}`);
  if (isNaN(d.getTime())) return null;
  return `${year}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Determine meeting type from link text */
function parseMeetingType(text) {
  const upper = text.toUpperCase();
  if (upper.includes("COMMITTEE OF THE WHOLE") || upper.includes("COTW")) return "committee";
  if (upper.includes("SPECIAL")) return "special";
  if (upper.includes("HERITAGE")) return "committee";
  return "regular";
}

async function findMeetingLinks() {
  const html = await fetchWithRetry(LISTING_URL);
  const $ = cheerio.load(html);
  const links = [];

  // Meetings are listed as <h2><a href="/meetings/{id}/">Text: Month Day, Year</a></h2>
  $("h2 a[href], h3 a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (!href || !text) return;
    if (!/\/meetings\/[^/]+\/?$/.test(href)) return;
    const full = resolveUrl(href);
    if (!full || full === LISTING_URL) return;

    const date = parseDateFromLinkText(text);
    const meetingType = parseMeetingType(text);
    links.push({ href: full, text, date, meetingType });
  });

  // Also check plain <a> links if h2/h3 pattern doesn't find enough
  if (links.length === 0) {
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (!href || !text) return;
      if (!/\/meetings\/[^/]+\/?$/.test(href)) return;
      if (/\.(pdf|doc|docx)$/i.test(href)) return;
      const full = resolveUrl(href);
      if (!full || full === LISTING_URL) return;
      const date = parseDateFromLinkText(text);
      const meetingType = parseMeetingType(text);
      links.push({ href: full, text, date, meetingType });
    });
  }

  const seen = new Set();
  return links.filter(({ href }) => {
    if (seen.has(href)) return false;
    seen.add(href);
    return true;
  });
}

async function scrapeMeetingPage(url, prefetchedDate, prefetchedMeetingType) {
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);

  const title = $("h1").first().text().trim() || "Council Meeting";

  // Try to extract date from page if not already known
  let date = prefetchedDate;
  if (!date) {
    const dateText = $("time").attr("datetime") || $("[datetime]").first().attr("datetime");
    if (dateText) {
      const d = new Date(dateText);
      if (!isNaN(d.getTime())) date = d.toISOString().slice(0, 10);
    }
    if (!date) {
      date = parseDateFromLinkText($("h1").first().text());
      if (!date) date = parseDateFromLinkText($(".entry-title, .page-title").first().text());
    }
  }

  let agendaUrl = null;
  let minutesUrl = null;
  let videoUrl = null;

  $('a[href*=".pdf"]').each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().toLowerCase().trim();
    const full = resolveUrl(href);
    if (!full) return;

    // Prefer the "reduced" package (smaller file, complete agenda)
    if (!agendaUrl && (text.includes("agenda") || text.includes("package") || href.includes("reduced") || href.includes("RC_"))) {
      agendaUrl = full;
    }
    if (!minutesUrl && text.includes("minutes")) {
      minutesUrl = full;
    }
  });

  // Fall back to first PDF if no agenda found
  if (!agendaUrl) {
    const firstPdf = $('a[href$=".pdf"]').first().attr("href");
    if (firstPdf) agendaUrl = resolveUrl(firstPdf);
  }

  $('a[href*="youtube.com"], a[href*="youtu.be"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href && !videoUrl) videoUrl = href.startsWith("http") ? href : resolveUrl(href);
  });

  const items = [];
  if (agendaUrl) {
    await new Promise((r) => setTimeout(r, PDF_DELAY_MS));
    try {
      const buf = await fetchWithRetry(agendaUrl, { binary: true });
      const pdfBuffer = Buffer.from(buf);
      const data = await pdf(pdfBuffer);
      items.push(...parseCumberlandAgendaPdf(data.text ?? ""));
    } catch (err) {
      console.error(`  PDF parse failed: ${err.message}`);
    }
  }

  return {
    url,
    title,
    date,
    meetingType: prefetchedMeetingType ?? "regular",
    agendaUrl,
    minutesUrl,
    videoUrl,
    items,
  };
}

/**
 * Parse Cumberland agenda PDF text into agenda items.
 * Looks for staff report blocks, bylaw items, and correspondence.
 */
function parseCumberlandAgendaPdf(text) {
  if (!text || typeof text !== "string") return [];

  // Strip common header/footer noise
  let clean = text
    .replace(/Village of Cumberland[^\n]*\n/gi, "")
    .replace(/Regular Council Meeting[^\n]*\n/gi, "")
    .replace(/Committee of the Whole[^\n]*\n/gi, "")
    .replace(/Page\s+\d+\s+of\s+\d+/gi, "")
    .replace(/\f/g, "\n");

  const items = [];

  // Split into sections at staff report markers, bylaw markers
  const sectionRegex =
    /(?=\bSTAFF REPORT\b)|(?=\bREPORT TO COUNCIL\b)|(?=Bylaw No\.?\s*\d+)|(?=\bRECEIVED LOG:)/gi;
  const parts = clean
    .split(sectionRegex)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const upper = part.toUpperCase();

    if (upper.startsWith("STAFF REPORT") || upper.startsWith("REPORT TO COUNCIL")) {
      const item = parseStaffReport(part);
      if (item) items.push(item);
    } else if (/Bylaw No\.?\s*\d+/i.test(part)) {
      const item = parseBylaw(part);
      if (item) items.push(item);
    } else if (upper.startsWith("RECEIVED LOG:")) {
      items.push(...parseCorrespondence(part));
    }
  }

  const filtered = items.filter(
    (i) => (i.description || "").trim().length >= MIN_DESCRIPTION_LENGTH
  );

  // Deduplicate by title
  const seen = new Map();
  for (const item of filtered) {
    if (!seen.has(item.title)) seen.set(item.title, item);
  }
  return Array.from(seen.values());
}

function parseStaffReport(block) {
  const lines = block.split(/\r?\n/).map((l) => l.trim());
  let title = null;
  let bodyLines = [];
  let recommendation = [];
  let inBody = false;
  let inRecommendation = false;

  for (const line of lines) {
    if (/^STAFF REPORT$|^REPORT TO COUNCIL$/i.test(line)) continue;
    if (/^(SUBJECT|RE|TOPIC):\s*/i.test(line)) {
      title = line.replace(/^(SUBJECT|RE|TOPIC):\s*/i, "").trim();
      inBody = true;
      continue;
    }
    if (/^(TO|FROM|DATE|FILE|MEETING):\s*/i.test(line)) continue;
    if (/^RECOMMENDATION(S)?:?$/i.test(line)) {
      inRecommendation = true;
      inBody = false;
      continue;
    }
    if (inRecommendation) recommendation.push(line);
    else if (inBody && line) bodyLines.push(line);
  }

  if (!title) return null;

  const description = capContent(bodyLines.join(" ").trim(), MAX_CONTENT_LENGTH);
  if (!description) return null;

  return {
    title,
    description,
    rawContent: [title, description, recommendation.join(" ")].filter(Boolean).join("\n\n"),
  };
}

function parseBylaw(block) {
  const bylawMatch = block.match(
    /Bylaw No\.?\s*(\d+[\w-]*)\s*[–\-–]?\s*([^\n]{3,80})/i
  );
  if (!bylawMatch) return null;

  const num = bylawMatch[1].trim();
  const name = bylawMatch[2].trim().replace(/[–\-]+$/, "").trim();
  if (!name || name.length < 5) return null;

  const title = `Bylaw No. ${num} – ${name}`;
  let description = block.slice(0, MAX_CONTENT_LENGTH).replace(/\s+/g, " ").trim();
  if (description.length < MIN_DESCRIPTION_LENGTH) return null;

  return {
    title,
    description: capContent(description, MAX_CONTENT_LENGTH),
    rawContent: title + "\n\n" + capContent(description, MAX_CONTENT_LENGTH),
  };
}

function parseCorrespondence(block) {
  const items = [];
  const reMatch = block.match(/Re:\s*([^\n]+)/i);
  const title = reMatch ? reMatch[1].trim().slice(0, 200) : "Correspondence";

  const paras = block
    .replace(/^RECEIVED LOG:.*?\n?/i, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);

  const description = capContent(paras.slice(0, 3).join(" "), MAX_CONTENT_LENGTH);
  if (description.length >= MIN_DESCRIPTION_LENGTH) {
    items.push({ title, description, rawContent: title + "\n\n" + description });
  }
  return items;
}

function capContent(s, max) {
  if (!s) return "";
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max).trim() + "…";
}

async function storeCumberlandResults(supabase, results, municipalityId) {
  let totalItemsFound = 0;
  let totalItemsNew = 0;

  const { data: runRow, error: runErr } = await supabase
    .from("scrape_runs")
    .insert({
      municipality_id: municipalityId,
      source_type: "agenda",
      status: "running",
    })
    .select("id")
    .single();

  if (runErr) throw new Error(`Scrape run insert failed: ${runErr.message}`);
  const runId = runRow.id;

  try {
    for (const parsed of results) {
      if (!parsed.date) {
        console.error(`  Skipping meeting with no date: ${parsed.url}`);
        continue;
      }

      const dateIso = `${parsed.date}T00:00:00Z`;

      const { data: meeting, error: meetingErr } = await supabase
        .from("meetings")
        .upsert(
          {
            municipality_id: municipalityId,
            meeting_type: parsed.meetingType || "regular",
            date: dateIso,
            title: parsed.title,
            status: "completed",
            agenda_url: parsed.agendaUrl,
            minutes_url: parsed.minutesUrl,
            video_url: parsed.videoUrl,
          },
          { onConflict: "municipality_id,date,meeting_type" }
        )
        .select("id")
        .single();

      if (meetingErr) {
        console.error(`  Meeting upsert failed: ${meetingErr.message}`);
        continue;
      }

      for (const item of parsed.items) {
        totalItemsFound++;
        const { data: existing } = await supabase
          .from("items")
          .select("id")
          .eq("meeting_id", meeting.id)
          .eq("title", item.title)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("items")
            .update({ description: item.description, raw_content: item.rawContent })
            .eq("id", existing.id);
        } else {
          totalItemsNew++;
          await supabase.from("items").insert({
            meeting_id: meeting.id,
            title: item.title,
            description: item.description,
            source_type: "agenda",
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

  console.error("Fetching Cumberland council meetings listing...");
  const links = await findMeetingLinks();
  console.error(`Found ${links.length} meeting links`);

  if (links.length === 0) {
    console.error("No meeting links found. Check if cumberland.ca/meetings/ structure has changed.");
    return;
  }

  const results = [];

  for (let i = 0; i < Math.min(links.length, limit); i++) {
    const { href, text, date, meetingType } = links[i];
    console.error(`\nScraping (${i + 1}/${Math.min(links.length, limit)}): ${text}`);
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));

    try {
      const parsed = await scrapeMeetingPage(href, date, meetingType);
      results.push(parsed);
      console.error(`  → date: ${parsed.date}, ${parsed.items.length} items from agenda PDF`);
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
    .eq("short_name", "Cumberland")
    .single();

  if (!mun) {
    console.error(
      'Cumberland municipality not found in DB. Run this SQL in Supabase:\n' +
      "INSERT INTO municipalities (name, short_name, website_url) VALUES ('Village of Cumberland', 'Cumberland', 'https://cumberland.ca');"
    );
    process.exit(1);
  }

  const { totalItemsFound, totalItemsNew } = await storeCumberlandResults(
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
