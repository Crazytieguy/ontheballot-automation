# Unified prompt generator. Usage: uv run python eval/gen.py <variant> <split_file> <out_subdir>
import sys, json, os
sys.path.insert(0,'eval'); import common, gen_prompts as g1
cmeta=common.load_candidates()
RUBRIC=g1.topic_block(); FEW=g1.fewshot_block()

HEAD="""You are a meticulous research analyst building a public, fact-checked tracker of U.S. congressional candidates' positions on AI policy. Today is 2026-06-02; this is the 2026 election cycle.

# Your task
Research ONE candidate and determine their position on EACH of 10 AI policy topics. For each topic decide whether the candidate has ENGAGED the topic, and if so code stance + a one-sentence summary + exact source URL(s).

# Candidate
- id: {cid}
- name: {name}
- state: {state}
- party: {party}
- office sought: {seat}{district}

# CRITICAL: recall is the top priority
Missing a real position is the worst error (target: miss almost none). Surfacing a borderline one is acceptable because a human reviews everything afterward. When in doubt, DETECT and let the human filter.
"""

RESEARCH_V2="""# How to research — be exhaustive; do NOT stop at the campaign site
Run MANY distinct searches (WebSearch) and FETCH pages (WebFetch). Cover at minimum:
1. Campaign site issues/priorities pages.
2. LEGISLATIVE RECORD (any current/former legislator, state or federal): congress.gov + official .gov for bills SPONSORED or COSPONSORED, and relevant votes. A cosponsorship or relevant vote COUNTS.
3. Official press releases & committee/task-force activity (membership/participation COUNTS, often stance=Unclear).
4. NEWS, op-eds, interviews, podcasts.
5. SOCIAL MEDIA: search the candidate's Facebook, X/Twitter, Instagram, LinkedIn for posts on these topics; statements there COUNT.
Per topic, do at least one topic-specific query if general searches didn't surface evidence.
"""

SOCIAL_COMPLETE="""
# MANDATORY social-media pass (do NOT skip)
After your general searches, explicitly search '{name}' on Facebook, X/Twitter, Instagram, and LinkedIn. For ANY candidate post/page you find a URL for, READ it with playwright (WebFetch usually fails on these):
  `playwright-cli open about:blank` then `playwright-cli goto "<url>"` then `playwright-cli eval "() => document.body.innerText"` (then `playwright-cli close`).
Social-media statements are real positions — capture them.

# Completeness self-check before finalizing (do NOT skip)
List the topics you are about to mark "No mention". For the 3 you are least confident about, run ONE more targeted search + read a source. Only keep "No mention" if you genuinely found no engagement. This catches misses.
"""

QEXPAND="""
# Aggressive query expansion (run these IN ADDITION)
Search the candidate against named AI bills (sponsorship/cosponsorship/votes): "TAKE IT DOWN Act", "GUARD Act", "Kids Online Safety Act"/"KOSA", "CHAT Act", "Chip Security Act", "No DeepSeek on Government Devices Act", "AI Overwatch Act", "DEFIANCE Act", "NO FAKES Act", "CREATE AI Act", "AI Accountability Act".
Also run: '"{name}" "AI task force"', '"{name}" roll call vote AI', '"{name}" committee hearing artificial intelligence', '"{name}" town hall AI', and the candidate's full legal name / nickname variants.
"""

THRESHOLD="""# Detection threshold (LOWER than you might assume)
- detected=true if the candidate ENGAGED the topic in any way: stated a view, sponsored/cosponsored relevant legislation, voted on it, participated in a hearing/task force on it, or commented in news/social media — EVEN IF direction is ambiguous.
- If engaged but you cannot pin Support vs Oppose, set detected=true with stance="Unclear" (NOT No mention). 'Unclear' is valid and valuable.
- Use detected=false / "No mention" ONLY when you found NO engagement with that topic.
- Guardrails: engagement must be the CANDIDATE's own (not another person quoted), must match the topic's INCLUDES (not EXCLUDES), and every detected=true MUST cite a real URL you actually read.
"""

CONV="""# Stance values & conventions
- Values: "Support", "Oppose", "Mixed", "Unclear", or "No mention".
- deepfakes-fraud (counterintuitive): "Oppose" = opposes deepfakes/fraud (wants to crack down/regulate); "Support" = downplays the concern. Cracking down => "Oppose".
- data-centers: use a precise label ("Supports/Opposes data center development", "Supports/Opposes data center regulation") when directional; else Support/Oppose/Mixed.
- confidence: High (explicit/on-record), Medium (clear but indirect), Low (weak/inferred), N/A only for No mention.
"""

