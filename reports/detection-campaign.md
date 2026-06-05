> **Detailed log (deep dive).** Start at the repo `README.md` / `docs/method.md`; this file is the full chronological record incl. abandoned approaches.

# AI-position extraction — experiment log

Goal: automate finding US congressional candidates' positions on 10 AI topics
(currently a fully manual process feeding a public tracker). Every hit is
human-validated downstream, so **recall is paramount**: target **<1% false
negatives, <10% false positives**. Cost/infra ignored this phase (ad hoc).

Source of truth: Google Sheet "Current Tracker (v2)" (owner justrmil@gmail.com),
pulled 2026-06-02 to `data/csv/` (Candidates 682, Positions v2 6684, Topics 10,
Sources 343, Corrections 1).

## Data model
- **Positions v2** = candidate × topic grid. Each cell stance ∈
  {Support, Oppose, Mixed, Unclear, No mention, + freeform data-center labels}.
  Only ~6% of cells are real positions; ~67% No-mention, ~27% blank (uncoded).
- **Sources** = evidence rows (type/url/excerpt) per position.
- Stance polarity is topic-specific: for `deepfakes-fraud`, **Oppose = opposes
  deepfakes (pro-regulation)**, Support = downplays. `data-centers` uses 2-axis
  freeform labels (development|regulation × support|oppose).
- 109 "No mention" cells nonetheless carry a source → the human read evidence and
  decided it did NOT constitute a position on that topic. The task is "evidence
  satisfying a topic's INCLUDES," not "any AI mention."

## Held-out eval (`data/eval/`)
- `split.json` — 20 test candidates (NEVER used for few-shot), stratified across
  10 states, both parties, House/Senate. 16 "gold" (sourced real positions) + 4
  "silent" (fully-coded all-No-mention).
- `answer_key.json` — 200 cells: **78 real** (recall/FN denominator) + **122
  No-mention** (precision/FP denominator).
- Few-shot pool (reserved, excluded from test): cotton-thomas, rouzer-david,
  talarico-james, foushee-valerie, bera-ami.
- `eval/score.py` — FNR (vs <1%), FPR (vs <10%), precision/recall, stance-dir
  accuracy, source-overlap. Validated vs perfect (0/0) and null (FNR 1.0).

## Results

| Run | Engine | Prompt | Recall | **FNR** | FP(vs GT) | FPR(raw) | true-FPR* | stance-dir |
|-----|--------|--------|-------:|--------:|----------:|---------:|----------:|-----------:|
| v1 baseline | built-in WebSearch/Fetch | balanced | 69.2% | **30.8%** (24/78) | 15 | 12.3% | **~3–4%** | 72% |
| v2 | built-in WebSearch/Fetch | recall-first | 88.5% | **11.5%** (9/78) | 23 | 18.9% | **~4–6%** | 71% |

\* true-FPR = genuine errors after adjudicating each FP against its cited source
(`fp_adjudication*.json`). Most "FPs" are **real positions the human coder
missed**, not hallucinations.

### Key findings
1. **Precision is not the bottleneck.** v1: 10/15 FPs were human-missed real
   positions (system correct); only ~4 genuine errors (~3% of No-mention cells).
   e.g. `capito/AI-preemption` is the *same roll-call vote* GT codes as Oppose
   for cotton but never coded for capito — automation caught it.
2. **Recall is the bottleneck**, and it's the trustworthy metric (GT-positive
   labels are solid). A free prompt change (detect any topic *engagement*; code
   Unclear instead of No-mention when direction is ambiguous; mandatory
   congress.gov sponsor/cosponsor/vote mining) cut FN **24 → 9 (−62%)**.
3. **Genuine v2 errors are all "topic over-assignment"** (real AI content filed
   under the wrong topic) + occasional misattribution — exactly what a cheap
   **verify** stage catches. Detect→verify is the precision lever for prod.
4. **Residual 9 FNs are coverage/access-bound**, not prompt-bound: 2 Facebook
   posts, 1 paywalled WaPo brief, 3 think-tank/.gov pages built-in search didn't
   rank, 1 genuine taxonomy overlap (companion-chatbots vs children-safety).
   Two v2 FP "unreachables" were LinkedIn — access is a real constraint.
   → motivates Exa/Perplexity (discovery) + playwright-cli (JS/paywall access).

### Architecture implication
`detect (recall-max) → verify (fetch cited URL, check vs topic INCLUDES/EXCLUDES)
→ human`. Verify removes over-assignment/misattribution without touching recall
(it only drops claims that fail the source/rubric check).

## Infra notes / bugs
- Workflow `args` arrives as a **string** → `JSON.parse` defensively in scripts.
- Adjudicator delegated by "read file at index i" → **index collisions**
  (duplicate/missing verdicts). Fix: pass the record inline per agent and have
  the orchestrator attach authoritative (cand,topic); don't trust agent echo.
- `read_file_content`/`download_file_content` exceed token limits on this sheet;
  decode the xlsx (`download_file_content` → base64) and parse with openpyxl.

