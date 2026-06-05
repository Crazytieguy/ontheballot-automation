export const meta = {
  name: 'baseline-builtin-search',
  description: 'Baseline: built-in web search, one research agent per test candidate, code AI positions',
  phases: [{ title: 'Research', detail: 'one agent per candidate: web search + code 10 topics' }],
}

const TOPICS = ['export-control','military-ai','regulation-philosophy','companion-chatbots',
  'children-safety','data-centers','jobs-workforce','deepfakes-fraud','AI-preemption','intellectual-property']

const POS_SCHEMA = {
  type: 'object',
  properties: {
    positions: {
      type: 'array',
      description: 'Exactly one entry per topic, all 10 topics.',
      items: {
        type: 'object',
        properties: {
          topicId: { type: 'string', enum: TOPICS },
          detected: { type: 'boolean', description: 'true if candidate has a position satisfying the topic INCLUDES' },
          stance: { type: 'string', description: 'Support|Oppose|Mixed|Unclear|No mention (or precise data-center label)' },
          confidence: { type: 'string', enum: ['High','Medium','Low','N/A'] },
          summary: { type: 'string', description: 'one sentence paraphrase of what the candidate said/did, or empty' },
          sources: { type: 'array', items: { type: 'string' }, description: 'source URLs actually found' },
        },
        required: ['topicId','detected','stance','confidence','summary','sources'],
      },
    },
  },
  required: ['positions'],
}

const cands = typeof args === 'string' ? JSON.parse(args) : args
log(`Baseline over ${cands.length} candidates with built-in web search`)

phase('Research')
const results = await parallel(cands.map(cid => () =>
  agent(
    `Read the file data/eval/prompts/${cid}.md and carry out the research task it specifies IN FULL. ` +
    `It is a complete, self-contained briefing. Use the WebSearch tool to run several distinct queries and the WebFetch tool to read the most promising pages (campaign site, congress.gov, news, social media, committee records). ` +
    `Base every detected=true on a real source URL you actually retrieved. Then return all 10 topic entries via structured output.`,
    { label: cid, phase: 'Research', schema: POS_SCHEMA }
  ).then(r => ({ cid, r })).catch(e => ({ cid, error: String(e) }))
))

const predictions = {}
const failures = []
for (const item of results.filter(Boolean)) {
  if (item.error || !item.r) { failures.push({ cid: item.cid, error: item.error || 'null' }); continue }
  const byTopic = {}
  for (const p of (item.r.positions || [])) {
    byTopic[p.topicId] = {
      detected: !!p.detected, stance: p.stance, confidence: p.confidence,
      summary: p.summary, sources: p.sources || [],
    }
  }
  predictions[item.cid] = byTopic
}
log(`Collected ${Object.keys(predictions).length} candidates; ${failures.length} failures`)
return { predictions, failures }
