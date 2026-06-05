import json,sys
d=json.load(open(sys.argv[1])); r=d["result"]; r=json.loads(r) if isinstance(r,str) else r
pred=r["predictions"]; json.dump(pred, open(sys.argv[2],"w"), indent=2)
split=json.load(open("data/eval/split_large.json"))
miss=[c for c in split['test'] if c not in pred]
print(f"{sys.argv[2]}: {len(pred)} cands, failures={r.get('failures')}, missing={miss}")
