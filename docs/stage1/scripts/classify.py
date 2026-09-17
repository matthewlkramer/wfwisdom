import os, json, re, html, time, sys, urllib.request, concurrent.futures as cf
KEY=os.environ["OPENAI_API_KEY"]; MODEL="gpt-5.6-luna"
tax=json.load(open('taxonomy.json'))
subs=[(s['key'],j['name']+' > '+s['name']) for j in tax['jobs'] for s in j['subs']]
sub_keys=[k for k,_ in subs]
stage_keys=[s['key'] for s in tax['stages']]
def strip(h): return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',h or ''))).strip()
SYSTEM=f"""You classify items from Wildflower Schools' internal knowledge base (Connected) into a new taxonomy built for emerging school teams (teacher leaders opening a Montessori microschool).
Taxonomy sub-jobs (key: name):
{chr(10).join(f'- {k}: {n}' for k,n in subs)}
Stages: {', '.join(f"{s['key']} ({s['desc']})" for s in tax['stages'])}
Content types: {', '.join(tax['content_types'])}
Rules: primary must be the single best sub-job key. secondary lists 0-2 other sub-job keys where a team would also expect to find it. stages lists the stages where the item is relevant (1-5). Spanish translations are classified like their English topic. Coach/consultant profile pages go to help.*. Annual data reports, dated session notes, and press go to archive.* or foundation.data. outdated=true ONLY when the item is superseded by newer guidance, is a dated report/snapshot/session-notes for a past year, is COVID-era guidance, or announces a past event; an example letter or template that merely mentions an old school year is NOT outdated. Give a one-line reason when true. unplaceable=true only if no sub-job fits at all. Keep 'why' to one short sentence a reader would find useful ("Sample resolution for removing a director")."""
SCHEMA={"type":"object","additionalProperties":False,"required":["primary","secondary","stages","content_type","outdated","outdated_reason","unplaceable","why"],
 "properties":{"primary":{"type":"string","enum":sub_keys},"secondary":{"type":"array","items":{"type":"string","enum":sub_keys}},
  "stages":{"type":"array","items":{"type":"string","enum":stage_keys}},"content_type":{"type":"string","enum":tax['content_types']},
  "outdated":{"type":"boolean"},"outdated_reason":{"type":"string"},"unplaceable":{"type":"boolean"},"why":{"type":"string"}}}
def call(item):
    body={"model":MODEL,"reasoning":{"effort":"low"},"input":[{"role":"system","content":SYSTEM},{"role":"user","content":item['text']}],
          "text":{"format":{"type":"json_schema","name":"classification","strict":True,"schema":SCHEMA}}}
    req=urllib.request.Request("https://api.openai.com/v1/responses",data=json.dumps(body).encode(),headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
    for i in range(4):
        try:
            with urllib.request.urlopen(req,timeout=120) as r: d=json.loads(r.read())
            txt=next(c['text'] for o in d['output'] if o.get('type')=='message' for c in o['content'] if c.get('type')=='output_text')
            res=json.loads(txt); res['usage']=d.get('usage',{}); return res
        except urllib.error.HTTPError as e:
            msg=e.read().decode()[:300]; 
            if e.code in (400,401,403): return {"_error":msg}
            time.sleep(3*(i+1)); last=msg
        except Exception as e: time.sleep(3*(i+1)); last=str(e)
    return {"_error":last}
d=json.load(open('catalog_full.json'))
items=[]
for kind in ('post','series','question'):
    for p in d[kind].values():
        cats=[t['name_path'][-1] for t in (p.get('taxa') or []) if t['taxonomy_name']=='Category' and t['name']!='All Hubs']
        auds=[t['name'] for t in (p.get('taxa') or []) if t['taxonomy_name']=='Audience' and t['name']!='All Hubs']
        att=[c.get('original_file_name') or c.get('url') or '' for c in (p.get('contents') or []) if c['type'] in ('PreviewableDocument','WebLink','Video')]
        title=p.get('title') or p.get('name') or p.get('question') or ''
        body=strip(p.get('post_body') or p.get('explanation') or '')
        if kind=='question': body=' '.join(strip(a.get('text') or a.get('body') or '') for a in (p.get('answers') or []))
        text=(f"Kind: {kind}\nTitle: {title}\nCurrent Bloomfire categories: {'; '.join(cats)}\nAudience tags: {'; '.join(auds)}\n"
              f"Last updated: {p['updated_at'][:10]}  Views: {p.get('views_count')}\nDescription: {strip(p.get('description'))[:500]}\n"
              f"Body excerpt: {body[:1200]}\nAttachments: {'; '.join(att)[:300]}")
        items.append({"kind":kind,"id":p['id'],"title":title,"text":text})
limit=int(sys.argv[1]) if len(sys.argv)>1 else len(items)
items=items[:limit]
out={}; t0=time.time()
with cf.ThreadPoolExecutor(8) as ex:
    for n,(it,res) in enumerate(zip(items,ex.map(call,items)),1):
        out[f"{it['kind']}:{it['id']}"]={**{k:it[k] for k in ('kind','id','title')},**res}
        if n%50==0 or n==len(items): print(n,'/',len(items),round(time.time()-t0),'s',flush=True)
json.dump(out,open('classification.json' if limit==len(items) or limit>100 else 'classification_test.json','w'),indent=1)
errs=[v for v in out.values() if '_error' in v]; print('errors',len(errs),errs[:2])
tok=sum(v.get('usage',{}).get('total_tokens',0) for v in out.values()); print('total tokens',tok)
for v in list(out.values())[:5]: print(json.dumps({k:v[k] for k in v if k!='usage'})[:400])
