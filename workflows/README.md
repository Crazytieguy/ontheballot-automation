# Workflows manifest

Multi-agent runner scripts for the detection/verify/stance experiments. Each fans
out one agent per unit (candidate, or cell) and aggregates structured output.
Metrics below are vs the eval set (20-cand/200-cell early runs; 50-cand/500-cell
campaign). **Recall is paramount** (target <1% FN, <10% true-FP); precision is
measured by ADJUDICATION, not raw FP-vs-GT (GT under-counts ~26%).

★ = member of the CURRENT BEST pipeline.

## Pipeline (current best)

`DETECT (recall-first, multi-method) → ENSEMBLE union → VERIFY as soft triage → human`

Detection ensemble = three diverse methods, union of detections:
1. **04** with the v4 prompt (built-in search, social+completeness) **+ 05** critic recheck → "v6"
2. **03** Exa gather→code → "v5"
3. **04** with the v10 stacked-prompt → "v10"

Ensemble v6∪v5∪v10 = **FNR 1.9% / recall 98.1%**, adjudicated true-FPR **9.6%** — both targets ~met.

## Manifest

| # | File | What it tested / did | Outcome / verdict |
|---|------|----------------------|-------------------|
| 01 | `01-detect-baseline-builtin.js` | Baseline detect: built-in WebSearch/Fetch, one agent/candidate, "balanced" v1 prompt, code 10 topics. | **Abandoned.** FNR 30.8% — balanced prompt under-detects badly. Established the harness + schema; superseded by recall-first prompting. |
| 02 | `02-detect-builtin-v2.js` | v2 prompt on built-in search: lowered "engagement" threshold + mandatory congress.gov sponsor/cosponsor/vote mining; code Unclear (not No-mention) when direction ambiguous. | **Superseded (lever proven).** FNR 30.8%→11.5% — recall-first prompt was the single biggest free win. Folded into the generic runner (04) + v4 prompt; not run standalone anymore. |
| 03 ★ | `03-detect-exa-v3.js` | Swap discovery engine to Exa (search/answer/contents CLI) + playwright access, same v2 coder; isolate the engine effect. Also the runner for the **v5 Exa gather→code** ensemble member. | **Engine swap = a wash** (FNR 14.1% vs 11.5%; gained 4 cells, lost 6 — variance, not Exa being worse). BUT **kept as an ensemble member**: best precision+stance, lightest agents, misses *different* cells than built-in. |
| 04 ★ | `04-detect-generic.js` | Generic per-candidate detect runner: prompt dir + tool note passed via args, with **auto-retry** of agents that errored/missed StructuredOutput. Used to run v4 / v8 / v10 prompts. | **Kept — the production detect runner.** Retry stage fixed the StructuredOutput-miss failures. Hosts the v4 (FNR 9.7%) and v10 (FNR 9.7%) ensemble members. v8 (disambig+multilabel) variant FAILED (FNR 53.5% — corrupted/over-restrictive run). |
| 05 ★ | `05-critic-recheck-v6.js` | Cheap aggressive SECOND pass over ONLY the topics v4 marked No-mention (dig harder, named bills, social via playwright). v4+critic = "v6". | **Kept.** Recovered misses: v4 9.7% → v6 7.7% FNR. Low-concurrency, 0 failures. Core member of the ensemble. |
| 06 | `06-verify-detected-v2.js` | Full detect→verify pipeline: adjudicate every v2-detected cell vs its cited source (SUPPORTED/WRONG_TOPIC/NOT_SUPPORTED/UNREACHABLE) and test **hard verify-and-drop**. | **Architecture rejected (informative).** Hard drop HURT recall (88.5%→80.8%; 6 dropped cells were real GT). Verdict: verify must be SOFT triage, never auto-drop, never reject on fetch failure. Logic lives on in 09. |
| 07 | `07-adjudicate-fps-v1.js` | Adjudicate v1 false-positives against cited sources to get TRUE precision (vs raw FP-vs-GT). | **One-shot analysis (kept as record).** Showed most "FPs" are real human-missed positions (true-FPR ~3-4%). Buggy delegation ("read file at index i" → index collisions); fixed in v2. |
| 08 | `08-adjudicate-fps-v2.js` | Same adjudication for v2 FPs; file+n passed via args. | **One-shot analysis (kept as record).** Confirmed v2 true-FPR ~4-6%; genuine errors are topic over-assignment. Superseded by 09 for the ensemble. |
| 09 ★ | `09-verify-ensemble-fps.js` | Adjudicate every ensemble FP vs source (with playwright for social/JS) + **retry on ERROR**. The soft-triage verify stage. | **Kept — the verify/triage stage.** Adjudicated all 125 ensemble FPs: 90 (72%) were real human-misses, 33 genuine errors → **true-FPR 9.6%**. Cleanly separates the review queue; does NOT drop. |
| 10 ★ | `10-stance-classify.js` | Isolated stance sweep: read GT source, classify direction per prompt variant (base / cot / conv / fewshot / decisive / decompose), apply topic conventions. | **Kept — stance classifier.** Best variant = **`decisive`** (~73% under a consistent rubric vs 64% baseline; over-hedging variants fewshot/decompose were worse). Ceiling is GT inconsistency, not prompting. |

## Dead-ends summarized (live in `reports/`)
- v1 balanced prompt (01): FNR 30.8%.
- v3 agent-driven Exa engine-swap (03 as solo detector): a wash vs built-in.
- Hard verify-and-drop (06): hurt recall.
- v7 stance-guide / v9 q-expand / v8 disambig+multilabel detect variants: corrupted/over-restrictive (FNR >50%).
- fewshot / decompose stance prompts (10): over-hedged, worse than `decisive`.
- High-concurrency campaign: >~60 concurrent subagents → StructuredOutput failures. Fix: ≤2 concurrent workflows + retry (04, 09).
