# Comox Valley Council Watch

A local government monitoring app for the Comox Valley that scrapes, summarizes, and alerts on council meeting agendas, minutes, and highlights across Courtenay, Comox, and CVRD.

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase account (or Supabase CLI for local dev)

### 1. Install dependencies

```bash
npm install
```

If you hit npm cache permission errors: `sudo chown -R $(whoami) ~/.npm`

### 2. Set up Supabase

**Option A: Supabase Cloud**

1. Create a project at [supabase.com](https://supabase.com)
2. Copy `.env.example` to `.env.local` and add your project URL and keys
3. Run migrations in the Supabase SQL Editor:
   - Copy contents of `supabase/migrations/20250226000001_initial_schema.sql`
   - Execute in the SQL Editor
4. Run the seed: copy `supabase/seed.sql` and execute

**Option B: Supabase CLI (local)**

```bash
npx supabase init   # if not already done
npx supabase start
npx supabase db reset   # runs migrations + seed
```

### 3. Run the Courtenay highlights scraper

Validates output before wiring into cron. Outputs JSON to stdout.

```bash
npm run scrape:courtenay
```

Options:

- `LIMIT=5` — scrape up to 5 highlights pages (default: 3)
- `LIMIT=1` — quick smoke test

Example output:

```json
[
  {
    "url": "https://www.courtenay.ca/news/2026-02-12/...",
    "meetingDate": "2026-02-11",
    "publishDate": "2026-02-12",
    "itemCount": 12,
    "items": [
      {
        "title": "Water conservation rebate program",
        "description": "...",
        "decision": "Council approved...",
        "rawContent": "..."
      }
    ]
  }
]
```

### 4. Dev server

```bash
npm run dev
```

## Project structure

```
├── src/
│   ├── app/              # Next.js App Router
│   └── lib/
│       └── supabase/     # Supabase clients (browser, server, admin)
├── scripts/
│   ├── scrape-courtenay-highlights.mjs   # Standalone Courtenay scraper
│   └── scrape-courtenay-highlights.ts    # TypeScript source
├── supabase/
│   ├── migrations/       # SQL migrations
│   └── seed.sql          # Municipality seed data
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run scrape:courtenay` | Run Courtenay highlights scraper (JSON to stdout) |
| `npm run db:seed` | Reset DB and run seed (requires Supabase CLI) |

## Next steps

- **Milestone 2**: Wire scraper to Supabase, add Claude AI summarization pipeline
- **Milestone 3**: Build feed UI with filtering and search
- **Milestone 4**: Auth + keyword alerts
- **Milestone 5**: Email digests, cron jobs
