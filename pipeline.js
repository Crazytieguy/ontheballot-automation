// ============================================================================
// CURRENT BEST PIPELINE (single file; all prompts inline & human-readable)
//
//   recall-first DETECT  (3 diverse members, run per candidate)
//        -> ENSEMBLE union (in JS, below)
//        -> STANCE pass    (decisive classifier, enum-constrained, on each detected cell)
//        -> [optional] VERIFY triage  (off by default)
//        -> human is the final filter
//
// PREREQUISITE for the Exa member: run the deterministic gather first so each candidate
// has an evidence dossier at data/eval/dossier/<id>.json (plain data-prep, not an agent):
//     uv run --with requests python tools/gather_exa.py --candidates cands.json
// (cands.json is the same {id,name,state,party,seat} list you pass as args.candidates.)
//
// Run (inside the agent harness; Workflow is the harness's workflow runner — there is no
// shell entry point):
//     Workflow({ scriptPath: "pipeline.js", args: { candidates: [{id,name,state,party,seat}], verify: false } })
//
// Scoring lives in eval/ (ensemble.py is the same union as below; score.py / board.py).
// Runner pitfalls (concurrency, retries, identity): workflows/CLAUDE.md.
// ============================================================================

export const meta = {
  name: 'pipeline',
  description: 'Recall-first detect (3 diverse methods) -> ensemble union -> decisive stance -> optional verify triage',
  phases: [
    { title: 'Detect', detail: '3 diverse detectors per candidate, unioned' },
    { title: 'Stance', detail: 'enum-constrained decisive stance per detected cell' },
    { title: 'Verify', detail: 'optional source-vs-rubric triage' },
  ],
}

const TOPICS = ['export-control','military-ai','regulation-philosophy','companion-chatbots',
  'children-safety','data-centers','jobs-workforce','deepfakes-fraud','AI-preemption','intellectual-property']

// ---------------------------------------------------------------------------
// SHARED PROMPT BLOCKS  (this is exactly what the agents see)
// ---------------------------------------------------------------------------

const TOPIC_RUBRIC = `# The 10 topics — code STRICTLY against each topic's INCLUDES / EXCLUDES
### export-control — Export Control and Compute Governance
- INCLUDES: export controls on AI chips/semiconductors/model weights; restrictions on cloud-compute access; policies targeting frontier models or datacenter operations; AI tech-competition with China when tied to controls.
- EXCLUDES: generic "support US innovation"; industrial policy (e.g. CHIPS Act) unless explicitly linked to restricting AI capabilities; cybersecurity/privacy without compute/export implications.
### military-ai — Military and National Security Uses of AI
- INCLUDES: autonomous/semi-autonomous weapons; AI in targeting/surveillance/intelligence/command-and-control; human-in-the-loop vs autonomous; DoD AI deployment/oversight.
- EXCLUDES: generic "strong national defense"; cybersecurity unless AI-specific; export controls (that's the topic above).
### regulation-philosophy — AI Regulation Philosophy
- INCLUDES: support for/opposition to AI-specific regulation; licensing/audits/safety standards/oversight bodies; "light-touch" vs precautionary; regulation framed as innovation-friendly vs innovation-harming.
- EXCLUDES: narrow sectoral rules; platform regulation unrelated to AI; privacy law unless tied to AI governance.
### companion-chatbots — AI Companion Chatbots
- INCLUDES: AI companions / "AI friends" / relationship chatbots; emotional dependence, parasocial relationships, manipulation by AI; AI companions in mental-health/loneliness (non-clinical) contexts.
- EXCLUDES: general/customer-service chatbots; clinical tools unless framed as companions; social-media algorithms unless explicitly about AI companionship.
### children-safety — Children's Online Safety
- INCLUDES: AI-generated content affecting children; age verification / youth protections; AI-enabled grooming, deepfakes of minors, recommendation harms; kids' interaction with generative AI.
- EXCLUDES: general education policy; non-AI child-safety issues; social-media regulation without AI relevance.
### data-centers — Data Centers (as they relate to AI: buildout, energy, grid)
- EXCLUDES: generic economic-development statements; energy policy without explicit connection to AI infrastructure; industrial policy unless tied to AI compute capacity.
### jobs-workforce — Jobs and Workforce Disruption
- Definition: AI-driven job displacement, reskilling, unemployment policy, tax policy for AI-driven wealth.
### deepfakes-fraud — Deepfakes and AI Fraud
- Definition: AI-generated misinformation, scam prevention, fraud targeting vulnerable populations, synthetic-media disclosure.
### AI-preemption — AI Preemption
- Definition: federal preemption of state AI laws, states' rights to regulate AI, patchwork of local vs national approaches.
### intellectual-property — Intellectual Property and AI
- Definition: AI training-data rights, copyright for creators/publishers, liability for AI-generated content.`

