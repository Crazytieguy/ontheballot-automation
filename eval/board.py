import sys, json
sys.path.insert(0,'eval'); import score as S
def run(name, pred, key="data/eval/answer_key_large.json"):
    res,fn,fp=S.score(pred, key_path=key, verbose=False)
    row=dict(name=name, FNR=round(res['FNR']*100,1), recall=round(res['recall']*100,1),
             FP=res['FP'], FPR_raw=round(res['FPR']*100,1), prec=round(res['precision']*100,1),
             stance_acc=round((res['stance_dir_acc'] or 0)*100,1), TP=res['TP'], FN=res['FN'],
             real=res['real'], nom=res['nomention'])
    line=f"{name:28s} FNR={row['FNR']:5.1f}% (FN={row['FN']:>3}/{row['real']})  rec={row['recall']:5.1f}%  FP={row['FP']:>3} (raw FPR {row['FPR_raw']:4.1f}%)  stance={row['stance_acc']:5.1f}%"
    print(line)
    with open("data/eval/scoreboard.tsv","a") as f:
        f.write("\t".join(f"{k}={v}" for k,v in row.items())+"\n")
    return row, fn, fp
if __name__=="__main__":
    name=sys.argv[1]; pred=sys.argv[2]; key=sys.argv[3] if len(sys.argv)>3 else "data/eval/answer_key_large.json"
    run(name,pred,key)
