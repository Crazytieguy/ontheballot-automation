# Current best method (end-to-end)

The recommended pipeline for automating discovery of US congressional candidates'
positions on the 10 AI-policy topics. It is **recall-first**: a missed real position
(false negative) is the worst error, because every machine-found item is human-validated
downstream. Targets: **<1% false negatives, <10% true false positives**.

> **Unverified.** The numbers below are from automated evaluation against the existing
> tracker data plus an LLM adjudicator; none have been human-checked yet. Treat as
> provisional. (Runner/operational details a human can ignore live in
> [`../workflows/CLAUDE.md`](../workflows/CLAUDE.md); the file-by-file map is in the
> [README](../README.md).)

On the held-out campaign set (50 candidates / 500 cells; 155 real positions, 345
No-mention) this pipeline reaches **FNR 1.9% (98.1% recall)** and **adjudicated true-FPR
9.6%** simultaneously — both targets ~met. Single methods alone sit at 8–12% FNR; the win
comes from ensembling diverse methods, not from any one search engine.

## Pipeline

```
recall-first DETECT (several diverse methods, run independently)
        |
        v
ENSEMBLE = UNION of detections (eval/ensemble.py)   <- the recall lever
        |
        v
VERIFY as triage (flag likely-errors)   <- may be unnecessary in production (see below)
        |
        v
HUMAN is the final filter   (+ a dedicated stance pass on detected cells)
```

### 1. Detect — recall-first, multi-method
Run several **diverse** detection methods independently. Each is one research agent per
candidate that researches all 10 topics. All share the same recall-first principles:

- **Lower the detection threshold.** Flag ANY genuine engagement by the candidate — a
  stated view, a sponsored/cosponsored bill, a relevant vote, hearing/task-force
  participation, or a news/social statement — even if direction is ambiguous (then use
  `Unclear`, not `No mention`). Reserve `No mention` for genuinely no engagement.
- **Be exhaustive.** Don't stop at the campaign site: mine congress.gov for
  sponsor/cosponsor/votes, official .gov press, committee/task-force activity, news,
  op-eds, interviews, and a **mandatory social-media pass** (Facebook/X/Instagram/
  LinkedIn). Aggressive query expansion against named bills helps surface records.
- **Force access on hard pages.** Social/JS/login-walled pages defeat WebFetch; read them
  with `playwright-cli` (and always `playwright-cli close` afterward).
- **Ground every hit** in a source URL the agent actually read.

The ensemble uses **three diverse members** (they miss *different* cells, which is why the
union works):

1. **Built-in search + critic re-check.** A recall-first WebSearch/WebFetch pass (social +
   a completeness self-check), then a second aggressive "second-opinion" agent that
   re-examines ONLY the topics the first pass marked No-mention and tries to overturn them.
   Solo FNR ~7.7%.
2. **Exa gather → code.** A deterministic Python step (`tools/gather_exa.py`) harvests an
   evidence dossier per candidate (Exa `/answer` + its citations, plus
   keyword/congress.gov/social searches); a lighter coder agent then reads the dossier and
   codes the 10 topics. Best precision + stance, most reliable agents; slightly lower solo
   recall (~11.6%) but the **most valuable ensemble member** (see below).
3. **Stacked-prompt single pass.** One built-in-search pass with every recall lever stacked
   into the prompt (social + completeness + query-expansion + topic disambiguation + stance
   guide). Solo FNR ~9.7%.

### 2. Ensemble — union of detections
`eval/ensemble.py` merges N prediction files: a cell is `detected` if **any** member
detected it (OR). This is the single biggest recall lever.

**Member contribution** (held-out set, 155 real cells; leave-one-out = FN if that member
is dropped and the other two are unioned):

| Member | solo FN | drop it → ensemble FN | cells only it catches |
|---|---|---|---|
| Built-in + critic | 12 | 7 (+4) | 4 |
| **Exa gather → code** | 18 | **8 (+5)** | **5** |
| Stacked-prompt | 15 | 4 (+1) | 1 |
| *full ensemble (all 3)* | — | **3 (1.9% FNR)** | — |

