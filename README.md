# On the Ballot — AI-position automation

R&D for **automating** the discovery of US congressional candidates' positions on 10 AI-policy topics — research done by hand today and published at **[ontheballot.ai](https://ontheballot.ai)**. Every machine-found item is human-validated downstream, so **recall is paramount**: the targets are <1% false negatives and <10% false positives. This repo is the **experiment harness + findings**, not the production system and not the data (the source spreadsheet and the unvalidated AI outputs are gitignored).

> [!IMPORTANT]
> **None of the results below are human-verified.** They come from automated evaluation against the existing tracker data plus an LLM adjudicator, so treat them as provisional. Claims that the existing spreadsheet contains coding errors cite specific rows (with `pos-` ids) for direct lookup; only those cited rows have been examined, and only by the automation. Setup to run anything: [`CLAUDE.md`](CLAUDE.md).

## Pipeline

For each candidate × topic cell: decide whether the candidate has a *position*, then classify its stance.

1. **Detect (recall-first), three diverse ways** — three independent detectors per candidate: **Built-in + critic** (web search, then an aggressive critic re-check of anything marked "No mention"), **Exa gather→code** (a deterministic Exa evidence dossier fed to a coder), and **Stacked-prompt** (one pass with every recall lever in the prompt). Each lowers the threshold (any genuine engagement counts; `Unclear` rather than `No mention` when direction is fuzzy) and grounds every hit in a source.
2. **Ensemble = union** of the three (detected if *any* detector found it).
3. **Stance** — a `decisive`, enum-constrained classifier assigns a spreadsheet-conformant label on each detected cell.
4. **Verify** *(optional, off by default)* — fetches each hit's source and flags likely errors for the reviewer; see Finding 4.
5. **Human is the final filter.**

The current pipeline is one file — **[`pipeline.js`](pipeline.js)** — with every prompt inline as readable multi-line strings (rubric + few-shot included); it's the best place to see what the agents do. The three detectors were developed as the standalone experiments in `workflows/` and consolidated here ([`workflows/README.md`](workflows/README.md) maps each).

**Result** on the held-out set (50 candidates / 500 cells = 155 real positions + 345 No-mention):

| Approach | FNR | recall | true-FPR |
|---|---|---|---|
| single detectors | 7.7–11.6% | 88–92% | not separately measured\* |
| **ensemble (union of 3)** | **1.9%** | **98.1%** | **9.6%** (adjudicated) |

\* Only the ensemble's flagged cells were adjudicated for precision (Finding 3).

**Running it.** There is no shell entry point: `pipeline.js` runs inside the agent harness via its `Workflow` runner. First build the Exa dossiers (the prerequisite for the Exa detector — deterministic data-prep, not an agent):
`uv run --with requests python tools/gather_exa.py --candidates cands.json` (same `{id,name,state,party,seat}` list you pass as args). Then: `Workflow({ scriptPath: "pipeline.js", args: { candidates: [...] } })`.

## Findings

Spreadsheet-issue claims cite specific cells (full logs and scoreboards in `reports/`).

**1. Recall is the bottleneck, not precision.** Signal is sparse (~6% of cells are real positions) and every hit is human-validated, so a miss costs more than a spurious flag. A recall-first prompt alone (detect any *engagement*; code `Unclear` not `No mention`; mandatory congress.gov sponsor/cosponsor/vote mining) lowered FNR from 30.8% to 11.5% vs the original balanced-prompt baseline.

**2. Method diversity drives recall; the search engine does not.** Single detectors plateau at 7.7–11.6% FNR; the union of three reaches 1.9% because they miss *different* cells. Per-member contribution (leave-one-out on the 155 real cells — FN if that detector is dropped and the other two unioned):

| detector | solo FN | drop it → ensemble FN | cells only it catches |
|---|---|---|---|
| Built-in + critic | 12 | 7 (+4) | 4 |
| Exa gather→code | 18 | 8 (+5) | 5 |
| Stacked-prompt | 15 | 4 (+1) | 1 |
| full ensemble | — | 3 | — |

The Exa gather→code detector contributes the most unique recall (dropping it loses the most; the two built-in detectors overlap heavily). Separately, swapping the *search engine* (built-in → Exa) inside a single detection agent made no significant difference (14.1% vs 11.5% FNR, within run-to-run variation) — so the gain is the diverse *method*, not the engine.

**3. An LLM adjudicator flags ~26% of the ensemble's "false positives" as likely real positions the sheet records as "No mention" (unverified).** Of the ensemble's 125 raw false positives, the adjudicator judged 90 (72%) to be genuine positions and 33 (26%) genuine errors. Implication if it holds: raw FP-vs-GT understates precision, so precision should be measured by adjudication against sources rather than against the No-mention labels. Four representative examples (currently "No mention" in the sheet; 4 of the ~90, the rest in `reports/`):

