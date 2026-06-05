export const meta = {
  name: 'stance-classify',
  description: 'Isolated stance classification sweep: read GT source, classify direction per variant',
  phases: [{ title: 'Classify', detail: 'one agent per cell' }],
}
const cfg = typeof args === 'string' ? JSON.parse(args) : args
const { variant, ids } = cfg
const n = ids.length
const SCHEMA = { type:'object', properties:{ stance:{type:'string'}, reasoning:{type:'string'} }, required:['stance','reasoning'] }

const BASE = `Output the candidate's stance on THIS topic as exactly one of: "Support", "Oppose", "Mixed", "Unclear". For the data-centers topic, instead use a precise label: "Supports data center development", "Opposes data center development", "Supports data center regulation", or "Opposes data center regulation".`
const COT = BASE + `\nBefore answering, in the 'reasoning' field: (a) quote the candidate's most relevant words; (b) state what they FAVOR and what they RESIST on this topic; (c) if they voice BOTH meaningful support AND meaningful concern about the same topic, the stance is "Mixed"; (d) if they engage the topic but take no determinable side, it is "Unclear". Default to Mixed/Unclear rather than forcing a side when the evidence is genuinely two-sided or vague.`
const CONV = COT + `\nApply these topic conventions exactly:\n- deepfakes-fraud (counterintuitive): "Oppose" = the candidate OPPOSES deepfakes/AI fraud (wants to criminalize/crack down/regulate). "Support" = downplays/minimizes the concern. So wanting to crack down on deepfakes => "Oppose".\n- data-centers has TWO axes: building/attracting data centers => "Supports data center development"; wanting disclosure/ratepayer/impact rules => "Supports data center regulation"; wanting to stop/limit buildout => "Opposes data center development". Supporting development is NOT the same as supporting regulation.\n- regulation-philosophy: light-touch / "AI as a force for deregulation" / innovation-first => "Oppose" (opposes heavy AI regulation). Mandatory testing / licensing / real guardrails => "Support". Pro-innovation BUT also wants consumer-protection guardrails => "Mixed".`
const EX = CONV + `\nWorked examples (summary => correct label):\n- "Introduced a bill to criminalize deepfake porn / crack down on AI scams" => Oppose (deepfakes-fraud).\n- "Says deepfake fears are overblown" => Support (deepfakes-fraud).\n- "'We want data centers here to win the AI race'" => Supports data center development.\n- "Data centers must disclose impact and fund their own power before operating" => Supports data center regulation.\n- "Stop data centers from draining our water" => Opposes data center development.\n- "Supports building data centers BUT insists companies pay their own power so families aren't hit with higher bills" => Mixed (data-centers).\n- "Pro-innovation, light-touch, yet calls for consumer-protection guardrails" => Mixed (regulation-philosophy).\n- "AI should be a force for deregulation; innovation-first" => Oppose (regulation-philosophy).\n- "We need mandatory testing and real guardrails before AI is deployed" => Support (regulation-philosophy).\n- "Served on the AI task force discussing workforce impacts" (no stated view) => Unclear.`
const DECISIVE = BASE +
`\nApply these topic conventions exactly:\n- deepfakes-fraud (counterintuitive): wanting to criminalize/crack down on/regulate deepfakes or AI fraud => "Oppose" (the candidate OPPOSES deepfakes). Downplaying the concern => "Support". Almost every candidate who ACTS on deepfakes wants to crack down => "Oppose".\n- data-centers TWO axes: building/attracting data centers => "Supports data center development"; wanting disclosure/ratepayer/impact rules => "Supports data center regulation"; wanting to stop/limit buildout => "Opposes data center development".\n- regulation-philosophy: light-touch / "force for deregulation" / innovation-first => "Oppose"; mandatory testing/licensing/guardrails => "Support".\n` +
`\nBE DECISIVE — do NOT over-hedge. The data is mostly clear-cut:\n- Pick the candidate's DOMINANT direction. A supportive position with a minor caveat is still "Support", NOT "Mixed".\n- Use "Mixed" ONLY when the candidate EXPLICITLY voices BOTH support AND opposition on this same topic in their own words (e.g. "we must build data centers" AND "but they must pay their own power so families aren't overcharged"). This is common mainly for data-centers.\n- Use "Unclear" ONLY when the candidate engages but states no position at all (e.g. merely sits on a task force). Otherwise commit to a direction.\n` +
`\nWorked examples (=> label): "Bill to criminalize deepfake porn / crack down on AI scams" => Oppose. "We want data centers here to win the AI race" => Supports data center development. "Data centers must disclose impact and fund their own power" => Supports data center regulation. "Supports building data centers BUT insists companies pay their own power" => Mixed. "AI as a force for deregulation, innovation-first" => Oppose. "Need mandatory testing/guardrails" => Support. "On the AI task force, no stated view" => Unclear.`
const DECOMPOSE = BASE +
`\nReason in TWO steps in the 'reasoning' field, quoting the source:\n  Q1 — Does the candidate express SUPPORT for, or take favorable action on, the thing this topic is about? (quote it, or "none")\n  Q2 — Does the candidate express OPPOSITION to or substantive CONCERN about it? (quote it, or "none")\nThen derive: BOTH Q1 and Q2 substantial & explicit => "Mixed"; only Q1 => Support; only Q2 => Oppose; engaged but neither is a real position => "Unclear". A clear position with only a minor caveat is NOT Mixed — require BOTH sides to be genuine.\n` +
`\nThen apply topic conventions to pick the final label:\n- deepfakes-fraud: cracking down on / regulating deepfakes or AI fraud => "Oppose"; downplaying => "Support".\n- data-centers: favor building => "Supports data center development"; favor disclosure/ratepayer/impact rules => "Supports data center regulation"; favor stopping buildout => "Opposes data center development"; genuinely both build-and-restrain => "Mixed".\n- regulation-philosophy: light-touch/deregulation => "Oppose"; mandatory guardrails/testing => "Support"; genuinely both => "Mixed".`
const G = ({base:BASE, cot:COT, conv:CONV, fewshot:EX, decisive:DECISIVE, decompose:DECOMPOSE})[variant]

