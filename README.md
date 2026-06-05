# politician-tracker

R&D harness for **automating** the discovery of US congressional candidates' positions on 10 AI-policy topics. Today this is done by hand and feeds a public tracker website. Every machine-found item is human-validated downstream, so **recall is paramount** (targets: <1% false negatives, <10% false positives).

> This repo is the **experiment harness + findings** — not the production system and not the data. The full dataset (a third party's private spreadsheet + unvalidated AI outputs) is gitignored.

---

## If you have 1 minute

This repo finds, per candidate × topic cell, whether a candidate has a *position* on an AI-policy topic. The winning approach is a **recall-first, multi-method ensemble**: the union of three diverse detectors.

**Headline result: FNR 1.9% (98.1% recall) with adjudicated true-FPR 9.6%** on the 50-candidate held-out set. Both targets ~met. Single methods alone sit at ~8-12% FNR (best 7.7%); the ensemble works because diverse methods miss *different* cells.

---

## If you have 2 minutes

**Current best method (detection):**
- **Union of three diverse detectors** — (1) built-in-search + a critic re-check, (2) Exa gather→code, (3) a stacked-prompt run. Engine choice (built-in vs Exa) was *not* the lever; **ensembling + a recall-first prompt were**.
- **Recall-first prompting**: stay biased toward flagging a position; let the human be the final filter.
- **Verify is soft triage**, never an auto-drop (hard verify-and-drop was tested and *hurt* recall).

**The one finding that matters most:** the **ground truth under-counts by ~26%**. When the ensemble's 125 raw "false positives" were adjudicated against their sources, **90 (72%) were real positions the human coders had missed**. So automation *improves coverage*, not just matches it. Consequence: only GT-real labels are trustworthy, and **precision must be measured by adjudication, never by raw FP-vs-GT**.

---

## If you have 5 minutes

**Pipeline, end to end:**

1. **DETECT (recall-first)** — run three diverse detectors over the candidate × topic grid:
   - `workflows/04-detect-generic.js` (v4 prompt) + `workflows/05-critic-recheck-v6.js` — built-in search + critic re-check ("v6")
   - `tools/gather_exa.py` + `workflows/03-detect-exa-v3.js` — Exa gather→code ("v5")
   - `workflows/04-detect-generic.js` (v10 stacked prompt) — all recall levers in one pass
2. **ENSEMBLE (union)** — `eval/ensemble.py` takes the union of detector hits. Diversity is the whole point: methods miss different cells.
3. **VERIFY as SOFT TRIAGE** — `workflows/09-verify-ensemble-fps.js` flags *likely* errors for human review. It never auto-drops.
4. **HUMAN is the final filter** — downstream validation of every flagged cell.
5. **STANCE (separate step)** — `workflows/10-stance-classify.js` assigns stance in {Support, Oppose, Mixed, Unclear, No mention}. Best method is **"decisive"** (apply topic conventions, stay decisive, high bar for Mixed/Unclear) = **73.2%** vs 64% baseline.

**Start here:** `docs/method.md` (the current best end-to-end method + the exact high-leverage files to read).

**Highest-leverage files:**
- `docs/method.md` — start here
- `eval/gen.py` + `prompts/examples/` — the prompts (detection v4 / v5 / v10)
- `workflows/04-detect-generic.js` + `workflows/05-critic-recheck-v6.js` — detection runner + critic
- `tools/gather_exa.py` + `workflows/03-detect-exa-v3.js` — Exa gather→code member
- `eval/ensemble.py` — the union
- `eval/score.py` + `eval/board.py` — metrics
- `workflows/09-verify-ensemble-fps.js` — verify/triage
- `workflows/10-stance-classify.js` — stance (incl. 'decisive')

**Compact results** (50-candidate held-out set: 155 real / 345 No-mention cells):

| Approach | FNR (recall) | FP rate |
|---|---|---|
| Single method | ~8-12% (best 7.7%) | — |
| **Ensemble (union of 3)** | **1.9% (98.1%)** | **9.6%** adjudicated true-FPR |

Stance accuracy (separate 142-cell eval): **decisive 73.2%** vs 64% baseline.

---

## If you have 10 minutes

- **`docs/findings.md`** — distilled key insights and lessons.
- **`reports/`** — the full experiment log: `detection-campaign.md`, `stance-experiments.md`, plus `scoreboard.tsv` / `stance_scoreboard.tsv`. Abandoned approaches are documented here (the README keeps only a one-line pointer).

**Key caveats:**
- **GT under-counts ~26%** — do not trust raw FP-vs-GT; only GT-real labels are reliable. Measure precision by adjudication.
- **Stance ceiling is GT inconsistency**, not prompting — deepfakes-fraud codes the *same* crackdown stance as both Oppose and Support. Fixing the GT conventions is the biggest remaining lever.
- **Topic conventions matter:** deepfakes-fraud has **inverted polarity** (Oppose = opposes deepfakes / pro-crackdown); data-centers uses a **2-axis label** (development vs regulation).
- **Signal is sparse** (~6% of cells are real positions).
- **Statistical power:** 155 real cells cannot validate a 1% FN claim; scale the recall denominator toward the full ~397 real positions before declaring <1% done.
- **Concurrency limit:** >~60 concurrent subagents caused StructuredOutput failures. Fix: <=2 concurrent + retry.

**How to reproduce (eval):**
- Held-out set: 50 candidates / 500 cells (155 real positions = recall/FN denominator; 345 No-mention = precision/FP denominator). Stance has a separate isolated 142-cell eval.
- Run detectors (`workflows/0*-detect*.js`, `tools/gather_exa.py`), union with `eval/ensemble.py`, then score with `eval/score.py` and `eval/board.py`. Stance: `workflows/10-stance-classify.js` then `eval/stance_score.py`.
- Data is gitignored but **regenerable from the source sheet**.

**Abandoned / dead-ends** (details in `reports/`): v1 balanced prompt (FNR 30.8%); v3 agent-driven Exa engine-swap (a wash vs built-in); hard verify-and-drop (hurt recall); few-shot/decompose stance prompts (over-hedged, worse than decisive); high-concurrency run failure.

---

## Repo map

```
README.md ............. entry point (this file)
docs/
  method.md ........... CURRENT BEST end-to-end method + high-leverage files to read
  findings.md ......... distilled key insights / lessons
  exa-features.md ..... Exa API reference
eval/ ................. harness: gen.py (prompt variants incl. v10 stacked + few-shot),
                        common.py, score.py, board.py, ensemble.py, stance_score.py, extract.py
tools/ ................ exa.py (Exa CLI wrapper), gather_exa.py (deterministic Exa gather)
workflows/ ............ all 10 attempted multi-agent workflow scripts (01..10) + README manifest
prompts/examples/ ..... rendered example prompts (detection v4 / v5 / v10)
reports/ .............. detailed experiment logs + scoreboards (abandoned approaches live here)
data/ ................. GITIGNORED (regenerable from the source sheet)
```
