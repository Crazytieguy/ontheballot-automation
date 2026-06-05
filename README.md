# On the Ballot — AI-position automation

R&D for **automating** the discovery of US congressional candidates' positions on 10 AI-policy topics — the research that today is done by hand and feeds the public tracker at **[ontheballot.ai](https://ontheballot.ai)**. Every machine-found item is human-validated downstream, so **recall is paramount**: the targets are <1% false negatives and <10% false positives.

> This repo is the **experiment harness + findings**, not the production system and not the data. The full dataset (a third party's private spreadsheet plus unvalidated AI outputs) is gitignored. Setup to run it: [`CLAUDE.md`](CLAUDE.md).

> [!IMPORTANT]
> **None of this has been human-verified yet.** Every number and claim below comes from automated evaluation against the existing tracker data plus an LLM adjudicator. Treat results as promising but **provisional**. Where a claim is about an *error in the existing spreadsheet*, I've cited specific rows (with `pos-` ids) so they can be checked directly.

---

# The method we landed on

Per candidate × topic cell: decide whether the candidate has a *position*, then classify its stance.

1. **Detect (recall-first), three diverse ways** — for each candidate, run three independent detectors: (a) built-in web search + an aggressive critic re-check of anything it marked "No mention", (b) an Exa-based gather→code pass, (c) a single "stacked" pass with every recall lever in the prompt. Each lowers the threshold (any genuine engagement counts; `Unclear` rather than `No mention` when direction is fuzzy) and grounds every hit in a real source.
2. **Ensemble = union** of the three (a cell counts as detected if *any* detector found it). This is the single biggest recall lever — the detectors miss *different* cells.
3. **Stance** — a dedicated `decisive` classifier assigns direction on each detected cell (applying the topic conventions).
4. **Verify** — optional triage that flags likely-wrong cells for the reviewer (off by default; see "what's pending").
5. **Human is the final filter.**

**Result on the held-out set (50 candidates / 500 cells; 155 real positions, 345 No-mention):**

| Approach | FNR (recall) | False-positive rate |
|---|---|---|
| Best single method | ~8–12% (best 7.7%) | — |
| **Ensemble (union of 3)** | **1.9% (98.1%)** | **9.6%** (adjudicated true-FPR) |

**Everything runs from one file: [`pipeline.js`](pipeline.js)** — all prompts are inline as readable multi-line strings (including the few-shot examples). That's the best place to review what the agents actually do. To run it: `Workflow({ scriptPath: "pipeline.js", args: { candidates: [{id,name,state,party,seat}] } })`.

**Which detectors are pulling weight** (leave-one-out: FN if that member is dropped and the other two are unioned, on the 155 real cells):

| Member | solo FN | drop it → ensemble FN | cells only it catches |
|---|---|---|---|
| Built-in + critic | 12 | 7 (+4) | 4 |
| **Exa gather→code** | 18 | **8 (+5)** | **5** |
| Stacked-prompt | 15 | 4 (+1) | 1 |
| *full ensemble* | — | **3 (1.9%)** | — |

So **keep Exa** — its gather→code member is the most valuable (drop it and you lose the most recall; the two built-in methods overlap heavily). The Exa member uniquely catches `ford-jd`/intellectual-property, `foster-bill`/companion-chatbots, `foster-bill`/intellectual-property, `hill-french`/military-ai, `lahood-darin`/AI-preemption. (Note: this is *not* the same as swapping the search engine inside one agent — that was a wash; see learning #2.)

---

# How we got here & what we learned

Each conclusion below includes the evidence behind it. Spreadsheet-issue claims cite specific cells so Vinaya can look them up. (The full chronological logs are in `reports/`.)

### 1. Recall is the bottleneck, not precision
Every hit is human-validated, and signal is sparse (~6% of cells are real positions), so a miss costs far more than a spurious flag. A recall-first prompt alone (detect any *engagement*; code `Unclear` not `No mention`; mandatory congress.gov sponsor/cosponsor/vote mining) cut FNR from **30.8% → 11.5%** vs the original balanced-prompt baseline.

### 2. A multi-method ensemble is the lever — *not* the search engine
Single methods plateau at ~8–12% FNR; the union of three diverse detectors hits 1.9% because they miss *different* cells (see the leave-one-out table above). **Caution on a confusing-sounding result:** swapping the search engine (built-in → Exa) *inside one detection agent* was a wash (FNR 14.1% vs 11.5% — run-to-run noise). That is a different thing from the **Exa gather→code method**, which is structurally distinct (a deterministic evidence dossier feeding a lighter coder) and is the most valuable member. Lesson: diversity of *method* pays; swapping the engine in place does not.

### 3. The spreadsheet appears to under-count real positions by ~26%
When the ensemble's 125 raw "false positives" were adjudicated against their cited sources, an LLM adjudicator judged **90 of 125 (72%) to be real positions coded "No mention" in the sheet**. If that holds, the automation *improves* coverage, and GT-No-mention labels can't be trusted (measure precision by adjudication, not raw FP-vs-GT). **This is itself unverified — please spot-check these examples** (all currently "No mention" in the sheet):

| Candidate / topic | sheet cell | what the source shows |
|---|---|---|
| `hill-french` / jobs-workforce | `pos-0047` | His own 2024 op-ed *"Drive innovation — Integrate AI for next generation"* (hill.house.gov, DocID 9340) calls for AI literacy, STEM, skilled-trades workforce prep. |
| `ross-deborah` / intellectual-property | `pos-0180` | She introduced the *Protect Working Musicians Act of 2026* to let artists negotiate with "generative AI developers" (ross.house.gov, May 2026). |
| `harrigan-pat` / export-control | `pos-0431` | Voted Yea on H.R. 2683 *Remote Access Security Act* (export control on remote AI-chip access) — govtrack House vote #13, 2026. |
| `ross-deborah` / data-centers | `pos-0174` | Her Dec-2025 Energy Subcommittee opening statement backs AI compute infrastructure and flags a DOE budget cut hurting it. |

### 4. Verify should be triage, not a filter — and may be unnecessary
Hard "verify-and-drop" (delete any detection a fact-checker can't confirm) **hurt recall**: on a recall-first pass it took recall 88.5% → 80.8%, and **6 of 13 dropped cells were real positions** (e.g. `ford-jd`/regulation-philosophy, `brown-sherrod`/children-safety) — wrongly rejected because the cited source 403'd or the verifier applied a stricter bar than the human coder. The verifier is still useful to *flag* likely errors and to *measure* precision, but it must never auto-drop and never reject on a fetch failure. **Open question:** since every cell is human-reviewed anyway, production may not need a verify step at all.

### 5. Stance: "decisive" wins; the ceiling is the spreadsheet's own conventions
The best stance classifier is **`decisive`** (apply the topic conventions, stay decisive, high bar for Mixed/Unclear): ~73% vs a 64% minimal baseline under a *consistent* rubric. Over-hedging variants did worse (the sheet is ~65% Support, so a decisive prior is better calibrated). But on the raw labels every method is stuck ~69–70%, because **the sheet codes the same stance inconsistently**:

- **deepfakes-fraud has contradictory polarity.** The sheet's own corrections log states the convention: *"Oppose = opposes deepfakes, Support = supports/minimizes concern."* By that rule, wanting to crack down on deepfakes = **Oppose** (and 25 cells are coded that way). But 9 cells use the freeform label **"Supports deepfake/fraud regulation"** for the *same* crackdown stance — e.g. `ricketts-pete` `pos-4038` (AI-watermark bill), `cavanaugh-john` `pos-4098` (bans political deepfakes). The corrections log also shows the team already re-coding five such entries (`pos-0438, pos-2228, pos-2348, pos-2618, pos-0588`), so this is a known, ongoing inconsistency. **Suggested fix:** retire the "Supports deepfake/fraud regulation" label and code all crackdown stances as Oppose.
- **data-centers conflates three labels.** The same "support buildout but want disclosure / ratepayer protection" stance is coded three different ways: `husted-jon` "Supports data center regulation" (`pos-3604`, Ratepayer Protection Pledge), `harrigan-pat` "Mixed" (`pos-0434`), `ford-jd` "Mixed" (`pos-3404`, SB-135 usage reporting), `miller-donna` "Opposes data center development" (`pos-2454`, disclosure requirements). **Suggested fix:** a crisp dominant-axis rule.

So the biggest remaining stance lever is a **data cleanup**, not more prompting.

### 6. Infra lessons (brief)
~60+ concurrent subagents caused mass "no StructuredOutput" failures → cap fan-out and always retry. Details a human can ignore are in [`workflows/CLAUDE.md`](workflows/CLAUDE.md).

---

# What's pending / open

- **Separate gathering from stance (minor cleanup).** Detection agents still emit a stance that the dedicated `decisive` pass then overwrites — slightly vestigial. Cleaner: have detectors only gather sources, and let the stance pass own all stance assignment. (`pipeline.js` already runs the separate pass; the detect prompt could stop asking for stance.)
- **Is `verify` needed in production?** TBD (see #4).
- **Validate <1% FN properly.** It's ~met, not proven: 3 readable-source misses remain, and 155 real cells can't statistically support a 1% claim — scale the recall denominator toward the full ~397 real positions.
- **Prompt unification: done.** All prompts now live inline in `pipeline.js` (this was previously split across generators + gitignored data).

# Caveats
- Nothing here is human-verified yet (including the "coders missed it" finding in #3).
- Topic conventions matter: deepfakes-fraud has inverted polarity; data-centers is a 2-axis label.
- A few sources (hard paywalls) remain genuinely inaccessible to both WebFetch and playwright.

# Reviewing & re-running

- **Prompts + pipeline:** [`pipeline.js`](pipeline.js) (all prompts inline). Older rendered example prompts: `prompts/examples/`.
- **Eval/metrics:** `eval/` — `score.py`, `board.py`, `ensemble.py` (the same union as the pipeline), `stance_score.py`.
- **Historical experiments:** `workflows/` (manifest in `workflows/README.md`; ★ = in the current pipeline). Full logs + scoreboards: `reports/`.
- **Setup / data regeneration:** [`CLAUDE.md`](CLAUDE.md). Data is gitignored but regenerable from the source sheet.
