"""Deterministically select held-out TEST set and FEW-SHOT pool.
TEST = candidates used ONLY for measuring precision/recall (never shown to models).
FEWSHOT = candidates whose codings may be used as in-prompt examples."""
import sys, json, csv
sys.path.insert(0,'eval'); import common

gt=common.load_ground_truth(); cmeta=common.load_candidates()
NOM=common.NOMENTION

# reserved few-shot examples (rich, cover tricky conventions) -> excluded from test
FEWSHOT=["cotton-thomas","rouzer-david","talarico-james","foushee-valerie","bera-ami"]

def profile(c):
    cells=gt[c]
    real=sum(1 for t in cells if cells[t]['det']=='real')
    nom=sum(1 for t in cells if cells[t]['det']=='nomention')
    blank=sum(1 for t in cells if cells[t]['det']=='blank')
    srcpos=sum(1 for t in cells if cells[t]['det']=='real' and cells[t]['sources'])
    m=cmeta.get(c,{})
    return dict(cand=c,real=real,nom=nom,blank=blank,srcpos=srcpos,
                state=m.get('state','?'),party=(m.get('party','?') or '').lower(),
                seat=(m.get('seat','?') or '').strip())

gold=[profile(c) for c in gt if profile(c)['blank']==0 and profile(c)['srcpos']>0 and c not in FEWSHOT]
silent=[profile(c) for c in gt if profile(c)['blank']==0 and profile(c)['real']==0 and c not in FEWSHOT]

# ---- pick 16 gold, stratified by state, spanning difficulty (real count) ----
# group by state, sort each by srcpos desc; round-robin to spread states; cap 2/state
from collections import defaultdict, OrderedDict
bys=defaultdict(list)
for g in sorted(gold,key=lambda x:(-x['srcpos'],-x['real'],x['cand'])):
    bys[g['state']].append(g)
order=sorted(bys, key=lambda s:-len(bys[s]))  # states by pool size
test_gold=[]; cap=defaultdict(int)
# round-robin two passes
for _pass in range(2):
    for s in order:
        if len(test_gold)>=16: break
        for g in bys[s]:
            if cap[g['state']]<=_pass and g not in test_gold:
                test_gold.append(g); cap[g['state']]+=1; break
    if len(test_gold)>=16: break
test_gold=test_gold[:16]

# ---- pick 4 silent from well-researched states, distinct from test_gold states where possible ----
sgood=[s for s in sorted(silent,key=lambda x:(x['cand'])) if s['state'] in {'IL','OH','NC','IN','CA','TX'}]
seen_states=set()
test_silent=[]
for s in sgood:
    if s['state'] not in seen_states:
        test_silent.append(s); seen_states.add(s['state'])
    if len(test_silent)>=4: break

test=[g['cand'] for g in test_gold]+[s['cand'] for s in test_silent]

split=dict(fewshot=FEWSHOT, test=test,
           test_gold=[g['cand'] for g in test_gold],
           test_silent=[s['cand'] for s in test_silent])
with open("data/eval/split.json","w") as f: json.dump(split,f,indent=2)

# build GT-for-test file (cells only; this is the answer key)
key={}
for c in test:
    key[c]={t:{k:gt[c][t][k] for k in ('stance','confidence','summary','sources','det','dir')}
            for t in common.TOPIC_ORDER if t in gt[c]}
with open("data/eval/answer_key.json","w") as f: json.dump(key,f,indent=2)

# report
def line(g): return f"  {g['cand']:22s} {g['state']:3s} {g['party'][:11]:11s} {g['seat']:8s} real={g['real']} nom={g['nom']} srcpos={g['srcpos']}"
print("FEW-SHOT (excluded from test):", FEWSHOT)
print(f"\nTEST gold ({len(test_gold)}):")
for g in test_gold: print(line(g))
print(f"\nTEST silent ({len(test_silent)}):")
for g in test_silent: print(line(g))
tot_real=sum(g['real'] for g in test_gold)
tot_nom=sum(g['nom'] for g in test_gold)+sum(s['nom'] for s in test_silent)
print(f"\nDETECTION denominators -> REAL(recall/FN)={tot_real}  NO-MENTION(precision/FP)={tot_nom}  total cells={(len(test))*10}")
