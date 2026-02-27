# Comox Valley Council Watch

## What This Is
A civic transparency tool for Comox Valley (BC) residents that scrapes municipal council meeting agendas/minutes from Courtenay, Comox, and CVRD, summarizes them with AI at three complexity levels, and presents them in a searchable feed. Live at https://comox-valley-council-watch.vercel.app

## Tech Stack
- **Frontend:** Next.js 16 (App Router), React, TypeScript, Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **AI:** Anthropic Claude API (claude-sonnet-4-20250514) for summarization
- **Deployment:** Vercel
- **Scrapers:** Node.js scripts using cheerio (HTML) and pdf-parse (PDFs), Playwright for CVRD

## Project Structure
```
src/
  app/
    page.tsx          # Main feed page, fetches highlights + filtered items
    actions.ts        # Server actions: getHighlights(), getFilteredItems()
    layout.tsx        # Root layout with fonts (Fraunces + Source Sans 3)
  components/
    FilterBar.tsx     # Municipality pills, complexity slider, category pills, search
    ItemCard.tsx      # Individual agenda item card with expand/collapse
    Highlights.tsx    # "This Week" hero section (top 5 significant items)
    ComplexitySlider.tsx  # Simple/Standard/Expert slider
    CommunityVoices.tsx   # Public feedback display with sentiment bar + positions
  lib/
    complexity-context.tsx  # React context for complexity level (localStorage)
    feed.ts                 # FeedItem type definitions
    supabase/
      client.ts     # Browser Supabase client
      server.ts     # Server Supabase client

scripts/
  scrape-courtenay.mjs    # Scrapes courtenay.ca highlights pages
  scrape-comox.mjs        # Scrapes comox.ca meeting PDFs + public feedback extraction
  scrape-cvrd.mjs         # Scrapes CVRD agenda viewer (SSL workaround, HTML tables)
  process-ai-summaries.mjs  # Generates summaries at 3 levels + impact + categories
  process-feedback.mjs      # Analyzes public correspondence with AI → positions
  reprocess-summaries.mjs   # Backfill script for summary levels
  run-pipeline.mjs          # Orchestrator: scrape all → AI summaries → feedback
  lib/
    ai-prompt.mjs     # AI prompt template for summarization
    supabase.mjs      # Shared Supabase client for scripts

supabase/
  migrations/          # SQL migrations (applied via Supabase SQL Editor)
```

## Database Schema

### municipalities
- id, name, short_name (Courtenay, Comox, CVRD), website_url, scrape_config

### meetings
- id, municipality_id, title, date, source_url, raw_feedback (text, for public correspondence)

### items
- id, meeting_id, title, description, raw_content
- summary (standard), summary_simple, summary_expert
- impact (one-sentence "You/Your" framing)
- decision, recommendation
- category (primary), categories (array), tags
- is_significant (boolean)

### public_feedback
- id, item_id (unique), meeting_id
- feedback_count, sentiment_summary
- support_count, oppose_count, neutral_count
- positions (jsonb array: [{stance, sentiment, count, detail}])
- raw_excerpts (jsonb, legacy)

## Design System
- **Fonts:** Fraunces (headings), Source Sans 3 (body)
- **Colors:** Forest green accent (`--accent`), warm neutrals, PNW-inspired palette
- **CSS variables defined in:** `src/app/globals.css`
- **Style:** Pacific Northwest civic — warm, trustworthy, not corporate
- **No emojis in UI** — use icons from lucide-react or plain symbols
- **Cards:** rounded-xl with subtle borders, bg-surface-elevated for highlights
- **Tags:** small rounded pills, muted colors

## Key Patterns

### Adding a New Scraper
1. Create `scripts/scrape-{municipality}.mjs`
2. Export items as: `{ title, description, rawContent, recommendation?, decision? }`
3. Upsert meetings and items to Supabase (see existing scrapers for pattern)
4. Add `npm run scrape:{name}` to package.json
5. Add to `run-pipeline.mjs`

### AI Processing Pipeline
1. `process-ai-summaries.mjs` finds items with `summary IS NULL`
2. Sends title + rawContent to Claude with structured JSON prompt
3. Returns: summary (3 levels), impact, category, categories, tags, is_significant, decision, recommendation
4. Prompt template lives in `scripts/lib/ai-prompt.mjs`

### Public Feedback Pipeline
1. Scraper extracts correspondence from PDFs → stores in `meetings.raw_feedback`
2. `process-feedback.mjs` sends to Claude → extracts positions with sentiment + counts
3. Results stored in `public_feedback` table, joined to items in frontend query

### Complexity Slider
- Three levels: simple, standard, expert (stored in React context + localStorage)
- `summary_simple`, `summary`, `summary_expert` columns
- ItemCard reads complexity context and displays appropriate summary
- 150ms fade transition on change

### Impact Callouts
- Only shown when `isActionableImpact()` returns true
- Filters out "No direct impact..." variants
- Displayed above title in accent green

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

## Common Commands
```bash
npm run dev              # Local dev server
npm run build            # Production build
npm run pipeline         # Full scrape + AI pipeline
npm run scrape:courtenay
npm run scrape:comox
npm run scrape:cvrd
npm run process:ai       # Generate AI summaries for new items
npm run process:feedback # Process public correspondence
npx vercel --prod        # Deploy to Vercel
```

## Important Notes
- CVRD agenda site has invalid SSL cert — scraper uses NODE_TLS_REJECT_UNAUTHORIZED=0
- Comox PDFs can be 400+ pages — feedback extraction samples first 40K chars
- Public hearing correspondence is in "Page 20-X" sections of Comox PDFs
- Supabase CLI doesn't work locally — use SQL Editor for migrations
- GitHub repo: https://github.com/jamesconnolly93/comox-valley-council-watch
- Vercel project: comox-valley-council-watch

## Coding Conventions
- Scripts use ESM (.mjs) with top-level await
- Frontend uses TypeScript strict mode
- Prefer server components; use 'use client' only when needed (context, localStorage, interactivity)
- Keep AI prompts in dedicated files under scripts/lib/
- Supabase queries in server actions (src/app/actions.ts), not in components
- Use existing CSS variables for colors, don't hardcode hex values in components
