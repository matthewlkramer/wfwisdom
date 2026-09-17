import os, json, sys, time, urllib.request
KEY=os.environ["OPENAI_API_KEY"]; MODEL=sys.argv[1] if len(sys.argv)>1 else "gpt-5.6-sol"; EFFORT=sys.argv[2] if len(sys.argv)>2 else "medium"
base=open('prompts/base.md').read(); types=json.load(open('prompts/types.json'))
cat=json.load(open('catalog_full.json'))['post']
LINKS={"landlord_letter":[4583329,5589224,4529451,4807564,4915175,4583411,4530868],
       "enrollment_email":[4656623,4657338,4531030,4473006,6066353,4531171,4657368],
       "tuition_policy":[4396562,4639886,5394462,4697236,4697237,4560242,4425988]}
SCHEMA={"type":"object","additionalProperties":False,
 "required":["verdict","summary","rubric","strengths","priority_changes","line_notes","example_rewrites","questions_for_writer","verify_with_humans","recommended_resources","nits"],
 "properties":{
  "verdict":{"type":"string","enum":["Ready to use","Nearly ready","Needs significant work"]},
  "summary":{"type":"string","description":"2-4 sentences addressed to the writer"},
  "rubric":{"type":"array","items":{"type":"object","additionalProperties":False,"required":["criterion","score","note"],"properties":{"criterion":{"type":"string"},"score":{"type":"integer","minimum":1,"maximum":5},"note":{"type":"string"}}}},
  "strengths":{"type":"array","items":{"type":"string"}},
  "priority_changes":{"type":"array","items":{"type":"object","additionalProperties":False,"required":["what","why","how"],"properties":{"what":{"type":"string"},"why":{"type":"string"},"how":{"type":"string"}}}},
  "line_notes":{"type":"array","items":{"type":"object","additionalProperties":False,"required":["quote","note"],"properties":{"quote":{"type":"string"},"note":{"type":"string"}}}},
  "example_rewrites":{"type":"array","maxItems":2,"items":{"type":"object","additionalProperties":False,"required":["original","rewrite","why"],"properties":{"original":{"type":"string"},"rewrite":{"type":"string"},"why":{"type":"string"}}}},
  "questions_for_writer":{"type":"array","items":{"type":"string"}},
  "verify_with_humans":{"type":"array","items":{"type":"string"},"description":"legal, financial, licensing or tax claims to verify with Ops Guide, attorney or accountant"},
  "recommended_resources":{"type":"array","items":{"type":"object","additionalProperties":False,"required":["title","url","why"],"properties":{"title":{"type":"string"},"url":{"type":"string"},"why":{"type":"string"}}}},
  "nits":{"type":"array","items":{"type":"string"}}}}
def build(tkey):
    t=types[tkey]
    res="\n".join(f"- {cat[str(i)]['title']} — {cat[str(i)]['url']}" for i in LINKS[tkey])
    rubric="\n".join(f"{n+1}. {c}: {d}" for n,(c,d) in enumerate(t['rubric']))
    return f"""{base}

=== Material type: {t['name']} ===
What good looks like (the standard for this type):
{t['guide']}

Rubric for this type (score each 1-5):
{rubric}

Reviewer notes for this type:
{t['prompt_notes']}

Connected resources you may recommend (only these):
{res}
"""
def review(tkey, draft):
    body={"model":MODEL,"reasoning":{"effort":EFFORT},"max_output_tokens":6000,
          "input":[{"role":"system","content":build(tkey)},{"role":"user","content":f"Here is the draft submitted as a '{types[tkey]['name']}'. Review it.\n\n---\n{draft}\n---"}],
          "text":{"format":{"type":"json_schema","name":"review","strict":True,"schema":SCHEMA}}}
    req=urllib.request.Request("https://api.openai.com/v1/responses",data=json.dumps(body).encode(),headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
    t0=time.time()
    with urllib.request.urlopen(req,timeout=600) as r: d=json.loads(r.read())
    txt=next(c['text'] for o in d['output'] if o.get('type')=='message' for c in o['content'] if c.get('type')=='output_text')
    return {"review":json.loads(txt),"usage":d.get('usage'),"seconds":round(time.time()-t0,1),"model":MODEL,"effort":EFFORT}
out={}
for tkey,fn in [("landlord_letter","drafts/landlord_letter.md"),("enrollment_email","drafts/enrollment_email.md"),("tuition_policy","drafts/tuition_policy.md")]:
    try: out[tkey]=review(tkey,open(fn).read()); print(tkey,out[tkey]['seconds'],'s',out[tkey]['usage'],flush=True)
    except urllib.error.HTTPError as e: print(tkey,'HTTP',e.code,e.read().decode()[:500]); out[tkey]={"error":e.code}
json.dump(out,open(f'reviews_{MODEL}.json','w'),indent=1)
