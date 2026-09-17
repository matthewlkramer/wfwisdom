import os, json, re, html, time, urllib.request, urllib.parse, concurrent.futures as cf
KEY=os.environ["OPENAI_API_KEY"]; TOK=open('bf_session_token').read().strip()
B="https://connected.wildflowerschools.org/api/v2"
PRICE={"gpt-5.6-sol":(4,20),"gpt-5.6-terra":(2,12),"gpt-5.6-luna":(0.2,1.2)}
cat=json.load(open('catalog_full.json'))['post']
att={}
for a in json.load(open('attachment_text.json')):
    if a.get('text'): att.setdefault(a['post_id'],[]).append(a['text'])
def strip(h): return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',h or ''))).strip()
def text_of(pid, n=1500):
    p=cat[str(pid)]; t=strip(p['description'])+' '+strip(p['post_body'])
    for a in att.get(int(pid),[]): t+=' '+a
    return re.sub(r'\s+',' ',t)[:n]
def bf_search(q,n=5):
    req=urllib.request.Request(f"{B}/search?query={urllib.parse.quote(q)}&page_size=10",headers={"Authorization":f"Bloomfire-Session-Token {TOK}"})
    with urllib.request.urlopen(req,timeout=60) as r: d=json.loads(r.read())
    ids=[x['instance']['id'] for x in d if x.get('type')=='post' and str(x['instance']['id']) in cat]
    return ids[:n]
QUERIES=["where do i even start looking for a space for my school","how do we get 501c3 status","how should we set our tuition levels"]
CHATQ=[("What are the requirements to get a lease guaranty from the Foundation?",None),("Do I need a liquor license to serve wine at a fundraiser?",None)]
def call(model, system, user, effort="low", max_out=800):
    body={"model":model,"reasoning":{"effort":effort},"max_output_tokens":max_out,"input":[{"role":"system","content":system},{"role":"user","content":user}]}
    req=urllib.request.Request("https://api.openai.com/v1/responses",data=json.dumps(body).encode(),headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
    t0=time.time()
    for i in range(3):
        try:
            with urllib.request.urlopen(req,timeout=300) as r: d=json.loads(r.read())
            txt=''.join(c['text'] for o in d['output'] if o.get('type')=='message' for c in o['content'] if c.get('type')=='output_text')
            u=d['usage']; cost=(u['input_tokens']*PRICE[model][0]+u['output_tokens']*PRICE[model][1])/1e6
            return {"text":txt.strip(),"seconds":round(time.time()-t0,1),"in":u['input_tokens'],"out":u['output_tokens'],"cost":round(cost,5)}
        except Exception as e: err=str(e); time.sleep(2)
    return {"text":"ERROR "+err,"seconds":0,"in":0,"out":0,"cost":0}
REWRITE="You rewrite a teacher leader's search query for Wildflower Schools' knowledge base (Connected) into a precise search query plus 3 to 6 keywords. Expand Wildflower shorthand (SSJ = School Startup Journey, TL = teacher leader, ETL = emerging teacher leader, ops guide, hub, flexible tuition, 501c3). Return JSON: {\"query\": string, \"keywords\": [string], \"job\": one of [understand, nonprofit, board, fund, finance, space, license, market, enroll, team, culture, systems, program, help]}. No prose."
EXPLAIN="Write one sentence (max 22 words) telling a teacher leader why this Connected item matches their search. Be concrete about what the item contains. No preamble, no quotes around it."
SUMMARY="Write a 2-sentence plain-language summary of this Connected item for a teacher leader deciding whether to open it: what it is, and what they would use it for. No marketing tone."
CHAT="You answer a teacher leader's question using ONLY the Connected passages provided. Cite each item you rely on as [title]. If the passages do not cover the question, say plainly that Connected does not cover it and suggest who to ask (Operations Guide, support@wildflowerschools.org). Keep it under 150 words."
retrieved={q:bf_search(q) for q in QUERIES}
chat_ctx={}
for q,_ in CHATQ:
    ids=bf_search(q,5); chat_ctx[q]=[(cat[str(i)]['title'],text_of(i,1200)) for i in ids]
SUMMARY_IDS=[4807564,4396562,4732858]
jobs=[]
for m in PRICE:
    for q in QUERIES:
        jobs.append((m,"rewrite",q,REWRITE,q))
        for pid in retrieved[q]:
            jobs.append((m,"explain",f"{q} || {cat[str(pid)]['title']}",EXPLAIN,f"Search: {q}\n\nItem title: {cat[str(pid)]['title']}\nItem text: {text_of(pid,900)}"))
    for pid in SUMMARY_IDS: jobs.append((m,"summary",cat[str(pid)]['title'],SUMMARY,f"Title: {cat[str(pid)]['title']}\n\n{text_of(pid,2500)}"))
    for q,_ in CHATQ:
        ctx="\n\n".join(f"### {t}\n{x}" for t,x in chat_ctx[q]); jobs.append((m,"chat",q,CHAT,f"Question: {q}\n\nConnected passages:\n{ctx}"))
print("jobs",len(jobs),flush=True)
out=[]
with cf.ThreadPoolExecutor(6) as ex:
    for (m,kind,label,sysm,user),res in zip(jobs,ex.map(lambda j: call(j[0],j[3],j[4]),jobs)):
        out.append({"model":m,"kind":kind,"label":label,**res})
json.dump({"retrieved":{q:[cat[str(i)]['title'] for i in ids] for q,ids in retrieved.items()},"results":out},open('model_compare.json','w'),indent=1)
import collections
agg=collections.defaultdict(lambda:[0,0.0,0.0])
for r in out: a=agg[(r['model'],r['kind'])]; a[0]+=1; a[1]+=r['seconds']; a[2]+=r['cost']
for k,(n,s,c) in sorted(agg.items()): print(f"{k[0]:14} {k[1]:8} n={n:2d} avg_s={s/n:5.1f} avg_cost=${c/n:.5f}")