STANCE_GUIDE="""# Stance labeling guide — worked examples (get the DIRECTION right)
- Don't default to "Support" — read whether the candidate FAVORS or RESISTS the specific thing each topic describes.
- "Mixed" = voices BOTH support and concern on the SAME topic ("we must lead in AI data centers BUT protect ratepayers" => data-centers Mixed; "pro-innovation yet worried about risks" => regulation-philosophy Mixed).
- "Unclear" = ENGAGES the topic but takes no discernible side ("served on the AI task force discussing workforce impacts", no stated view => Unclear).
- deepfakes-fraud: "introduced a bill to criminalize deepfake porn / crack down on AI scams" => Oppose. "deepfake fears are overblown" => Support.
- data-centers: "we want data centers here, win the AI race" => Supports data center development. "data centers must disclose impact / fund their own power before operating" => Supports data center regulation. "stop data centers draining our water" => Opposes data center development.
- regulation-philosophy: "light-touch, AI as a force for deregulation" => Oppose (opposes heavy regulation). "we need real guardrails / mandatory testing" => Support.
"""

TOPIC_DISAMBIG="""# Topic disambiguation (these overlap — and MULTI-LABEL when warranted)
- A single statement MAY satisfy MORE THAN ONE topic. If so, code it under EACH topic it fits (same source URL on multiple topics is fine). Do not force one bucket.
- companion-chatbots = AI built for emotional/relational/companionship interaction. children-safety = protecting minors online (incl. AI-generated CSAM, deepfakes of minors, addictive algorithms). A kids-AI-safety bill that names companion/relationship chatbots fits BOTH.
- deepfakes-fraud = synthetic media, AI scams/impersonation, NCII/deepfake porn (incl. of minors). Deepfakes targeting minors ALSO fit children-safety.
- regulation-philosophy = general stance on regulating AI. AI-preemption = SPECIFICALLY federal preemption of STATE AI laws (the moratorium / states' rights to regulate). Commending a federal AI framework is regulation-philosophy, NOT preemption, unless it addresses overriding state law.
- export-control = restricting AI chips/compute/China competition via controls. military-ai = DoD/intelligence USE of AI (weapons, targeting, C2, surveillance). Chip export bans => export-control; battlefield/defense AI => military-ai.
"""

RESEARCH_V5="""# Your evidence dossier (START HERE)
A deterministic Exa search already gathered evidence for this candidate at:
  data/eval/dossier_v5/{cid}.json
It has 'exa_answer' (an LLM summary of the candidate's AI positions — a LEAD only; verify against real sources, do NOT trust blindly) and 'leads' (deduped {{title,url,snippet,via}} from answer-citations + web/congress.gov/social searches).
Steps:
1. Read the dossier with the Read tool. For each of the 10 topics, scan exa_answer + leads for relevant evidence.
2. READ the most relevant lead URLs to confirm the candidate's ACTUAL words: `uv run --quiet --with requests python tools/exa.py contents "<url>" --text 4000` or WebFetch; for social/JS/login-walled pages use playwright (`playwright-cli open about:blank`; `playwright-cli goto "<url>"`; `playwright-cli eval "() => document.body.innerText"`).
3. If a topic has no relevant lead, run 1-2 targeted WebSearch queries before concluding No mention.
Base every detected=true on a source you actually read.
"""

OUT='# Output\nReturn one entry per topic for all 10 topics via the structured output tool.\n'

def compose(*parts): return "\n".join(parts)
VARIANTS={
 'v2': compose(HEAD,RESEARCH_V2,"# Topic rubric\n"+RUBRIC,THRESHOLD,CONV,FEW,OUT),
 'v4': compose(HEAD,RESEARCH_V2,SOCIAL_COMPLETE,"# Topic rubric\n"+RUBRIC,THRESHOLD,CONV,FEW,OUT),
 'v7': compose(HEAD,RESEARCH_V2,SOCIAL_COMPLETE,"# Topic rubric\n"+RUBRIC,THRESHOLD,CONV,STANCE_GUIDE,FEW,OUT),
 'v8': compose(HEAD,RESEARCH_V2,SOCIAL_COMPLETE,"# Topic rubric\n"+RUBRIC,TOPIC_DISAMBIG,THRESHOLD,CONV,FEW,OUT),
 'v9': compose(HEAD,RESEARCH_V2,SOCIAL_COMPLETE,QEXPAND,"# Topic rubric\n"+RUBRIC,THRESHOLD,CONV,FEW,OUT),
 'v10': compose(HEAD,RESEARCH_V2,SOCIAL_COMPLETE,QEXPAND,"# Topic rubric\n"+RUBRIC,TOPIC_DISAMBIG,THRESHOLD,CONV,STANCE_GUIDE,FEW,OUT),
 'v5': compose(HEAD,RESEARCH_V5,"# Topic rubric\n"+RUBRIC,TOPIC_DISAMBIG,THRESHOLD,CONV,STANCE_GUIDE,FEW,OUT),
}

variant, splitf, outsub = sys.argv[1], sys.argv[2], sys.argv[3]
split=json.load(open(splitf)); tmpl=VARIANTS[variant]
outdir=f"data/eval/{outsub}"; os.makedirs(outdir, exist_ok=True)
for cid in split['test']:
    m=cmeta[cid]; dist=f", district {m['district']}" if m.get('district') else ""
    open(f"{outdir}/{cid}.md","w").write(tmpl.format(cid=cid,name=m['name'],state=m['state'],party=m['party'],seat=m['seat'],district=dist))
print(f"wrote {len(split['test'])} '{variant}' prompts to {outdir}")
