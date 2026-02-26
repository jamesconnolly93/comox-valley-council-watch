#!/usr/bin/env node
/**
 * CVRD Board Meeting Scraper
 *
 * Scrapes Comox Valley Regional District Board meetings from comoxvalleyrd.ca.
 * Primary: minutes/agendas portal (cheerio) — lists Board meetings with agenda links.
 * Fallback: PDF parsing if agenda content is served as PDF.
 *
 * Board meetings only (skips committees for MVP).
 * CVRD staff reports use: SUBJECT:, RECOMMENDATION, PURPOSE, BACKGROUND.
 *
 * With --dry-run: prints JSON to stdout (no DB). Without: writes to Supabase.
 * Usage: node scripts/scrape-cvrd.mjs [--dry-run]
 * Env: LIMIT=N (default 3) - max meetings to scrape
 *
 * If cvrdagendaminutes.comoxvalleyrd.ca returns empty/JS-rendered content,
 * consider Playwright fallback: npx playwright install chromium
 */

import { writeFileSync } from "fs";
import * as cheerio from "cheerio";
import { loadEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/supabase-admin.mjs";

const MINUTES_AGENDAS_URL =
  "https://www.comoxvalleyrd.ca/minutes-agendas";
const NEWS_URL = "https://www.comoxvalleyrd.ca/news";
const BASE_URL = "https://www.comoxvalleyrd.ca";
const USER_AGENT =
  "ComoxValleyCouncilWatch/1.0 (LocalGovMonitor; +mailto:info@example.com)";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PAGE_DELAY_MS = 2000;
const AGENDA_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 15000;
const MIN_DESCRIPTION_LENGTH = 80;
const MAX_CONTENT_LENGTH = 2000;

const BOARD_COMMITTEE_NAMES = [
  "Comox Valley Regional District Board (CVRD)",
  "Comox Valley Regional District Board",
];

let debugHtmlSaved = false;

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

async function fetchWithRetry(url, opts = {}, retries = 2) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            opts.binary ? "application/pdf,*/*" : "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
        ...opts,
      });
      clearTimeout(timeout);
      if (res.ok) return opts.binary ? res.arrayBuffer() : res.text();
      if (res.status === 404) throw new Error(`Not found: ${url}`);
      if (i < retries) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        throw new Error(`Timeout fetching ${url}`);
      }
      if (i < retries) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
      else throw err;
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

