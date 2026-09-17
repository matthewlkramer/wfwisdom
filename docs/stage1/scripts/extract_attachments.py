import json, io, time, urllib.request, concurrent.futures as cf, re
from pypdf import PdfReader
d=json.load(open('catalog_full.json'))
jobs=[]
for kind in ('post',):
    for p in d[kind].values():
        for c in p.get('contents') or []:
            if c['type'] in ('PreviewableDocument','Document') and c.get('content_url'):
                jobs.append((p['id'],c['id'],c['content_url'],c.get('original_file_name') or '', c.get('original_file_size') or 0))
print('jobs',len(jobs),flush=True)
def work(j):
    pid,cid,url,name,size=j
    try:
        with urllib.request.urlopen(url,timeout=120) as r: data=r.read()
        if data[:4]!=b'%PDF': return {'post_id':pid,'content_id':cid,'file':name,'error':'not pdf','bytes':len(data)}
        rd=PdfReader(io.BytesIO(data)); pages=len(rd.pages)
        txt='\n'.join((pg.extract_text() or '') for pg in rd.pages[:60])
        txt=re.sub(r'[ \t]+',' ',txt); txt=re.sub(r'\n{3,}','\n\n',txt).strip()
        return {'post_id':pid,'content_id':cid,'file':name,'pages':pages,'chars':len(txt),'text':txt[:60000]}
    except Exception as e: return {'post_id':pid,'content_id':cid,'file':name,'error':str(e)[:200]}
out=[]; t0=time.time()
with cf.ThreadPoolExecutor(6) as ex:
    for n,res in enumerate(ex.map(work,jobs),1):
        out.append(res)
        if n%25==0: print(n,'/',len(jobs),round(time.time()-t0),'s',flush=True)
json.dump(out,open('attachment_text.json','w'))
print('done; errors',sum('error' in o for o in out),'total chars',sum(o.get('chars',0) for o in out))
