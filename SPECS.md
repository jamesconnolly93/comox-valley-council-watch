# Comox Valley Council Watch — Strategic Review & Next Specs

## Executive Assessment

You've built something genuinely novel. No other tool in the Comox Valley
takes raw 400-page PDFs and turns them into "68 residents wrote letters,
here's what they want, ranked by how many people agree." That Community
Voices feature alone is worth the entire project.

But right now the tool is a **newspaper** — people visit, read, and leave.
The civic technology that actually changes communities (vTaiwan, Polis,
Decidim) all share one trait: they create **feedback loops** between
residents and government. The information doesn't just flow one way.

Here's the strategic frame:

**Phase 1 (now): Make it spreadable**
People need a reason to visit and a reason to share. Right now there's
no trigger to come back next week.

**Phase 2 (next month): Make it participatory** 
Let residents signal what matters to them. Not comments (impossible
to moderate solo), but structured lightweight input that generates
aggregate signal.

**Phase 3 (later): Make it authoritative**
Once you have community signal data, package it for council members
themselves. "247 residents viewed this item. The community is split:
52% want 4-storey limits, 31% support 6 storeys with conditions."
That's data council doesn't have today.

---

## Bugs to Fix First

The SSR impact filter fix didn't fully take — "No direct impact" callouts
are still visible in the deployed HTML. Cumberland may not be showing
in the filter bar. The Highlights hero section may not be rendering.
Bylaw deduplication may not be collapsing older readings.

---

## Spec 1: Weekly Email Digest

**Why:** This is the single highest-leverage feature for growth. A weekly
email turns a website into a habit. Local Facebook groups have proven
that Comox Valley residents want this information — they just don't
know where to find it. An email that arrives Monday morning saying
"3 decisions last week that affect your property taxes" is irresistible.

**What to build:**

A simple email signup (just email address, no auth) and a weekly digest
that summarizes what happened across all four municipalities.

Database:
```sql
CREATE TABLE subscribers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text UNIQUE NOT NULL,
  confirmed boolean DEFAULT false,
  confirmation_token text,
  unsubscribe_token text DEFAULT encode(gen_random_bytes(16), 'hex'),
  municipality_filter text[],  -- optional: only these municipalities
  category_filter text[],      -- optional: only these categories
  created_at timestamptz DEFAULT now()
);
```

Signup component:
- Simple inline form at the top of the page, below the hero: 
  "Get a weekly summary. No spam, unsubscribe anytime."
- Email input + "Subscribe" button
- Sends confirmation email with token link
- Confirmation page at /confirm/[token]

Digest generation (scripts/send-digest.mjs):
- Runs Monday mornings via Vercel cron (after the pipeline)
- Queries items from the past 7 days
- Groups by municipality
- Includes only items with actionable impacts + significant items
- For each item: title, one-sentence summary, impact line, link to /item/[id]
- If Community Voices data exists, include: "68 residents weighed in on
  Bylaw 2056 — see what they said"
- Footer: unsubscribe link, link to full site
- Send via Resend (resend.com) — free tier is 3,000 emails/month

API route: /api/subscribe (POST), /api/confirm/[token] (GET),
/api/unsubscribe/[token] (GET)

Vercel cron addition in vercel.json:
```json
{ "path": "/api/cron/digest", "schedule": "0 17 * * 1" }
```
(Monday 17:00 UTC = 9am PT, one hour after the pipeline runs)

---

## Spec 2: "This Affects Me" Reactions

**Why:** This is the Audrey Tang insight. You don't need comments to
create collective intelligence. You need structured, low-friction
input. A single button — "This affects me" — generates powerful
signal with zero moderation burden.

When 200 people click "This affects me" on the water bill increase
item, that's data that doesn't exist anywhere else. Council can see
that 200 people are paying attention to this specific decision.

**What to build:**

A single reaction button on each ItemCard. Not thumbs up/down (too
political), not a 5-star rating (too complex). Just: "This affects me."

