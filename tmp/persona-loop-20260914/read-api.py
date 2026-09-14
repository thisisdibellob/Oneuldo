import json,sys,pathlib,urllib.request,urllib.error
root=pathlib.Path(__file__).parent
account=json.loads((root/'account.json').read_text())
def req(path,data=None,token=None):
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']='Bearer '+token
    with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8080'+path,data=None if data is None else json.dumps(data).encode(),headers=headers),timeout=30) as r:
        raw=r.read();return json.loads(raw) if raw else None
login=req('/api/auth/login',{'email':account['email'],'password':account['password']})
path=sys.argv[1]
result=req(path,token=login['accessToken'])
if len(sys.argv)>2:
    (root/sys.argv[2]).write_text(json.dumps(result,ensure_ascii=False,indent=2))
if path.endswith('/current') and 'analysis-jobs' in path: print(json.dumps(result,ensure_ascii=False))
else:print(json.dumps({'saved':sys.argv[2] if len(sys.argv)>2 else False,'keys':list(result) if isinstance(result,dict) else type(result).__name__},ensure_ascii=False))
