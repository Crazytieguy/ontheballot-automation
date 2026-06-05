# Current best method (end-to-end)

This is the recommended pipeline for automating discovery of US congressional
candidates' positions on the 10 AI-policy topics. It is **recall-first**: a missed
real position (false negative) is the worst error, because every machine-found item is
human-validated downstream. Targets: **<1% false negatives, <10% true false positives**.

On the held-out campaign set (50 candidates / 500 cells; 155 real positions, 345
No-mention) the pipeline below reaches **FNR 1.9% (98.1% recall)** and **adjudicated
true-FPR 9.6%** simultaneously — both targets ~met. Single methods alone sit at
8–12% FNR; the win comes from ensembling diverse methods, not from any one engine.

## Pipeline

```
recall-first DETECT (multiple diverse methods, run independently)
        |
        v
ENSEMBLE = UNION of detections (eval/ensemble.py)   <- the recall lever
        |
        v
VERIFY as SOFT TRIAGE (flag likely-errors; NEVER auto-drop)
        |
        v
HUMAN is the final filter   (+ dedicated 'decisive' STANCE pass on detected cells)
```

### 1. Detect — recall-first, multi-method
Run several **diverse** detection methods independently over the candidate list. Each
method is one research agent per candidate that researches all 10 topics and emits a
structured position per topic (`detected`, `stance`, `confidence`, `summary`,
`sources`). All methods share the same recall-first prompt principles:

- **Lower the detection threshold.** `detected=true` for ANY genuine engagement by the
  candidate — a stated view, a sponsored/cosponsored bill, a relevant vote, hearing/
  task-force participation, or a news/social statement — even if direction is ambiguous.
  If engaged but direction is unclear, use `stance="Unclear"` (NOT No mention). Reserve
  No mention for genuinely no engagement.
- **Be exhaustive in search.** Don't stop at the campaign site: mine congress.gov for
  sponsor/cosponsor/votes, official .gov press, committee/task-force activity, news,
  op-eds, interviews, and a **mandatory social-media pass** (Facebook/X/Instagram/
  LinkedIn). Aggressive query expansion against named bills (TAKE IT DOWN, GUARD, KOSA,
  CHAT Act, Chip Security, etc.) helps surface legislative records.
- **Force access on hard pages.** Social/JS/login-walled pages defeat WebFetch; read them
  with `playwright-cli` (`open about:blank` -> `goto URL` -> `eval "() => document.body.innerText"`).
- **Ground every hit.** Every `detected=true` must cite a source URL the agent actually read.

The current ensemble uses **three diverse members** (they miss *different* cells, which
is why the union works):

1. **Built-in search + critic re-check (v4 -> v6).** A recall-first WebSearch/WebFetch
   pass (`v4` prompt: social + completeness self-check), then a second aggressive
   "second-opinion" critic agent that re-examines ONLY the topics the first pass marked
   No-mention and tries hard to overturn them. Solo FNR ~7.7–9.7%.
2. **Exa gather -> code (v5).** A deterministic Python step harvests an evidence dossier
   per candidate (Exa `/answer` + its citations, plus keyword/congress.gov/social
   searches), then a lighter coder agent reads the dossier (and the cited pages) and
   codes the 10 topics. Best precision + stance, most reliable agents; slightly lower
   solo recall — an excellent ensemble member. Solo FNR ~11.6%.
3. **Stacked-prompt single pass (v10).** One built-in-search pass with every recall lever
   stacked into the prompt (social + completeness + query-expansion + topic
   disambiguation + stance guide). Solo FNR ~9.7%.

> Engine choice (built-in vs Exa) was NOT the lever — agent-driven engine swap was a
> wash on recall. What moved FNR was (a) the recall-first prompt + lowered threshold
> (v1 30.8% -> v2 11.5%) and (b) **ensembling diverse methods** (-> 1.9%).

### 2. Ensemble — union of detections
`eval/ensemble.py` merges N prediction files: a cell is `detected` if **any** member
detected it (OR); the stance/summary come from the highest-confidence detecting member,
and sources are unioned. This is the single biggest recall lever (each member misses
8–12%, but their misses largely cancel). FP count rises, but that is acceptable — see below.

### 3. Verify — soft triage only, never drop
A verify agent fetches each detected cell's cited source and judges it against the
topic's INCLUDES/EXCLUDES rubric (`SUPPORTED` / `WRONG_TOPIC` / `NOT_SUPPORTED` /
`UNREACHABLE`). **Use this only to flag/sort likely-wrong cells for prioritized human
review — never to auto-drop.** Hard verify-and-drop was tested and HURT recall (it
deleted real positions, because the human coder's "engagement counts" bar is more
generous than a strict fact-checker, and fetch failures cause false rejections). Verify
must never reject on a fetch failure. The same workflow that adjudicates FPs cleanly
separated 90 human-misses from 33 genuine errors, which is exactly its triage value.

