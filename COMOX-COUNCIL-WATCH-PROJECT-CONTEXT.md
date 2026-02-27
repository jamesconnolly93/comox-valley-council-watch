# Comox Valley Council Watch — Full Project Context

Upload this file when starting a new Claude chat to continue coaching on this project.

---

## What This Is

A civic transparency tool for the Comox Valley (BC, Canada) that scrapes municipal council meeting agendas/minutes, summarizes them with AI at three reading levels, extracts public feedback from PDFs, and presents everything in a searchable feed. The goal is to make local government accessible to ordinary residents.

**Live site:** https://comox-valley-council-watch.vercel.app
**Local repo:** ~/Documents/comox-valley-council-watch
**Stack:** Next.js 16, Supabase (hosted), Claude API (Anthropic), Vercel deployment
**Key files:** CLAUDE.md (project root, for Claude Code), SPECS.md (project root, strategic roadmap)

---

## Who I Am

James, Head of Finance at Jito Labs (crypto infrastructure). Based in Comox, BC. Building this as a community side project. Using Claude Code (CLI tool) for implementation — I feed it specs and it writes the code. I need strategic/product coaching, code review, deployment help, and spec writing for Claude Code sessions.

---

## Architecture

### Scrapers (scripts/)
- `scrape-courtenay.mjs` — Scrapes Courtenay council highlights pages (HTML)
- `scrape-comox.mjs` — Scrapes Comox council agendas/minutes (PDF-based)
- `scrape-cumberland.mjs` — Scrapes Cumberland council agendas (PDF-based, NEW)
- `scrape-cvrd.mjs` — Scrapes CVRD board meetings (Playwright-based, requires headed browser)

### AI Processing (scripts/)
- `process-ai-summaries.mjs` — Sends raw content to Claude API, gets back:
  - `summary_simple` / `summary_standard` / `summary_expert` (three complexity levels)
  - `impact` callout (personal relevance framing)
  - `categories` array
  - `is_significant` boolean
  - `bylaw_number` (if applicable)
- `process-feedback.mjs` — Extracts Community Voices from public hearing correspondence PDFs:
  - Counts letters, analyzes sentiment (support/oppose/neutral)
  - Extracts 3-6 distinct positions with counts and details
  - Stores in `public_feedback` table

### Frontend (src/)
- `src/app/page.tsx` — Main feed page (server component)
- `src/app/actions.ts` — Server actions: getFilteredItems, getHighlights
- `src/app/item/[id]/page.tsx` — Individual item pages with OG tags
- `src/app/item/[id]/opengraph-image/route.tsx` — Dynamic OG image generation
- `src/app/api/react/route.ts` — Reaction button API
- `src/app/api/subscribe/route.ts` — Email subscription
- `src/app/api/confirm/route.ts` — Email confirmation
- `src/app/api/unsubscribe/route.ts` — Unsubscribe
- `src/app/api/cron/pipeline/route.ts` — Weekly scraper cron
- `src/components/` — ItemCard, FilterBar, ComplexitySlider, Highlights, CommunityVoices, DigestSignup, ReactionButton, MeetingGroup
- `src/lib/feed.ts` — Shared utilities: isActionableImpact, municipalityBadgeClass, complexity hook

### Database (Supabase)
Key tables:
- `municipalities` — Courtenay, Comox, CVRD, Cumberland
- `meetings` — Scraped meetings with dates, raw_feedback text
- `items` — Individual agenda items with summaries, impact, categories, bylaw_number, thread_id
- `public_feedback` — Extracted community voice data (sentiment, positions)
- `reactions` — "This affects me" clicks (fingerprint-based dedup, no auth)
- `subscribers` — Email digest subscribers (double opt-in)
- `issue_threads` — (may exist) Groups items about same bylaw across meetings

### Pipeline Commands
```bash
npm run pipeline              # Full scrape + AI
npm run scrape:courtenay      # Individual scrapers
npm run scrape:comox
npm run scrape:cumberland
npm run scrape:cvrd
npm run process:ai            # AI summaries
npm run process:feedback      # Community Voices extraction
npm run reprocess:summaries   # Re-run AI on existing items (backfill)
npm run send:digest:dry       # Test email digest
```

### Deployment
```bash
git add -A && git commit -m "message" && git push
npx vercel --prod             # Deploy (add --force to bypass cache)
```