const STANCE_CONVENTIONS = `# Stance values & conventions (apply EXACTLY)
- Values: "Support", "Oppose", "Mixed", "Unclear", or "No mention".
- deepfakes-fraud is COUNTERINTUITIVE: wanting to criminalize/crack down on/regulate deepfakes or AI fraud => "Oppose" (the candidate opposes deepfakes). Downplaying the concern => "Support".
- data-centers uses a 2-axis label when directional: "Supports data center development" (favor building) / "Opposes data center development" (stop buildout) / "Supports data center regulation" (disclosure/ratepayer/impact rules). Supporting development != supporting regulation.
- regulation-philosophy: light-touch / "force for deregulation" / innovation-first => "Oppose"; mandatory testing/licensing/guardrails => "Support"; genuinely both => "Mixed".
- "Mixed" only when the candidate explicitly voices BOTH support and opposition on the same topic; "Unclear" only when they engage but state no determinable side. Otherwise commit to a direction.`

const FEWSHOT = `# Worked examples (already-coded candidates — study the conventions)
### James Talarico (TX, democratic, Senate)
- export-control: "Support" — wants legislation to strengthen export controls to keep advanced AI chips from adversaries.
- regulation-philosophy: "Support" — encourage innovation while setting clear guidelines that protect Americans.
- children-safety: "Support" — commonsense safeguards to keep kids safe online, more parental control.
- data-centers: "Opposes data center development" — AI data centers should not disrupt communities or raise energy costs.
- jobs-workforce: "Support" — invest in STEM education; protect workers from invasive AI workplace surveillance.
- deepfakes-fraud: "Oppose" — required platforms to create reporting for explicit deepfakes (i.e. opposes deepfakes).
- intellectual-property: "Support" — AI companies should follow the same copyright laws as everyone else.
- (military-ai, companion-chatbots, AI-preemption: "No mention")
### Tom Cotton (AR, republican, Senate)
- export-control: "Support" — introduced the Chip Security Act (location verification + diversion reporting).
- companion-chatbots: "Support" — cosponsored the GUARD Act (age verification for AI chatbots).
- data-centers: "Supports data center development" — DATA Act letting AI data centers build off-grid power.
- AI-preemption: "Oppose" — voted to strike the section preempting state AI law.
- (military-ai, children-safety[+], jobs-workforce, deepfakes-fraud, intellectual-property: "No mention" / minor)
### David Rouzer (NC, republican, House)
- regulation-philosophy: "Oppose" — focus on reducing regulatory barriers so US innovation leads.
- data-centers: "Unclear" — signed a letter urging silicon carbide in the AI Action Plan (engages, no clear dev/reg side).
- jobs-workforce: "Support" — US must support AI literacy and technical skills for the workforce.
- AI-preemption: "Support" — asked whether lack of federal preemption is a top hurdle to innovation.
- (others: "No mention")`