### 4. Human is the final filter
The human reviewer validates the (recall-maxed, triage-sorted) queue. Note the headline
data-quality finding: when the ensemble's 125 raw "false positives" were adjudicated
against their sources, **90 (72%) were REAL positions the human coders had missed** —
so the automation improves coverage, not just matches it. Consequence: only GT-real
labels are trustworthy; **precision must be measured by ADJUDICATION, never raw FP-vs-GT**.

### 5. Stance — a dedicated 'decisive' classification pass
Stance direction is a separate problem from detection; run it as a dedicated pass over
each detected cell (read the source, classify direction). The best method is
**`decisive`**: apply the topic conventions exactly, stay decisive, and keep a high bar
for Mixed/Unclear (Mixed only when the candidate explicitly voices BOTH sides; Unclear
only when engaged with no stated view). It reaches **73.2%** under a consistent rubric
vs 64% for a minimal baseline; a 3-method vote adds ~+1.4 pts. Few-shot/decompose
variants over-hedged and did worse. Key conventions the prompt must encode:
deepfakes-fraud is INVERTED (cracking down on deepfakes => **Oppose**); data-centers
is a 2-axis label (development vs regulation). The remaining ceiling is **ground-truth
inconsistency** (the same crackdown stance is coded both Oppose and Support in GT) —
fixing the GT conventions is a bigger lever than more prompting.

## Operating notes / pitfalls
- **Concurrency cap.** Running too many heavy detection agents at once (>~60 concurrent
  subagents) caused mass "completed without StructuredOutput" failures. Run <=2
  detection workflows concurrently, and always retry schema-enforced agents once
  (the runners do this).
- Workflow `args` arrives as a **string** -> `JSON.parse` defensively.
- Attach authoritative `(candidate, topic)` from the orchestrator; do not trust an
  agent's echoed identifiers (caused index collisions in an early adjudicator).

---

# High-leverage files (open these to understand / re-run)

**Start here**
- `docs/method.md` — this file.
- `docs/findings.md` — distilled key insights/lessons.
- `reports/detection-campaign.md` — full detection experiment log + the 50-candidate
  scoreboard and adjudicated true-precision numbers.
- `reports/stance-experiments.md` — full stance sweep + the GT-consistency analysis.

**The prompts (the actual levers)**
- `eval/gen.py` — unified prompt generator; composes variants from blocks. Inspect the
  `VARIANTS` map: `v4` (social + completeness), `v5` (Exa-dossier), `v10` (all levers
  stacked). Blocks of note: `THRESHOLD` (lowered detection bar), `SOCIAL_COMPLETE`,
  `QEXPAND`, `TOPIC_DISAMBIG`, `STANCE_GUIDE`, `CONV` (topic conventions).
- `prompts/examples/` — rendered example prompts:
  `detection-v4-social-completeness.example.md`, `detection-v5-exa-gather-code.example.md`,
  `detection-v10-stacked.example.md`.

**Detection runners (ensemble members)**
- `workflows/04-detect-generic.js` — generic per-candidate detection runner (promptdir +
  toolnote via args; includes the retry stage). Used for the v4/v10 passes.
- `workflows/05-critic-recheck-v6.js` — the critic / second-opinion re-check over only
  No-mention topics (the v6 = v4 + critic member).
- `tools/gather_exa.py` — deterministic Exa gather -> per-candidate dossier
  (`data/eval/dossier_v5/<cid>.json`) for the v5 member.
- `workflows/03-detect-exa-v3.js` — the Exa-engine coder runner (pairs with the dossier /
  the v3/v5 Exa path). `tools/exa.py` is the Exa CLI wrapper agents call for read/search.
- (context) `workflows/01-detect-baseline-builtin.js`, `02-detect-builtin-v2.js` — the
  baseline and recall-first v2 built-in passes that established the prompt lever.

**Ensemble + scoring**
- `eval/ensemble.py` — union N prediction files (the recall lever).
- `eval/score.py` — detection scorer (FNR/FPR, recall/precision, stance-dir, source
  overlap) against an answer key.
- `eval/board.py` — one-line scoreboard wrapper over `score.py` (writes
  `data/eval/scoreboard.tsv`).
- `eval/common.py` — GT loading + stance/detection label normalization (shared).
- `eval/extract.py` — pull a workflow run's `predictions` out into a scorable JSON.

**Verify (soft triage)**
- `workflows/09-verify-ensemble-fps.js` — adjudicate every ensemble FP against its cited
  source (true-precision + triage). `06-verify-detected-v2.js` is the per-detection
  verify variant (also emits `stance_ok`).

**Stance**
- `workflows/10-stance-classify.js` — isolated stance pass; the `decisive` variant is the
  recommended method (variants `base/cot/conv/fewshot/decisive/decompose/vote` all live
  here in the prompt strings).
- `eval/stance_score.py` — stance scorer (coarse direction + data-center fine axis).