### Env Vars (.env.local + Vercel dashboard)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
NEXT_PUBLIC_SITE_URL=https://comox-valley-council-watch.vercel.app
CRON_SECRET=
```

---

## Features Completed

### Core
- [x] 4-municipality scraping (Courtenay, Comox, CVRD, Cumberland)
- [x] AI summaries at 3 complexity levels (Simple/Standard/Expert) with sticky slider
- [x] Impact callouts — personal relevance framing, filtered to only show actionable ones
- [x] Category tagging and filtering (Development, Finance, Infrastructure, etc.)
- [x] Municipality filtering with colored badges
- [x] Expandable item cards with full content, decision text, tags

### Community Intelligence
- [x] Community Voices — extracts public hearing letters, counts them, analyzes sentiment
- [x] Sentiment bar visualization (oppose/support/neutral)
- [x] Ranked positions with letter counts ("Limit building heights to 3-4 storeys" ~52 letters)
- [x] "This affects me" reaction buttons (fingerprint-based, no auth, optimistic UI)

### Growth & Distribution
- [x] Email digest signup (double opt-in via Resend)
- [x] Weekly cron job (Monday 8am PT — pipeline, Monday 9am PT — digest)
- [x] Individual item pages at /item/[id] with OG tags for social sharing
- [x] Share links on each card

### Data Quality
- [x] Bylaw number extraction and deduplication (title regex fallback)
- [x] Content cleanup (PDF artifacts, boilerplate removal)
- [x] Title case fixes for CVRD items

---

## Current State / In Progress

### UX Overhaul (Claude Code session was IN PROGRESS when context was saved)
Claude Code was implementing a major UX overhaul with these 4 tasks:

1. **Compact cards** — Collapsed default state showing: impact line, title, municipality badge, reaction count, Community Voices badge. Full content on expand. Goal: 2-3 lines per card when collapsed.

2. **Issue-based grouping** — Replace meeting-chronology feed with issue threads. Items sharing same bylaw_number group together. Shows thread title, meeting count, latest status. Standalone items show below.

3. **Landing entry points** — Three clickable topic cards at top: "Your Money" (Finance filter), "Development" (Development + Housing), "Hot Topics" (sorted by reactions + letters). Replace blank space above email signup.

4. **Mobile polish** — Filter bar collapses on mobile. Compact cards at 375px.

**Status:** Claude Code was mid-implementation when it hit a rate limit. It had completed the issue grouping logic in actions.ts (screenshot showed groupItemsByIssue function, "hot" sort by feedback count). Unclear if all 4 tasks completed. 

**To check:** Run `npm run build` locally to see if it compiles. If it does, test at localhost:3000. If not, re-prompt Claude Code with: "Continue the UX overhaul where you left off. Read CLAUDE.md for context."

---

## Strategic Roadmap (from SPECS.md)

### Phase 1: Make it spreadable (NOW)
- Compact cards + issue grouping (in progress)
- Landing entry points
- Mobile polish
- Historical backfill (6-12 months of meetings)

### Phase 2: Make it participatory (NEXT MONTH)
- Neighbourhood relevance selector (personalize feed by area)
- Issue thread pages at /issue/[slug] with timeline visualization
- YouTube video timestamps (link to exact discussion moment)

### Phase 3: Make it authoritative (LATER)
- Package community signal data for council members
- "247 residents viewed this item. 52% want 4-storey limits."
- Custom domain: comoxcouncilwatch.ca

---

## Known Issues & Technical Debt

1. **Supabase CLI broken locally** — use SQL Editor in browser for all migrations
2. **CVRD scraper needs Playwright** — can't run in Vercel cron (excluded from automated pipeline)
3. **Next.js lockfile warning** — extra package-lock.json in parent directory, harmless
4. **Historical data limited** — only Nov 2025 - Feb 2026 currently scraped
5. **Bylaw dedup** — works via title regex fallback, but running `npm run reprocess:summaries` would populate the actual bylaw_number column for cleaner matching
6. **Feb 4 Comox meeting** — had 9 letters extracted but not processed through feedback pipeline
7. **Scanned/handwritten letters** — not extractable as text, only counted by page estimation
8. **Highlights hero section** — may not show when municipality filter is active (by design) but query was also fixed to fetch 40 candidates instead of 5

## Cost Tracking
- AI backfill (40 items): ~$3-4
- Feedback processing per meeting: ~$0.50-1.00
- Regular AI summaries: ~$0.10 per item
- Claude Code sessions: varies, track with `/cost`

---

## How to Work With Me

I use **Claude Code** (CLI tool) to implement features. My workflow:
1. We discuss strategy and design in Claude.ai chat (this conversation)
2. You write detailed specs for each feature
3. I paste specs into Claude Code in my terminal
4. Claude Code writes the code, I test locally, deploy to Vercel
5. You review the deployed site and we iterate

When writing specs for Claude Code, include:
- Database migrations (SQL for Supabase SQL Editor)
- File locations and component names
- Specific behavior descriptions
- Always start with "Read CLAUDE.md for context"

When I share Claude Code output, it's usually a summary table of what was built + any migrations to run manually.