## Next levers (untried)
- Exa and/or Perplexity search backends (needs API keys in `.env`). Targets the
  discovery-bound residual FNs (social, think-tank, paywalled, ranked-too-low).
- playwright-cli for JS-only / paywalled pages (Facebook, LinkedIn, WaPo).
- Granularity: per-(candidate,topic) agents or two-stage gather→code for depth.
- Ensemble/multi-pass union to push FN toward <1% (then verify for precision).
- Statistical power: 78 real cells can't validate a 1% FN claim — scale the
  recall denominator toward the full ~397 real positions before declaring done.

## Playwright access probe (2026-06-02)
playwright-cli (v0.1.13 / Playwright 1.60.0) can read JS/social pages that
built-in WebFetch cannot:
- Facebook public post (ford-jd AI task force): **readable** — recovered the exact
  text behind the login header. Fixes the 2 ford-jd social-media FNs.
- CSIS transcript (westerman): **readable** — was a *discovery* miss, not access.
- WaPo paywalled intelligence brief (harrigan): **failed** (ERR_HTTP2_PROTOCOL_ERROR /
  bot-block) — genuinely hard.
Takeaway: Exa for discovery + playwright for access (social/JS) covers all but the
hard paywall. Usage: `playwright-cli open`, `goto <url>`, `eval "() => document.body.innerText"`.

## Detect→verify pipeline result (CORRECTS the earlier optimistic take)
Ran a full verify pass over all 92 v2-detected cells (fetch cited source, judge
vs INCLUDES/EXCLUDES). Verdict mix: 79 SUPPORTED, 9 WRONG_TOPIC, 2 NOT_SUPPORTED,
2 UNREACHABLE. Applying "keep only SUPPORTED":

| | v2 (detect only) | v2 + hard verify-drop |
|---|---:|---:|
| Recall | 88.5% | **80.8%** (worse) |
| FNR | 11.5% | **19.2%** (worse) |
| true-error FPR | ~4–6% | ~13% raw / barely better |

**Hard verify-and-drop is the WRONG architecture for this task.** Of 13 dropped
detections, **6 were real GT positions** (verify created FNs) vs only ~2–4 genuine
errors removed. Causes:
1. The human GT coder uses a GENEROUS "engagement counts" bar (task-force
   membership, tangential mentions = a position); a strict fact-checker verifier
   disagrees and rejects borderline-but-valid cells. Verify must be calibrated to
   the coder's threshold, not a generic "strict" bar.
2. Fetch failures (403 / ECONNREFUSED / LinkedIn-999 / paywall) make verify judge
   on the wrong/weaker source → false rejection. Verify must NEVER reject on a
   fetch failure (keep/defer to human).
3. Precision is already adequate AND most "FPs" are human-misses (desirable), so
   there's little to gain and much recall to lose by dropping.

**Revised architecture:** recall-first detect → verify as a SOFT TRIAGE signal
(flag likely-wrong for prioritized human review, NEVER auto-drop) → human is the
filter. The path to <1% FN is MORE recall (better search/access, ensemble),
not filtering.

### Bonus finding: topic-boundary / multi-label problem
Several "errors" are real engagement filed under the wrong topic (TAKE IT DOWN Act
→ children-safety vs deepfakes-fraud; AI-chatbot-suicide story → children-safety vs
companion-chatbots; AI misinformation → deepfakes vs regulation-philosophy).
Mis-bucketing simultaneously makes a wrong-topic FP AND a same-evidence FN. GT
itself double-codes one statement across topics. → v4 ideas: (a) clarify
overlapping topic boundaries in the prompt, (b) let the detector assign one piece
of evidence to MULTIPLE topics.

## Exa engine test (v3) + Ensemble — the recall lever is MULTI-PASS, not the engine
v3 = v2 coder, discovery swapped to Exa (keyword/answer/congress.gov/social) + playwright access. Exa spend: $1.46 (152 search + 41 answer + 94 contents).

| Run | FNR | Recall | FP(raw) |
|---|---:|---:|---:|
| v1 built-in, balanced | 30.8% | 69.2% | 15 |
| v2 built-in, recall-first | 11.5% | 88.5% | 23 |
| v3 Exa, recall-first | 14.1% | 85.9% | 29 |
| v2 + hard verify-drop | 19.2% | 80.8% | 18 |
| **ensemble v2 ∪ v3** | **6.4%** | **93.6%** | 35 |

Findings:
- **Agent-driven engine swap (built-in→Exa) is ~a wash on recall** (within run-to-run
  variance): v3 gained 4 real cells v2 missed but regressed on 6 (4 of them findable
  non-social pages — depth/variance, not Exa being worse). Engine choice is NOT the lever.