const THRESHOLD = `# Detection threshold — RECALL IS PARAMOUNT (a missed real position is the worst error; a human validates every hit afterward)
- detected=true for ANY genuine engagement by the candidate: a stated view, a sponsored/cosponsored bill, a relevant vote, hearing/task-force participation, or a news/social statement — even if direction is ambiguous (then stance="Unclear", NOT "No mention").
- Use "No mention" ONLY when you found no engagement with that topic at all.
- Guardrails: it must be the CANDIDATE's own engagement (not someone else quoted), must match the topic's INCLUDES (not its EXCLUDES), and every detected=true MUST cite a source URL you actually read.`

const PLAYWRIGHT = `For social-media / JS / login-walled pages (WebFetch usually fails on these), read with playwright via Bash: \`playwright-cli open about:blank\`; \`playwright-cli goto "<url>"\`; \`playwright-cli eval "() => document.body.innerText"\`; then \`playwright-cli close\` when done with the page.`

// --- per-member research instructions (this is what makes the 3 detectors DIVERSE) ---
const RESEARCH_BUILTIN = (c) => `# How to research (be exhaustive; don't stop at the campaign site)
Use the WebSearch tool for many distinct queries and WebFetch to read pages. Cover: campaign issues pages; the LEGISLATIVE RECORD (congress.gov sponsor/cosponsor/votes for any current/former legislator); official .gov press; committee/task-force activity (membership counts, often Unclear); news/op-eds/interviews; and a SOCIAL-MEDIA pass (search "${c.name}" on Facebook/X/Instagram/LinkedIn). ${PLAYWRIGHT}
Before finalizing, list the topics you are about to mark "No mention" and run one more targeted search for the 3 you are least sure about.`

const RESEARCH_STACKED = (c) => `${RESEARCH_BUILTIN(c)}
Also run queries against named AI bills (sponsorship/votes): "TAKE IT DOWN Act", "GUARD Act", "Kids Online Safety Act"/"KOSA", "CHAT Act", "Chip Security Act", "No DeepSeek on Government Devices Act", "DEFIANCE Act", "NO FAKES Act"; plus '"${c.name}" AI task force' and '"${c.name}" roll call vote AI'.
A single source may support MORE THAN ONE topic — code it under each it fits (e.g. a kids-AI-safety bill naming companion chatbots fits both children-safety and companion-chatbots). companion-chatbots vs children-safety, deepfakes-fraud vs children-safety, regulation-philosophy vs AI-preemption, and export-control vs military-ai overlap — read the INCLUDES carefully.`

const RESEARCH_EXA = (c) => `# Evidence: read the prebuilt Exa dossier (do NOT gather it yourself)
A deterministic Exa gather (tools/gather_exa.py, run as a prerequisite) has written this candidate's evidence to data/eval/dossier/${c.id}.json — an "exa_answer" summary plus a deduped "leads" list ({title,url,snippet}) from Exa /answer citations and keyword / congress.gov / social searches.
- Read that file with the Read tool. For each topic, scan exa_answer + leads.
- Confirm by READING the most relevant lead URLs (\`uv run --quiet --with requests python tools/exa.py contents "<url>" --text 4000\` or WebFetch; ${PLAYWRIGHT}). Treat exa_answer as a lead, not ground truth — verify against the sources.
- If data/eval/dossier/${c.id}.json is missing, fall back to \`uv run --quiet --with requests python tools/exa.py search "${c.name} artificial intelligence" --type keyword --n 25\` and read results.`

const OUTPUT = `# Output
Return one entry for ALL 10 topics via the structured output tool.`

function detectPrompt(c, research) {
  const dist = c.district ? `, district ${c.district}` : ''
  return `You are a meticulous research analyst building a public, fact-checked tracker (ontheballot.ai) of US congressional candidates' positions on 10 AI-policy topics. This is the 2026 election cycle.

# Candidate
id: ${c.id} | name: ${c.name} | ${c.state} | ${c.party} | ${c.seat}${dist}

${research(c)}

${TOPIC_RUBRIC}

${THRESHOLD}

${STANCE_CONVENTIONS}

${FEWSHOT}

${OUTPUT}`
}

