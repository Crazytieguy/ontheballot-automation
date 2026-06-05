#!/usr/bin/env python
# Deterministic Exa gather: per candidate, harvest evidence (answer citations + searches)
# into a dossier file the coder agent reads. Usage: uv run --with requests python tools/gather_exa.py <split_file>
import sys, os, json, urllib.request, urllib.error, concurrent.futures as cf
sys.path.insert(0,'eval'); import common
TOPICS=common.load_topics(); cmeta=common.load_candidates(); ORDER=common.TOPIC_ORDER

def key():
    k=os.environ.get("EXA_API_KEY")
    if not k and os.path.exists(".env"):
        for l in open(".env"):
            if l.startswith("EXA_API_KEY="): k=l.strip().split("=",1)[1]
    return k
KEY=key()

def call(path,payload):
    req=urllib.request.Request("https://api.exa.ai"+path, data=json.dumps(payload).encode(),
        headers={"x-api-key":KEY,"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req,timeout=90) as r: d=json.loads(r.read())
    except Exception as e:
        return {"_error":str(e),"costDollars":{"total":0}}
    return d

def gather(cid):
    m=cmeta[cid]; name=m['name']; who=f"{name} ({m['state']} {m['party']} candidate for {m['seat']})"
    cost=0.0; leads=[]   # leads: {title,url,snippet,via}
    def add(results,via):
        for r in (results or []):
            leads.append({"title":r.get('title'),"url":r.get('url'),
                          "snippet":(" … ".join((r.get('highlights') or [])[:2]) or (r.get('text') or '')[:300]),"via":via})
    topiclist="; ".join(f"{TOPICS[t]['name']}" for t in ORDER)
    a=call("/answer",{"query":f"What are {who}'s positions on these AI policy topics: {topiclist}? Give specifics and cite sources.","text":False})
    cost+=(a.get("costDollars") or {}).get("total",0) or 0
    ans=a.get("answer","")
    for c in (a.get("citations") or []): leads.append({"title":c.get('title'),"url":c.get('url'),"snippet":(c.get('text') or '')[:300],"via":"answer-citation"})
    for q,dom,via in [
        (f'{name} artificial intelligence', None, "search-ai"),
        (f'{name} AI', "congress.gov", "search-congress"),
        (f'{name} AI', "x.com,twitter.com,facebook.com,instagram.com,linkedin.com", "search-social"),
    ]:
        p={"query":q,"numResults":20,"type":"keyword","contents":{"highlights":{"query":"AI policy position","numSentences":2}}}
        if dom: p["includeDomains"]=dom.split(",")
        d=call("/search",p); cost+=(d.get("costDollars") or {}).get("total",0) or 0
        add(d.get("results"),via)
    # dedupe by url
    seen=set(); dd=[]
    for l in leads:
        u=(l.get('url') or '').rstrip('/')
        if not u or u in seen: continue
        seen.add(u); dd.append(l)
    return cid, {"candidate":{"id":cid,"name":name,"state":m['state'],"party":m['party'],"seat":m['seat']},
                 "exa_answer":ans, "leads":dd, "_cost":round(cost,4)}

split=json.load(open(sys.argv[1])); cands=split['test']
os.makedirs("data/eval/dossier_v5",exist_ok=True)
total=0.0
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    for cid,doss in ex.map(gather, cands):
        json.dump(doss, open(f"data/eval/dossier_v5/{cid}.json","w"), indent=2)
        total+=doss["_cost"]
        print(f"  {cid}: {len(doss['leads'])} leads  (${doss['_cost']})")
print(f"GATHER DONE. {len(cands)} dossiers. Exa cost this gather: ${total:.3f}")