log(`stance variant=${variant} over ${n} cells`)
phase('Classify')
const runOne = (i) => {
  const nnn = String(i).padStart(3,'0')
  return agent(
    `Read the JSON file data/eval/stance/${nnn}.json . It has a candidate (name/state/party/seat), a topic (topicName/description/includes/excludes), and 'gt_sources' (URLs).\n`+
    `READ the gt_sources to see what THIS candidate (by name) actually said/did on this topic (use WebFetch; for social/JS pages use playwright-cli via Bash: open about:blank; goto URL; eval "() => document.body.innerText"; then MANDATORY playwright-cli close — never leave the browser open). If a source won't load, reason from the title/snippet and topic.\n`+
    `${G}\n`+
    `You MUST finish by calling StructuredOutput with {stance, reasoning}.`,
    { label: ids[i], phase:'Classify', schema: SCHEMA }
  ).then(v => ({ id: ids[i], stance: v.stance })).catch(e => ({ id: ids[i], stance: 'ERROR' }))
}
let out = await parallel(Array.from({length:n}, (_,i) => () => runOne(i)))
let failed = out.map((x,i)=>({x,i})).filter(o=>o.x.stance==='ERROR').map(o=>o.i)
if (failed.length){ log(`retry ${failed.length}`); const rr=await parallel(failed.map(i=>()=>runOne(i))); const by=Object.fromEntries(rr.map(r=>[r.id,r])); out=out.map(x=> x.stance==='ERROR'&&by[x.id]?by[x.id]:x) }
const pred=Object.fromEntries(out.filter(Boolean).map(x=>[x.id, x.stance]))
return { variant, pred }