function criticPrompt(c, nomTopics) {
  return `Second-opinion researcher for ${c.name} (${c.state}, ${c.party}, ${c.seat}). A FIRST pass marked these AI-policy topics "No mention": ${nomTopics.join(', ')}.
The first pass found nothing, so DIG HARDER on EACH: targeted searches (topic terms + the name), named AI bills, congress.gov cosponsorships/votes, committee hearings / "AI task force", op-eds, and a social-media check. ${PLAYWRIGHT}
If you find ANY genuine engagement by ${c.name} matching the topic (a statement, sponsored/cosponsored bill, vote, hearing participation — even if stance is Unclear), set detected=true with a one-sentence summary + the source URL you read. Recall is paramount; when in doubt, detect. If still nothing, detected=false.
${STANCE_CONVENTIONS}
Return one entry per rechecked topic via structured output.`
}

// Stance is enum-constrained so it conforms to the spreadsheet's label set.
const STD_STANCES = ['Support', 'Oppose', 'Mixed', 'Unclear']
const DC_STANCES = ['Supports data center development', 'Opposes data center development',
  'Supports data center regulation', 'Opposes data center regulation', 'Mixed', 'Unclear']
const stanceLabels = (topic) => topic === 'data-centers' ? DC_STANCES : STD_STANCES
const stanceSchema = (topic) => ({ type:'object', properties:{
  stance:{ type:'string', enum: stanceLabels(topic) }, reasoning:{ type:'string' } }, required:['stance','reasoning'] })

function stancePrompt(c, topic, sources) {
  return `Classify ${c.name}'s (${c.state}, ${c.party}) stance on the AI-policy topic "${topic}".
Allowed labels (choose exactly one): ${stanceLabels(topic).join(' | ')}.
READ the cited source(s): ${sources.join(' , ') || '(none — reason from what the detector found)'} (use WebFetch; ${PLAYWRIGHT}).
${STANCE_CONVENTIONS}
Be decisive: pick the candidate's dominant direction; a supportive position with a minor caveat is still "Support", not "Mixed". Return {stance, reasoning}.`
}

function verifyPrompt(c, topic, stance, sources) {
  return `Fact-check: a detector flagged that ${c.name} (${c.state}) holds the stance "${stance}" on "${topic}", citing: ${sources.join(' , ') || '(none)'}.
Fetch the source(s) (${PLAYWRIGHT}) and judge whether the page genuinely shows THIS candidate taking that position on THIS topic per the rubric:
${TOPIC_RUBRIC}
Verdict: SUPPORTED (genuine + on-topic) / WRONG_TOPIC (real AI content, wrong topic) / NOT_SUPPORTED (not the candidate / no such statement) / UNREACHABLE. NEVER reject on a mere fetch failure (use UNREACHABLE). This is triage only — it never auto-drops a detection.`
}

// ---------------------------------------------------------------------------
// SCHEMAS
// ---------------------------------------------------------------------------
const posItem = { type:'object', properties:{
  topicId:{type:'string', enum:TOPICS}, detected:{type:'boolean'}, stance:{type:'string'},
  confidence:{type:'string', enum:['High','Medium','Low','N/A']}, summary:{type:'string'},
  sources:{type:'array', items:{type:'string'}} }, required:['topicId','detected','stance','confidence','summary','sources'] }
const POS_SCHEMA = { type:'object', properties:{ positions:{ type:'array', items: posItem } }, required:['positions'] }
const CRITIC_SCHEMA = { type:'object', properties:{ rechecked:{ type:'array', items: posItem } }, required:['rechecked'] }
const VERDICT_SCHEMA = { type:'object', properties:{ verdict:{type:'string', enum:['SUPPORTED','WRONG_TOPIC','NOT_SUPPORTED','UNREACHABLE']}, reasoning:{type:'string'} }, required:['verdict','reasoning'] }

const byTopic = (positions) => Object.fromEntries((positions||[]).map(p => [p.topicId, p]))

