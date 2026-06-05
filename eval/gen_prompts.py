import sys, json, os, csv
sys.path.insert(0,'eval'); import common
gt=common.load_ground_truth(); topics=common.load_topics(); cmeta=common.load_candidates()
split=json.load(open("data/eval/split.json"))

def topic_block():
    lines=[]
    for tid in common.TOPIC_ORDER:
        t=topics[tid]
        lines.append(f"### {tid} — {t['name']}\n"
                     f"- Definition: {t['description']}\n"
                     f"- INCLUDES (counts as a position): {t['includes']}\n"
                     f"- EXCLUDES (does NOT count — code No mention): {t['excludes']}")
    return "\n\n".join(lines)

def fewshot_block():
    out=["## Worked examples (from already-coded candidates — study the conventions)"]
    for cid in ["talarico-james","cotton-thomas","rouzer-david"]:
        m=cmeta[cid]
        out.append(f"\n### Example: {m['name']} ({m['state']}, {m['party']}, {m['seat']})")
        for tid in common.TOPIC_ORDER:
            cell=gt[cid].get(tid)
            if not cell: continue
            if cell['det']=='real':
                src=cell['sources'][0] if cell['sources'] else '(none)'
                out.append(f"- {tid}: stance=\"{cell['stance']}\", confidence={cell['confidence']} — {cell['summary']}  [source: {src}]")
            else:
                out.append(f"- {tid}: stance=\"No mention\"")
    return "\n".join(out)

RUBRIC=topic_block(); FEW=fewshot_block()

INSTR_TEMPLATE="""You are a meticulous research analyst building a public, fact-checked tracker of U.S. congressional candidates' positions on AI policy. Today is 2026-06-02; this is the 2026 election cycle.

# Your task
Research ONE candidate and determine their position on EACH of 10 AI policy topics. For each topic, decide whether the candidate has expressed a position that satisfies that topic's INCLUDES criteria, and if so, code the stance, write a one-sentence summary, and cite the exact source URL(s).

# Candidate
- id: {cid}
- name: {name}
- state: {state}
- party: {party}
- office sought: {seat}{district}

# How to research (use web search and page fetches)
- Search the open web. Good sources, in rough priority: the candidate's official campaign website ("issues"/"priorities" pages), congress.gov (bills sponsored/cosponsored, votes) for incumbents, official .gov press releases and committee hearing records/transcripts, reputable news, candidate social media (X, Facebook, Instagram), interviews/podcasts, voter guides.
- Run MULTIPLE distinct searches (e.g. '"{name}" AI', '"{name}" artificial intelligence', '"{name}" data center', '"{name}" deepfake', '"{name}" chips export China', '"{name}" {seat} issues AI'). Fetch the most promising pages to read the actual words.
- An incumbent's legislative record (sponsored bills, votes, committee statements) is fair game and often decisive.

# Topic rubric — code STRICTLY against INCLUDES/EXCLUDES
{rubric}

# Stance values & conventions
- Allowed stance values: "Support", "Oppose", "Mixed", "Unclear", or "No mention".
- For most topics: Support = favors/endorses the thing the topic describes; Oppose = against it.
- deepfakes-fraud convention (IMPORTANT, counterintuitive): "Oppose" = opposes deepfakes/fraud (i.e. SUPPORTS regulating or cracking down on them); "Support" = downplays/minimizes the concern. When a candidate wants to crack down on deepfakes, code "Oppose".
- data-centers: if the position is clearly directional you MAY use a precise label like "Supports data center development", "Opposes data center development", "Supports data center regulation", or "Opposes data center regulation"; otherwise use Support/Oppose/Mixed.
- Mixed = expresses competing considerations on both sides. Unclear = touches the topic but the stance can't be pinned down.
- confidence: High (explicit, on-record, unambiguous), Medium (clear but indirect), Low (weak/inferred). Use N/A only for No mention.

# Decision rule (recall-first, but evidence-bound)
- PRIORITIZE NOT MISSING real positions. If you find credible, specific evidence the candidate expressed a view matching a topic's INCLUDES, set detected=true.
- BUT a position requires the candidate themselves taking a stance on THAT topic. Do NOT count: generic "support innovation" platitudes, another person's words in an article that merely mentions the candidate, the candidate mentioning AI without a stance, or content that matches the topic's EXCLUDES. In those cases code "No mention".
- Every detected=true MUST have at least one real source URL you actually found, and the summary must paraphrase what the candidate specifically said/did.
- If you found nothing satisfying INCLUDES, set detected=false, stance="No mention". That is the correct and common answer — most candidate/topic cells are No mention.

{few}

# Output
Return one entry per topic for all 10 topics via the structured output tool.
"""

os.makedirs("data/eval/prompts",exist_ok=True)
for cid in split['test']:
    m=cmeta[cid]
    dist=f", district {m['district']}" if m.get('district') else ""
    prompt=INSTR_TEMPLATE.format(cid=cid,name=m['name'],state=m['state'],party=m['party'],
                                 seat=m['seat'],district=dist,rubric=RUBRIC,few=FEW)
    open(f"data/eval/prompts/{cid}.md","w").write(prompt)
print("wrote", len(split['test']), "prompt files to data/eval/prompts/")
print("example prompt size (chars):", len(open(f"data/eval/prompts/{split['test'][0]}.md").read()))