Takeaways: (a) **Exa gather→code is the most valuable member** — dropping it costs the most
recall and it uniquely catches 5 cells; (b) the two built-in-based methods overlap heavily
(they miss many of the same cells), so **diversity is what pays** — the complementary
Exa method is doing the heavy lifting, not a third correlated pass; (c) stacked-prompt adds
the least and is the first candidate to cut if trimming.

> **"Engine choice was not the lever" — clarified.** That claim refers to a *different*
> experiment: swapping the search engine (built-in WebSearch → Exa search) *inside one
> detection agent* was a wash (FNR 14.1% vs 11.5% — run-to-run variance). It does **not**
> mean Exa is unnecessary. The **Exa gather→code method** (deterministic dossier → light
> coder) is structurally different and, per the table above, the single most valuable
> member. Keep Exa as that method; don't bother engine-swapping inside an agent.

### 3. Verify — triage (necessity in production: TBD)
A verify agent fetches each detected cell's cited source and judges it against the topic's
INCLUDES/EXCLUDES rubric. Today it is useful as **soft triage** — flag/sort likely-wrong
cells for review — and as the **measurement** that gave us the adjudicated true-FPR.

- **Do NOT use it to auto-drop.** Hard verify-and-drop was tested and HURT recall (it
  deleted real positions: the human coder's "engagement counts" bar is more generous than a
  strict fact-checker, and fetch failures cause false rejections). Verify must never reject
  on a fetch failure.
- **⚠ PENDING / TBD:** whether the production pipeline needs a verify step **at all** is
  undecided. Since every cell is human-reviewed anyway, verify may be redundant except as a
  queue-prioritization signal. Leave this open until the human-review workflow is defined.

### 4. Human is the final filter
The human validates the (recall-maxed) queue. Headline data-quality signal: when the
ensemble's 125 raw "false positives" were adjudicated against their sources, an **LLM
adjudicator judged 90 (72%) to be real positions the human coders had missed** — i.e. the
automation may *improve* coverage, not just match it. **This judgement is itself unverified**
and needs human confirmation before being relied on. Consequence either way: GT-No-mention
labels are unreliable, so **precision must be measured by adjudication, not raw FP-vs-GT**.

### 5. Stance — a dedicated 'decisive' classification pass
Classify stance direction as a dedicated pass over each detected cell (read the source,
classify). The best method is **`decisive`**: apply the topic conventions exactly, stay
decisive, keep a high bar for Mixed/Unclear. ~73% under a consistent rubric vs ~64% for a
minimal baseline; a 3-method vote adds ~+1.4 pts; over-hedging variants did worse. Key
conventions the prompt must encode: deepfakes-fraud is INVERTED (cracking down on deepfakes
=> **Oppose**); data-centers is a 2-axis label (development vs regulation). The remaining
ceiling is **ground-truth convention inconsistency**, not the model — fixing the GT
conventions is a bigger lever than more prompting.

## Open / pending design questions

- **⚠ PENDING — separate gathering from stance.** Today each detection agent emits a stance
  *and* there is a separate `decisive` stance pass, which is redundant. A cleaner design:
  detection agents only **detect + gather sources** (and a summary); a single downstream
  step assigns stance. This removes the duplicated, lower-quality in-detection stance and
  makes stance independently improvable. Not yet implemented.
- **⚠ TBD — is `verify` needed in production?** See §3. Undecided.
- **⚠ PENDING — unify the prompts into one git-tracked location.** Prompts are currently
  split across block templates (`eval/gen.py`), few-shot built from gitignored data
  (`eval/gen_prompts.py`), and per-agent wrapper text inside the `workflows/*.js` runners.
  The committed full renders in `prompts/examples/` are the best way to review them *today*,
  but a future version should consolidate all prompt text — including the interpolated
  few-shot examples — into one reviewable, version-controlled place.