Database:
```sql
CREATE TABLE reactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id uuid REFERENCES items(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,  -- browser fingerprint hash (no auth needed)
  created_at timestamptz DEFAULT now(),
  UNIQUE(item_id, fingerprint)
);
```

Frontend:
- Small button below the summary, before tags: "📌 This affects me"
- Show count: "📌 12 residents"  
- On click: increment count, change to filled state, persist via 
  API call
- Fingerprint: hash of user-agent + screen resolution + timezone 
  (no cookies, no tracking, just dedup)
- Optimistic UI: increment immediately, reconcile with server
- One reaction per item per browser (enforced by unique constraint)
- No auth required — friction kills participation

API route: POST /api/react { item_id, fingerprint }
- Returns { count } 
- Rate limited: max 50 reactions per fingerprint per day

Display:
- When count > 0, show on the card
- When count > 10, show more prominently (larger text, slight glow)
- When count > 50, add to Highlights section automatically 
  (community-driven significance)
- Include reaction counts in weekly digest: "47 residents said
  this affects them"

---

## Spec 3: Issue Threads (Cross-Meeting Continuity)

**Why:** The OCP debate has spanned 6+ meetings across Comox and CVRD
over 4 months. A resident who discovers the tool today sees fragments
scattered through the feed. They have no way to understand the arc of
a decision — when it started, what changed, where it stands now.

This is the "bill tracker" pattern from GovTrack/OpenStates, adapted
for municipal government.

**What to build:**

An "issue thread" page that aggregates all items related to the same
bylaw or topic into a timeline.

Database:
```sql
CREATE TABLE issue_threads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,             -- "Comox OCP & Zoning Bylaw"
  slug text UNIQUE NOT NULL,       -- "comox-ocp-zoning-2025"
  summary text,                    -- AI-generated thread summary
  status text DEFAULT 'active',    -- active, adopted, defeated, paused
  bylaw_numbers text[],            -- ["2054", "2056"]
  municipality_id uuid REFERENCES municipalities(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Link items to threads
ALTER TABLE items ADD COLUMN thread_id uuid REFERENCES issue_threads(id);
```

Auto-detection (in process-ai-summaries.mjs):
- When AI extracts a bylaw_number, check if an issue_thread exists
  with that number
- If yes, link the item to the thread
- If no and 2+ items share the same bylaw_number, auto-create a 
  thread

Thread page at /issue/[slug]:
- Timeline view: vertical line with dots for each meeting date
- Each dot expands to show the item card for that meeting
- At the top: current status badge (Active / Adopted / Defeated)
- AI-generated thread summary: "This bylaw has been discussed across
  4 meetings since November 2025. Council reduced the maximum height
  from 12 to 6 storeys after public pressure, but the 6-storey
  baseline remains contentious."
- Community Voices section if any item in the thread has feedback
- Reaction count aggregated across all items in the thread
- "Follow this issue" — adds to email digest preferences

ItemCard integration:
- If an item belongs to a thread, show a small link:
  "Part of: Comox OCP & Zoning Bylaw →"
- This replaces the "Also discussed" line from the bylaw tracker

Feed integration:
- In the main feed, when multiple items from the same thread appear,
  show only the most recent with a "View full timeline (4 meetings)" 
  link — this replaces the bylaw deduplication logic with something
  richer

---

## Spec 4: Neighbourhood Relevance

**Why:** Audrey Tang's key insight from vTaiwan: lower the barrier to
participation by making it personal. "Council approved a zoning
amendment" means nothing to most people. "A 6-storey building could
be built on your block" changes everything.

Right now the impact callouts do this somewhat, but they're generic.
Real relevance requires knowing where someone lives.

**What to build:**

A simple "What's your neighbourhood?" selector that personalizes
the feed.

Neighbourhoods (hardcoded for now):
- Comox: Downtown, Buena Vista, Marina Park, Hospital Area, 
  Comox Landing, Glacier View, Brooklyn Creek
- Courtenay: Downtown, East Courtenay, West Courtenay, 
  South Courtenay, Puntledge Park
