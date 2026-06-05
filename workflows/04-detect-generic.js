export const meta = {
  name: 'detect-generic',
  description: 'Generic per-candidate detection runner (promptdir + toolnote via args)',
  phases: [{ title: 'Research', detail: 'one agent per candidate' }],
}
const TOPICS = ['export-control','military-ai','regulation-philosophy','companion-chatbots',
  'children-safety','data-centers','jobs-workforce','deepfakes-fraud','AI-preemption','intellectual-property']
const POS_SCHEMA = { type:'object', properties:{ positions:{ type:'array',
  description:'Exactly one entry per topic, all 10 topics.', items:{ type:'object', properties:{
    topicId:{type:'string', enum:TOPICS}, detected:{type:'boolean'},
    stance:{type:'string'}, confidence:{type:'string', enum:['High','Medium','Low','N/A']},
    summary:{type:'string'}, sources:{type:'array', items:{type:'string'}},
  }, required:['topicId','detected','stance','confidence','summary','sources'] } } }, required:['positions'] }
const cfg = typeof args === 'string' ? JSON.parse(args) : args
const { promptdir, toolnote, cands } = cfg
log(`${promptdir}: ${cands.length} candidates`)
phase('Research')
const mkPrompt = (cid) =>
  `Read the file data/eval/${promptdir}/${cid}.md and carry out the research task it specifies IN FULL. It is a complete, self-contained briefing. ${toolnote} `+
  `Recall is the priority: detect any genuine engagement with a topic (use stance Unclear if direction is ambiguous), but base every detected=true on a real source URL whose content you actually read. `+
  `IMPORTANT: you MUST finish by calling the StructuredOutput tool with all 10 topic entries — do not end your turn without it.`
const runOne = (cid) => agent(mkPrompt(cid), { label: cid, phase:'Research', schema: POS_SCHEMA })
  .then(r => ({cid, r})).catch(e => ({cid, error:String(e)}))

let results = await parallel(cands.map(cid => () => runOne(cid)))
// retry stage: re-run any candidate that errored (e.g. transient StructuredOutput miss)
let failedCids = results.filter(x => x && (x.error || !x.r)).map(x => x.cid)
if (failedCids.length){
  log(`retrying ${failedCids.length} failed: ${failedCids.join(',')}`)
  const retry = await parallel(failedCids.map(cid => () => runOne(cid)))
  const byId = Object.fromEntries(retry.filter(Boolean).map(x => [x.cid, x]))
  results = results.map(x => (x && (x.error||!x.r) && byId[x.cid]) ? byId[x.cid] : x)
}
const predictions={}, failures=[]
for (const it of results.filter(Boolean)){
  if (it.error || !it.r){ failures.push({cid:it.cid, error: it.error||'null'}); continue }
  const bt={}; for (const p of (it.r.positions||[])) bt[p.topicId]={detected:!!p.detected, stance:p.stance, confidence:p.confidence, summary:p.summary, sources:p.sources||[]}
  predictions[it.cid]=bt
}
log(`collected ${Object.keys(predictions).length}; ${failures.length} failures`)
return { predictions, failures }
