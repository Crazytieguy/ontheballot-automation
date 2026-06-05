export const meta = {
  name: 'verify-detected-v2',
  description: 'Verify stage: adjudicate every v2-detected position against its cited source (full detect->verify pipeline)',
  phases: [{ title: 'Verify', detail: 'fetch cited source, judge support + topic-fit' }],
}
const ids = typeof args === 'string' ? JSON.parse(args) : args
const n = ids.length
const VERDICT = { type:'object', properties:{
  verdict:{type:'string', enum:['SUPPORTED','NOT_SUPPORTED','WRONG_TOPIC','UNREACHABLE']},
  satisfies_includes:{type:'boolean'},
  stance_ok:{type:'boolean', description:'does the cited source support the predicted stance direction?'},
  reasoning:{type:'string'},
}, required:['verdict','satisfies_includes','stance_ok','reasoning'] }
log(`Verifying ${n} detected cells`)
phase('Verify')
const out = await parallel(Array.from({length:n}, (_,i) => {
  const nnn = String(i).padStart(3,'0')
  return () => agent(
    `Read the JSON file data/eval/verify/${nnn}.json . Fields: cand, name, topic, topicName, includes, excludes, stance (predicted), summary (predicted), urls (cited).\n`+
    `An automated detector flagged THIS candidate (by name) as having this position. VERIFY it as a strict fact-checker.\n`+
    `(1) WebFetch each cited url (retry a failed fetch once; if none load -> UNREACHABLE). (2) Read what the named candidate actually says/does on the page. (3) Judge:\n`+
    `   SUPPORTED = page genuinely shows THIS candidate taking a position that satisfies the topic's INCLUDES (not just EXCLUDES). satisfies_includes=true.\n`+
    `   WRONG_TOPIC = candidate says something AI-related but it does NOT match this topic's INCLUDES (matches EXCLUDES or belongs to a different topic). satisfies_includes=false.\n`+
    `   NOT_SUPPORTED = page does not actually show this candidate taking this position (another person's words / no such statement / fabricated). satisfies_includes=false.\n`+
    `Also set stance_ok = whether the source supports the predicted stance DIRECTION (remember deepfakes-fraud convention: Oppose = opposes deepfakes/pro-regulation).\n`+
    `Use the file's includes/excludes verbatim as the rubric. Return verdict, satisfies_includes, stance_ok, one-sentence reasoning quoting key evidence.`,
    { label: ids[i], phase:'Verify', schema: VERDICT }
  ).then(v => ({ id: ids[i], ...v })).catch(e => ({ id: ids[i], verdict:'ERROR', satisfies_includes:false, stance_ok:false, reasoning:String(e) }))
})
)
return { verdicts: out.filter(Boolean) }
