#!/usr/bin/env npx tsx
/**
 * Courtenay Council Meeting Highlights Scraper
 *
 * Standalone script to fetch and parse council meeting highlights from
 * courtenay.ca. Run with: npm run scrape:courtenay
 *
 * Outputs JSON to stdout for validation. Does not require Supabase.
 */

import * as cheerio from "cheerio";

const NEWS_LISTING_URL = "https://www.courtenay.ca/news";
const BASE_URL = "https://www.courtenay.ca";
const USER_AGENT =
  "ComoxValleyCouncilWatch/1.0 (LocalGovMonitor; +mailto:info@example.com)";

interface ScrapedItem {
  title: string;
  description: string;
  decision: string | null;
  rawContent: string;
}

interface ScrapedHighlights {
  url: string;
  meetingDate: string;
  publishDate: string;
  itemCount: number;
  items: ScrapedItem[];
}

async function fetchWithRetry(
  url: string,
  retries = 2
): Promise<string> {
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

function extractMeetingDateFromUrl(url: string): string | null {
  // Pattern: /news/2026-02-12/courtenay-council-meeting-highlights-february-11-2026
  const match = url.match(/courtenay-council-meeting-highlights-([a-z]+)-(\d+)-(\d+)/i);
  if (match) {
    const [, month, day, year] = match;
    const monthNum = new Date(`${month} 1, 2000`).getMonth() + 1;
    return `${year}-${String(monthNum).padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return null;
}

function extractPublishDateFromUrl(url: string): string | null {
  // Pattern: /news/2026-02-12/...
  const match = url.match(/\/news\/(\d{4}-\d{2}-\d{2})\//);
  return match ? match[1] : null;
}

function parseHighlightsPage(html: string, pageUrl: string): ScrapedHighlights {
  const $ = cheerio.load(html);
  const meetingDate = extractMeetingDateFromUrl(pageUrl) ?? "unknown";
  const publishDate = extractPublishDateFromUrl(pageUrl) ?? "unknown";

  const items: ScrapedItem[] = [];
  const seenTitles = new Set<string>();

  // Main content area - municipal sites often use article, main, or a content class
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

  // Fallback: body if no clear content container
  if (!$content.length || $content.text().trim().length < 100) {
    $content = $("body");
  }

  // Remove nav, footer, sidebar
  $content.find("nav, footer, aside, .sidebar, .menu, script, style").remove();

  // Find all headings (h2, h3) - each typically starts a new item
  const headings = $content.find("h2, h3").toArray();

  for (const headingEl of headings) {
    const $heading = $(headingEl);
    const title = $heading.text().trim();
    if (!title || title.length < 3) continue;

    // Skip generic headings
    const skipPatterns = [
      /^council meeting highlights/i,
      /^related links/i,
      /^share/i,
      /^contact/i,
      /^quick links/i,
    ];
    if (skipPatterns.some((p) => p.test(title))) continue;

    // Dedupe by normalized title
    const normTitle = title.toLowerCase().replace(/\s+/g, " ");
    if (seenTitles.has(normTitle)) continue;
    seenTitles.add(normTitle);

    // Collect content until next heading
    const parts: string[] = [];
    let $next = $heading.next();
    let decision: string | null = null;

    while ($next.length && !$next.is("h2, h3")) {
      const tag = $next.prop("tagName")?.toLowerCase();
      const text = $next.text().trim();

      if (text) {
        // "Council directed...", "Council approved...", "Council received..." = decision
        if (
          /^Council\s+(directed|approved|received|adopted|referred|deferred|denied|authorized|instructed|accepted|endorsed|supported)/i.test(
            text
          ) ||
          /^(Council|Mayor)\s+.*(directed|approved|received)/i.test(text)
        ) {
          decision = text;
        }
        parts.push(text);
      }
      $next = $next.next();
    }

    const description = parts.join("\n\n").trim();
    const rawContent = description || title;

    items.push({
      title,
      description: description || title,
      decision: decision || null,
      rawContent,
    });
  }

  // Fallback: if no h2/h3 structure, try paragraph blocks as items
  if (items.length === 0) {
    $content.find("p").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 50 && !/^(Council meeting|For more information|Contact)/i.test(text)) {
        const firstSentence = text.split(/[.!?]/)[0];
        items.push({
          title: firstSentence.length > 80 ? firstSentence.slice(0, 77) + "..." : firstSentence,
          description: text,
          decision: /Council\s+(directed|approved|received)/i.test(text) ? text : null,
          rawContent: text,
        });
      }
    });
  }

  return {
    url: pageUrl,
    meetingDate,
    publishDate,
    itemCount: items.length,
    items,
  };
}

async function findHighlightsLinks(): Promise<{ href: string; text: string }[]> {
  const html = await fetchWithRetry(NEWS_LISTING_URL);
  const $ = cheerio.load(html);
  const links: { href: string; text: string }[] = [];

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

  // Dedupe by href
  const seen = new Set<string>();
  return links.filter(({ href }) => {
    if (seen.has(href)) return false;
    seen.add(href);
    return true;
  });
}

async function main() {
  const limit = parseInt(process.env.LIMIT || "3", 10);

  console.error("Fetching news listing...");
  const links = await findHighlightsLinks();
  console.error(`Found ${links.length} council meeting highlights links`);

  const results: ScrapedHighlights[] = [];

  for (let i = 0; i < Math.min(links.length, limit); i++) {
    const { href, text } = links[i];
    console.error(`\nScraping (${i + 1}/${Math.min(links.length, limit)}): ${text}`);
    await new Promise((r) => setTimeout(r, 1500)); // Rate limit: 1 req per ~1.5s

    try {
      const html = await fetchWithRetry(href);
      const parsed = parseHighlightsPage(html, href);
      results.push(parsed);
      console.error(`  → ${parsed.itemCount} items extracted`);
    } catch (err) {
      console.error(`  → Error: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
