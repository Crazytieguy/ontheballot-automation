export const meta = {
  name: 'critic-recheck-v6',
  description: 'Critic pass: aggressively re-examine ONLY the topics v4 marked No-mention, to catch misses',
  phases: [{ title: 'Recheck', detail: 'one agent per candidate, only No-mention topics' }],
}
const RE_SCHEMA = { type:'object', properties:{ rechecked:{ type:'array', items:{ type:'object', properties:{
  topicId:{type:'string'}, detected:{type:'boolean'}, stance:{type:'string'},
  confidence:{type:'string', enum:['High','Medium','Low','N/A']}, summary:{type:'string'},
  sources:{type:'array', items:{type:'string'}},
}, required:['topicId','detected','stance','confidence','summary','sources'] } } }, required:['rechecked'] }
const cfg = typeof args === 'string' ? JSON.parse(args) : args
const cands = cfg.cands
log(`critic recheck over ${cands.length} candidates`)
phase('Recheck')
const results = await parallel(cands.map(cid => () =>
  agent(
    `Read the JSON file data/eval/recheck_v4/${cid}.json . It has the candidate (name/state/party/seat) and 'recheck_topics' — AI-policy topics that a FIRST research pass marked "No mention" for this candidate, each with its INCLUDES/EXCLUDES rubric.\n`+
    `You are a SECOND-OPINION researcher. The first pass found nothing on these topics, so DIG HARDER and more creatively than a normal search. For EACH recheck_topic:\n`+
    `- Run several targeted searches (WebSearch): topic-specific terms + the candidate name, named bills (TAKE IT DOWN/GUARD/KOSA/CHAT Act/Chip Security/etc.), congress.gov cosponsorships & votes, committee hearings / 'AI task force', op-eds, interviews.\n`+
    `- Do a social-media check: search Facebook/X/Instagram/LinkedIn for the candidate on the topic; READ any found post with playwright via Bash (\`playwright-cli open about:blank\`; \`playwright-cli goto "URL"\`; \`playwright-cli eval "() => document.body.innerText"\`; then MANDATORY \`playwright-cli close\` — never leave the browser open).\n`+
    `- If you find ANY genuine engagement by the CANDIDATE that matches the topic's INCLUDES (a statement, sponsored/cosponsored bill, vote, hearing participation — even if stance is Unclear), set detected=true with a one-sentence summary and the source URL(s) you read. Recall is paramount; when in doubt, detect.\n`+
    `- If you still find nothing, set detected=false.\n`+
    `Return one entry per recheck_topic via structured output.`,
    { label: cid, phase:'Recheck', schema: RE_SCHEMA }
  ).then(r => ({cid, r})).catch(e => ({cid, error:String(e)}))
))
const recheck={}, failures=[]
for (const it of results.filter(Boolean)){
  if (it.error || !it.r){ failures.push({cid:it.cid, error: it.error||'null'}); continue }
  const bt={}; for (const p of (it.r.rechecked||[])) bt[p.topicId]={detected:!!p.detected, stance:p.stance, confidence:p.confidence, summary:p.summary, sources:p.sources||[]}
  recheck[it.cid]=bt
}
log(`collected ${Object.keys(recheck).length}; ${failures.length} failures`)
return { recheck, failures }
