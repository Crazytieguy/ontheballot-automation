export const meta = {
  name: 'organize-docs',
  description: 'Draft + refine repo documentation for progressive disclosure (README-first)',
  phases: [{ title: 'Draft', detail: 'README, method, findings, workflow manifest' }, { title: 'Refine', detail: 'critic hardens the README' }],
}

const CONTEXT = `
PROJECT (politician-tracker): A contractor's R&D repo for AUTOMATING the discovery of US congressional candidates' positions on 10 AI-policy topics. Today this is done by hand and feeds a PUBLIC tracker website. Every machine-found item is human-validated downstream, so RECALL is paramount: targets are <1% false negatives and <10% false positives. This repo is the experiment harness + findings (NOT the production system, NOT the data — the full data is gitignored as it's a third party's private spreadsheet + unvalidated AI outputs).

DATA MODEL: a candidate x topic grid. stance in {Support, Oppose, Mixed, Unclear, No mention}. Signal is sparse (~6% of cells are real positions). Topic-specific conventions matter: deepfakes-fraud has INVERTED polarity (Oppose = opposes deepfakes / pro-crackdown); data-centers uses a 2-axis label (development vs regulation).

EVAL: held-out set of 50 candidates / 500 cells (155 real positions = recall/FN denominator; 345 No-mention = precision/FP denominator). Stance has a separate isolated 142-cell eval. Scorers: eval/score.py, eval/board.py, eval/stance_score.py.

HEADLINE DETECTION RESULT: a recall-first MULTI-METHOD ENSEMBLE — union of three diverse detectors (built-in-search + critic re-check; Exa gather->code; stacked-prompt) — reaches FNR 1.9% (98.1% recall) with adjudicated true-FPR 9.6%. BOTH targets ~met. Single methods alone sit at 8-12% FNR; the ensemble works because diverse methods miss DIFFERENT cells. Engine choice (built-in vs Exa) was NOT the lever; ensembling + a recall-first prompt were.

BIGGEST FINDING: the ground truth UNDER-COUNTS by ~26% — when the ensemble's 125 "false positives" were adjudicated against their sources, 90 (72%) were REAL positions the human coders had MISSED. So the automation improves coverage, not just matches it. Consequence: only GT-real labels are trustworthy; precision must be measured by ADJUDICATION, never raw FP-vs-GT.

ARCHITECTURE: recall-first DETECT -> VERIFY as SOFT TRIAGE (flag likely-errors for human review; NEVER auto-drop — hard verify-drop was tested and HURT recall) -> human is the final filter.

STANCE ACCURACY: best method is "decisive" (apply topic conventions, stay decisive, high bar for Mixed/Unclear) = 73.2% under a consistent rubric vs 64% baseline. The ceiling is GROUND-TRUTH inconsistency (deepfakes-fraud codes the same crackdown stance as both Oppose and Support); fixing the GT conventions is the biggest remaining lever, not more prompting.

ABANDONED / DEAD-ENDS (keep OUT of README prime real estate; they live in reports/): v1 balanced prompt (FNR 30.8%); v3 agent-driven Exa engine-swap (a wash vs built-in); HARD verify-and-drop (hurt recall); fewshot/decompose stance prompts (over-hedged, worse than decisive); a high-concurrency run failure (>~60 concurrent subagents caused StructuredOutput failures — fix: <=2 concurrent + retry).

REPO STRUCTURE (final):
- README.md ............ the entry point (you are writing/refining this)
- docs/method.md ....... the CURRENT BEST end-to-end method + exact high-leverage files to read
- docs/findings.md ..... distilled key insights/lessons
- docs/exa-features.md . Exa API reference (pre-existing)
- eval/ ................ harness code: gen.py (prompt variants incl v10 stacked + few-shot), common.py, score.py, board.py, ensemble.py, stance_score.py, extract.py
- tools/ ............... exa.py (Exa CLI wrapper), gather_exa.py (deterministic Exa gather for gather->code)
- workflows/ .......... all 10 attempted multi-agent workflow scripts (01..10) + workflows/README.md manifest
- prompts/examples/ .... rendered example prompts incl. few-shot (detection v4/v5/v10)
- reports/ ............. DETAILED experiment logs (detection-campaign.md, stance-experiments.md) + scoreboards. This is where abandoned approaches are documented.
- data/ ................ GITIGNORED (regenerable from the source sheet)

HIGH-LEVERAGE FILES to review the current best method: docs/method.md (start), eval/gen.py + prompts/examples/ (the prompts), workflows/04-detect-generic.js (detection runner) + 05-critic-recheck-v6.js, tools/gather_exa.py + workflows/03-detect-exa-v3.js (Exa gather->code member), eval/ensemble.py (union), eval/score.py + eval/board.py (metrics), workflows/09-verify-ensemble-fps.js (verify/triage), workflows/10-stance-classify.js (stance, incl 'decisive').
`

