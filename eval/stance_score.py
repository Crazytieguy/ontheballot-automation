import json,sys
from collections import Counter, defaultdict
sys.path.insert(0,'eval'); import common
def canon(stance, topic):
    d=common.stance_direction(stance)
    if topic=='data-centers' and d in ('support','oppose'):
        s=(stance or '').lower()
        if 'develop' in s: return d+'-dev'
        if 'regulat' in s: return d+'-reg'
    return d
def run(name, predfile):
    cells={f"{r['cand']}|{r['topic']}":r for r in json.load(open("data/eval/stance_cells.json"))}
    pred=json.load(open(predfile))  # {id: stance_string}
    tot=ok=fine_tot=fine_ok=0; pertopic=defaultdict(lambda:[0,0]); conf=Counter()
    for cid,r in cells.items():
        if cid not in pred: continue
        gd=r['_gt_dir']; pd=common.stance_direction(pred[cid])
        tot+=1; m=(gd==pd); ok+=m; pertopic[r['topic']][0]+=m; pertopic[r['topic']][1]+=1
        if not m: conf[f"{gd}->{pd}"]+=1
        gf=canon(r['_gt_stance'],r['topic']); pf=canon(pred[cid],r['topic']); fine_tot+=1; fine_ok+=(gf==pf)
    print(f"{name:26s} coarse={ok}/{tot}={100*ok/max(1,tot):.1f}%   fine(dc-axis)={100*fine_ok/max(1,fine_tot):.1f}%")
    return dict(name=name, coarse=round(100*ok/max(1,tot),1), fine=round(100*fine_ok/max(1,fine_tot),1),
                pertopic={t:round(100*a/max(1,b)) for t,(a,b) in pertopic.items()}, conf=dict(conf.most_common(6)))
if __name__=="__main__":
    import sys
    res=run(sys.argv[1], sys.argv[2])
    with open("data/eval/stance_scoreboard.tsv","a") as f: f.write(json.dumps(res)+"\n")
    print("  per-topic:", res['pertopic'])
    print("  confusions:", res['conf'])
