export const meta = {
  name: 'adjudicate-fps',
  description: 'Adjudicate baseline false-positives: is each flagged position truly supported by its source and on-topic?',
  phases: [{ title: 'Adjudicate', detail: 'fetch cited source, judge support + topic-fit' }],
}
const n = typeof args === 'string' ? parseInt(args,10) : args
const VERDICT = {
  type:'object',
  properties:{
    cand:{type:'string'}, topic:{type:'string'},
    verdict:{type:'string', enum:['SUPPORTED','NOT_SUPPORTED','WRONG_TOPIC','UNREACHABLE']},
    satisfies_includes:{type:'boolean'},
    reasoning:{type:'string'},
  },
  required:['cand','topic','verdict','satisfies_includes','reasoning'],
}
phase('Adjudicate')
const verdicts = await parallel(Array.from({length:n}, (_,i) => () =>
  agent(
    `Read the JSON file data/eval/fp_records.json and take the element at index ${i} (0-based). It has fields: cand, name, topic, topicName, includes, excludes, pred_stance, pred_summary, url.\n`+
    `An automated system flagged this candidate as having a position on this topic. Your job is to ADJUDICATE whether that is correct, acting as a strict fact-checker.\n`+
    `Steps: (1) Use WebFetch to load the 'url'. If it fails, try once more; if still unreachable, verdict=UNREACHABLE. (2) Read the page for what THIS candidate (by name) actually says or does. (3) Decide:\n`+
    `   - SUPPORTED = the page genuinely shows this candidate taking the predicted position, AND it satisfies the topic's INCLUDES (not merely the EXCLUDES). Set satisfies_includes=true.\n`+
    `   - WRONG_TOPIC = the candidate says something AI-related on the page, but it does NOT match this topic's INCLUDES (matches EXCLUDES or a different topic). satisfies_includes=false.\n`+
    `   - NOT_SUPPORTED = the page does not actually show this candidate taking this position (someone else's words, no such statement, hallucinated). satisfies_includes=false.\n`+
    `Be strict and use the provided includes/excludes verbatim as the rubric. Return cand, topic, verdict, satisfies_includes, and one-sentence reasoning quoting the key evidence.`,
    { label: `${i}`, phase:'Adjudicate', schema: VERDICT }
  ).catch(e => ({ verdict:'ERROR', reasoning:String(e), cand:`idx${i}`, topic:'?', satisfies_includes:false }))
))
return { verdicts: verdicts.filter(Boolean) }
