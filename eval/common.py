"""Shared eval utilities: loading GT, stance normalization, detection labels."""
import csv, json, os
from collections import defaultdict

CSV="data/csv"
NOMENTION={'No mention','No Mention','No-Mention','no mention'}

def load_csv(name):
    with open(f"{CSV}/{name}.csv") as f: return list(csv.DictReader(f))

def detection_label(stance):
    """Collapse a GT stance string to one of: real | nomention | blank."""
    s=(stance or '').strip()
    if s=='' : return 'blank'
    if s in NOMENTION: return 'nomention'
    return 'real'

def stance_direction(stance):
    """Normalize a stance string to a coarse direction for the secondary metric."""
    s=(stance or '').strip().lower()
    if s in (n.lower() for n in NOMENTION) or s=='': return 'none'
    if s=='unclear': return 'unclear'
    if s=='mixed': return 'mixed'
    if s.startswith('support'): return 'support'
    if s.startswith('oppose'):  return 'oppose'
    return 'other'

def load_ground_truth():
    """Return {cand: {topic: {stance,confidence,summary,sources:[url],det,dir}}}."""
    pos=load_csv("positions_v2"); src=load_csv("sources")
    sby=defaultdict(list)
    for s in src: sby[s['positionId'].strip()].append(s['url'].strip())
    gt=defaultdict(dict)
    for p in pos:
        c=p['candidateId'].strip(); t=p['topicId'].strip()
        if not c or not t: continue
        pid=p['id'].strip()
        gt[c][t]=dict(stance=p['stance'].strip(), confidence=p['confidence'].strip(),
                      summary=(p['summary'] or '').strip(), sources=sby.get(pid,[]),
                      det=detection_label(p['stance']), dir=stance_direction(p['stance']),
                      pid=pid)
    return gt

def load_topics():
    return {t['id'].strip(): t for t in load_csv("topics") if t['id'].strip()}

def load_candidates():
    return {c['id'].strip(): c for c in load_csv("candidates") if c['id'].strip()}

TOPIC_ORDER=['export-control','military-ai','regulation-philosophy','companion-chatbots',
             'children-safety','data-centers','jobs-workforce','deepfakes-fraud',
             'AI-preemption','intellectual-property']