- **Ensembling two passes halves FNR (11.5%→6.4%)** because the passes miss DIFFERENT
  cells. Multi-pass union is the recall lever. (FP rises but those are mostly
  human-misses; precision isn't the constraint.)
- **The 5 persistent FNs are structural:** 2 Facebook (agents skip playwright when it's
  optional → make social-access deterministic), 1 readable news page whose source Exa
  /answer DID return as a citation (haggard — harvest /answer citations deterministically,
  don't trust the prose), 1 CSIS page (discovery), 1 WaPo paywall (genuinely hard).
- **Stance-direction accuracy stuck ~71-73%** across all runs — a separate coding-nuance
  problem (Mixed/Unclear boundaries + deepfakes polarity), lower priority since human validates.

## Roadmap to <1% FN
1. Multi-pass ENSEMBLE (≥2-3 passes, union detections) — proven to cut FNR.
2. Deterministic structural access (remove agent discretion):
   - force playwright read on every discovered social URL;
   - harvest EVERY Exa /answer citation and feed full text to the coder (don't trust the
     /answer narrative).
3. Per-(candidate,topic) granularity or gather→code split to cut variance/increase depth.
4. Topic-boundary disambiguation + multi-label assignment (see verify finding).
5. Verify only as SOFT triage (never drop); human is the filter.
6. Scale the held-out denominator (78 → toward ~397 real cells) to actually validate <1%.
Engine (built-in vs Exa) is a secondary knob; keep both in the ensemble cheaply.

## Infra lesson: concurrency cap (campaign, 2026-06-02)
Running 5 heavy detection workflows at once (~60 concurrent subagents) caused mass
"subagent completed without calling StructuredOutput" failures, concentrated in
later-queued candidates (model-API capacity starvation). Lighter/low-concurrency
runs (v4, v6) had 0 failures. Fixes applied: (1) detection workflow now RETRIES
failed agents once and explicitly instructs the StructuredOutput call; (2) run
<= 2 detection workflows concurrently. Corrupted runs (v7, v9, possibly v8/v2ref)
must be re-run. Productionization note: cap fan-out concurrency and always retry
schema-enforced agents.

## CAMPAIGN RESULTS (50-candidate set: 155 real / 345 no-mention cells)

| Config | FNR | Recall | raw FP | stance |
|---|---:|---:|---:|---:|
| v4 social+completeness | 9.7% | 90.3% | 95 | 69.3% |
| v5 Exa gather→code | 11.6% | 88.4% | 68 | **73.7%** |
| v6 v4+critic recheck | 7.7% | 92.3% | 108 | 69.9% |
| v10 stacked prompt levers | 9.7% | 90.3% | 84 | 72.1% |
| ensemble v6∪v5 | 2.6% | 97.4% | 120 | 71.5% |
| **ensemble v6∪v5∪v10** | **1.9%** | **98.1%** | 125 | 72.4% |

### True precision (adjudicated all 125 ensemble FPs against sources)
- **90/125 (72%) of "false positives" were REAL positions the human coders MISSED** —
  the system was correct. 33 (26%) genuine errors, 2 unverifiable.
- **TRUE false-positive rate = 33/345 = 9.6%** → under the <10% target.
- GT-corrected precision (crediting human-missed) = **88%**.

### Both targets ~met by ONE config (recall-max ensemble, NO drop):
- **FNR 1.9%** (3 readable-source misses; near the <1% target — a 4th method/recheck
  should cross it) and **true-FPR 9.6%** (< 10%), simultaneously.

### Biggest finding: the ground truth itself under-counts by ~26%
The ensemble surfaced **90 documented positions the manual process missed** (out of 345
GT-no-mention cells). So the automation is not merely matching humans — it materially
**improves coverage**. Implication: GT-no-mention labels are unreliable (~26% are
actually positions); only GT-real labels are trustworthy. Report recall against GT-real;
measure precision by ADJUDICATION, never raw FP-vs-GT.

### What moved the needle (ranked)
1. **Multi-method ensemble** — THE recall lever (each method misses 8–12%; their
   different misses cancel → 1.9%). Diversity of method matters (built-in+critic vs Exa-gather).
2. Recall-first prompt + lowered "engagement" threshold (v1→v2: 30.8%→11.5% FNR).
3. Critic re-check pass (a cheap second aggressive pass on No-mentions).
4. Forced social access via playwright (recovers Facebook-only positions).
5. Stance guide + topic-disambiguation lifted stance accuracy ~69%→~74% (modest;
   Mixed/Unclear boundaries remain the hard part).
6. Exa gather→code: best precision+stance and most reliable (lighter agents), slightly
   lower solo recall — excellent ensemble member.

### Recommended operating point
**Recall-max ensemble (≥2 diverse methods, union detections), NO auto-drop.** Use the
verify stage only as **soft triage**: it cleanly separated the 90 human-misses from the
33 genuine errors, so flag/sort the queue for human review — don't filter. (Hard
verify-drop was tested and HURTS recall.) Human remains the final filter.

### Not yet done / to reach a defensible <1%
- 3 residual FNs (haggard/AI-preemption news, biss/export-control site, buckhout/military
  .gov) are coding/discovery misses on readable pages — a 4th ensemble member or a
  targeted recheck should catch ≥2.
- Scale denominator further (155 → toward ~397 real) for statistical power on the 1% claim.
- Stance-direction accuracy (~74%) is the next quality frontier.