# union N prediction files: detected = OR; stance/summary/sources from highest-confidence detected member
import sys, json
ORDER={'High':3,'Medium':2,'Low':1,'N/A':0,'':0}
def cell(P,c,t): return (P.get(c) or {}).get(t) or {}
def build(preds, key):
    out={}
    for c in key:
        out[c]={}
        for t in key[c]:
            cands=[cell(P,c,t) for P in preds]
            det=[x for x in cands if x.get('detected')]
            if det:
                best=max(det, key=lambda x: ORDER.get(x.get('confidence',''),0))
                srcs=[]; 
                for x in det: srcs+= (x.get('sources') or [])
                out[c][t]={'detected':True,'stance':best.get('stance'),'confidence':best.get('confidence'),'summary':best.get('summary'),'sources':srcs}
            else:
                out[c][t]={'detected':False,'stance':'No mention','sources':[]}
    return out
if __name__=="__main__":
    key=json.load(open(sys.argv[1])); outp=sys.argv[2]; files=sys.argv[3:]
    preds=[json.load(open(f)) for f in files]
    json.dump(build(preds,key), open(outp,"w"))
    print(f"ensembled {len(files)} -> {outp}")
