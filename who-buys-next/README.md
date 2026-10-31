# Who Buys Next

**Track 02 · Strategy: find the signal nobody is watching.**

Who Buys Next helps ResearchMind's sales team find buyers before they fill a form. It runs a signal playbook across the places research buyers leave a trail, ranks the organisations it finds, names the people who hold the budget, and writes the first messages.

## The core idea

The person who uses ResearchMind is usually a researcher, often junior. They are not the buyer. Who Buys Next is built around **7 buyer segments**, each with its own buyer, user and sales motion:

| Segment | Buyer (budget) | User | Motion |
|---|---|---|---|
| In-house research teams (UX, market, consumer, trend, competitive) | Research Manager, Head of Research/Insights, Head of Design | Researchers, analysts | Sales-led team plan |
| Research & consulting agencies | Founder, Research Director, Head of Qual | Consultants, moderators | Sales-led, pilot on one project |
| Market research agencies | MD, Head of Qualitative | Qual researchers | Sales-led, pilot on one study |
| Product teams (PM-led research) | Head of Product, VP Product | PMs, designers | Product-led trial, then team |
| Universities & research programmes | Dean of Research, PhD Coordinator, HoD, Library | PhD scholars, faculty | Partnership that drives individual subscriptions |
| PhD scholars & academic researchers | The scholar | The scholar | Self-serve individual plan |
| Government research facilities | Director, PI, Procurement | Scientists, fellows | Tender / GeM procurement |

## The playbook

15 signals, each tagged with segments, source, lead time, intent (1–5) and earliness (1–5). Tier A signals name the need outright: hiring research roles, a new research leader, a job post that mentions synthesis or a repository, unhappiness with Dovetail/NVivo/ATLAS.ti/MAXQDA, and scholars struggling with qualitative analysis. Tier B and C cover PhD intakes, methods workshops, agency expansion, PM-led discovery roles, funding, research grants, software tenders, conference talks and DIY GitHub scripts.

**Score:** `Heat = (35·Intent + 25·Earliness + 25·Fit + 15·Freshness) ÷ 100 ÷ 5 × 100`, plus 5 points for each extra signal at the same company (max 2). Fit is the average of the account's own fit and its segment value. Freshness: ≤30 days = 5, ≤90 = 4, ≤180 = 3, ≤365 = 2, older is rejected. HOT ≥ 75 · WARM 55–74 · WATCH < 55. Every weight is a slider in the app.

**Tender vs job post:** a tender for research *services* buys an agency, not a tool, so it is off by default and used to find the agency that wins. A tender for *qualitative analysis software licences* is a direct buyer with budget, so it scores high.

**Noise filter:** vendors and their listicles, recruiters and aggregators, non-qualitative "research", anything older than 12 months, organisations with no research function, existing customers, and stopping at a junior researcher instead of the budget holder. Rejected items are kept with the reason.

## How it stops hallucination

- The scout only keeps a lead if its link is one of the search results it was given.
- The people finder only keeps a person if their name appears in the page it cites.
- Messages are written from the account's evidence, and say which signals they rely on.

## Deploy (about 2 minutes)

1. Push this folder to a GitHub repo.
2. Import it at vercel.com/new. No framework, no build command.
3. Add one environment variable for AI. Free options: `GEMINI_API_KEY` (Google AI Studio) or `GROQ_API_KEY`. Paid: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`.
4. Optional: `GITHUB_TOKEN` for higher GitHub search limits.

Without a server key, anyone can paste their own key in **Settings**; it stays in their browser.

**Real-time search with your own key.** Free search (Google News, Bing, Reddit, HN, GitHub) runs first. A Claude or Gemini key adds the provider's own web search as a backup, or as the only source if you pick "Always use your AI key's web search" in Settings. This is the most reliable option, because search engines often block scraping from cloud servers.

## Using it

Five steps across the top:

1. **Set up**: connect your API key once (saved in your browser) and confirm what you sell. You get the buyer map: who pays, who uses, how to sell.
2. **Find buyers**: tick signals, optionally add your own, press **Run**. Buyers appear live. Search options and scoring weights sit in fold-outs.
3. **Buyers**: ranked by heat. Open one for why-now, people to contact (with Find people), evidence and score.
4. **Outreach**: pick a person, get a day-by-day plan and messages for LinkedIn, email and communities.
5. **Playbook**: the one page to share with the team.

Lavender dashed boxes are **your input**; white boxes are **results**.

## Files

```
index.html       The app (built from src/app.html by build.sh)
src/app.html     App source: UI, playbook data, prompts, scoring, verified sample run
api/search.js    Keyless search: Google News, Bing (DuckDuckGo fallback), Reddit, Hacker News,
                 GitHub, and site-scoped searches for job boards, review sites, tenders,
                 LinkedIn profiles, posts and events
api/page.js      Reads a public company page (team, about, leadership) and finds people links
api/ai.js        One door to Claude, Gemini, Groq, OpenAI and OpenRouter
api/websearch.js Web search through your own Claude or Gemini key (more reliable than free search)
api/ok.js        Health check
```

After editing `src/app.html`, run `./build.sh`.

## The verified sample run

The app opens on a real run checked on 31 Oct 2026, with every claim linked: Emergent Labs (Series C + a UX Researcher JD that asks for transcript-analysis tooling), Zinnia, 6sense (Dovetail in the stack), TDU (qualitative research workshop for PhD students) and DTU (January 2027 PhD intake). Rejected examples show the noise filter at work: a stale Atlassian posting, Cartesia's ML "research operations" role, and competitor-written "alternatives" posts.