function parseDateFromRow(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const match = dateStr.match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!match) return null;
  const [, monthName, day, year] = match;
  const monthNum = new Date(`${monthName} 1, 2000`).getMonth() + 1;
  return `${year}-${String(monthNum).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Check news for Board meeting highlight-style posts (like Courtenay).
 * Returns [] if none found — we fall back to minutes/agendas.
 */
async function findNewsHighlights() {
  try {
    const html = await fetchWithRetry(NEWS_URL);
    const $ = cheerio.load(html);
    const links = [];

    $('a[href*="/news/"]').each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (!href || !text) return;
      const full = href.startsWith("http") ? href : BASE_URL + (href.startsWith("/") ? href : "/" + href);
      const lower = text.toLowerCase();
      if (
        lower.includes("board meeting") ||
        lower.includes("council") ||
        lower.includes("board highlights") ||
        lower.includes("agenda") ||
        lower.includes("minutes")
      ) {
        links.push({ href: full, text });
      }
    });

    const seen = new Set();
    return links.filter(({ href }) => {
      if (seen.has(href)) return false;
      seen.add(href);
      return true;
    });
  } catch (err) {
    console.error(`News check failed: ${err.message}`);
    return [];
  }
}

/**
 * Scrape minutes-agendas portal for Board meeting rows.
 * Returns { date, title, agendaUrl, minutesUrl, videoUrl }[] for Board (CVRD) only.
 */
async function findBoardMeetingsFromPortal() {
  const html = await fetchWithRetry(MINUTES_AGENDAS_URL);
  const $ = cheerio.load(html);
  const meetings = [];

  $("table tbody tr, table tr").each((_, row) => {
    const $row = $(row);
    const cells = $row.find("td").toArray();
    if (cells.length < 2) return;

    const dateCell = $(cells[0]).text().trim();
    const committeeCell = $(cells[1]).text().trim();

    const isBoard = BOARD_COMMITTEE_NAMES.some((name) =>
      committeeCell.includes(name)
    );
    if (!isBoard) return;

    const date = parseDateFromRow(dateCell);
    if (!date) return;

    let agendaUrl = null;
    let minutesUrl = null;
    let videoUrl = null;

    $row.find('a[href*="cvrdagendaminutes"], a[href*="CVRDAgendas"], a[href*="CVRDminutes"]').each(
      (_, a) => {
        const href = $(a).attr("href");
        const text = $(a).text().toLowerCase();
        if (!href) return;
        const full = href
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"');
        if (full.includes("CVRDAgendas") || full.includes("agendas")) {
          agendaUrl = full;
        } else if (full.includes("CVRDminutes") || full.includes("minutes")) {
          minutesUrl = full;
        }
      }
    );

    $row.find('a[href*="youtube.com"], a[href*="youtu.be"]').each((_, a) => {
      const href = $(a).attr("href");
      if (href) videoUrl = href.replace(/&amp;/g, "&");
    });

    const title = `CVRD Board Meeting – ${dateCell.split(" - ")[0] || date}`;

    meetings.push({
      date,
      title,
      agendaUrl,
      minutesUrl,
      videoUrl,
    });
  });

  const seen = new Set();
  return meetings
    .filter((m) => m.agendaUrl || m.minutesUrl) // need agenda or minutes to scrape
    .filter((m) => {
      const key = `${m.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Browser-like headers for cvrdagendaminutes (ASP.NET may block bot UAs) */
const CVRD_FETCH_HEADERS = {
  "User-Agent": BROWSER_USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

function isCvrdAgendaDomain(url) {
  try {
    return new URL(url).hostname === "cvrdagendaminutes.comoxvalleyrd.ca";
  } catch {
    return false;
  }
}

/**
 * Fetch content from cvrdagendaminutes. Returns { type: 'html'|'pdf', text?, html? }.
 * Attempt 1: Browser-like headers + PrinterVersion=1
 * Attempt 2: Playwright (if fetch fails and playwright available)
 * Uses NODE_TLS_REJECT_UNAUTHORIZED=0 for cvrdagendaminutes (invalid SSL cert).
 */
async function fetchCvrdContent(url) {
  if (!url) return null;

  await new Promise((r) => setTimeout(r, AGENDA_DELAY_MS));

  let fetchUrl = url;
  try {
    const u = new URL(url);
    u.searchParams.set("PrinterVersion", "1");
    fetchUrl = u.toString();
  } catch {
    // keep original if URL parse fails
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const originalTLS = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (isCvrdAgendaDomain(fetchUrl)) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  try {
    const res = await fetch(fetchUrl, {
      headers: {
        ...CVRD_FETCH_HEADERS,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("pdf")) {
      const buf = await res.arrayBuffer();
      const data = await pdf(Buffer.from(buf));
      const result = { type: "pdf", text: data.text };
      const preview = (data.text || "").slice(0, 500);
      console.error(
        `  Content preview (${(data.text || "").length} chars): ${preview}`
      );
      return result;
    }

    const html = await res.text();
    console.error(
      `  Content preview (${html.length} chars): ${html.slice(0, 500)}`
    );
    return { type: "html", html };
  } catch (err) {
    clearTimeout(timeout);
    console.error(`  Fetch failed: ${err.message}, trying Playwright...`);
    return await fetchCvrdContentWithPlaywright(fetchUrl);
  } finally {
    if (isCvrdAgendaDomain(fetchUrl)) {
      if (originalTLS === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTLS;
      }
    }
  }
}

/**
 * Playwright fallback when fetch is blocked (cookies/sessions required).
 * Uses ignoreHTTPSErrors for cvrdagendaminutes invalid SSL cert.
 * Use: npx playwright install chromium
 */
async function fetchCvrdContentWithPlaywright(url) {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    const content = await page.content();
    await browser.close();
    console.error(
      `  Content preview (${content.length} chars): ${content.slice(0, 500)}`
    );
    return { type: "html", html: content };
  } catch (err) {
    console.error(`  Playwright failed: ${err.message}`);
    return null;
  }
}

/**
 * Parse CVRD staff reports from text. Uses SUBJECT:, PURPOSE, BACKGROUND, RECOMMENDATION.
 * CVRD format similar to Comox.
 */
function parseCvrdStaffReport(block) {
  const lines = block.split(/\r?\n/).map((l) => l.trim());
  let title = null;
  let purpose = [];
  let background = [];
  let recommendation = [];
  let inPurpose = false;
  let inBackground = false;
  let inRecommendation = false;

  const metadataKeys = /^(Meeting|TO|FROM|FILE|DATE|RE):\s*/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ul = line.toUpperCase();

    if (/^SUBJECT:\s*/i.test(line)) {
      title = line.replace(/^SUBJECT:\s*/i, "").trim();
      continue;
    }
    if (metadataKeys.test(line)) continue;
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
    if (
      /^RECOMMENDATION(S)?:?\s*$/i.test(line) ||
      /^RECOMMENDATION\s/i.test(ul)
    ) {
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

function parseCvrdBylaw(block) {
  const bylawMatch = block.match(
    /(?:CVRD\s+)?Bylaw No\.\s*(\d+)\s*[–-]\s*([^\n]+)/i
  );
  if (!bylawMatch) {
    const alt = block.match(/Bylaw No\.\s*(\d+)\s*[–-]\s*([^\n]+)/i);
    if (!alt) return null;
    return parseBylawWithMatch(block, alt);
  }
  return parseBylawWithMatch(block, bylawMatch);
}

function parseBylawWithMatch(block, match) {
  const [, num, name] = match;
  const title = `Bylaw No. ${num} – ${name.trim()}`;
  const titleMatch = block.match(
    /TITLE\s*[:\s]+(.+?)(?=\n\n|\n[A-Z]{2,}|\n\d\.|$)/is
  );
  const purposeMatch = block.match(
    /PURPOSE\s*[:\s]+(.+?)(?=\n\n|\n[A-Z]{2,}|\n\d\.|$)/is
  );
  let description = "";
  if (titleMatch) description = titleMatch[1].trim().replace(/\s+/g, " ");
  if (purposeMatch)
    description +=
      (description ? " " : "") +
      purposeMatch[1].trim().replace(/\s+/g, " ");
  if (!description) description = block.slice(0, 800).replace(/\s+/g, " ").trim();
  description = capContent(description, MAX_CONTENT_LENGTH);
  if (description.length < MIN_DESCRIPTION_LENGTH) return null;
  return { title, description, rawContent: title + "\n\n" + description };
}

function parseAgendaPdf(text) {
  if (!text || typeof text !== "string") return [];

  let clean = text;
  clean = clean.replace(
    /\b[A-Za-z]+\s+\d{1,2},\s+\d{4}[^P]*Page\s*\d+/gi,
    ""
  );
  clean = clean.replace(
    /Comox Valley Regional District[^P]*Page\s*\d+/gi,
    ""
  );
  clean = clean.replace(
    /CVRD\s+Bylaw No\.\s*\d+[^–-]*[–-][^P]*\s*Page\s*\d+/gi,
    ""
  );

  const items = [];
  const sectionRegex =
    /(?=\bSTAFF REPORT\b)|(?=CVRD\s+Bylaw No\.\s*\d+)|(?=Bylaw No\.\s*\d+[^0-9])|(?=RECEIVED LOG:)/gi;
  const parts = clean
    .split(sectionRegex)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const upper = part.toUpperCase();
    if (upper.startsWith("STAFF REPORT")) {
      const item = parseCvrdStaffReport(part);
      if (item) items.push(item);
    } else if (/\b(?:CVRD\s+)?Bylaw No\.\s*\d+/i.test(part)) {
      const item = parseCvrdBylaw(part);
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

/**
 * Parse CVRD agenda HTML — table layout with BLOCKQUOTE tags.
 * Section headers: F. REPORTS, G. BYLAWS AND RESOLUTIONS.
 * Numbered items: <td><b>1)</b></td><td colspan=3><b>TITLE</b></td>
 * Descriptions and recommendations in <BLOCKQUOTE>.
 */
function parseCvrdAgendaHtml(html) {
  const $ = cheerio.load(html);
  const items = [];

  $("td b").each((_, el) => {
    const text = $(el).text().trim();
    const match = text.match(/^(\d+)\)$/);
    if (!match) return;

    const row = $(el).closest("tr");
    const titleTd = row.find("td[colspan] b");
    const title = titleTd.text().trim();
    if (!title) return;

    let description = "";
    let recommendation = "";
    let currentRow = row.next("tr");

    while (currentRow.length) {
      const cellText = currentRow.text().trim();

      const hasNumberedItem = currentRow
        .find("td b")
        .toArray()
        .some((b) => /^\d+\)$/.test($(b).text().trim()));
      const isSectionHeader = /^[A-Z]\.\s+[A-Z]/.test(cellText);
      if (hasNumberedItem || isSectionHeader) break;

      currentRow.find("blockquote").each((_, bq) => {
        const bqText = $(bq).text().trim();
        if (!bqText) return;
        if (bqText.startsWith("THAT ")) {
          recommendation += (recommendation ? "\n" : "") + bqText;
        } else if (
          bqText.startsWith("Report dated") ||
          bqText.startsWith("NOTE:") ||
          bqText.length > 50
        ) {
          description += (description ? "\n" : "") + bqText;
        }
      });

      currentRow = currentRow.next("tr");
    }

    const isCommitteeMinutes =
      /COMMITTEE|COMMISSION|FORUM/i.test(title) &&
      /minutes dated.*for receipt/i.test(description) &&
      !recommendation;
    if (isCommitteeMinutes) return;

    if (/^ADOPTION OF MINUTES/i.test(title)) return;
    if (/CLOSED MEETING|IN.?CAMERA|TRADITIONAL TERRITOR|LAND ACKNOWLEDGMENT/i.test(title)) return;

    const cleanTitle = title
      .replace(/^RECOMMENDATION for /i, "")
      .replace(/\s+/g, " ")
      .trim();

    const leadingQuote = (cleanTitle.match(/^["\u201C\u201D]/) ?? [""])[0];
    const stripped = cleanTitle.replace(/^["\u201C\u201D]/, "");

    const words = stripped.split(/\s+/);
    const smallWords = [
      "AND",
      "OR",
      "THE",
      "OF",
      "FOR",
      "IN",
      "TO",
      "A",
      "AN",
    ];
    const titleCased = words
      .map((word, i) => {
        if (smallWords.includes(word) && i > 0) {
          return word.toLowerCase();
        }
        if (/^(CVRD|MRDT|OAP|OCP|ALR)$/i.test(word)) return word;
        if (/^Bylaw$/i.test(word)) return "Bylaw";
        if (/^No\.$/i.test(word)) return "No.";
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");
    const formattedTitle = leadingQuote + titleCased;

    const rawContent = [formattedTitle, description, recommendation]
      .filter(Boolean)
      .join("\n\n");

    if (rawContent.length < 100) return;

    items.push({
      title: formattedTitle,
      description: (description || "").slice(0, MAX_CONTENT_LENGTH),
      rawContent: rawContent.slice(0, MAX_CONTENT_LENGTH),
      decision: recommendation || null,
    });
  });

  return items;
}

function capContent(s, max) {
  if (!s) return "";
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + "…";
}

/**
 * Scrape meeting content. Attempt 3: Prefer minutes over agenda when both exist
 * — minutes contain what council actually decided; agendas are pre-meeting.
 */
async function scrapeMeeting(meeting) {
  const agendaUrl = meeting.agendaUrl;
  const minutesUrl = meeting.minutesUrl;

  if (!agendaUrl && !minutesUrl) {
    return { ...meeting, items: [] };
  }

  // Try agenda first (our parser understands this format), fall back to minutes
  const urlsToTry = [agendaUrl, minutesUrl].filter(Boolean);

  let content = null;
  for (const url of urlsToTry) {
    content = await fetchCvrdContent(url);
    if (content) break;
  }

  if (!content) return { ...meeting, items: [] };

  // Debug: dump first meeting's HTML to inspect DOM structure
  if (content.type === "html" && content.html && !debugHtmlSaved) {
    writeFileSync("/tmp/cvrd-agenda-debug.html", content.html);
    console.error("  Wrote debug HTML to /tmp/cvrd-agenda-debug.html");
    debugHtmlSaved = true;
  }

  let items = [];
  if (content.type === "pdf") {
    items = parseAgendaPdf(content.text || "");
  } else {
    items = parseCvrdAgendaHtml(content.html || "");
  }

  return { ...meeting, items };
}

async function storeCvrdResults(supabase, results, municipalityId) {
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
          },
          { onConflict: "municipality_id,date,meeting_type" }
        )
        .select("id")
        .single();

      if (meetingErr)
        throw new Error(`Meeting upsert failed: ${meetingErr.message}`);

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
              ...(item.decision != null && { decision: item.decision }),
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
            ...(item.decision != null && { decision: item.decision }),
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

  console.error("Checking CVRD for scrapeable content...");

  let meetings = [];
  const newsHighlights = await findNewsHighlights();

  if (newsHighlights.length > 0) {
    console.error(
      `Found ${newsHighlights.length} potential highlight-style news links`
    );
    for (let i = 0; i < Math.min(newsHighlights.length, limit); i++) {
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
      const { href, text } = newsHighlights[i];
      console.error(`Fetching news: ${text}`);
      try {
        const html = await fetchWithRetry(href);
        const $ = cheerio.load(html);
        const $content =
          $("article, [role='main'], .content, main, .field--name-body").first() ||
          $("body");
        $content.find("nav, footer, script, style").remove();
        const items = [];
        $content.find("h2, h3").each((_, el) => {
          const title = $(el).text().trim();
          if (!title || /^related|^share|^contact/i.test(title)) return;
          let desc = "";
          $(el)
            .nextAll()
            .each(function () {
              if ($(this).is("h2, h3")) return false;
              desc += " " + $(this).text().trim();
            });
          if (title.length > 3 && desc.trim().length > 50) {
            items.push({
              title,
              description: capContent(desc.trim(), MAX_CONTENT_LENGTH),
              rawContent: title + "\n\n" + desc.trim(),
            });
          }
        });
        if (items.length > 0) {
          const dateMatch = text.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
          const date = dateMatch
            ? `${dateMatch[3]}-${String(new Date(dateMatch[1] + " 1, 2000").getMonth() + 1).padStart(2, "0")}-${dateMatch[2].padStart(2, "0")}`
            : new Date().toISOString().slice(0, 10);
          meetings.push({
            date,
            title: text,
            agendaUrl: href,
            minutesUrl: null,
            videoUrl: null,
            items,
          });
        }
      } catch (err) {
        console.error(`  Error: ${err.message}`);
      }
    }
  }

  if (meetings.length === 0) {
    console.error("No highlights found. Falling back to minutes-agendas portal...");
    const boardMeetings = await findBoardMeetingsFromPortal();
    console.error(`Found ${boardMeetings.length} Board meetings`);

    for (let i = 0; i < Math.min(boardMeetings.length, limit); i++) {
      const m = boardMeetings[i];
      console.error(
        `\nScraping (${i + 1}/${Math.min(boardMeetings.length, limit)}): ${m.title}`
      );
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
      try {
        const parsed = await scrapeMeeting(m);
        meetings.push(parsed);
        console.error(`  → ${parsed.items.length} items from agenda`);
      } catch (err) {
        console.error(`  → Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  if (dryRun) {
    console.log(JSON.stringify(meetings, null, 2));
    return;
  }

  if (meetings.length === 0) {
    console.error("No meetings scraped. Exiting.");
    return;
  }

  loadEnv();
  const supabase = createAdminClient();

  const { data: mun } = await supabase
    .from("municipalities")
    .select("id")
    .eq("short_name", "CVRD")
    .single();

  if (!mun) throw new Error("CVRD municipality not found. Run db:seed first.");

  const { totalItemsFound, totalItemsNew } = await storeCvrdResults(
    supabase,
    meetings,
    mun.id
  );
  const existing = totalItemsFound - totalItemsNew;
  console.error(
    `\nScrape complete: ${meetings.length} meetings processed, ${totalItemsNew} new items stored, ${existing} items already existed.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
