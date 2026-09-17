import os, json, time, urllib.request, urllib.parse, concurrent.futures as cf
B="https://connected.wildflowerschools.org/api/v2"
TOK=open("bf_session_token").read().strip()
PERSON="id,first_name,last_name,profile_url"
CONTENT=("contents(id,type,media_type,publish_state,title,description,original_file_name,text_body,content_url,"
         "api_download_url,can_download,original_content_type,original_file_size,has_audio_transcript,"
         "audio_transcript(id,transcript,job_status),url,code_language,created_at,updated_at)")
POST_F=("id,name,title,description,path,edit_url,contribution_type,public,published,featured,expired,read_only,"
        f"author({PERSON}),authors({PERSON}),keywords(id,name),categories(id,name),series(id,title),"
        f"{CONTENT},comments(id,comment,created_at,updated_at,likes_count,author({PERSON}),comments(id,comment,created_at,author({PERSON}))),"
        "likes_count,views_count,popularity,followers_count,comments_count,contents_count,published_at,updated_at,created_at,"
        "latest_event(status),organizations_published_in(id,name),post_body,publish_state,url,viewers_count,display_metadata,taxa(name,id,id_path,name_path,taxonomy_id,taxonomy_name)")
SERIES_F=(f"id,name,title,description,path,author({PERSON}),categories(id,name),keywords(id,name),posts(id,title),questions(id),series(id,title),"
          "likes_count,views_count,popularity,followers_count,comments_count,posts_count,published_at,updated_at,created_at,public,published,featured,post_body,url,viewers_count,taxa(name,id,id_path,name_path,taxonomy_id,taxonomy_name)")
Q_F=(f"id,name,question,description,explanation,path,author({PERSON}),categories(id,name),keywords(id,name),accepted(id),"
     f"answers(id,text,body,created_at,likes_count,author({PERSON})),comments(id,comment,created_at,author({PERSON})),"
     "likes_count,views_count,popularity,followers_count,answers_count,published_at,updated_at,created_at,series(id,title),post_body,url,taxa(name,id,id_path,name_path,taxonomy_id,taxonomy_name)")
def get(path, fields, tries=4):
    req=urllib.request.Request(B+path, headers={"Authorization":f"Bloomfire-Session-Token {TOK}","bloomfire-requested-fields":fields,"Accept":"application/json"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=90) as r: return json.loads(r.read())
        except Exception as e:
            err=e; time.sleep(2*(i+1))
    return {"_error":str(err),"_path":path}
posts=json.load(open("posts_all.json")); series=json.load(open("series_all.json")); qs=json.load(open("questions_all.json"))
jobs=[("post",p["id"],f"/posts/{p['id']}",POST_F) for p in posts]+[("series",s["id"],f"/series/{s['id']}",SERIES_F) for s in series]+[("question",q["id"],f"/questions/{q['id']}",Q_F) for q in qs]
out={"post":{},"series":{},"question":{}}
t0=time.time()
with cf.ThreadPoolExecutor(8) as ex:
    futs={ex.submit(get,path,f):(kind,i) for kind,i,path,f in jobs}
    for n,fut in enumerate(cf.as_completed(futs),1):
        kind,i=futs[fut]; out[kind][str(i)]=fut.result()
        if n%50==0: print(n,"/",len(jobs),round(time.time()-t0),"s",flush=True)
json.dump(out,open("catalog_full.json","w"))
errs=[v for k in out for v in out[k].values() if "_error" in v]
print("done",len(jobs),"errors",len(errs),errs[:3])
