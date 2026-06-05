export const meta = {
  name: 'detect-exa-v3',
  description: 'v3: Exa search/answer discovery + playwright access, v2 coder; isolate search-engine effect',
  phases: [{ title: 'Research', detail: 'one agent per candidate, Exa + playwright' }],
}
const TOPICS = ['export-control','military-ai','regulation-philosophy','companion-chatbots',
  'children-safety','data-centers','jobs-workforce','deepfakes-fraud','AI-preemption','intellectual-property']
const POS_SCHEMA = { type:'object', properties:{ positions:{ type:'array',
  description:'Exactly one entry per topic, all 10 topics.', items:{ type:'object', properties:{
    topicId:{type:'string', enum:TOPICS}, detected:{type:'boolean'},
    stance:{type:'string'}, confidence:{type:'string', enum:['High','Medium','Low','N/A']},
    summary:{type:'string'}, sources:{type:'array', items:{type:'string'}},
  }, required:['topicId','detected','stance','confidence','summary','sources'] } } }, required:['positions'] }
const cands = typeof args === 'string' ? JSON.parse(args) : args
log(`v3 Exa detection over ${cands.length} candidates`)
phase('Research')
const results = await parallel(cands.map(cid => () =>
  agent(
    `Read the file data/eval/prompts_v3/${cid}.md and carry out the research task it specifies IN FULL. `+
    `It is a complete, self-contained briefing. Use the Bash tool to run the Exa CLI commands it gives (\`uv run --quiet --with requests python tools/exa.py search|answer|contents ...\`) for discovery and reading, and playwright-cli (via Bash) for social-media/JS pages. WebFetch is also available for reading normal pages. `+
    `Recall is the priority: detect any genuine engagement with a topic (use stance Unclear if direction is ambiguous), but base every detected=true on a real source URL whose content you actually read. Respect the per-candidate Exa call budget in the briefing. Return all 10 topic entries via structured output.`,
    { label: cid, phase:'Research', schema: POS_SCHEMA }
  ).then(r => ({cid, r})).catch(e => ({cid, error:String(e)}))
))
const predictions={}, failures=[]
for (const it of results.filter(Boolean)){
  if (it.error || !it.r){ failures.push({cid:it.cid, error: it.error||'null'}); continue }
  const bt={}; for (const p of (it.r.positions||[])) bt[p.topicId]={detected:!!p.detected, stance:p.stance, confidence:p.confidence, summary:p.summary, sources:p.sources||[]}
  predictions[it.cid]=bt
}
log(`collected ${Object.keys(predictions).length}; ${failures.length} failures`)
return { predictions, failures }
