#!/usr/bin/env node
/**
 * Comox Council Meeting Scraper
 *
 * Scrapes Town of Comox council meetings from comox.ca.
 * Fetches meeting listing, extracts agenda PDFs, parses into items.
 *
 * With --dry-run: prints JSON to stdout (no DB). Without: writes to Supabase.
 * Usage: node scripts/scrape-comox.mjs [--dry-run]
 * Env: LIMIT=N (default 3) - max meetings to scrape
 */

import * as cheerio from "cheerio";
import { loadEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/supabase-admin.mjs";

const LISTING_URLS = [
  "https://www.comox.ca/councilmeetings",
  "https://www.comox.ca/government-bylaws/council/meetings",
];
const BASE_URL = "https://www.comox.ca";
const USER_AGENT =
  "ComoxValleyCouncilWatch/1.0 (LocalGovMonitor; +mailto:info@example.com)";
const PAGE_DELAY_MS = 2000;
const PDF_DELAY_MS = 1000;
const MIN_DESCRIPTION_LENGTH = 100;
const MAX_CONTENT_LENGTH = 2000;
const MAX_RAW_FEEDBACK_CHARS = 50000;
const FEEDBACK_SAMPLE_CHARS = 40000;

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

async function fetchWithRetry(url, opts = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: opts.binary ? "application/pdf,*/*" : "text/html,application/xhtml+xml",
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

function extractDateFromMeetingSlug(slug) {
  const match = slug?.match(/(\w+)-(\d+)-(\d+)/);
  if (!match) return null;
  const [, month, day, year] = match;
  const monthNum = new Date(`${month} 1, 2000`).getMonth() + 1;
  const y = year?.length === 4 ? year : `20${year}`;
  return `${y}-${String(monthNum).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

async function findMeetingLinks() {
  for (const url of LISTING_URLS) {
    try {
      const html = await fetchWithRetry(url);
      const $ = cheerio.load(html);
      const links = [];

      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().trim();
        if (!href || !text) return;
        if (!href.includes("/meeting")) return;
        const full = resolveUrl(href);
        if (!full || full === url) return;
        if (!/meetings?\/[\w-]+(?:-[\w-]+)*$/.test(href)) return;
        if (/\.pdf$/i.test(href)) return;
        links.push({ href: full, text });
      });

      const seen = new Set();
      const unique = links.filter(({ href }) => {
        if (seen.has(href)) return false;
        seen.add(href);
        return true;
      });

      if (unique.length > 0) return unique;
    } catch (err) {
      console.error(`Listing ${url} failed: ${err.message}`);
    }
  }
  return [];
}

async function scrapeMeetingPage(url) {
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);

  const result = {
    url,
    title: $("h1").first().text().trim() || "Regular Council Meeting",
    date: null,
    agendaUrl: null,
    minutesUrl: null,
    videoUrl: null,
    items: [],
  };

  $('a[href*=".pdf"]').each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().toLowerCase();
    const full = resolveUrl(href);
    if (!full) return;
    if (text.includes("agenda")) result.agendaUrl = full;
    else if (text.includes("minutes")) result.minutesUrl = full;
  });

  $('a[href*="youtube.com"], a[href*="youtu.be"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) result.videoUrl = href.startsWith("http") ? href : resolveUrl(href);
  });

  const slug = url.split("/").pop() || "";
  result.date = extractDateFromMeetingSlug(slug);
  if (!result.date) {
    const dateText = $("time").attr("datetime") || $("[datetime]").first().attr("datetime");
    if (dateText) {
      const d = new Date(dateText);
      if (!isNaN(d.getTime())) result.date = d.toISOString().slice(0, 10);
    }
  }

  if (result.agendaUrl) {
    await new Promise((r) => setTimeout(r, PDF_DELAY_MS));
    try {
      const buf = await fetchWithRetry(result.agendaUrl, { binary: true });
      const pdfBuffer = Buffer.from(buf);
      const data = await pdf(pdfBuffer);
      const pdfText = data.text ?? "";
      result.items = parseAgendaPdf(pdfText);
      result.rawFeedback = extractFeedbackFromPdf(pdfText);
    } catch (err) {
      console.error(`  PDF parse failed: ${err.message}`);
    }
  }

  return result;
}

/**
 * Extract public hearing correspondence from the "Page 20-X" section.
 * Letters live in this subsection (~8K through ~60K+ chars). The numbered
 * index may be in a table that pdf-parse can't extract; we count by letter markers.
 */
function extractFeedbackFromPdf(text) {
  if (!text || typeof text !== "string") return null;

  // Letters are in the "Page 20-" subsection of the PDF
  const startMatch = text.indexOf("Page 20-1");
  if (startMatch === -1) return null;

  // Find the end: last occurrence of "Page 20-N" pattern
  const pagePattern = /Page 20-\d+/g;
  let lastPageEnd = startMatch;
  let match;
  while ((match = pagePattern.exec(text)) !== null) {
    lastPageEnd = match.index + match[0].length;
  }

  const letterSection = text.slice(startMatch, lastPageEnd + 500);

  // Page 20 section spans 20-1 through 20-N (e.g. 134 pages of submissions)
  const pageNumbers = letterSection.match(/Page 20-(\d+)/g) || [];
  const maxPage =
    pageNumbers.length > 0
      ? Math.max(
          ...pageNumbers.map((p) => parseInt(p.match(/\d+$/)[0], 10))
        )
      : 1;
  const estimatedFromPages = Math.round(maxPage / 2);

  // Count individual letters by salutations and email headers
  const dearCount = (
    letterSection.match(/Dear (?:Mayor|Council|Town)/gi) || []
  ).length;
  const emailFromCount = (letterSection.match(/^From:\s*.*$/gm) || []).length;

  // Use whichever count is higher: marker count or page estimate
  const letterCount = Math.max(
    dearCount + emailFromCount,
    estimatedFromPages,
    1
  );

  // Sample: first 40K chars of letter content for Claude analysis
  const sample =
    letterCount +
    " letters identified in public hearing correspondence.\n\n" +
    letterSection.slice(0, FEEDBACK_SAMPLE_CHARS);

  // Keep total stored payload under 50k (rawText + sample + JSON overhead)
  const rawTextMax = 35000;
  return {
    rawText: letterSection.slice(0, rawTextMax),
    letterCount,
    maxPage,
    sample,
  };
}

/**
 * Parse Comox agenda PDF into agenda-level items using structural markers.
 * Extracts: STAFF REPORT blocks, Bylaw items, Correspondence (RECEIVED LOG).
 */
function parseAgendaPdf(text) {
  if (!text || typeof text !== "string") return [];

  let clean = text;

  // Strip page footer markers: "February 4, 2026, Regular Council MeetingPage 5"
  clean = clean.replace(
    /\b[A-Za-z]+\s+\d{1,2},\s+\d{4},\s*Regular Council Meeting\s*Page\s*\d+/gi,
    ""
  );

  // Strip bylaw page headers: "Town of Comox Bylaw No. 2053 – Development Cost Charges Bylaw Page 12"
  clean = clean.replace(
    /Town of Comox Bylaw No\.\s*\d+[^–-]*[–-][^P]*\s*Page\s*\d+/gi,
    ""
  );

  const items = [];

  // Split into sections using primary delimiters
  const sectionRegex = /(?=\bSTAFF REPORT\b)|(?=Town of Comox Bylaw No\.\s*\d+)|(?=Bylaw No\.\s*\d+[^0-9])|(?=RECEIVED LOG:)/gi;
  const parts = clean.split(sectionRegex).map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    const upper = part.toUpperCase();

    if (upper.startsWith("STAFF REPORT")) {
      const item = parseStaffReport(part);
      if (item) items.push(item);
    } else if (/\b(?:Town of Comox )?Bylaw No\.\s*\d+/i.test(part)) {
      const item = parseBylaw(part);
      if (item) items.push(item);
    } else if (upper.startsWith("RECEIVED LOG:")) {
      const subItems = parseCorrespondence(part);
      items.push(...subItems);
    }
  }

  const filtered = items.filter((i) => {
    const desc = (i.description || "").trim();
    return desc.length >= MIN_DESCRIPTION_LENGTH;
  });

  // Deduplicate by title (e.g. same bylaw on multiple pages)
  const seen = new Map();
  for (const item of filtered) {
    if (seen.has(item.title)) {
      const existing = seen.get(item.title);
      const combined =
        (existing.rawContent || "") + "\n\n" + (item.rawContent || "");
      existing.rawContent = combined.slice(0, MAX_CONTENT_LENGTH);
      existing.description = combined.slice(0, MAX_CONTENT_LENGTH);
    } else {
      seen.set(item.title, item);
    }
  }
  return Array.from(seen.values());
}

function parseStaffReport(block) {
  const lines = block.split(/\r?\n/).map((l) => l.trim());
  let title = null;
  let purpose = [];
  let background = [];
  let recommendation = [];
  let inPurpose = false;
  let inBackground = false;
  let inRecommendation = false;
  let inMetadata = true;

  const metadataKeys = /^(Meeting|TO|FROM|FILE|DATE|RE):\s*/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ul = line.toUpperCase();

    if (/^SUBJECT:\s*/i.test(line)) {
      title = line.replace(/^SUBJECT:\s*/i, "").trim();
      inMetadata = false;
      continue;
    }
    if (inMetadata && metadataKeys.test(line)) continue;
    if (/^STAFF REPORT$/i.test(line)) continue;

    if (/^PURPOSE:?\s*$/i.test(line) || ul.startsWith("PURPOSE ")) {
      inPurpose = true;
      inBackground = false;
      inRecommendation = false;
      const rest = line.replace(/^PURPOSE:?\s*/i, "").trim();
      if (rest) purpose.push(rest);
      continue;
    }
    if (/^BACKGROUND:?\s*$/i.test(line) || ul.startsWith("BACKGROUND ")) {
      inPurpose = false;
      inBackground = true;
      inRecommendation = false;
      const rest = line.replace(/^BACKGROUND:?\s*/i, "").trim();
      if (rest) background.push(rest);
      continue;
    }
    if (/^RECOMMENDATION(S)?:?\s*$/i.test(line) || /^RECOMMENDATION\s/i.test(ul)) {
      inPurpose = false;
      inBackground = false;
      inRecommendation = true;
      const rest = line.replace(/^RECOMMENDATION(S)?:?\s*/i, "").trim();
      if (rest) recommendation.push(rest);
      continue;
    }
    if (inPurpose && line) purpose.push(line);
    else if (inBackground && line) background.push(line);
    else if (inRecommendation && line) recommendation.push(line);
  }

  if (!title) return null;

  const descParts = [...purpose, ...background];
  const description = capContent(descParts.join(" ").trim(), MAX_CONTENT_LENGTH);
  const decision = capContent(recommendation.join(" ").trim(), 500);

  return {
    title,
    description: description || null,
    rawContent: [title, description, decision].filter(Boolean).join("\n\n"),
  };
}

function parseBylaw(block) {
  const bylawMatch = block.match(
    /(?:Town of Comox\s+)?Bylaw No\.\s*(\d+)\s*[–-]\s*([^\n]+)/
  );
  if (!bylawMatch) return null;

  const num = bylawMatch[1];
  const name = bylawMatch[2].trim();
  const title = `Bylaw No. ${num} – ${name}`;

  let description = "";
  const titleMatch = block.match(/TITLE\s*[:\s]+(.+?)(?=\n\n|\n[A-Z]{2,}|\n\d\.|$)/is);
  const purposeMatch = block.match(/PURPOSE\s*[:\s]+(.+?)(?=\n\n|\n[A-Z]{2,}|\n\d\.|$)/is);
  if (titleMatch) description = titleMatch[1].trim().replace(/\s+/g, " ");
  if (purposeMatch) description += (description ? " " : "") + purposeMatch[1].trim().replace(/\s+/g, " ");
  if (!description) description = block.slice(0, 800).replace(/\s+/g, " ").trim();

  description = capContent(description, MAX_CONTENT_LENGTH);
  if (description.length < MIN_DESCRIPTION_LENGTH) return null;

  return {
    title,
    description,
    rawContent: title + "\n\n" + description,
  };
}

function parseCorrespondence(block) {
  const items = [];
  const receivedBlocks = block.split(/(?=RECEIVED LOG:)/gi).slice(1);

  for (const rb of receivedBlocks) {
    const reMatch = rb.match(/Re:\s*([^\n]+)/i);
    const title = reMatch ? reMatch[1].trim().slice(0, 200) : "Correspondence";

    const paras = rb
      .replace(/^RECEIVED LOG:.*?\n?/i, "")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    const description = capContent(paras.slice(0, 3).join(" "), MAX_CONTENT_LENGTH);
    if (description.length < MIN_DESCRIPTION_LENGTH) continue;

    items.push({
      title,
      description,
      rawContent: title + "\n\n" + description,
    });
  }

  return items;
}

function capContent(s, max) {
  if (!s) return "";
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + "…";
}

async function storeComoxResults(supabase, results, municipalityId) {
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
      if (!parsed.date) continue;

      const dateIso = `${parsed.date}T00:00:00Z`;

      const { data: meeting, error: meetingErr } = await supabase
        .from("meetings")
        .upsert(
          {
            municipality_id: municipalityId,
            meeting_type: "regular",
            date: dateIso,
            title: parsed.title,
            status: "completed",
            agenda_url: parsed.agendaUrl,
            minutes_url: parsed.minutesUrl,
            video_url: parsed.videoUrl,
            raw_feedback:
              parsed.rawFeedback?.rawText && parsed.rawFeedback.rawText.length > 0
                ? JSON.stringify({
                    rawText: parsed.rawFeedback.rawText,
                    letterCount: parsed.rawFeedback.letterCount,
                    maxPage: parsed.rawFeedback.maxPage,
                    sample: parsed.rawFeedback.sample,
                  })
                : null,
          },
          { onConflict: "municipality_id,date,meeting_type" }
        )
        .select("id")
        .single();

      if (meetingErr) throw new Error(`Meeting upsert failed: ${meetingErr.message}`);

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
            .update({
              description: item.description,
              raw_content: item.rawContent,
            })
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

  console.error("Fetching Comox council meetings listing...");
  const links = await findMeetingLinks();
  console.error(`Found ${links.length} meeting links`);

  const results = [];

  for (let i = 0; i < Math.min(links.length, limit); i++) {
    const { href, text } = links[i];
    console.error(`\nScraping (${i + 1}/${Math.min(links.length, limit)}): ${text}`);
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));

    try {
      const parsed = await scrapeMeetingPage(href);
      results.push(parsed);
      const fbNote = parsed.rawFeedback
        ? `, ${parsed.rawFeedback.letterCount} letters extracted`
        : "";
      console.error(`  → ${parsed.items.length} items from agenda PDF${fbNote}`);
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
    .eq("short_name", "Comox")
    .single();

  if (!mun) throw new Error("Comox municipality not found. Run db:seed first.");

  const { totalItemsFound, totalItemsNew } = await storeComoxResults(
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
