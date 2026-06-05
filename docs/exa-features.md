# Exa Search API — Feature Reference for the Politician AI-Stance Tracker

Research notes on the [Exa](https://exa.ai) search API, scoped to our task: **find a named US
congressional candidate's documented stance on specific AI-policy topics, maximizing recall**
across campaign sites, congress.gov, .gov press releases, news/op-eds, social media (X, Facebook,
Instagram, LinkedIn), think tanks, and committee-hearing transcripts (often YouTube).

> The API key lives in `.env` as `EXA_API_KEY`. Never hardcode it. All examples below assume
> `x-api-key: $EXA_API_KEY` (REST) or `Exa(os.environ["EXA_API_KEY"])` (SDK).

Docs sourced from `https://exa.ai/docs` (the `https://docs.exa.ai/*` URLs 307-redirect there).
The machine-readable index is `https://exa.ai/docs/llms.txt`; every page has a `.md` variant.

---

## 0. Key validation (live test, 2026-06-02)

All three calls below succeeded with our key.

| Endpoint | Test query | Result | Cost (`costDollars.total`) |
|---|---|---|---|
| `POST /search` (neural + contents) | "John Cornyn AI export controls", 3 results | 200 OK, 3 results (Nextgov, PoliScore, QuiverQuant) | **$0.007** |
| `POST /findSimilar` | url=`cornyn.senate.gov`, 3 results | 200 OK, returned cornyn.senate.gov subpages | **$0.007** |
| `POST /answer` | "What is Senator John Cornyn position on AI export controls?" | 200 OK, narrative answer + **8 citations** (mostly cornyn.senate.gov press releases) | **$0.005** |

Response headers of note: `x-exa-queued: false`, `x-exa-queue-ms: 0`. No rate-limit headers
(`x-ratelimit-*`) are returned; limits are enforced server-side (see §7). Every JSON response
carries a `costDollars` breakdown, e.g. `{"total":0.007,"search":{"neural":0.007}}` — so we can
meter spend per call programmatically. The remaining free-credit balance is **not** exposed on
these endpoints (it's a dashboard value at `dashboard.exa.ai`).

**Conclusion: the key works.**

---

## 1. Endpoints

Base URL `https://api.exa.ai`. Auth header `x-api-key`. Confirmed live paths (from
`exa-spec.json` + live calls):

| Endpoint | Method | What it does | Use for us |
|---|---|---|---|
| `/search` | POST | Web search; optionally returns page contents in the same call | Core recall engine: fan-out queries per (candidate, topic) |
| `/contents` | POST | Fetch clean content for known URLs/IDs (text, highlights, summary, subpages) | Extract evidence from a known campaign/issues page or congress.gov bill |
| `/findSimilar` | POST | Given a URL, return semantically similar pages | Fan out from a candidate's "issues" page or a strong source |
| `/answer` | POST | Search + LLM in one call → narrative/JSON answer **with citations** | One-shot "What is <candidate>'s position on <topic>?" |
| `/research/v1` | GET/POST | Async agentic research tasks (report + citations) | **Deprecated 2026-05-01** → migrate to `/search type=deep-reasoning` |
| `/agent/runs` | POST/GET | Newer Agent API (replaces Research API) — multi-step autonomous research | Heavy per-candidate dossier build (priced per-effort, see §7) |
| `/monitors/*` | POST/GET | Scheduled recurring searches that alert on new matches | Watch for *new* candidate statements over a campaign cycle |
| `/v0/websets/*` | POST/GET | Async "Websets": build a verified, structured collection of many matching pages/people + enrichments | Bulk-discover all pages matching a topic, verified against criteria |

**Note on findSimilar:** it is live and billable ($0.007/call in our test) even though it no
longer appears in the published `exa-spec.json` paths or the newest "coding agent" cheat sheets.
Treat it as supported-but-legacy; the SDK still exposes `find_similar` / `find_similar_and_contents`.

---

## 2. Search types (`type` param)

The platform has expanded well beyond the classic neural/keyword/auto trio. Current values:

| `type` | Latency | What it is | Recall implication |
|---|---|---|---|
| `auto` | ~1s | **Default.** Router picks neural vs keyword per query | Safe default; good baseline recall |
| `neural` | ~1s | Embeddings/semantic over Exa's own index | Best for conceptual queries ("AI safety regulation stance") where exact words vary |
| `keyword` | fast | Classic keyword match | Best for exact strings: bill numbers ("S.3555"), proper names, handles |
| `fast` | ~450ms | Streamlined, lower latency | Cheap pre-pass / high-volume fan-out |
| `instant` | ~250ms | Real-time, lowest latency | Interactive use |
| `deep-lite` | ~4s | Lightweight multi-step synthesis | — |
| `deep` | 4–15s | Multi-step agentic search | Harder recall on obscure positions |
| `deep-reasoning` | 12–40s | Max reasoning depth (the Research-API replacement) | Best for "did they ever say anything about X" deep digs |

**For our recall goal:** run **both** `neural` (semantic coverage) and `keyword` (exact bill #s,
handles, names) as separate queries rather than relying solely on `auto`. Reserve `deep` /
`deep-reasoning` for the hard "find any documented position" pass where cheap searches came up empty.

---

## 3. Filters (on `/search` and largely `/findSimilar`)

| Param | Notes |
|---|---|
| `numResults` | default 10, **max 100**. Pricing tiers at 10 results (see §7) — first 10 are base price, each extra 1k results-beyond-10 adds ~$1/1k. Pull large `numResults` for recall; it's cheap. |
| `includeDomains` / `excludeDomains` | arrays, **max 1200 domains each**. Supports domain *path* filtering (changelog: "Domain Path Filter Support"). Scope to `congress.gov`, `*.senate.gov`, `*.house.gov`, `twitter.com`/`x.com`, `linkedin.com`, etc. |
| `startPublishedDate` / `endPublishedDate` | ISO 8601. Window to a campaign cycle. |
| `startCrawlDate` / `endCrawlDate` | ISO 8601, by crawl time. |
| `includeText` / `excludeText` | Require/forbid a phrase to appear in the page (phrase filter). Force the candidate's name or a topic term to appear. |
| `userLocation` | two-letter country code (e.g. `us`). |
| `category` | Restrict to a content vertical (see allowed values below). |
| `moderation` | boolean — filter unsafe content. |
| Pagination | No cursor on `/search`; paginate by raising `numResults` (max 100) or by varying the query. Websets/Agent/Monitors APIs are the async/large-scale path. |

### `category` allowed values

Officially documented enum: **`company`, `research paper`, `news`, `personal site`,
`financial report`, `people`**. The docs explicitly add: *"Other strings are accepted and used as
category hints for search."* — so historical hints like **`tweet`, `pdf`, `github`,
`linkedin profile`** still act as soft category hints rather than hard filters in current builds.

Practical caveats:
- `company` and `people` support a **reduced filter set** — no `startPublishedDate`,
  `endPublishedDate`, `startCrawlDate`, `endCrawlDate`, or `excludeDomains`.
- `people`'s `includeDomains` only accepts supported profile domains (LinkedIn etc.).

**For social media recall:** because `category` is now mostly a soft hint, the reliable way to pull
tweets/LinkedIn/etc. is **`includeDomains: ["twitter.com","x.com","facebook.com",
"instagram.com","linkedin.com"]`** (optionally combined with `category:"tweet"`/`"personal site"`
as a hint). This is the lever that fixes WebSearch's blind spot for social posts.

There are also dedicated **verticals** (separate tuned indexes): News, Company, People, Code — see
`/docs/reference/verticals/*`. The `news` category/vertical is directly useful for op-eds and
coverage.

---

## 4. Contents options

Available both nested under `contents` on `/search` and as top-level params on `/contents`.
(The Python SDK names are snake_case: `max_characters`, `max_age_hours`, `subpage_target`, …)

| Option | What it does |
|---|---|
| `text` | Full page as clean **markdown** (markdown is now the default). Object form: `maxCharacters`, `includeHtmlTags`, `verbosity` (`compact`/`standard`/`full`), `includeSections`/`excludeSections`. Cap chars to control tokens. |
| `highlights` | Most-relevant excerpts. Object: `query` (what to highlight for), `maxCharacters`/num sentences. **Token-efficient** — best default for agent extraction. Returns `highlightScores`. |
| `summary` | LLM summary of the page. Object: `query` (focus prompt, e.g. "candidate's stance on AI") **and `schema`** (JSON Schema Draft-7 → structured extraction). Costs $1/1k pages. |
| **Freshness** (`maxAgeHours`) | Replaces the legacy `livecrawl` enum. `0` = always livecrawl; `-1` = cache-only, never crawl; omit = default (cache, livecrawl as fallback); positive N = crawl if cache older than N hours. |
| Legacy `livecrawl` (still mapped) | `always`→`maxAgeHours:0`; `never`→`-1`; `fallback`→omit (default); `preferred`→`maxAgeHours:1` (or lower). Use **fresh crawl for fast-moving sources** (campaign sites, social) and cache for stable ones (old bills). |
| `livecrawlTimeout` | ms cap for live crawl, default ~10000; 10000–15000 recommended. |
| `subpages` | Crawl N linked pages per result (start 5–10). Great for an "Issues" hub that links to many sub-pages. |
| `subpageTarget` | Keyword(s) to steer subpage selection, e.g. `["AI","technology","artificial intelligence"]`. |
| `extras.links` | Extract up to N outbound URLs per page. |
| `extras.imageLinks` | Extract up to N image URLs per page. |

`/contents` returns a per-URL **`statuses[]`** array; the call returns 200 even when individual
URLs fail, so always inspect statuses. Response objects carry `title, url, id, publishedDate,
author, image, favicon, text, highlights, highlightScores, summary, subpages, extras`.

---

## 5. `/answer` endpoint — the one-shot path

Combines search + LLM generation in **one call** and returns **answer + citations together**.

Request params:
- `query` (required) — natural-language question/instruction.
- `text` (bool, default false) — also return full source page text per citation.
- `stream` (bool, default false) — SSE stream (answer-token deltas, then citations, then cost).
- `outputSchema` (object, JSON Schema Draft-7) — return **structured JSON** instead of prose
  (e.g. `{position, confidence, quote, source_url}` per topic).

Response: `{ answer, citations[], costDollars, requestId }`. `citations[]` items carry
`title, url, publishedDate, author, id, image, favicon` (+ `text` if requested). No `model` or
`systemPrompt` field is documented for this endpoint.

**Verified live:** our test query returned a clean narrative + **8 citations** (cornyn.senate.gov
press releases, etc.) for **$0.005**. This can one-shot
*"What is <candidate>'s position on <AI topic>?"* — but it is a *generated* answer, so for a
recall-first pipeline use it as a **lead generator** (harvest its citations) rather than the sole
source of truth, and pair it with raw `/search` fan-out so we don't miss what the LLM didn't surface.

---

## 6. `/findSimilar`

Given a seed `url`, returns semantically similar pages. Params mirror `/search`: `numResults`,
`includeDomains`/`excludeDomains`, date filters, and a `contents` block. Verified live ($0.007).

**Use:** seed it with a candidate's official **issues/AI page** (or a strong op-ed) to fan out to
related coverage, think-tank responses, and rebuttals we'd otherwise miss. Also seed with a known
*good evidence* page for one candidate to find the equivalent page for others.

---

## 7. Limits & cost

### Rate limits (default)
| Endpoint | Limit |
|---|---|
| `/search` | 10 QPS |
| `/answer` | 10 QPS |
| `/contents` | 100 QPS |
| `/research/v1` (legacy) | 15 concurrent tasks |

Increases: contact `sales@exa.ai` (Enterprise). No separate documented free-vs-paid QPS split.

### Free credits / trial ceiling
- **$10 in free credits** on new account onboarding.
- Plus **$7/month** in free credits for accounts with a payment method on file (expire end of month).
- Free tier effectively covers **~1,000 requests/month** at no cost.
- Startup/Education grants: up to **$1,000** in credits.

**Spend ceiling to respect during trial: treat ~$10 (one-time) + ~$7/mo as the budget.** Every
response includes `costDollars`, so meter as you go. (Live balance isn't exposed via API — check
`dashboard.exa.ai`.)

### Per-request pricing (from exa.ai/pricing)
| Item | Price |
|---|---|
| Search (`auto`/`neural`/`keyword`/`fast`), ≤10 results | **$7 / 1k requests** (~$0.007 each) |
| Search, each result beyond 10 | +$1 / 1k requests |
| Deep search | $12–15 / 1k requests (+$1/1k beyond 10) |
| Contents | **$1 / 1k pages per content type** |
| AI page summaries | **$1 / 1k pages** (Search, Deep, Contents, Monitors, Answer) |
| Monitors | $15 / 1k requests |
| Agent API | $0.025 (low) / $0.10 (medium) / $0.50 (high) / $2.00 (x-high) per request; internal search tool calls $0.007 each |

Observed live costs: search w/ contents $0.007; findSimilar $0.007; answer $0.005.

**Cost levers for scale:**
- Big `numResults` is cheap (+$1 per 1k extra results) → **pull 50–100 results for recall, nearly free.**
- Each **content type** (text / highlights / summary) is billed separately per page → prefer
  `highlights` (token-cheap) over full `text`; add `summary` only when extracting structured stance.
- **Livecrawl has no documented surcharge** beyond the contents fee, but it adds latency
  (`livecrawlTimeout`). Use `maxAgeHours:0` only for fast-moving sources.
- `/answer` ≈ $0.005–0.007 + summary/content fees — cheap enough to run **per (candidate, topic)**.
- Deep search / Agent API are the expensive tier — reserve for hard digs.

---

## 8. Python SDK (`exa-py`)

```python
import os
from exa_py import Exa

exa = Exa(os.environ["EXA_API_KEY"])

# Recall-max search, scoped + contents in one call
r = exa.search_and_contents(
    "Jane Doe artificial intelligence regulation position",
    type="neural",
    num_results=50,
    include_domains=["congress.gov", "senate.gov", "house.gov"],
    start_published_date="2023-01-01",
    highlights={"query": "AI policy stance", "max_characters": 500},
    # text={"max_characters": 2000}, summary={"query": "candidate's AI stance"}
)
for item in r.results:
    print(item.title, item.url, item.highlights)

# Fan out from a known issues page
sim = exa.find_similar_and_contents(
    "https://janedoe.house.gov/issues/technology",
    num_results=25,
    highlights=True,
)

# Fetch contents for known URLs (e.g. a specific bill page) with fresh crawl
c = exa.get_contents(
    ["https://www.congress.gov/bill/119th-congress/senate-bill/3555"],
    text={"max_characters": 4000},
    max_age_hours=0,           # force livecrawl
    subpages=5,
    subpage_target=["AI", "artificial intelligence"],
)

# One-shot answer with citations (optionally structured)
a = exa.answer(
    "What is Representative Jane Doe's position on AI export controls?",
    text=True,
)
print(a.answer)
for cite in a.citations:
    print(cite.title, cite.url)

# Streaming answer
for chunk in exa.stream_answer("What is Jane Doe's stance on AI safety regulation?"):
    print(chunk, end="", flush=True)
```

Notes: SDK is snake_case (`num_results`, `include_domains`, `start_published_date`,
`max_age_hours`, `subpage_target`). `AsyncExa` mirrors all methods for async/await.
`find_similar` / `find_similar_and_contents` exist. `search_and_contents` is the convenience
wrapper (search + `/contents` fused). Research API methods are deprecated → use
`exa.search(type="deep-reasoning", ...)`.

---

## 9. MCP server

Exa ships an **official, open-source MCP server**.

- Hosted (remote) endpoint: `https://mcp.exa.ai/mcp`
- Local: `npx exa-mcp-server`
- Tools: `web_search_exa` (default), `web_fetch_exa` (default, fetch URL → markdown),
  `web_search_advanced_exa` (optional; filters, domains, date ranges).

Add to Claude Code:
```bash
claude mcp add --transport http exa https://mcp.exa.ai/mcp
```
Generic JSON config (with key):
```json
{
  "exa": {
    "url": "https://mcp.exa.ai/mcp",
    "headers": { "x-api-key": "YOUR_EXA_API_KEY" }
  }
}
```
There's also a **Websets MCP** (`/docs/reference/websets-mcp`) for the bulk-collection workflow.
For our agent, the MCP server is the lowest-friction way to give Claude Exa search/fetch directly,
but the REST/SDK path gives finer control over `numResults`, `category`, domain scoping, and cost.

---

## 10. Recommended call patterns for the tracker

1. **Recall-max multi-query fan-out** (per candidate × topic): issue parallel `/search` calls —
   one `neural`, one `keyword` — each `num_results=50–100`, `includeText` = candidate name,
   `highlights` on. Cheap (~$0.007 + extra-results pennies each).
2. **Social-media sweep:** `/search`, `includeDomains:["twitter.com","x.com","facebook.com",
   "instagram.com","linkedin.com"]`, `category:"tweet"` hint, `start/endPublishedDate` = cycle,
   `maxAgeHours:0` for freshness. Fixes WebSearch's social blind spot.
3. **Legislative record:** `/search`, `includeDomains:["congress.gov"]`, `type:"keyword"` for bill
   numbers; then `/contents` on bill URLs with `subpages` for cosponsor/vote details.
4. **One-shot stance check:** `/answer` per (candidate, topic) with `text=true` (or `outputSchema`
   for `{position, confidence, quote, source_url}`); harvest its `citations` as additional leads.
5. **Fan-out from a strong source:** `/findSimilar` seeded with the candidate's official issues
   page to discover related coverage/rebuttals.
6. **Deep dig (only when above is empty):** `/search type:"deep-reasoning"` to confirm "no
   documented position" before reporting a miss (protects recall).

Budget guardrail: stay within ~$10 one-time + ~$7/mo free credits; read `costDollars.total` on
every response to meter spend.
