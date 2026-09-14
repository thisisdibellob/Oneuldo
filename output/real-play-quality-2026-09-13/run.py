import base64,hashlib,hmac,json,time,datetime,urllib.request,urllib.error
from pathlib import Path
out=Path(__file__).parent
props={}
for l in Path('backend/local.properties').read_text().splitlines():
 if '=' in l and not l.lstrip().startswith('#'):
  k,v=l.split('=',1);props[k.strip()]=v.strip()
secret=props.get('security.jwt.secret',props.get('JWT_SECRET'))
assert secret and not secret.startswith('${'),'JWT configuration unavailable'
member='d26b0864-56c4-48d1-9613-5f68659c959e'; session='0be87806-79ea-49df-9f56-8dafe4ea50b4'
def enc(x):return base64.urlsafe_b64encode(x).rstrip(b'=')
now=int(time.time()); payload={'iss':'oneuldo','sub':member,'iat':now,'exp':now+7200,'token_type':'access'}
unsigned=enc(b'{"alg":"HS256"}')+b'.'+enc(json.dumps(payload).encode());token=(unsigned+b'.'+enc(hmac.new(base64.b64decode(secret),unsigned,hashlib.sha256).digest())).decode()
def req(path,data=None):
 r=urllib.request.Request('http://127.0.0.1:8080'+path,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+token})
 with urllib.request.urlopen(r,timeout=60) as x:return json.load(x)
r={'sessionId':session,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Latest completed real play via actual backend analysis job API'}
def save(): (out/'result.json').write_text(json.dumps(r,ensure_ascii=False,indent=2))
t=time.monotonic()
try:
 r['receipt']=req('/api/behavior-analyses/sessions/'+session+'/receipt')
 r['job']=req('/api/analysis-jobs/sessions/'+session,{})
 print('Submitted '+r['job']['id'],flush=True);save()
 for i in range(240):
  r['job']=req('/api/analysis-jobs/'+r['job']['id']);r['elapsedSeconds']=round(time.monotonic()-t,2);save()
  if i%3==0:print(str(r['elapsedSeconds'])+'s '+r['job']['status']+' '+r['job']['stage']+' '+str(r['job']['completed'])+'/'+str(r['job']['total']),flush=True)
  if r['job']['status'] in ['READY','FAILED','CANCELLED']:
   if r['job'].get('analysisId'):r['analysis']=req('/api/behavior-analyses/'+r['job']['analysisId'])
   r['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print('FINAL '+r['job']['status'],flush=True);break
  time.sleep(15)
 else:r['status']='POLL_TIMEOUT';save()
except Exception as e:
 r['error']=type(e).__name__
 if isinstance(e,urllib.error.HTTPError):r['httpStatus']=e.code;r['detail']=e.read().decode()[:1500]
 save();print('ERROR '+type(e).__name__,flush=True)
