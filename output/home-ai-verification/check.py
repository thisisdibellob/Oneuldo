import json,uuid,secrets,time,datetime,urllib.request,urllib.error
from pathlib import Path
out=Path(__file__).parent
base='http://127.0.0.1:8080'; token=None
report={'synthetic':True,'scope':'Real app backend HTTP APIs, not UI interaction','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
def save(): (out/'analysis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
def req(path,data=None):
 headers={'Content-Type':'application/json'}
 if token: headers['Authorization']='Bearer '+token
 r=urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers=headers)
 with urllib.request.urlopen(r,timeout=45) as res:
  b=res.read(); return json.loads(b) if b else None
try:
 tag=uuid.uuid4().hex[:12]; password=secrets.token_urlsafe(24); email=f'home-ai-check-{tag}@example.com'
 member=req('/api/members',dict(loginId='homecheck'+tag,name='서버연동 합성테스트',email=email,password=password,passwordConfirm=password,birthDate='2000-01-01'))
 login=req('/api/auth/login',dict(email=email,password=password)); token=login['accessToken']; report['memberId']=login['memberId']
 events=json.load(open('output/ollama-api-check/retest.json'))['events']; session=str(uuid.uuid4()); task=str(uuid.uuid4())
 now=datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(minutes=3)
 for i,e in enumerate(events):
  e['metadata']['clientEventId']=str(uuid.uuid4()); e['metadata']['occurredAt']=(now+datetime.timedelta(seconds=i*20)).isoformat();e['metadata']['appVersion']='synthetic-home-https-check'
  e['identity']['sessionId']=session;e['task']['taskId']=task;e['task']['scenarioVariant']='SYNTHETIC_HOME_HTTPS_TEST'
 report['sessionId']=session;report['events']=events
 report['ingestion']=req('/api/behavior-logs/batches',dict(batchId=str(uuid.uuid4()),events=events))
 report['receipt']=req('/api/behavior-analyses/sessions/'+session+'/receipt')
 started=time.monotonic(); job=req('/api/analysis-jobs/sessions/'+session,{});report['job']=job;save();print('Analysis submitted '+job['id'],flush=True)
 for i in range(160):
  job=req('/api/analysis-jobs/'+job['id']);report['job']=job;report['elapsedSeconds']=round(time.monotonic()-started,1);save()
  if job['status'] in ('READY','FAILED','CANCELLED'):
   if job.get('analysisId'):report['analysis']=req('/api/behavior-analyses/'+job['analysisId'])
   report['status']=job['status'];save();print('FINAL '+job['status']+' '+str(report['elapsedSeconds'])+' seconds',flush=True);break
  if i%3==0: print('Progress '+job['status']+' '+str(job.get('stage'))+' '+str(report['elapsedSeconds'])+'s',flush=True)
  time.sleep(15)
 else:report['status']='TIMEOUT';save()
except Exception as e:
 report['status']='ERROR';report['errorType']=type(e).__name__
 if isinstance(e,urllib.error.HTTPError):report['httpStatus']=e.code;report['response']=e.read().decode()[:2000]
 save(); print('ERROR '+type(e).__name__,flush=True);raise
