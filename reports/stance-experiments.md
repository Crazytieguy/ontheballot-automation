> **Detailed log (deep dive).** Start at the repo `README.md` / `docs/method.md`; this file is the full chronological record incl. abandoned approaches.

# Stance-direction accuracy experiments (2026-06-03)

Goal: improve stance-direction accuracy (was ~69–74% end-to-end). Isolated eval to
separate classification from retrieval: **142 GT-real cells that have a source**;
each is classified by READING the GT source(s) and applying the conventions. Metric =
coarse direction match (Support/Oppose/Mixed/Unclear) vs GT; "fine" also checks the
data-center development-vs-regulation axis. Scorer: `eval/stance_score.py`; per-run rows
in `data/eval/stance_scoreboard.tsv`; test cells in `data/eval/stance_cells.json`.

## Diagnosis (where errors are, across detection runs)
- Worst topics: **data-centers (16–44%)**, **deepfakes-fraud (56–58%)**, regulation-philosophy (67%).
- Dominant confusions: `mixed→support` (model flattens nuance) and `oppose↔support`
  polarity flips (deepfakes convention + data-center axis).

## Sweep results (isolated stance eval, 142 cells)
"canonical" = re-scored with the deepfakes-fraud GT made internally consistent
(crackdown = Oppose). data-centers/regulation columns are canonical per-topic accuracy.

| Variant | coarse (raw GT) | coarse (canonical) | data-centers | regulation | deepfakes |
|---|---:|---:|---:|---:|---:|
| base (minimal) | 69.0% | 64.1% | 33% | 63% | 0% |
| fewshot (CoT + conventions + examples) | 62.7% | 67.6% | 33% | 49% | 94% |
| decisive (conventions, no hedging) | 68.3% | 73.2% | 28% | 69% | 100% |
| decompose (2-question support/concern) | 66.2% | 71.1% | 28% | 69% | 100% |
| **vote(decisive+decompose+base)** | **69.7%** | **74.6%** | 28% | 66% | 100% |

**Winner: `decisive`** as a single method (73.2% canonical, simple) or the 3-method
**vote** for +1.4 pts (74.6% canonical). vs base 64.1% canonical = **+9–10 pts**, almost
entirely from applying the deepfakes polarity correctly. On the RAW (buggy) GT all methods
sit ~69–70% — because the deepfakes labels contradict any consistent convention, so raw
accuracy cannot move regardless of method.

## Key findings
1. **Deepfakes-fraud GT is internally inconsistent** — the same "crack down on deepfakes"
   position is coded **Oppose for 10** candidates and **Support / "Supports deepfake/fraud
   regulation" for 7**. By the corrections-log's own stated rule (Oppose = opposes deepfakes),
   the convention-following model is RIGHT (94% under canonical) and the 7 are GT errors.
   → This is a DATA fix, not a model fix; standardizing it lifts measured accuracy and the
   public data quality. Recommend re-coding deepfakes-fraud to one convention.
2. **`fewshot` over-hedged** — its "default to Mixed/Unclear when two-sided/vague" framing
   flipped clean Support cases (regulation 63%→49%, jobs 100%→81%). GT is 65% Support, so a
   DECISIVE prior is better calibrated. Conventions help; hedging hurts. → `decisive` variant.
3. **Real (non-GT) remaining hard spots:** data-centers (~33%, genuinely Mixed-heavy — GT
   codes many as Mixed; models pick a side) and regulation-philosophy Mixed cases.
4. Most topics are already strong given the source (children 88%, jobs 100%, AI-preemption
   100%, export 83%, IP 100%) — the headline ~70% is dragged down almost entirely by
   deepfakes (GT bug) + data-centers (Mixed) + regulation Mixed.

(Updated as variants land.)

## Conclusion & recommendations
1. **Best stance method = `decisive`** (conventions + decisiveness, high-bar Mixed/Unclear).
   Deploy it as a DEDICATED stance-classification pass over each detected position
   (decoupled from detection). Optional: 3-method vote for +1.4 pts. `decompose` did not
   beat `decisive` (mild re-hedging). Prompts live in the stance-classify workflow script.
2. **Biggest lever is a DATA fix, not a model fix: standardize the deepfakes-fraud
   convention.** 7 of 17 deepfakes cells code a pro-crackdown stance as Support/"Supports
   deepfake/fraud regulation" instead of Oppose, contradicting the corrections-log rule.
   Fixing them lifts measured accuracy ~+5 pts and cleans the public dataset. Cells to re-code
   to Oppose: brown-sherrod, beatty-joyce, brown-shontel (GT "Support"); powell-denise,
   capito-shelley, ricketts-pete, cavanaugh-john (GT "Supports deepfake/fraud regulation").
   (Better still: retire the "Supports deepfake/fraud regulation" freeform label entirely.)
3. **data-centers (~28–33%) is the residual hard topic** and is ALSO partly a GT-consistency
   issue: "supports building data centers BUT wants ratepayer/impact rules" is coded
   inconsistently across Mixed / "Supports data center regulation" / "Supports data center
   development". Recommend a crisp data-center coding rule (e.g., dominant-axis + reserve
   Mixed for explicit build-and-restrain) before chasing model gains here.
4. **Everything else is already strong** given the source: children 88–94%, jobs ~95–100%,
   AI-preemption ~88–100%, export ~83%, IP ~75–100%.

Net: with the deepfakes GT fixed, the recommended method reaches ~74–75% and the only real
remaining model weakness is data-centers Mixed. Stance is within a reasonable operating range
given it is human-validated; the path to higher numbers runs through GT coding-convention
cleanup, not more prompting.

Artifacts (all local): stance_pred_{base,fewshot,decisive,decompose,vote}.json,
stance_cells.json, stance_ids.json, stance_scoreboard.tsv, eval/stance_score.py.