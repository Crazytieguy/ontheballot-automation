"""Score a predictions file against the held-out answer key.

Predictions JSON schema:
{ "<candidateId>": { "<topicId>": {
      "detected": true|false,        # does this candidate have a position on this topic?
      "stance": "Support|Oppose|Mixed|Unclear|No mention|...",
      "confidence": "High|Medium|Low|N/A",
      "summary": "...",
      "sources": ["https://..."]
}}}

Primary metric = DETECTION (binary: has-position vs no-mention).
  FN  = GT real  & pred not detected   (CRITICAL, target FNR < 1%)
  FP  = GT nomention & pred detected    (target FPR < 10%)
Secondary = stance-direction accuracy on true positives.
"""
import sys, json
sys.path.insert(0,'eval'); import common

def load(p):
    with open(p) as f: return json.load(f)

def score(pred_path, key_path="data/eval/answer_key.json", verbose=True):
    key=load(key_path); pred=load(pred_path)
    TP=FN=FP=TN=0
    fn_cells=[]; fp_cells=[]
    dir_ok=dir_tot=0; dir_mismatch=[]
    src_found=src_overlap=0
    for c, topics in key.items():
        for t, g in topics.items():
            gdet=g['det']
            if gdet=='blank': continue
            p=(pred.get(c) or {}).get(t) or {}
            pdet=bool(p.get('detected'))
            if gdet=='real' and pdet: TP+=1
            elif gdet=='real' and not pdet:
                FN+=1; fn_cells.append((c,t,g['stance'],g['summary'][:90],g['sources'][:1]))
            elif gdet=='nomention' and pdet:
                FP+=1; fp_cells.append((c,t,p.get('stance'),(p.get('summary') or '')[:90],(p.get('sources') or [])[:1]))
            else: TN+=1
            # secondary: stance direction on TPs
            if gdet=='real' and pdet:
                dir_tot+=1
                gd=g['dir']; pd=common.stance_direction(p.get('stance',''))
                if gd==pd: dir_ok+=1
                else: dir_mismatch.append((c,t,g['stance'],p.get('stance')))
                # source signal
                ps=[u for u in (p.get('sources') or []) if u]
                if ps: src_found+=1
                gs=set(u.rstrip('/').split('#')[0] for u in g['sources'])
                if gs and any(u.rstrip('/').split('#')[0] in gs for u in ps): src_overlap+=1
    real=TP+FN; nom=FP+TN
    recall=TP/real if real else 0
    prec=TP/(TP+FP) if (TP+FP) else 0
    fnr=FN/real if real else 0
    fpr=FP/nom if nom else 0
    out=dict(TP=TP,FN=FN,FP=FP,TN=TN,real=real,nomention=nom,
             recall=round(recall,4),precision=round(prec,4),
             FNR=round(fnr,4),FPR=round(fpr,4),
             stance_dir_acc=round(dir_ok/dir_tot,4) if dir_tot else None,
             src_found_rate=round(src_found/TP,4) if TP else None,
             src_overlap_rate=round(src_overlap/TP,4) if TP else None)
    if verbose:
        print(json.dumps(out,indent=2))
        print(f"\n=== FALSE NEGATIVES ({FN}) — missed real positions [CRITICAL] ===")
        for c,t,s,sm,src in fn_cells: print(f"  {c:20s} {t:22s} GT={s:10s} | {sm} | {src}")
        print(f"\n=== FALSE POSITIVES ({FP}) — invented positions ===")
        for c,t,s,sm,src in fp_cells: print(f"  {c:20s} {t:22s} pred={s} | {sm} | {src}")
        print(f"\n=== STANCE-DIR MISMATCHES on TPs ({len(dir_mismatch)}) ===")
        for c,t,g,p in dir_mismatch: print(f"  {c:20s} {t:22s} GT={g} pred={p}")
    return out, fn_cells, fp_cells

if __name__=="__main__":
    keyp=sys.argv[2] if len(sys.argv)>2 else "data/eval/answer_key.json"
    score(sys.argv[1] if len(sys.argv)>1 else "data/eval/predictions.json", key_path=keyp)
