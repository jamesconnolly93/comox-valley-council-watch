/**
 * PDF utilities for the pipeline.
 *
 * Download PDFs, extract per-page text, split into sub-PDFs per item,
 * and find correspondence sections.
 */

import { PDFDocument } from "pdf-lib";
import pdf from "pdf-parse/lib/pdf-parse.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MAX_CLAUDE_PAGES = 15;

// ── In-memory PDF cache (per pipeline run) ──────────────────────────

const pdfCache = new Map();

export function clearPdfCache() {
  pdfCache.clear();
}

// ── Download ─────────────────────────────────────────────────────────

/**
 * Download a PDF from a URL with retry. Caches per URL within a run.
 *
 * @param {string} url
 * @param {{ retries?: number, allowInsecureSsl?: boolean, timeoutMs?: number }} opts
 * @returns {Promise<Buffer>}
 */
export async function downloadPdf(url, opts = {}) {
  if (pdfCache.has(url)) return pdfCache.get(url);

  const { retries = 2, allowInsecureSsl = false, timeoutMs = 30_000 } = opts;

  const originalTLS = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (allowInsecureSsl) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  try {
    for (let i = 0; i <= retries; i++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(url, {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/pdf,*/*",
          },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          if (res.status === 404) throw new Error(`PDF not found: ${url}`);
          throw new Error(`HTTP ${res.status} fetching ${url}`);
        }

        const buf = Buffer.from(await res.arrayBuffer());
        pdfCache.set(url, buf);
        return buf;
      } catch (err) {
        if (i < retries) {
          await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        } else {
          throw err;
        }
      }
    }
  } finally {
    if (allowInsecureSsl) {
      if (originalTLS === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTLS;
      }
    }
  }
}

// ── Per-page text extraction ─────────────────────────────────────────

/**
 * Extract text content for each page of a PDF.
 * Returns an array where index = 0-based page number, value = page text.
 *
 * @param {Buffer} pdfBuffer
 * @returns {Promise<string[]>}
 */
export async function getPageTexts(pdfBuffer) {
  const pageTexts = [];

  // pdf-parse calls this for each page; we collect per-page text
  function renderPage(pageData) {
    return pageData.getTextContent().then((textContent) => {
      const text = textContent.items.map((item) => item.str).join(" ");
      pageTexts.push(text);
      return text;
    });
  }

  await pdf(pdfBuffer, { pagerender: renderPage });
  return pageTexts;
}

// ── Page range extraction ────────────────────────────────────────────

/**
 * Extract a page range from a PDF into a new sub-PDF.
 * Returns base64-encoded PDF ready for the Anthropic API.
 *
 * @param {Buffer} pdfBuffer - Full PDF buffer
 * @param {number} startPage - 0-based inclusive
 * @param {number} endPage - 0-based inclusive
 * @returns {Promise<{ base64: string, pageCount: number }>}
 */
export async function extractPages(pdfBuffer, startPage, endPage) {
  const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();

  const start = Math.max(0, startPage);
  const end = Math.min(totalPages - 1, endPage);
  // Cap at 50 pages — staff reports rarely exceed this; tail is appendices/boilerplate
  const effectiveEnd = Math.min(end, start + MAX_CLAUDE_PAGES - 1);

  const indices = [];
  for (let i = start; i <= effectiveEnd; i++) {
    indices.push(i);
  }

  const newDoc = await PDFDocument.create();
  const pages = await newDoc.copyPages(srcDoc, indices);
  for (const page of pages) {
    newDoc.addPage(page);
  }

  const pdfBytes = await newDoc.save();
  return {
    base64: Buffer.from(pdfBytes).toString("base64"),
    pageCount: pages.length,
  };
}

// ── Item-to-page mapping ─────────────────────────────────────────────

/**
 * Normalise a string for fuzzy matching: lowercase, collapse whitespace.
 */
function norm(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Build search patterns for an item from its title.
 * Returns an array of strings to search for in page text.
 */
function buildSearchPatterns(item) {
  const title = item.title || "";
  const patterns = [];

  // Full title
  if (title.length > 10) {
    patterns.push(norm(title));
  }

  // Bylaw pattern: "Bylaw No. 2056"
  const bylawMatch = title.match(/Bylaw\s+No\.?\s*(\d+)/i);
  if (bylawMatch) {
    patterns.push(norm(`Bylaw No. ${bylawMatch[1]}`));
    patterns.push(norm(`Bylaw No.${bylawMatch[1]}`));
  }

  // SUBJECT line from staff reports (common in Comox/Cumberland PDFs)
  const subjectText = title.replace(/^(Staff Report|Report to Council)\s*[-–:]\s*/i, "").trim();
  if (subjectText.length > 10 && subjectText !== title) {
    patterns.push(norm(subjectText));
  }

  // First significant words (for partial matching)
  const words = title.split(/\s+/).filter((w) => w.length > 3);
  if (words.length >= 3) {
    patterns.push(norm(words.slice(0, 4).join(" ")));
  }

  return patterns;
}

/**
 * Map items to their page ranges within a meeting PDF.
 *
 * @param {string[]} pageTexts - Per-page text from getPageTexts()
 * @param {Array<{id: string, title: string}>} items
 * @returns {Map<string, {startPage: number, endPage: number}>}
 */
export function findItemPages(pageTexts, items) {
  const result = new Map();
  const normedPages = pageTexts.map(norm);

  // Find the start page for each item
  const itemStarts = [];
  for (const item of items) {
    const patterns = buildSearchPatterns(item);
    let foundPage = -1;

    for (const pattern of patterns) {
      if (!pattern) continue;
      for (let p = 0; p < normedPages.length; p++) {
        if (normedPages[p].includes(pattern)) {
          foundPage = p;
          break;
        }
      }
      if (foundPage >= 0) break;
    }

    itemStarts.push({ id: item.id, startPage: foundPage });
  }

  // Sort by start page to determine end pages
  const mapped = itemStarts
    .filter((s) => s.startPage >= 0)
    .sort((a, b) => a.startPage - b.startPage);

  for (let i = 0; i < mapped.length; i++) {
    const current = mapped[i];
    const next = mapped[i + 1];
    const endPage = next ? Math.max(current.startPage, next.startPage - 1) : pageTexts.length - 1;

    result.set(current.id, {
      startPage: current.startPage,
      endPage,
    });
  }

  return result;
}

// ── Correspondence section detection ─────────────────────────────────

const CORRESPONDENCE_MARKERS = [
  /received\s+log/i,
  /written\s+submissions?/i,
  /public\s+input/i,
  /public\s+correspondence/i,
  /page\s+20-/i,
  /letters?\s+of\s+(support|opposition)/i,
];

/**
 * Find the page range of public correspondence in a meeting PDF.
 *
 * @param {string[]} pageTexts
 * @returns {{ startPage: number, endPage: number } | null}
 */
export function findCorrespondencePages(pageTexts) {
  const normedPages = pageTexts.map(norm);

  let startPage = -1;
  for (let p = 0; p < normedPages.length; p++) {
    for (const marker of CORRESPONDENCE_MARKERS) {
      if (marker.test(normedPages[p])) {
        startPage = p;
        break;
      }
    }
    if (startPage >= 0) break;
  }

  if (startPage < 0) return null;

  let endPage = pageTexts.length - 1;

  // Enforce Claude's page limit
  if (endPage - startPage + 1 > MAX_CLAUDE_PAGES) {
    endPage = startPage + MAX_CLAUDE_PAGES - 1;
  }

  return { startPage, endPage };
}
