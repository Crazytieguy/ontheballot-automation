# Findings — durable insights

The distilled lessons from the detection + stance campaigns. For the current best
end-to-end method see `docs/method.md`; for the full experiment logs and abandoned
approaches see `reports/detection-campaign.md` and `reports/stance-experiments.md`.

Eval is a held-out set of 50 candidates / 500 cells: **155 real positions**
(recall/FN denominator) + **345 No-mention** (precision/FP denominator). Stance has
a separate **142-cell** isolated eval. Scorers: `eval/score.py`, `eval/board.py`,
`eval/stance_score.py`.

## 1. Recall is the bottleneck, not precision
- Targets are **<1% false negatives, <10% false positives** — every machine hit is
  human-validated downstream, so a missed position (FN) is far costlier than a
  spurious one (FP).
- Signal is sparse: only **~6%** of candidate×topic cells are real positions.
- **GT-real labels are the only trustworthy metric.** Report recall against GT-real;
  GT-No-mention labels are unreliable (see #3). Precision must be measured by
  adjudication, never raw FP-vs-GT.
- A recall-first prompt alone (detect any topic *engagement*; code Unclear not
  No-mention when direction is ambiguous; mandatory congress.gov sponsor/cosponsor/
  vote mining) cut FNR **30.8% → 11.5%** (v1 balanced → v2 recall-first). The
  abandoned v1 balanced prompt sat at 30.8% FNR.

## 2. The multi-method ensemble is THE recall lever (not the engine)
- Single methods plateau at **~8–12% FNR** (v6 7.7%, v4 9.7%, v10 9.7%, v5 11.6%).
- The **union of three diverse detectors** — built-in-search + critic re-check (v6),
  Exa gather→code (v5), stacked-prompt (v10) — reaches **FNR 1.9% / 98.1% recall**.
  Two members (v6 ∪ v5) already hit 2.6% FNR.
- Why it works: diverse methods miss **different** cells, so their misses cancel.
  Method *diversity* is what matters (built-in+critic vs Exa-gather are
  complementary).
- **Engine choice (built-in WebSearch vs Exa) was NOT the lever** — the v3
  agent-driven Exa engine-swap was a wash vs built-in (within run-to-run variance:
  gained 4 cells, lost 6). Keep both in the ensemble cheaply; don't expect one
  engine to win.
- Other recall contributors, ranked: recall-first prompt + lowered "engagement"
  threshold (#1) > critic re-check pass > forced social access via playwright
  (recovers Facebook-only positions) > Exa gather→code as a member.

## 3. The ground truth UNDER-COUNTS real positions by ~26%
- When the ensemble's **125 raw "false positives"** were adjudicated against their
  cited sources: **90 (72%) were REAL positions the human coders had MISSED** — the
  system was correct. Only **33 (26%)** were genuine errors; 2 unverifiable.
- **True false-positive rate = 33/345 = 9.6%** (under the <10% target).
  GT-corrected precision (crediting the human-misses) = **88%**, vs a raw
  FP-vs-GT precision that looks like ~55%.
- Consequence: the automation **improves coverage**, it doesn't merely match humans.
  ~26% of GT-No-mention cells are actually positions, so those labels can't be
  trusted. **Measure precision by adjudication, never raw FP-vs-GT.**
- Genuine errors are overwhelmingly **topic over-assignment** (real AI content filed
  under the wrong topic; one statement is even double-coded across topics in GT) plus
  occasional misattribution — exactly the class a verify stage can flag.

## 4. Verify as SOFT TRIAGE — never auto-drop
- **Hard verify-and-drop was tested and HURT recall:** applying "keep only SUPPORTED"
  to v2 took recall 88.5% → 80.8% (FNR 11.5% → 19.2%). Of 13 dropped detections,
  6 were real GT positions (verify *created* FNs).
- Failure modes of a strict verifier: (a) the human coder uses a generous
  "engagement counts" bar (task-force membership, tangential mentions), and a generic
  strict fact-checker disagrees and rejects valid borderline cells; (b) fetch
  failures (403 / LinkedIn-999 / paywall) make verify judge on a weaker source and
  falsely reject — **verify must NEVER reject on a fetch failure**.
- Right architecture: **recall-first DETECT → VERIFY as soft triage** (flag
  likely-errors for prioritized human review, sort the queue) → **human is the final
  filter**. The verify pass cleanly separated the 90 human-misses from the 33 genuine
  errors, so it's useful for triage — just not for dropping.

## 5. Stance accuracy ceiling is GT convention CONSISTENCY, not prompting
- Best method = **`decisive`** (apply topic conventions, stay decisive, high bar for
  Mixed/Unclear): **73.2%** under a consistent (canonical) rubric vs **64.1%**
  baseline. A 3-method vote adds only +1.4 pts (74.6%).
- Topic conventions matter: **deepfakes-fraud has INVERTED polarity** (Oppose =
  opposes deepfakes / pro-crackdown); **data-centers** uses a 2-axis label
  (development vs regulation). Applying the deepfakes polarity correctly is almost the
  entire base→decisive gain (deepfakes 0% → 100% canonical).
- **The ceiling is GT inconsistency, not the model.** deepfakes-fraud codes the
  *same* "crack down on deepfakes" stance as both Oppose (10 candidates) and
  Support / "Supports deepfake regulation" (7). On the raw (buggy) GT every method is
  stuck ~69–70% regardless — the labels contradict any consistent convention.
- Biggest remaining stance lever is a **DATA fix**: standardize the deepfakes-fraud
  convention (re-code the 7, or retire the freeform label) and add a crisp
  data-centers dominant-axis rule. data-centers (~28–33%) is the residual genuinely
  hard topic (Mixed-heavy). Everything else is already strong given the source
  (children 88%, jobs ~95–100%, AI-preemption ~88–100%, export 83%, IP 75–100%).
- Abandoned stance prompts: `fewshot`/`decompose` over-hedged (defaulting to
  Mixed/Unclear flipped clean Support cases) and lost to `decisive`. GT is ~65%
  Support, so a decisive prior is better calibrated. Conventions help; hedging hurts.

## 6. Infra: concurrency cap + always retry schema-enforced agents
- Running 5 heavy detection workflows at once (**~60 concurrent subagents**) caused
  mass "subagent completed without calling StructuredOutput" failures, concentrated
  in later-queued candidates (model-API capacity starvation). Light/low-concurrency
  runs had 0 failures. Corrupted runs had to be re-run.
- Fixes (apply in production): (1) **cap fan-out at <=2 concurrent** detection
  workflows; (2) **retry failed agents once** and explicitly instruct the
  StructuredOutput call.
- Lesser gotchas: workflow `args` arrives as a **string** → `JSON.parse` defensively;
  never delegate adjudication by "read file at index i" (index collisions) — pass the
  record inline and have the orchestrator attach the authoritative (candidate, topic);
  the source sheet exceeds read-tool token limits, so decode the xlsx (base64) and
  parse with openpyxl.

## Open items / caveats
- **Statistical power:** 155 real cells cannot validate a 1% FN claim. Scale the
  recall denominator toward the full ~397 real positions before declaring <1% done.
- 3 residual FNs (haggard/AI-preemption news, biss/export-control site,
  buckhout/military .gov) are coding/discovery misses on *readable* pages — a 4th
  ensemble member or targeted recheck should catch >=2 and likely cross <1%.
- Hard paywalls (e.g. WaPo) remain a genuine access constraint that neither built-in
  fetch nor playwright reliably defeats.
