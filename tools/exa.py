#!/usr/bin/env python
# Exa API helper. Usage via: uv run --with requests python tools/exa.py <cmd> ...
# Reads EXA_API_KEY from .env. Logs every call's costDollars to data/eval/exa_cost.log.
import sys, os, json, argparse, urllib.request, urllib.error

def api_key():
    k=os.environ.get("EXA_API_KEY")
    if not k and os.path.exists(".env"):
        for line in open(".env"):
            if line.startswith("EXA_API_KEY="):
                k=line.strip().split("=",1)[1]
    if not k: sys.exit("EXA_API_KEY not found (.env or env)")
    return k

def call(path, payload):
    req=urllib.request.Request("https://api.exa.ai"+path,
        data=json.dumps(payload).encode(),
        headers={"x-api-key":api_key(),"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            d=json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"Exa HTTP {e.code}: {e.read().decode()[:300]}")
    cost=(d.get("costDollars") or {}).get("total")
    if cost is not None:
        os.makedirs("data/eval", exist_ok=True)
        with open("data/eval/exa_cost.log","a") as f:
            f.write(json.dumps({"path":path,"q":str(payload.get('query') or payload.get('urls') or '')[:80],"cost":cost})+"\n")
    return d

def fmt_results(results):
    out=[]
    for i,r in enumerate(results or []):
        line=f"[{i+1}] {r.get('title') or '(no title)'}\n    url: {r.get('url')}"
        if r.get('publishedDate'): line+=f"\n    published: {r['publishedDate']}"
        hl=r.get('highlights')
        if hl: line+="\n    highlights: "+" … ".join(h.strip() for h in hl[:3])
        elif r.get('text'): line+="\n    text: "+r['text'].strip().replace("\n"," ")[:500]
        out.append(line)
    return "\n".join(out) if out else "(no results)"

def cmd_search(a):
    contents={}
    if a.text: contents["text"]={"maxCharacters":a.text}
    if a.highlights: contents["highlights"]={"query":a.highlights,"numSentences":3}
    if a.livecrawl: contents["livecrawl"]="always"
    p={"query":a.query,"numResults":a.n,"type":a.type}
    if contents: p["contents"]=contents
    if a.domains: p["includeDomains"]=a.domains.split(",")
    if a.exclude: p["excludeDomains"]=a.exclude.split(",")
    if a.start: p["startPublishedDate"]=a.start
    if a.category: p["category"]=a.category
    d=call("/search",p)
    print(fmt_results(d.get("results")))
    print(f"\n[cost ${ (d.get('costDollars') or {}).get('total') }]")

def cmd_answer(a):
    p={"query":a.query,"text":bool(a.text)}
    d=call("/answer",p)
    print("ANSWER:\n"+(d.get("answer") or ""))
    cites=d.get("citations") or []
    print("\nCITATIONS:")
    for i,c in enumerate(cites):
        print(f"[{i+1}] {c.get('title')}\n    {c.get('url')}")
    print(f"\n[cost ${ (d.get('costDollars') or {}).get('total') }]")

def cmd_contents(a):
    p={"urls":a.urls.split(","),"text":{"maxCharacters":a.text}}
    if a.subpages: p["subpages"]=a.subpages
    if a.livecrawl: p["livecrawl"]="always"
    d=call("/contents",p)
    print(fmt_results(d.get("results")))
    print(f"\n[cost ${ (d.get('costDollars') or {}).get('total') }]")

def cmd_similar(a):
    p={"url":a.url,"numResults":a.n}
    if a.text: p["contents"]={"text":{"maxCharacters":a.text}}
    d=call("/findSimilar",p)
    print(fmt_results(d.get("results")))
    print(f"\n[cost ${ (d.get('costDollars') or {}).get('total') }]")

ap=argparse.ArgumentParser()
sub=ap.add_subparsers(required=True)
s=sub.add_parser("search"); s.add_argument("query"); s.add_argument("--type",default="auto",choices=["auto","neural","keyword","fast"]); s.add_argument("--n",type=int,default=25); s.add_argument("--domains"); s.add_argument("--exclude"); s.add_argument("--start"); s.add_argument("--category"); s.add_argument("--text",type=int,default=0); s.add_argument("--highlights"); s.add_argument("--livecrawl",action="store_true"); s.set_defaults(f=cmd_search)
an=sub.add_parser("answer"); an.add_argument("query"); an.add_argument("--text",action="store_true"); an.set_defaults(f=cmd_answer)
c=sub.add_parser("contents"); c.add_argument("urls"); c.add_argument("--text",type=int,default=2000); c.add_argument("--subpages",type=int,default=0); c.add_argument("--livecrawl",action="store_true"); c.set_defaults(f=cmd_contents)
si=sub.add_parser("similar"); si.add_argument("url"); si.add_argument("--n",type=int,default=10); si.add_argument("--text",type=int,default=0); si.set_defaults(f=cmd_similar)
args=ap.parse_args(); args.f(args)