const PD_SPEC = `PROGRESSIVE-DISCLOSURE REQUIREMENT (critical): a reader must, by glancing for a fixed time budget, know exactly what to look at and use the time well. Structure the README with explicit time-boxed sections IN ORDER:
- "## If you have 1 minute" — what this is + the single headline result (the ensemble FNR/FPR numbers) in 2-3 lines.
- "## If you have 2 minutes" — the current best method in ~3 bullets + the one most important finding (GT under-counts 26%).
- "## If you have 5 minutes" — how the pipeline works end-to-end + a pointer to docs/method.md and the 4-5 highest-leverage files.
- "## If you have 10 minutes" — docs/findings.md, reports/ for the full log, key caveats, and how to reproduce.
- A compact repo map at the end.
Keep it tight (small surface area). Do NOT put detailed abandoned-approach narratives in the README — one line max pointing to reports/. Use a results table only if it stays compact.`

phase('Draft')
const drafts = await parallel([
  () => agent(`${CONTEXT}\n\n${PD_SPEC}\n\nWRITE the file README.md (use the Write tool) for this repo following the progressive-disclosure requirement EXACTLY. Be accurate to the numbers above. Verify file paths exist with the Read/Bash tools if unsure. Return a one-line confirmation.`, {label:'README', phase:'Draft'}),
  () => agent(`${CONTEXT}\n\nWRITE the file docs/method.md (use the Write tool): a precise description of the CURRENT BEST end-to-end method (recall-first detect -> multi-method ensemble union -> verify-as-soft-triage -> human; plus the 'decisive' stance pass), and a bulleted "high-leverage files" map telling a reviewer exactly which files/workflows to open to understand and re-run it. Read the actual files in eval/, tools/, workflows/ to be accurate. ~1-2 pages. Return a one-line confirmation.`, {label:'method', phase:'Draft'}),
  () => agent(`${CONTEXT}\n\nWRITE the file docs/findings.md (use the Write tool): the distilled, durable insights a future engineer needs — recall is the bottleneck; multi-method ensemble is the lever; GT under-counts ~26% (measure precision by adjudication); verify-as-soft-triage not drop; stance ceiling is GT convention consistency; the concurrency/retry infra lesson. Crisp bullets with the supporting numbers. Return a one-line confirmation.`, {label:'findings', phase:'Draft'}),
  () => agent(`${CONTEXT}\n\nRead each script in the workflows/ directory (01..10 .js) and WRITE the file workflows/README.md (use the Write tool): a manifest table with one row per workflow — filename, what it tested/did, and its OUTCOME/verdict (kept vs abandoned and why). Mark which workflows compose the CURRENT BEST pipeline. Keep it compact. Return a one-line confirmation.`, {label:'manifest', phase:'Draft'}),
])

phase('Refine')
const critique = await agent(
  `${CONTEXT}\n\n${PD_SPEC}\n\nYou are a documentation editor doing QC. READ (with the Read tool) the freshly written README.md, docs/method.md, docs/findings.md, and workflows/README.md, plus skim reports/detection-campaign.md and reports/stance-experiments.md for factual accuracy.\n`+
  `Evaluate the README against the progressive-disclosure requirement: does a 1/2/5/10-minute reader get steadily deeper value with correct ordering and minimal surface area? Are abandoned approaches kept out of prime real estate? Are the numbers accurate and consistent across files? Are the high-leverage file pointers correct (verify the paths exist)?\n`+
  `Then REWRITE README.md (use the Write tool) to fix every issue you find — tighten it, fix ordering, correct any wrong numbers/paths, ensure the time-boxed sections genuinely deliver progressive disclosure. Also fix any clear errors in the other three files.\n`+
  `Return: a short bullet list of the concrete changes you made and any remaining gaps a human should resolve.`,
  {label:'critic', phase:'Refine'}
)
return { critique }