| candidate / topic | cell | source shows |
|---|---|---|
| `hill-french` / jobs-workforce | `pos-0047` | His 2024 op-ed *"Drive innovation — Integrate AI for next generation"* (hill.house.gov, DocID 9340) calls for AI literacy, STEM, skilled-trades workforce prep. |
| `ross-deborah` / intellectual-property | `pos-0180` | She introduced the *Protect Working Musicians Act of 2026* to let artists negotiate with "generative AI developers" (ross.house.gov, May 2026). |
| `harrigan-pat` / export-control | `pos-0431` | Voted Yea on H.R. 2683 *Remote Access Security Act* (export control on remote AI-chip access) — govtrack House vote #13, 2026. |
| `ross-deborah` / data-centers | `pos-0174` | Her Dec-2025 Energy Subcommittee opening statement backs AI compute infrastructure and flags a DOE budget cut affecting it. |

**4. A verify stage should triage, not filter.** "Verify-and-drop" (delete any detection a fact-checker can't confirm) lowered recall from 88.5% to 80.8%, and 6 of 13 dropped cells were real positions — e.g. `ford-jd` / regulation-philosophy (`pos-3403`) and `brown-sherrod` / children-safety (`pos-3595`) — rejected because the cited source returned an error or the verifier applied a stricter bar than the human coder. (These counts come from the same automated adjudication and are likewise unverified.) Verify is useful to *flag* likely errors and to *measure* precision, but it must never auto-drop and never reject on a fetch failure. Whether production needs a verify step at all is open (see below).

**5. For stance, a "decisive" classifier wins; the ceiling is the spreadsheet's own conventions.** The `decisive` classifier (apply the topic conventions, stay decisive, high bar for Mixed/Unclear) reaches ~73% on the isolated 142-cell stance eval vs ~64% for a minimal baseline; over-hedging variants scored lower (the sheet is ~65% Support). On the raw labels every method stays ~69–70%, because the sheet codes the same stance inconsistently in two topics:

- **deepfakes-fraud — contradictory polarity.** The sheet's own *Corrections Log* tab states the convention ("Oppose = opposes deepfakes, Support = supports/minimizes concern"), and 25 cells code crackdown stances as Oppose. But 9 cells use the freeform label "Supports deepfake/fraud regulation" for the same crackdown stance — e.g. `ricketts-pete` (`pos-4038`, AI-watermark bill), `cavanaugh-john` (`pos-4098`, bans political deepfakes). The Corrections Log already shows five such entries (`pos-0438, pos-2228, pos-2348, pos-2618, pos-0588`) being re-coded. A consistent rule (retire "Supports deepfake/fraud regulation"; code crackdown as Oppose) would raise measured accuracy.
- **data-centers — conflated labels.** A "support buildout but want disclosure / ratepayer protection" stance is coded three ways: `husted-jon` "Supports data center regulation" (`pos-3604`), `harrigan-pat` "Mixed" (`pos-0434`), `ford-jd` "Mixed" (`pos-3404`), `miller-donna` "Opposes data center development" (`pos-2454`). A dominant-axis rule would resolve it.

The largest remaining stance improvement is therefore data cleanup rather than more prompting.

**6. Infra.** ~60+ concurrent subagents caused mass "no StructuredOutput" failures → cap fan-out and retry. Details: [`workflows/CLAUDE.md`](workflows/CLAUDE.md).

## Open questions

- **Is a verify step needed in production?** Since every cell is human-reviewed, it may only be worth keeping as a queue-prioritization signal (Finding 4).
- **Validate <1% FN properly.** It is ~met, not proven: 3 readable-source misses remain, and 155 real cells can't statistically support a 1% claim — scale toward the sheet's full ~397 real positions (the 155 held-out plus ~242 elsewhere).
- **Separate gathering from stance (minor).** Detectors still emit a provisional stance that the `decisive` pass overwrites; detectors could stop emitting stance entirely.

## Caveats

- Results are unverified (see the note at top), including the "coders missed it" finding.
- Topic conventions are non-obvious for deepfakes-fraud and data-centers (Finding 5).
- A few sources (hard paywalls) are inaccessible to both WebFetch and playwright.

## Repo

- `pipeline.js` — the current pipeline (all prompts inline).
- `eval/` — scorers (`score.py`, `board.py`, `stance_score.py`) and `ensemble.py` (the union).
- `tools/` — `exa.py` (Exa CLI), `gather_exa.py` (the dossier prereq), `parse_xlsx.py`, `exa-features.md`.
- `workflows/` — the historical experiments + manifest; `reports/` — full logs and scoreboards.
- `prompts/examples/` — rendered example prompts. `data/` — gitignored, regenerable (see [`CLAUDE.md`](CLAUDE.md)).
