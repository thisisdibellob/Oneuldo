import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
const root = resolve(import.meta.dirname, '..');
const read = p => readFileSync(resolve(root,p), 'utf8');
const properties = Object.fromEntries(read('backend/local.properties').split(/\r?\n/).filter(l=>l.trim()&&!l.trim().startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const key = process.env.GROQ_API_KEY || properties.GROQ_API_KEY;
if (!key) throw new Error('GROQ_API_KEY unavailable');
const model = process.env.GROQ_MODEL || properties.GROQ_MODEL || 'qwen/qwen3.6-27b';
const source = read('backend/src/main/java/oneuldo/behaviorlog/analysis/service/AiBehaviorAnalysisPromptFactory.java');
const system = source.match(/public String systemPrompt\(\)\s*\{\s*return """([\s\S]*?)""";/)[1].split('\n').map(l=>l.trim()).join('\n');
const cases = JSON.parse(read('shared/evidence/synthetic-cases.json'));
const reviews = JSON.parse(read('shared/evidence/review.json'));
const approved = reviews.cards.filter(c=>c.status==='DEVELOPMENT_APPROVED').map(c=>c.cardId);
const cards = JSON.parse(read('shared/evidence/candidates.json')).filter(c=>approved.includes(c.card_id));
const results=[];
mkdirSync(resolve(root,'tmp/phase6'),{recursive:true});
const path=resolve(root,'tmp/phase6/live-responses.json');
for (const c of cases) {
  const sessionId = '60000000-0000-4000-8000-' + c.case_id.slice(1).padStart(12,'0');
  const eventId = '61000000-0000-4000-8000-' + c.case_id.slice(1).padStart(12,'0');
  const input = {
    evaluationOnly:true, synthetic:true, evidenceCards:cards,
    behaviorTimeline:{sessions:[{sessionId,events:[{behaviorLogId:eventId,sequence:1,
      observation:c.observation_ko, knownConditions:c.known_conditions_ko}]}]},
    practiceCapabilities:'Only S01/S02 or CUSTOM 2-4 items, difficulty 1-3; short text, list reminder, pause. No diagnosis or actual payment.',
    outputContract:{summary:'관찰 요약', findings:[{id:'F1',skill:'관찰 영역',observation:'관찰',interpretation:'가설',
      alternativeExplanations:['대안'],evidenceEventIds:[eventId],suggestedSupport:'가능한 지원'}],
      sessionAssessments:[{sessionId,judgment:'SUCCESS|FAILURE|UNDETERMINED',explanation:'원사건의 충분성을 판단; 부족하면 보류',evidenceEventIds:[eventId]}],
      uncertainties:['한계'],practicePlan:{targetFindingIds:['F1'],goal:'연습 목표',rationale:'이유',recommendedDifficulty:2,itemCount:2,
        quantityComplexity:'LOW',budgetPressure:'LOW',textSupport:'SIMPLIFIED',reasonCodes:['OBSERVATION_PRACTICE']},
      usedEvidenceCardIds:['사용한 제공 카드 ID; 미사용이면 빈 배열']},
  };
  const prompt=JSON.stringify(input), start=Date.now();
  let response;
  try { response=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:prompt}],
      max_completion_tokens:1800,temperature:0.2,top_p:0.8,reasoning_effort:'none',reasoning_format:'hidden',stream:false}),
    signal:AbortSignal.timeout(30000),
  }); } catch { console.log(c.case_id+' network/timeout; stopped'); break; }
  if (!response.ok) { console.log(c.case_id+' HTTP '+response.status+'; stopped without retry'); break; }
  const body=await response.json(), raw=body.choices?.[0]?.message?.content;
  let analysis=null; try { analysis=JSON.parse(raw); } catch {}
  const used=analysis?.usedEvidenceCardIds ?? [];
  const row={caseId:c.case_id,synthetic:true,model:body.model,latencyMs:Date.now()-start,usage:body.usage,
    promptHash:createHash('sha256').update(system+prompt).digest('hex'),systemPrompt:system,inputPrompt:prompt,
    rawOutput:raw,analysis,mechanicalChecks:{jsonObject:!!analysis,
      citations:used.every(id=>approved.includes(id)),
      eventReferences:!!analysis&&[...(analysis.findings??[]),...(analysis.sessionAssessments??[])].every(f=>
        Array.isArray(f.evidenceEventIds)&&f.evidenceEventIds.length>0&&f.evidenceEventIds.every(id=>id===eventId)),
      sessionReferences:analysis?.sessionAssessments?.length===1&&analysis.sessionAssessments[0].sessionId===sessionId},
    expertValidated:false};
  results.push(row); writeFileSync(path,JSON.stringify(results,null,2)+'\n');
  console.log(c.case_id+' '+row.latencyMs+'ms '+JSON.stringify(row.mechanicalChecks));
  await setTimeout(2200);
}
console.log(JSON.stringify({completed:results.length,total:24,productionApproved:false,output:'tmp/phase6/live-responses.json'}));

