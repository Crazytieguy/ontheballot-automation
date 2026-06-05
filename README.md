# On the Ballot — AI-position automation

R&D harness for **automating** the discovery of US congressional candidates' positions on 10 AI-policy topics — the research that today is done by hand and feeds the public tracker at **[ontheballot.ai](https://ontheballot.ai)**. Every machine-found item is human-validated downstream, so **recall is paramount**: the targets are <1% false negatives and <10% false positives.

> This repo is the **experiment harness + findings**, not the production system and not the data. The full dataset (a third party's private spreadsheet plus unvalidated AI outputs) is gitignored. Setup: see [`CLAUDE.md`](CLAUDE.md).

> [!IMPORTANT]
> **Status: not yet human-verified.** Every number and claim below comes from automated evaluation against the existing tracker data plus an LLM adjudicator. None of it has been checked by a human reviewer yet — treat the results as promising but **provisional**.

## Headline result

A **recall-first, multi-method ensemble** — the union of three diverse detectors — reaches **FNR 1.9% (98.1% recall)** with an **adjudicated true-FPR of 9.6%** on the 50-candidate held-out set (155 real positions / 345 No-mention cells). Both targets appear ~met (pending human verification).

| Approach | FNR (recall) | False-positive rate |
|---|---|---|
| Best single method | ~8–12% (best 7.7%) | — |
| **Ensemble (union of 3)** | **1.9% (98.1%)** | **9.6%** (adjudicated true-FPR) |

The lever is **method diversity, not the search engine**: each detector alone misses 8–12%, but they miss *different* cells, so their misses cancel.

## How it works

Per candidate × topic cell, decide whether the candidate has a *position*, then classify its stance. The pipeline:

1. **Detect (recall-first)** — run several diverse detectors, each one agent per candidate researching all 10 topics. Lower the detection threshold (any genuine engagement counts; code `Unclear` rather than `No mention` when direction is ambiguous), search exhaustively (congress.gov records, official press, news, and a mandatory social-media pass via `playwright`), and ground every hit in a real source.
2. **Ensemble** — take the **union** of the detectors' hits (`eval/ensemble.py`). This is the single biggest recall lever.
3. **Verify** — adjudicate each hit against its source to flag likely errors for review. (Whether the production pipeline needs this at all is undecided — see `docs/method.md`.)
4. **Human is the final filter** — downstream validation of every flagged cell.
5. **Stance** — classify direction. Best method is a `decisive` pass (apply the topic conventions, stay decisive, high bar for Mixed/Unclear): ~73% vs a 64% baseline.

The three ensemble members are **built-in search + a critic re-check**, an **Exa gather→code** pass, and a **stacked-prompt** pass. Full description and a file-by-file map: **[`docs/method.md`](docs/method.md)**.

## The finding that matters most

When the ensemble's 125 raw "false positives" were adjudicated against their sources, an **LLM adjudicator judged 90 of them (72%) to be real positions the human coders had missed** (this judgement is itself unverified, pending human review). If it holds, the automation *improves* coverage rather than merely matching it — and it means **only GT-real labels are trustworthy**, so precision must be measured by adjudication, never by raw FP-vs-GT.

## Reviewing the prompts

The full, rendered prompts (including the interpolated few-shot examples) are committed in **`prompts/examples/`** — that's the best place to read what an agent actually sees. How they're composed from labeled blocks (threshold, social pass, conventions, stance guide, few-shot) is in **`eval/gen.py`**. Note the prompts are currently split across a few places (block templates in `eval/gen.py`, few-shot built from gitignored data, and per-agent wrapper text inside the `workflows/*.js` runners); unifying them into one git-tracked location is a known follow-up (see `docs/method.md`).

## Where to look

- **[`docs/method.md`](docs/method.md)** — the current best end-to-end method, the member-contribution analysis, and open/pending design questions. Start here.
- **[`docs/findings.md`](docs/findings.md)** — the durable insights and lessons.
- **Detection:** `workflows/04-detect-generic.js` (runner) + `05-critic-recheck-v6.js` (critic); `tools/gather_exa.py` + `workflows/03-detect-exa-v3.js` (the Exa member).
- **Ensemble & metrics:** `eval/ensemble.py` (the union); `eval/score.py` + `eval/board.py`.
- **Verify / stance:** `workflows/09-verify-ensemble-fps.js`; `workflows/10-stance-classify.js`.
- **[`workflows/README.md`](workflows/README.md)** — manifest of all 11 attempted workflows (★ = in the current best pipeline; each has a kept/abandoned verdict).
- **`reports/`** — the full chronological experiment logs and scoreboards; abandoned approaches are documented here.

## Caveats

- **Nothing here is human-verified yet** (see the status note above), including the "positions the coders missed" finding.
- **The <1% FN target is ~met, not proven** — 3 readable-source misses remain, and 155 real cells can't statistically validate a 1% claim; scale the recall denominator first.
- **Stance accuracy is capped by ground-truth convention consistency, not prompting** — e.g. deepfakes-fraud codes the same crackdown stance as both Oppose and Support. The biggest remaining stance lever is a data fix.
- **Topic conventions matter** — deepfakes-fraud has inverted polarity (Oppose = opposes deepfakes); data-centers uses a 2-axis label (development vs regulation).
- **Signal is sparse** (~6% of cells are real positions), and a few sources (hard paywalls) remain genuinely inaccessible.
