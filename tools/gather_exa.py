#!/usr/bin/env python
# Deterministic Exa gather -> one evidence dossier per candidate at data/eval/dossier/<id>.json.
#
# This is PREREQUISITE data-prep for pipeline.js's Exa-gather detector (run it first). It is
# plain, deterministic Python (a fixed set of Exa calls per candidate) on purpose: that
# exhaustive, uniform evidence is what makes the Exa member valuable, so it is kept OUT of an
# agent's discretion.
#
# Usage:
#   uv run --with requests python tools/gather_exa.py --candidates cands.json
#       cands.json = [{"id","name","state","party","seat"}, ...]   (self-contained)
#   uv run --with requests python tools/gather_exa.py --split data/eval/split_large.json
#       (looks up candidate metadata from data/csv via eval/common.py)
import sys, os, json, argparse, urllib.request, concurrent.futures as cf
sys.path.insert(0, 'eval'); import common
TOPICS = common.load_topics(); ORDER = common.TOPIC_ORDER

def api_key():
    k = os.environ.get("EXA_API_KEY")
    if not k and os.path.exists(".env"):
        for line in open(".env"):
            if line.startswith("EXA_API_KEY="): k = line.strip().split("=", 1)[1]
    if not k: sys.exit("EXA_API_KEY not found (.env or env)")
    return k

def call(path, payload):
    req = urllib.request.Request("https://api.exa.ai" + path, data=json.dumps(payload).encode(),
        headers={"x-api-key": api_key(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r: return json.loads(r.read())
    except Exception as e:
        return {"_error": str(e), "costDollars": {"total": 0}}

def gather(c):
    """c = {id,name,state,party,seat}. Returns (id, dossier)."""
    name = c['name']; who = f"{name} ({c.get('state','')} {c.get('party','')} candidate for {c.get('seat','')})"
    cost = 0.0; leads = []
    def add(results, via):
        for r in (results or []):
            leads.append({"title": r.get('title'), "url": r.get('url'),
                          "snippet": (" … ".join((r.get('highlights') or [])[:2]) or (r.get('text') or '')[:300]), "via": via})
    topiclist = "; ".join(TOPICS[t]['name'] for t in ORDER)
    a = call("/answer", {"query": f"What are {who}'s positions on these AI policy topics: {topiclist}? Give specifics and cite sources.", "text": False})
    cost += (a.get("costDollars") or {}).get("total", 0) or 0
    for cit in (a.get("citations") or []):
        leads.append({"title": cit.get('title'), "url": cit.get('url'), "snippet": (cit.get('text') or '')[:300], "via": "answer-citation"})
    for q, dom, via in [
        (f'{name} artificial intelligence', None, "search-ai"),
        (f'{name} AI', "congress.gov", "search-congress"),
        (f'{name} AI', "x.com,twitter.com,facebook.com,instagram.com,linkedin.com", "search-social"),
    ]:
        p = {"query": q, "numResults": 20, "type": "keyword", "contents": {"highlights": {"query": "AI policy position", "numSentences": 2}}}
        if dom: p["includeDomains"] = dom.split(",")
        d = call("/search", p); cost += (d.get("costDollars") or {}).get("total", 0) or 0
        add(d.get("results"), via)
    seen = set(); dd = []
    for l in leads:
        u = (l.get('url') or '').rstrip('/')
        if not u or u in seen: continue
        seen.add(u); dd.append(l)
    return c['id'], {"candidate": c, "exa_answer": a.get("answer", ""), "leads": dd, "_cost": round(cost, 4)}

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidates", help="JSON file: [{id,name,state,party,seat}, ...]")
    ap.add_argument("--split", help="a split.json (looks up metadata from data/csv)")
    a = ap.parse_args()
    if a.candidates:
        cands = json.load(open(a.candidates))
    elif a.split:
        cm = common.load_candidates(); test = json.load(open(a.split))['test']
        cands = [{"id": cid, **{k: cm[cid].get(k, '') for k in ('name', 'state', 'party', 'seat')}} for cid in test]
    else:
        sys.exit("pass --candidates <file> or --split <file>")
    os.makedirs("data/eval/dossier", exist_ok=True)
    total = 0.0
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        for cid, doss in ex.map(gather, cands):
            json.dump(doss, open(f"data/eval/dossier/{cid}.json", "w"), indent=2)
            total += doss["_cost"]
            print(f"  {cid}: {len(doss['leads'])} leads (${doss['_cost']})")
    print(f"GATHER DONE. {len(cands)} dossiers -> data/eval/dossier/. Exa cost: ${total:.3f}")
