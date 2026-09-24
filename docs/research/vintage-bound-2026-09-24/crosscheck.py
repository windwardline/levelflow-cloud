# Independent re-implementation for two symbols (no code shared with vintage_bound.py),
# compared with vintage_bound's own functions.
import os, json, sys
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
R=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','..'))
def indep(sym, zone='America/New_York'):
    z=ZoneInfo(zone)
    seen={}
    for line in open(f"{R}/.minute-bank/{sym.replace('^','%5E')}.jsonl"):
        if line.strip():
            r=json.loads(line); seen.setdefault(r['date'], r)
    ws=datetime(2026,8,4,tzinfo=timezone.utc); we=datetime(2026,8,26,tzinfo=timezone.utc)
    m={}
    for d,r in seen.items():
        u=datetime.strptime(d,'%Y-%m-%d %H:%M:%S').replace(tzinfo=z).astimezone(timezone.utc)
        if ws<=u<we: m[u]=r
    bank={}
    for u in m:
        b=u.replace(minute=u.minute-u.minute%5)
        if b in bank: continue
        ms=[m.get(b+timedelta(minutes=i)) for i in range(5)]
        if all(ms):
            bank[b]=(ms[0]['open'],max(x['high'] for x in ms),min(x['low'] for x in ms),ms[4]['close'])
    store=json.load(open(f"{R}/.calibration-cache/{sym}-5min-7000.rolling.json"))
    cache={}
    for it in store['items']:
        u=datetime.fromtimestamp(it['time']/1000,timezone.utc)
        if ws-timedelta(days=3)<=u<we: cache[u]=(it['open'],it['high'],it['low'],it['close'])
    del store
    ct=sorted(cache)
    out={}
    for k in (0.5,1.0,2.0):
        out[k]=[0,0,0.0]   # n, nonzero, sum d
    t=ws
    while t<we:
        if t.hour%4==0 and t.minute==0 and t in bank and t in cache:
            slots=[t+timedelta(minutes=5*j) for j in range(1,97)]
            slots=[s for s in slots if s<we]
            cp=[cache[s] for s in slots if s in cache]; bp=[bank[s] for s in slots if s in bank]
            if len(cp)>=90 and len(bp)>=90:
                prior=[s for s in ct if s<=t][-14:]
                atr=sum(cache[s][1]-cache[s][2] for s in prior)/14
                if atr>0:
                    for k in (0.5,1.0,2.0):
                        for side in (1,-1):
                            res=[]
                            for path,ref in ((bp,bank[t][3]),(cp,cache[t][3])):
                                u=k*atr; o=None
                                for (_,h,l,c) in path:
                                    hit_stop = (l<=ref-u) if side>0 else (h>=ref+u)
                                    hit_tgt = (h>=ref+u) if side>0 else (l<=ref-u)
                                    if hit_stop: o=-1.0; break
                                    if hit_tgt: o=1.0; break
                                if o is None: o=side*(path[-1][3]-ref)/u
                                res.append(o)
                            d=res[0]-res[1]
                            out[k][0]+=1; out[k][1]+=(d!=0); out[k][2]+=d
        t+=timedelta(hours=1)
    return out
sys.path.insert(0,'.')
import vintage_bound as vb, collections
for sym in sys.argv[1:]:
    a=indep(sym)
    minutes,_=vb.load_bank(sym); bb,_=vb.build_buckets(minutes)
    cb,_=vb.load_cache(sym)
    rows,_=vb.brackets_for(bb,cb,sorted(cb),lambda e:None)
    for k in (0.5,1.0,2.0):
        sel=[r for r in rows if r['k']==k]
        b=[len(sel), sum(1 for r in sel if r['ob']!=r['oc']), sum(r['ob']-r['oc'] for r in sel)]
        print(sym,k,'independent',a[k][0],a[k][1],round(a[k][2],6),'| script',b[0],b[1],round(b[2],6))