// ---------------------------------------------------------------------------
// ORCHESTRATION
// ---------------------------------------------------------------------------
const cfg = typeof args === 'string' ? JSON.parse(args) : (args || {})
const cands = cfg.candidates || []
const doVerify = !!cfg.verify
if (!cands.length) throw new Error('pipeline: args.candidates is required ([{id,name,state,party,seat}])')
log(`pipeline over ${cands.length} candidates (verify=${doVerify})`)

phase('Detect')
// Per candidate: run the 3 diverse members, then a critic re-check on member A's No-mentions,
// then UNION everything. The members miss different cells, so the union is the recall lever.
const detected = await parallel(cands.map(c => async () => {
  const [a, b, d] = await parallel([
    () => agent(detectPrompt(c, RESEARCH_BUILTIN), { label:`${c.id}:builtin`, phase:'Detect', schema:POS_SCHEMA }).catch(()=>null),
    () => agent(detectPrompt(c, RESEARCH_EXA),     { label:`${c.id}:exa`,     phase:'Detect', schema:POS_SCHEMA }).catch(()=>null),
    () => agent(detectPrompt(c, RESEARCH_STACKED), { label:`${c.id}:stacked`, phase:'Detect', schema:POS_SCHEMA }).catch(()=>null),
  ])
  const A = byTopic(a?.positions), B = byTopic(b?.positions), D = byTopic(d?.positions)
  const nom = TOPICS.filter(t => !A[t]?.detected)
  let crit = {}
  if (nom.length) {
    const cr = await agent(criticPrompt(c, nom), { label:`${c.id}:critic`, phase:'Detect', schema:CRITIC_SCHEMA }).catch(()=>null)
    crit = byTopic(cr?.rechecked)
  }
  const order = { High:3, Medium:2, Low:1, 'N/A':0, '':0 }
  const cell = {}
  for (const t of TOPICS) {
    const hits = [A[t], B[t], D[t], crit[t]].filter(p => p && p.detected)
    if (hits.length) {
      const best = hits.sort((x,y)=> (order[y.confidence]||0)-(order[x.confidence]||0))[0]
      cell[t] = { detected:true, stance:best.stance, confidence:best.confidence, summary:best.summary,
                  sources:[...new Set(hits.flatMap(h => h.sources||[]))] }
    } else {
      cell[t] = { detected:false, stance:'No mention', confidence:'N/A', summary:'', sources:[] }
    }
  }
  return { cand:c, cell }
}))

phase('Stance')
// Dedicated enum-constrained 'decisive' stance pass on each DETECTED cell (decoupled from detection).
const stanceJobs = []
for (const r of detected.filter(Boolean))
  for (const t of TOPICS)
    if (r.cell[t].detected)
      stanceJobs.push(async () => {
        const s = await agent(stancePrompt(r.cand, t, r.cell[t].sources), { label:`${r.cand.id}:${t}`, phase:'Stance', schema:stanceSchema(t) }).catch(()=>null)
        if (s?.stance) r.cell[t].stance = s.stance
      })
await parallel(stanceJobs)

if (doVerify) {
  phase('Verify')
  const vJobs = []
  for (const r of detected.filter(Boolean))
    for (const t of TOPICS)
      if (r.cell[t].detected)
        vJobs.push(async () => {
          const v = await agent(verifyPrompt(r.cand, t, r.cell[t].stance, r.cell[t].sources), { label:`${r.cand.id}:${t}`, phase:'Verify', schema:VERDICT_SCHEMA }).catch(()=>null)
          if (v) r.cell[t].verify = v.verdict   // triage flag only; never drops the detection
        })
  await parallel(vJobs)
}

const predictions = {}
for (const r of detected.filter(Boolean)) predictions[r.cand.id] = r.cell
const nDet = Object.values(predictions).flatMap(c => Object.values(c)).filter(x => x.detected).length
log(`done: ${Object.keys(predictions).length} candidates, ${nDet} detected cells`)
return { predictions }
