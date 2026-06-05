You are a meticulous research analyst building a public, fact-checked tracker of U.S. congressional candidates' positions on AI policy. Today is 2026-06-02; this is the 2026 election cycle.

# Your task
Research ONE candidate and determine their position on EACH of 10 AI policy topics. For each topic decide whether the candidate has ENGAGED the topic, and if so code stance + a one-sentence summary + exact source URL(s).

# Candidate
- id: cornyn-john
- name: John Cornyn
- state: TX
- party: republican
- office sought: Senate, district Senate

# CRITICAL: recall is the top priority
Missing a real position is the worst error (target: miss almost none). Surfacing a borderline one is acceptable because a human reviews everything afterward. When in doubt, DETECT and let the human filter.

# Your evidence dossier (START HERE)
A deterministic Exa search already gathered evidence for this candidate at:
  data/eval/dossier_v5/cornyn-john.json
It has 'exa_answer' (an LLM summary of the candidate's AI positions — a LEAD only; verify against real sources, do NOT trust blindly) and 'leads' (deduped {title,url,snippet,via} from answer-citations + web/congress.gov/social searches).
Steps:
1. Read the dossier with the Read tool. For each of the 10 topics, scan exa_answer + leads for relevant evidence.
2. READ the most relevant lead URLs to confirm the candidate's ACTUAL words: `uv run --quiet --with requests python tools/exa.py contents "<url>" --text 4000` or WebFetch; for social/JS/login-walled pages use playwright (`playwright-cli open about:blank`; `playwright-cli goto "<url>"`; `playwright-cli eval "() => document.body.innerText"`).
3. If a topic has no relevant lead, run 1-2 targeted WebSearch queries before concluding No mention.
Base every detected=true on a source you actually read.

# Topic rubric
### export-control — Export Control and Compute Governance
- Definition: Government control or restriction of advanced AI capabilities through trade, export, or compute access.
- INCLUDES (counts as a position): Export controls on AI chips, semiconductors, or model weights; Restrictions on cloud compute access (domestic or foreign); Policies targeting frontier models, large-scale training, or datacenter operations; AI-related technology competition with China or other strategic rivals when tied to controls
- EXCLUDES (does NOT count — code No mention): Generic 'support U.S. innovation' statements; Industrial policy (e.g., CHIPS Act) unless explicitly linked to restricting AI capabilities; Cybersecurity or data privacy without compute/export implications

### military-ai — Military and National Security Uses of AI
- Definition: Positions on the use of AI in military, intelligence, or national security contexts.
- INCLUDES (counts as a position): Autonomous or semi-autonomous weapons; AI in targeting, surveillance, intelligence analysis, or command-and-control; 'Human-in-the-loop' vs autonomous decision-making; Defense Department AI deployment, oversight, or restrictions
- EXCLUDES (does NOT count — code No mention): Generic support for 'strong national defense'; Cybersecurity unless AI-specific; Export controls (covered under Export Control & Compute Governance)

### regulation-philosophy — AI Regulation Philosophy
- Definition: A candidate's general stance on regulating AI systems.
- INCLUDES (counts as a position): Support for or opposition to AI-specific regulation; Calls for licensing, audits, safety standards, or oversight bodies; Preference for 'light-touch' vs precautionary regulation; Framing of regulation as innovation-friendly vs innovation-harming
- EXCLUDES (does NOT count — code No mention): Narrow sectoral rules (e.g., healthcare-only AI rules); Platform regulation unrelated to AI systems; Privacy law unless explicitly tied to AI governance

### companion-chatbots — AI Companion Chatbots
- Definition: Positions on AI systems designed for emotional, relational, or social interaction.
- INCLUDES (counts as a position): AI companions, 'AI friends,' or relationship chatbots; Emotional dependence, parasocial relationships, or manipulation by AI; Use of AI companions in mental health or loneliness contexts (non-clinical)
- EXCLUDES (does NOT count — code No mention): General chatbot or customer service AI; Clinical or licensed mental health tools unless framed as companions; Social media algorithms unless explicitly about AI companionship

### children-safety — Children's Online Safety
- Definition: Views on protecting minors from harms related to AI or AI-mediated platforms.
- INCLUDES (counts as a position): AI-generated content affecting children; Age verification, youth protections, or safeguards; AI-enabled grooming, deepfakes of minors, or recommendation harms; Children's interaction with generative AI tools
- EXCLUDES (does NOT count — code No mention): General education policy; Non-AI child safety issues; Social media regulation without AI relevance

### data-centers — Data Centers
- Definition: Positions on the development, regulation, or public impact of data center infrastructure as it relates to AI, including energy consumption and grid reliability concerns tied to AI workloads.
- INCLUDES (counts as a position): 
- EXCLUDES (does NOT count — code No mention): Generic economic development statements; energy policy without explicit connection to AI infrastructure; industrial policy unless tied to AI compute capacity.

### jobs-workforce — Jobs and Workforce Disruption
- Definition: Positions on AI-driven job displacement, reskilling programs, unemployment policy, and tax policy for distributing AI-driven wealth.
- INCLUDES (counts as a position): 
- EXCLUDES (does NOT count — code No mention): 

### deepfakes-fraud — Deepfakes and AI Fraud
- Definition: Views on AI-generated misinformation, scam prevention, fraud targeting vulnerable populations, and synthetic media disclosure requirements.
- INCLUDES (counts as a position): 
- EXCLUDES (does NOT count — code No mention): 

### AI-preemption — AI Preemption
- Definition: Stance on federal preemption of state AI laws, states' rights to regulate AI, and the patchwork of local vs. national regulatory approaches.
- INCLUDES (counts as a position): 
- EXCLUDES (does NOT count — code No mention): 

### intellectual-property — Intellectual Property and AI 
- Definition: Positions on AI training data rights, copyright protections for creators and publishers, and liability for AI-generated content.
- INCLUDES (counts as a position): 
- EXCLUDES (does NOT count — code No mention): 
# Topic disambiguation (these overlap — and MULTI-LABEL when warranted)
- A single statement MAY satisfy MORE THAN ONE topic. If so, code it under EACH topic it fits (same source URL on multiple topics is fine). Do not force one bucket.
- companion-chatbots = AI built for emotional/relational/companionship interaction. children-safety = protecting minors online (incl. AI-generated CSAM, deepfakes of minors, addictive algorithms). A kids-AI-safety bill that names companion/relationship chatbots fits BOTH.
- deepfakes-fraud = synthetic media, AI scams/impersonation, NCII/deepfake porn (incl. of minors). Deepfakes targeting minors ALSO fit children-safety.
- regulation-philosophy = general stance on regulating AI. AI-preemption = SPECIFICALLY federal preemption of STATE AI laws (the moratorium / states' rights to regulate). Commending a federal AI framework is regulation-philosophy, NOT preemption, unless it addresses overriding state law.
- export-control = restricting AI chips/compute/China competition via controls. military-ai = DoD/intelligence USE of AI (weapons, targeting, C2, surveillance). Chip export bans => export-control; battlefield/defense AI => military-ai.

# Detection threshold (LOWER than you might assume)
- detected=true if the candidate ENGAGED the topic in any way: stated a view, sponsored/cosponsored relevant legislation, voted on it, participated in a hearing/task force on it, or commented in news/social media — EVEN IF direction is ambiguous.
- If engaged but you cannot pin Support vs Oppose, set detected=true with stance="Unclear" (NOT No mention). 'Unclear' is valid and valuable.
- Use detected=false / "No mention" ONLY when you found NO engagement with that topic.
- Guardrails: engagement must be the CANDIDATE's own (not another person quoted), must match the topic's INCLUDES (not EXCLUDES), and every detected=true MUST cite a real URL you actually read.

# Stance values & conventions
- Values: "Support", "Oppose", "Mixed", "Unclear", or "No mention".
- deepfakes-fraud (counterintuitive): "Oppose" = opposes deepfakes/fraud (wants to crack down/regulate); "Support" = downplays the concern. Cracking down => "Oppose".
- data-centers: use a precise label ("Supports/Opposes data center development", "Supports/Opposes data center regulation") when directional; else Support/Oppose/Mixed.
- confidence: High (explicit/on-record), Medium (clear but indirect), Low (weak/inferred), N/A only for No mention.

# Stance labeling guide — worked examples (get the DIRECTION right)
- Don't default to "Support" — read whether the candidate FAVORS or RESISTS the specific thing each topic describes.
- "Mixed" = voices BOTH support and concern on the SAME topic ("we must lead in AI data centers BUT protect ratepayers" => data-centers Mixed; "pro-innovation yet worried about risks" => regulation-philosophy Mixed).
- "Unclear" = ENGAGES the topic but takes no discernible side ("served on the AI task force discussing workforce impacts", no stated view => Unclear).
- deepfakes-fraud: "introduced a bill to criminalize deepfake porn / crack down on AI scams" => Oppose. "deepfake fears are overblown" => Support.
- data-centers: "we want data centers here, win the AI race" => Supports data center development. "data centers must disclose impact / fund their own power before operating" => Supports data center regulation. "stop data centers draining our water" => Opposes data center development.
- regulation-philosophy: "light-touch, AI as a force for deregulation" => Oppose (opposes heavy regulation). "we need real guardrails / mandatory testing" => Support.

## Worked examples (from already-coded candidates — study the conventions)

### Example: James Talarico (TX, democratic, Senate)
- export-control: stance="Support", confidence=High — Wants to pass legislation to enforce and strengthen export controls to keep advanced AI chips out of the hands of adversaries  [source: https://jamestalarico.com/issue/social-media-artificial-intelligence-tech/]
- military-ai: stance="No mention"
- regulation-philosophy: stance="Support", confidence=High — Says that we can and must encourage innovation while setting clear guidelines that protect Americans from harm  [source: https://jamestalarico.com/issue/social-media-artificial-intelligence-tech/]
- companion-chatbots: stance="No mention"
- children-safety: stance="Support", confidence=High — Wants to pass commonsense safeguards to keep kids safe online, including giving parents more control over their children's social media use  [source: https://jamestalarico.com/issue/social-media-artificial-intelligence-tech/]
- data-centers: stance="Opposes data center development", confidence=High — Asserts that AI data centers should not disrupt communities or raise energy costs for Americans  [source: https://jamestalarico.com/issue/social-media-artificial-intelligence-tech/]
- jobs-workforce: stance="Support", confidence=High — Advocates for investing in STEM education to foster the next eneration of responsible tech leaders; wants to protect workers from invasive AI surveillance in the workplace  [source: https://jamestalarico.com/issue/social-media-artificial-intelligence-tech/]
- deepfakes-fraud: stance="Oppose", confidence=High — In the Texas legislature, protected victims in cases involving explicit deepfake material by requiring social media platforms to create effective reporting and investigation processes  [source: https://jamestalarico.com/issue/social-media-artificial-intelligence-tech/]
- AI-preemption: stance="No mention"
- intellectual-property: stance="Support", confidence=High — Asserts that AI companies should follow the same copyright laws as everyone else  [source: https://jamestalarico.com/issue/social-media-artificial-intelligence-tech/]

### Example: Thomas B. Cotton  (AR, republican, Senate)
- export-control: stance="Support", confidence=High — Introduced the Chip Security Act, which would require location verification mechanisms on AI chips subject to export controls and mandate reporting to Commerce's Bureau of Industry and Security if chips are diverted or tampered with; also co-sponsored the America First GAIN AI Act to prioritize American companies' access to AI chips ahead of adversaries.  [source: https://www.congress.gov/bill/119th-congress/senate-bill/1705]
- military-ai: stance="No mention"
- regulation-philosophy: stance="Support", confidence=Medium — Introduced legislation that would make it easier for regulators to block large tech companies from buying up rivals or nascent competitors.  [source: https://www.washingtonpost.com/technology/2021/11/05/klobuchar-cotton-tech-competition/]
- companion-chatbots: stance="Support", confidence=High — Cosponsored GUARD Act (S.3062) - Guidelines for User Age-verification and Responsible Dialogue Act of 2025.  [source: https://www.congress.gov/bill/119th-congress/senate-bill/3062/cosponsors]
- children-safety: stance="Support", confidence=Medium — Wrote a social media post about holding AI chatbot companies accountable.  [source: https://www.facebook.com/TomCottonAR/posts/any-company-that-creates-an-ai-bot-that-preys-on-children-must-be-held-accountab/1298014031694918/]
- data-centers: stance="Supports data center development", confidence=High — Introduced DATA Act allowing AI data centers to bypass federal electricity regulations and build independent energy infrastructure; pushed off-grid power plan for AI data centers.  [source: https://www.congress.gov/bill/119th-congress/senate-bill/3585]
- jobs-workforce: stance="No mention"
- deepfakes-fraud: stance="No mention"
- AI-preemption: stance="Oppose", confidence=High — Voted to strike the section relating to AI preemption.  [source: https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00363.htm]
- intellectual-property: stance="No mention"

### Example: David Cheston Rouzer (NC, republican, House)
- export-control: stance="No mention"
- military-ai: stance="No mention"
- regulation-philosophy: stance="Oppose", confidence=Medium — Notes that the focus remains on reducing regulatory barriers to ensure that American innovation continues to lead the way  [source: https://rouzer.house.gov/news/email/show.aspx?ID=IQUN6V2V7Y5LKRXHJOEBMB6XRA#:~:text=My%20focus%20remains%20on%20reducing,in%20the%20global%20AI%20landscape.]
- companion-chatbots: stance="No mention"
- children-safety: stance="No mention"
- data-centers: stance="Unclear", confidence=Low — Signed a letter to the White House Office of Science and Technology Policy urging the Administration to incorporate silicon carbide into the AI Action Plan; a part of the effort to reduce AI's growing energy footprint with advanced semiconductor tech  [source: https://hudson.house.gov/press-releases/hudson-leads-effort-to-reduce-ais-growing-energy-footprint-with-advanced?st_source=ai_mode#:~:text=Here's%20some%20information%20about%20press%20releases%20about,David%20Rouzer%2C%20Chuck%20Edwards%2C%20and%20Tim%20Moore.]
- jobs-workforce: stance="Support", confidence=High — Believes that the U.S. must support AI literacy and technical skills to advance the workforce  [source: https://www.youtube.com/watch?v=NQYUPv6So50]
- deepfakes-fraud: stance="No mention"
- AI-preemption: stance="Support", confidence=Low — Asked Michael Kratsio if the lack of federal preemption is among the top three hurdles to innovation  [source: https://www.youtube.com/watch?v=NQYUPv6So50]
- intellectual-property: stance="No mention"
# Output
Return one entry per topic for all 10 topics via the structured output tool.
