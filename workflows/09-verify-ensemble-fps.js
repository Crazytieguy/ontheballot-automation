export const meta = {
  name: 'verify-ensemble-fps',
  description: 'Adjudicate every ensemble false-positive against its cited source (true precision)',
  phases: [{ title: 'Verify', detail: 'fetch cited source, judge support + topic-fit' }],
}
const cfg = typeof args === 'string' ? JSON.parse(args) : args
const { dir, ids } = cfg
const n = ids.length
const VERDICT = { type:'object', properties:{
  verdict:{type:'string', enum:['SUPPORTED','NOT_SUPPORTED','WRONG_TOPIC','UNREACHABLE']},
  satisfies_includes:{type:'boolean'}, reasoning:{type:'string'},
}, required:['verdict','satisfies_includes','reasoning'] }
log(`verifying ${n} ensemble FPs`)
phase('Verify')
const runOne = (i) => {
  const nnn = String(i).padStart(3,'0')
  return agent(
    `Read the JSON file data/eval/${dir}/${nnn}.json . Fields: cand, name, topic, topicName, includes, excludes, stance (predicted), summary (predicted), urls (cited).\n`+
    `An automated detector flagged THIS candidate (by name) as having this position. VERIFY strictly as a fact-checker.\n`+
    `(1) WebFetch each cited url (for social/JS pages use playwright-cli via Bash: open about:blank; goto URL; eval "() => document.body.innerText"; retry a failed fetch once; if none load -> UNREACHABLE). (2) Read what the named candidate actually says/does. (3) Judge:\n`+
    `   SUPPORTED = the page genuinely shows THIS candidate taking a position satisfying the topic INCLUDES (not just EXCLUDES). satisfies_includes=true.\n`+
    `   WRONG_TOPIC = candidate says something AI-related but it does NOT match this topic INCLUDES (matches EXCLUDES or another topic). satisfies_includes=false.\n`+
    `   NOT_SUPPORTED = page does not show this candidate taking this position (another person's words / no such statement / fabricated). satisfies_includes=false.\n`+
    `Use the file's includes/excludes verbatim as the rubric. Return verdict, satisfies_includes, one-sentence reasoning quoting key evidence.`,
    { label: ids[i], phase:'Verify', schema: VERDICT }
  ).then(v => ({ id: ids[i], ...v })).catch(e => ({ id: ids[i], verdict:'ERROR', satisfies_includes:false, reasoning:String(e) }))
}
let out = await parallel(Array.from({length:n}, (_,i) => () => runOne(i)))
let failed = out.map((x,i)=>({x,i})).filter(o=>o.x && o.x.verdict==='ERROR').map(o=>o.i)
if (failed.length){ log(`retrying ${failed.length}`); const rr=await parallel(failed.map(i=>()=>runOne(i))); const by=Object.fromEntries(rr.map(r=>[r.id,r])); out=out.map(x=> (x.verdict==='ERROR'&&by[x.id])?by[x.id]:x) }
return { verdicts: out.filter(Boolean) }
