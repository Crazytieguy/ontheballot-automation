export const meta = {
  name: 'adjudicate-fps-v2',
  description: 'Adjudicate v2 false-positives against their cited sources',
  phases: [{ title: 'Adjudicate', detail: 'fetch cited source, judge support + topic-fit' }],
}
const cfg = typeof args === 'string' ? JSON.parse(args) : args
const { file, n } = cfg
const VERDICT = { type:'object', properties:{
  cand:{type:'string'}, topic:{type:'string'},
  verdict:{type:'string', enum:['SUPPORTED','NOT_SUPPORTED','WRONG_TOPIC','UNREACHABLE']},
  satisfies_includes:{type:'boolean'}, reasoning:{type:'string'},
}, required:['cand','topic','verdict','satisfies_includes','reasoning'] }
phase('Adjudicate')
const verdicts = await parallel(Array.from({length:n}, (_,i) => () =>
  agent(
    `Read the JSON file ${file} and take the element at index ${i} (0-based). Fields: cand, name, topic, topicName, includes, excludes, pred_stance, pred_summary, url.\n`+
    `An automated system flagged this candidate as having a position on this topic. ADJUDICATE strictly as a fact-checker.\n`+
    `(1) WebFetch the 'url' (retry once; if still unreachable -> UNREACHABLE). (2) Read what THIS candidate (by name) actually says/does. (3) Decide:\n`+
    `   SUPPORTED = page genuinely shows this candidate taking the predicted position AND it satisfies the topic INCLUDES (not just EXCLUDES); satisfies_includes=true.\n`+
    `   WRONG_TOPIC = candidate says something AI-related but it does NOT match this topic INCLUDES (matches EXCLUDES or another topic); satisfies_includes=false.\n`+
    `   NOT_SUPPORTED = page does not actually show this candidate taking this position (someone else's words / no such statement / fabricated); satisfies_includes=false.\n`+
    `Use the provided includes/excludes verbatim as the rubric. Return cand, topic, verdict, satisfies_includes, one-sentence reasoning quoting key evidence.`,
    { label:`${i}`, phase:'Adjudicate', schema: VERDICT }
  ).catch(e => ({verdict:'ERROR', reasoning:String(e), cand:`idx${i}`, topic:'?', satisfies_includes:false}))
))
return { verdicts: verdicts.filter(Boolean) }