- Cumberland: Village Core, Coal Creek, Royston
- Electoral Areas: Royston, Union Bay, Fanny Bay, Hornby Island,
  Denman Island, Mt Washington, Merville, Black Creek

Storage: localStorage (no account needed)

AI processing update:
- Add `affected_areas` to the AI prompt: "List specific Comox Valley
  neighbourhoods or areas directly affected by this item, if any.
  Return as a JSON array of strings. If the item affects the entire
  municipality or is not area-specific, return an empty array."
- Store as jsonb column on items

Feed personalization:
- When a neighbourhood is selected, items that match get a subtle
  highlight: "📍 Relevant to Buena Vista"
- These items sort to the top within their meeting group
- In the weekly digest: "2 items this week that affect your 
  neighbourhood"

Implementation note: Don't filter OUT non-matching items — that
creates a filter bubble. Just boost matching items visually.

---

## Spec 5: Council Meeting Video Timestamps

**Why:** Comox and Courtenay stream their meetings on YouTube. The 
recordings exist but they're 3-hour monoliths. If you could click 
an agenda item and jump to the exact moment council discussed it, 
you've eliminated the biggest barrier to transparency: time.

**What to build:**

For each item, store a YouTube timestamp that links directly to the 
discussion in the meeting recording.

Database:
```sql
ALTER TABLE items ADD COLUMN video_url text;
ALTER TABLE items ADD COLUMN video_timestamp integer;  -- seconds
ALTER TABLE meetings ADD COLUMN video_url text;
```

Scraper update:
- Comox already provides YouTube channel links
- Courtenay posts recordings on YouTube
- Scrape the video URL for each meeting

Timestamp extraction (ambitious but achievable):
- Download YouTube auto-captions (youtube-transcript-api or yt-dlp)
- Search captions for the agenda item title or bylaw number
- Store the timestamp of the first match
- This can be a separate script: scripts/process-video-timestamps.mjs

Frontend:
- If video_timestamp exists, show a ▶️ button on the ItemCard
- Click opens YouTube at the exact timestamp:
  https://youtube.com/watch?v=VIDEO_ID&t=TIMESTAMP
- Label: "Watch council discuss this (starts at 1:23:45)"

---

## Recommended Order for Claude Code

```
Session 1 (bugs): 
"Review the deployed site at https://comox-valley-council-watch.vercel.app. 
The 'No direct impact' callouts are still showing in the server-rendered 
HTML despite the isActionableImpact filter. The Highlights hero section 
may not be rendering. Cumberland may not appear in the filter bar. Bylaw 
deduplication may not be collapsing older readings. Diagnose and fix all 
of these. Read CLAUDE.md for context."

Session 2 (reactions): 
"Add a 'This affects me' reaction button to each ItemCard. No auth 
required — use browser fingerprinting for dedup. Store in a reactions 
table. Show count on each card. See the spec in SPECS.md for full details. 
Read CLAUDE.md for project context."

Session 3 (email digest): 
"Add email subscription and weekly digest. Use Resend for email delivery. 
Simple signup form, confirmation flow, weekly cron job that sends a digest 
of the past week's significant items. See SPECS.md for full details. 
Read CLAUDE.md."

Session 4 (issue threads): 
"Add issue thread pages that aggregate items about the same bylaw into a 
timeline. Auto-detect threads from bylaw_number. Create /issue/[slug] 
pages. Replace bylaw deduplication with thread links. See SPECS.md. 
Read CLAUDE.md."

Session 5 (neighbourhoods): 
"Add neighbourhood relevance. Let users select their neighbourhood, 
then highlight items that affect their area. Add affected_areas to 
AI processing. See SPECS.md. Read CLAUDE.md."

Session 6 (video timestamps): 
"Add YouTube video timestamps to items. Scrape meeting video URLs, 
extract timestamps from auto-captions. Add play button to ItemCards 
that deep-links to the discussion. See SPECS.md. Read CLAUDE.md."
```

Save this file as SPECS.md in your project root alongside CLAUDE.md.
Claude Code will reference it when you point it there.
