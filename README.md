# politician-tracker

R&D harness for **automating** the discovery of US congressional candidates' positions on 10 AI-policy topics — work that's done by hand today and feeds a public tracker website. Every machine-found item is human-validated downstream, so **recall is paramount**: the targets are <1% false negatives and <10% false positives.

> This repo is the **experiment harness + findings**, not the production system and not the data. The full dataset (a third party's private spreadsheet plus unvalidated AI outputs) is gitignored.

## Headline result

A **recall-first, multi-method ensemble** — the union of three diverse detectors — reaches **FNR 1.9% (98.1% recall)** with an **adjudicated true-FPR of 9.6%** on the 50-candidate held-out set (155 real positions / 345 No-mention cells). Both targets are ~met.

| Approach | FNR (recall) | False-positive rate |
|---|---|---|
| Best single method | ~8–12% (best 7.7%) | — |
| **Ensemble (union of 3)** | **1.9% (98.1%)** | **9.6%** (adjudicated true-FPR) |

The lever is **method diversity, not the search engine**: each detector alone misses 8–12%, but they miss *different* cells, so their misses cancel.

## How it works

Per candidate × topic cell, decide whether the candidate has a *position*, then classify its stance. The pipeline:

1. **Detect (recall-first)** — run several diverse detectors, each one agent per candidate researching all 10 topics. Lower the detection threshold (any genuine engagement counts; code `Unclear` rather than `No mention` when direction is ambiguous), search exhaustively (congress.gov records, official press, news, and a mandatory social-media pass via `playwright`), and ground every hit in a real source.
2. **Ensemble** — take the **union** of the detectors' hits (`eval/ensemble.py`). This is the single biggest recall lever.
3. **Verify as soft triage** — adjudicate each hit against its source to *flag* likely errors for review. Never auto-drop (that was tested and hurt recall).
4. **Human is the final filter** — downstream validation of the recall-maxed, triage-sorted queue.
5. **Stance** — a separate `decisive` classification pass (apply the topic conventions, stay decisive, high bar for Mixed/Unclear): ~73% vs a 64% baseline.

The three ensemble members are built-in-search + a critic re-check, an Exa gather→code pass, and a stacked-prompt pass. Full description and a file-by-file map: **[`docs/method.md`](docs/method.md)**.

## The finding that matters most

The **ground truth under-counts real positions by ~26%**. When the ensemble's 125 raw "false positives" were adjudicated against their sources, **90 (72%) turned out to be real positions the human coders had missed** — so the automation *improves* coverage, it doesn't just match it. Consequence: only GT-real labels are trustworthy, and **precision must be measured by adjudication, never by raw FP-vs-GT**.

## Where to look

- **[`docs/method.md`](docs/method.md)** — the current best end-to-end method and the high-leverage files to open.
- **[`docs/findings.md`](docs/findings.md)** — the durable insights and lessons.
- `eval/gen.py` + `prompts/examples/` — the prompts (incl. few-shot), composed from labeled blocks.
- `workflows/04-detect-generic.js` + `05-critic-recheck-v6.js` — the detection runner and critic pass.
- `tools/gather_exa.py` + `workflows/03-detect-exa-v3.js` — the Exa gather→code member.
- `eval/ensemble.py` — the union; `eval/score.py` + `eval/board.py` — the metrics.
- `workflows/09-verify-ensemble-fps.js` — verify/triage; `workflows/10-stance-classify.js` — stance.
- **[`workflows/README.md`](workflows/README.md)** — manifest of all 11 attempted workflows (★ marks the ones in the current best pipeline; each has a kept/abandoned verdict).
- **`reports/`** — the full chronological experiment logs and scoreboards. Abandoned approaches are documented here.

## Repo map

```
README.md ............. you are here
docs/
  method.md ........... current best end-to-end method + high-leverage files
  findings.md ......... distilled insights / lessons
  exa-features.md ..... Exa API reference
eval/ ................. harness: gen.py (prompt variants + few-shot), score.py, board.py,
                        ensemble.py, stance_score.py, common.py, extract.py
tools/ ................ exa.py (Exa CLI wrapper), gather_exa.py (deterministic Exa gather)
workflows/ ............ all 11 attempted multi-agent workflow scripts + a manifest
prompts/examples/ ..... rendered example prompts (detection v4 / v5 / v10)
reports/ .............. detailed experiment logs + scoreboards (abandoned approaches live here)
data/ ................. gitignored (regenerable from the source sheet)
```

## Caveats

- **GT under-counts ~26%** — don't trust raw FP-vs-GT; measure precision by adjudication.
- **The <1% FN target is ~met, not proven** — 3 readable-source misses remain, and 155 real cells can't statistically validate a 1% claim; scale the recall denominator first.
- **Stance accuracy is capped by GT convention consistency, not prompting** — e.g. deepfakes-fraud codes the same crackdown stance as both Oppose and Support. The biggest remaining stance lever is a data fix.
- **Topic conventions matter** — deepfakes-fraud has inverted polarity (Oppose = opposes deepfakes); data-centers uses a 2-axis label (development vs regulation).
- **Signal is sparse** (~6% of cells are real positions), and a few sources (hard paywalls) remain genuinely inaccessible.

## Reproducing the eval

Run the detectors (`workflows/0*-detect*.js`, `tools/gather_exa.py`), union with `eval/ensemble.py`, score with `eval/score.py` / `eval/board.py`; for stance, `workflows/10-stance-classify.js` then `eval/stance_score.py`. The data is gitignored but regenerable from the source sheet. Note: cap fan-out at ≤2 concurrent detection workflows and retry schema-enforced agents (see `docs/findings.md`).
