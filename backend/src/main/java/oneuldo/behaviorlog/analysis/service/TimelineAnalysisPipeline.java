package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import java.util.function.Function;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Every event is preserved by default; opt-in projections explicitly disclose their coverage. */
public final class TimelineAnalysisPipeline {
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(TimelineAnalysisPipeline.class);
    private final AiBehaviorAnalysisPromptFactory prompts;
    private final AiBehaviorAnalysisValidator validator;
    private final GroqChatClient client;
    private final ObjectMapper mapper;
    private final int maxChunks;
    private final AnalysisTokenBudget budget;
    private final AnalysisCallPacer pacer;
    private String model;
    private boolean movementDetailLimited;
    private int completedObservations;
    private int plannedObservations;
    private AnalysisCheckpoints checkpoints=AnalysisCheckpoints.NONE;
    public TimelineAnalysisPipeline withCheckpoints(AnalysisCheckpoints store) {checkpoints=store;return this;}
    private static final String RETRY = "\n구조와 실제 사건 참조를 수정하세요. JSON 하나만 출력하세요.";
    public TimelineAnalysisPipeline(AiBehaviorAnalysisPromptFactory p, AiBehaviorAnalysisValidator v, GroqChatClient c, ObjectMapper m) {
        this(p,v,c,m,64);
    }
    public TimelineAnalysisPipeline(AiBehaviorAnalysisPromptFactory p, AiBehaviorAnalysisValidator v, GroqChatClient c, ObjectMapper m,int max) {
        this(p,v,c,m,max,new AnalysisTokenBudget(),new AnalysisCallPacer());
    }
    public TimelineAnalysisPipeline(AiBehaviorAnalysisPromptFactory p, AiBehaviorAnalysisValidator v, GroqChatClient c, ObjectMapper m,
            int max, AnalysisTokenBudget b, AnalysisCallPacer pacer) {
        if (max < 1) throw new IllegalArgumentException("maxChunks must be positive");
        prompts=p;validator=v;client=c;mapper=m;maxChunks=max;budget=b;this.pacer=pacer;
    }
    public String model() { return model; }
    public List<BehaviorAnalysisInputResponse> partition(BehaviorAnalysisInputResponse input,int limit) {
        List<BehaviorAnalysisInputResponse> chunks=new ArrayList<>();
        var refs=new AnalysisReferences(mapper,input);
        int from=0;
        while(from<input.eventCount()) {
            if(chunks.size()>=maxChunks)throw new IllegalArgumentException("CHUNK_CALL_BUDGET_EXCEEDED");
            int low=from+1,high=input.eventCount(),best=from;
            while(low<=high) {
                int end=(low+high)/2;
                if(observationCost(slice(input,from,end),input,refs)<=limit) {best=end;low=end+1;}
                else high=end-1;
            }
            if(best==from)throw new IllegalArgumentException("SINGLE_EVENT_EXCEEDS_LIMIT: required="+observationCost(slice(input,from,from+1),input,refs)+", limit="+limit);
            chunks.add(slice(input,from,best));from=best;
        }
        return chunks;
    }
    private int observationCost(BehaviorAnalysisInputResponse part,BehaviorAnalysisInputResponse full,AnalysisReferences refs) {
        return budget.total(prompts.observationSystem(),refs.encode(observationPrompt(part,full))+suffix(maxChunks,maxChunks)+RETRY,budget.chunkOutputTokens())+200;
    }
    private String observationPrompt(BehaviorAnalysisInputResponse part,BehaviorAnalysisInputResponse full) {
        if(prompts.movementMaxError()==0) return prompts.observationPrompt(part,full);
        var projection=prompts.movementProjection(part);
        return prompts.projectedObservationPrompt(projection.visible(),full,projection,true);
    }
    private void split(BehaviorAnalysisInputResponse part,BehaviorAnalysisInputResponse full,int limit,
            List<BehaviorAnalysisInputResponse> out,AnalysisReferences refs) {
        if(out.size()>=maxChunks) throw new IllegalArgumentException("CHUNK_CALL_BUDGET_EXCEEDED");
        int required=observationCost(part,full,refs);
        if(required<=limit) {out.add(part);return;}
        if(part.eventCount()<=1) throw new IllegalArgumentException("SINGLE_EVENT_EXCEEDS_LIMIT: required="+required+", limit="+limit);
        int half=part.eventCount()/2;
        var events=part.input().sessions().stream().flatMap(s->s.events().stream()).toList();
        // Prefer an interaction boundary near the midpoint, protecting adjacent movement samples.
        for(int offset=0;offset<Math.max(1,events.size()/4);offset++) {
            int candidate=half+offset;
            if(candidate>0 && candidate<events.size() && events.get(candidate).action()!=null
                    && !"SHOP.MOVEMENT_SAMPLED".equals(events.get(candidate).action().eventCode())) {half=candidate;break;}
        }
        split(slice(part,0,half),full,limit,out,refs);split(slice(part,half,part.eventCount()),full,limit,out,refs);
    }
    private BehaviorAnalysisInputResponse select(BehaviorAnalysisInputResponse input,Set<UUID> ids) {
        List<BehaviorAnalysisInput.SessionTimeline> sessions=new ArrayList<>();
        int count=0;
        for(var s:input.input().sessions()) {
            var events=s.events().stream().filter(e->ids.contains(e.behaviorLogId())).toList();
            if(!events.isEmpty()) {sessions.add(new BehaviorAnalysisInput.SessionTimeline(s.sessionId(),s.startedAt(),s.endedAt(),s.integrity(),events));count+=events.size();}
        }
        var old=input.input();
        var data=new BehaviorAnalysisInput(old.schemaVersion(),old.datasetId(),old.generatedAt(),old.analysisWindow(),old.anonymousSubjectId(),sessions.size(),count,sessions);
        return new BehaviorAnalysisInputResponse(input.id(),input.schemaVersion(),input.generatedAt(),sessions.size(),count,data);
    }
    private BehaviorAnalysisInputResponse slice(BehaviorAnalysisInputResponse input,int from,int to) {
        var ids=input.input().sessions().stream().flatMap(s->s.events().stream()).skip(from).limit(to-from)
                .map(BehaviorAnalysisInput.EventTimeline::behaviorLogId).collect(java.util.stream.Collectors.toSet());
        return select(input,ids);
    }
    private record Group(BehaviorAnalysisInputResponse scope,AiObservationDigest digest) {}
    public AiBehaviorAnalysis analyze(BehaviorAnalysisInputResponse input,int limit,List<AiBehaviorAnalysisRun.Attempt> audit) {
        var refs=new AnalysisReferences(mapper,input);
        String whole=refs.encode(prompts.userPrompt(input));
        if(budget.total(prompts.systemPrompt(),whole+RETRY,budget.finalOutputTokens())+200<=limit) {
            AnalysisProgress.stage("FINALIZING",0,1);
            var result=call(prompts.systemPrompt(),whole,budget.finalOutputTokens(),limit,audit,raw->validator.validate(refs.read(raw),input));
            AnalysisProgress.stage("FINALIZING",1,1);return result;
        }
        var chunks=partition(input,limit);
        log.info("AI analysis partition: events={}, chunks={}",input.eventCount(),chunks.size());
        List<Group> groups=new ArrayList<>();
        plannedObservations=chunks.size();
        AnalysisProgress.stage("OBSERVING",0,plannedObservations);
        for(int i=0;i<chunks.size();i++) {
            var chunk=chunks.get(i);
            groups.addAll(observeBounded(chunk,input,refs,limit,audit));
        }
        while(true) {
            AnalysisProgress.stage("FINALIZING",completedObservations,plannedObservations);
            String finalPrompt=finalPrompt(input,groups,refs);
            String finalSystem=FinalAnalysisPromptCompactor.systemPrompt();
            log.info("AI final assembly: groups={}, reservedTokens={}, limit={}",groups.size(),budget.total(finalSystem,finalPrompt+RETRY,budget.finalOutputTokens()),limit);
            if(budget.total(finalSystem,finalPrompt+RETRY,budget.finalOutputTokens())<=limit)
                return call(finalSystem,finalPrompt,budget.finalOutputTokens(),limit,audit,
                        raw->validateFinal(refs.read(raw),input,finalPrompt));
            if(groups.size()<=1) {
                audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1,finalPrompt,null,"FINAL_EVIDENCE_EXCEEDS_LIMIT","PREFLIGHT",finalSystem,budget.finalOutputTokens(),null,null,null,0L));
                throw new IllegalArgumentException("FINAL_EVIDENCE_EXCEEDS_LIMIT");
            }
            AnalysisProgress.stage("REDUCING",completedObservations,plannedObservations);
            List<Group> reduced=new ArrayList<>();
            for(int i=0;i<groups.size();) {
                if(i+1==groups.size()) {reduced.add(groups.get(i));i++;continue;}
                int end=i+2;
                budget.requireFits(prompts.observationSystem(),mergePrompt(groups.subList(i,end),refs)+RETRY,budget.chunkOutputTokens(),limit,"REDUCE_INPUT_EXCEEDS_LIMIT");
                while(end<groups.size() && end-i<4 && budget.total(prompts.observationSystem(),mergePrompt(groups.subList(i,end+1),refs)+RETRY,budget.chunkOutputTokens())<=limit) end++;
                var pair=groups.subList(i,end);
                Set<UUID> covered=new HashSet<>();pair.forEach(g->g.scope.input().sessions().forEach(s->s.events().forEach(e->covered.add(e.behaviorLogId()))));
                var scope=select(input,covered);
                log.info("AI reduction batch: children={}",pair.size());
                var digest=call(prompts.observationSystem(),mergePrompt(pair,refs),budget.chunkOutputTokens(),limit,audit,
                        raw->{var value=refs.readDigest(raw);noRequests(value);return validator.validateReduction(value,scope,pair.stream().map(Group::digest).toList());});
                reduced.add(new Group(scope,digest));
                i=end;
            }
            groups=reduced;
        }
    }
    private List<Group> observeBounded(BehaviorAnalysisInputResponse chunk,BehaviorAnalysisInputResponse full,AnalysisReferences refs,
            int limit,List<AiBehaviorAnalysisRun.Attempt> audit) {
        try {
            var digest=observe(chunk,full,refs,completedObservations+1,plannedObservations,limit,audit);
            completedObservations++;AnalysisProgress.stage("OBSERVING",completedObservations,plannedObservations);
            return List.of(new Group(chunk,digest));
        } catch(IllegalStateException failure) {
            if(!"OUTPUT_TRUNCATED".equals(failure.getMessage()) || chunk.eventCount()<2 || plannedObservations>=maxChunks) throw failure;
            plannedObservations++;AnalysisProgress.stage("OBSERVING",completedObservations,plannedObservations);
            int half=chunk.eventCount()/2;
            var result=new ArrayList<Group>();
            result.addAll(observeBounded(slice(chunk,0,half),full,refs,limit,audit));
            result.addAll(observeBounded(slice(chunk,half,chunk.eventCount()),full,refs,limit,audit));
            return result;
        }
    }
    private AiObservationDigest observe(BehaviorAnalysisInputResponse chunk,BehaviorAnalysisInputResponse full,AnalysisReferences refs,
            int number,int total,int limit,List<AiBehaviorAnalysisRun.Attempt> audit) {
        var projection=prompts.movementProjection(chunk);
        var visible=projection.visible();
        log.info("AI movement observation: chunk={}/{}, sourceEvents={}, visibleEvents={}, simplifiedSegments={}, maxError={}",
                number,total,chunk.eventCount(),visible.eventCount(),projection.segments().size(),prompts.movementMaxError());
        String prompt=refs.encode(observationPrompt(chunk,full))+suffix(number,total);
        var digest=call(prompts.observationSystem(),prompt,budget.chunkOutputTokens(),limit,audit,raw->{
            var value=refs.readDigest(raw);
            projection.expand(value.requestedSegmentIds()); // reject fabricated/cross-session segment requests
            return validator.validateDigest(value,visible);
        });
        if(digest.requestedSegmentIds().isEmpty()) return disclose(digest,projection,visible);
        var expanded=projection.expand(digest.requestedSegmentIds());
        String detail=refs.encode(prompts.projectedObservationPrompt(expanded,full,projection,false))+suffix(number,total);
        if(budget.total(prompts.observationSystem(),detail+RETRY,budget.chunkOutputTokens())>limit || audit.size()+2>=maxChunks*2+1) {
            movementDetailLimited=true;
            var limits=new ArrayList<>(digest.uncertainties());limits.add("요청한 이동 원본은 추가 호출 예산을 초과하여 확인하지 못했습니다. 해당 세부 이동 해석은 보류해야 합니다.");
            // Do not retain unverified interpretations after the model explicitly requested missing evidence.
            return new AiObservationDigest("추가 원본 확인이 필요한 이동 구간",List.of(),limits);
        }
        var result=call(prompts.observationSystem(),detail,budget.chunkOutputTokens(),limit,audit,raw->{
            var value=refs.readDigest(raw);noRequests(value);return validator.validateDigest(value,expanded);
        });
        return disclose(result,projection,expanded);
    }
    private void noRequests(AiObservationDigest digest) {
        if(!digest.requestedSegmentIds().isEmpty()) throw new IllegalArgumentException("MOVEMENT_REQUEST_NOT_ALLOWED");
    }
    private AiObservationDigest disclose(AiObservationDigest digest,MovementProjection projection,BehaviorAnalysisInputResponse visible) {
        Set<UUID> ids=new HashSet<>();visible.input().sessions().forEach(s->s.events().forEach(e->ids.add(e.behaviorLogId())));
        long omitted=projection.segments().stream().flatMap(s->s.sourceEventIds().stream()).filter(id->!ids.contains(id)).count();
        if(omitted==0) return new AiObservationDigest(digest.summary(),digest.observations(),digest.uncertainties());
        movementDetailLimited=true;
        var limits=new ArrayList<>(digest.uncertainties());
        limits.add("이동 관측점 "+omitted+"개는 시간별 위치 오차 "+prompts.movementMaxError()+" 게임 좌표 단위 이내로 축약되었습니다. 생략된 미세 이동은 확인하지 않았습니다.");
        return new AiObservationDigest(digest.summary(),digest.observations(),limits);
    }
    private AiBehaviorAnalysis validateFinal(AiBehaviorAnalysis value,BehaviorAnalysisInputResponse input,String prompt) {
        validator.validate(value,input);
        if(!value.usedEvidenceCardIds().isEmpty())throw new IllegalArgumentException("FINAL_CARD_NOT_SUPPLIED");
        var root=new LosslessTables(mapper).decode(mapper.readTree(prompt));
        Set<String> supplied=new HashSet<>();
        root.path("evidenceReferences").forEach(e->supplied.add(e.path("id").asString()));
        var refs=new AnalysisReferences(mapper,input);
        Set<UUID> citations=new HashSet<>();
        value.findings().forEach(f->citations.addAll(f.evidenceEventIds()));
        value.sessionAssessments().forEach(s->citations.addAll(s.evidenceEventIds()));
        for(UUID id:citations) {
            String alias=mapper.readTree(refs.encode(mapper.writeValueAsString(Map.of("id",id)))).path("id").asString();
            if(!supplied.contains(alias)) throw new IllegalArgumentException("FINAL_EVIDENCE_NOT_SUPPLIED");
        }
        boolean limited=root.path("movementDetailLimited").asBoolean();
        if(limited) {
            var limits=new ArrayList<>(value.uncertainties());
            limits.add("일부 이동점은 허용 오차 내 축약되었거나 추가 원본 확인이 제한되었습니다. 미확인 세부 이동은 판단 근거로 확정할 수 없습니다.");
            value=new AiBehaviorAnalysis(value.summary(),value.findings(),value.sessionAssessments(),limits,value.practicePlan(),value.usedEvidenceCardIds());
        }
        return validator.validate(value,input);
    }
    private String mergePrompt(List<Group> groups,AnalysisReferences refs) {
        ObjectNode merge=mapper.createObjectNode();
        merge.put("stage","REDUCE: 구간 AI 해석을 시간순으로 통합하라. 사실·가설·반증·불확실성과 근거 ID를 유지하라. 다수결·성공률을 계산하지 말고 원문 미확인 추측을 사실로 바꾸지 말라.");
        merge.set("chunkAnalyses",mapper.valueToTree(groups.stream().map(Group::digest).toList()));
        merge.put("outputContract",prompts.reductionContract());
        return refs.encode(mapper.writeValueAsString(merge));
    }
    private String finalPrompt(BehaviorAnalysisInputResponse input,List<Group> groups,AnalysisReferences refs) {
        return AnalysisSynthesisPrompt.build(mapper,prompts,input,groups.stream().map(Group::digest).toList(),refs,movementDetailLimited);
    }
    private static String suffix(int n,int count) {return "\n구간 "+n+"/"+count+": 세션 일부이며 구간 밖 행동을 가정하지 마세요.";}
    private <T> T call(String system,String prompt,int output,int limit,List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,T> parse) {
        budget.requireFits(system,prompt+RETRY,output,limit,"ANALYSIS_INPUT_EXCEEDS_LIMIT");
        var cached=checkpoints.find(system,prompt,output);
        if(cached.isPresent()) {
            var response=cached.get();
            try {
                T result=parse.apply(response.text());
                if("length".equals(response.finishReason())) throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                model=response.model();audit.add(attempt(audit.size()+1,system,prompt,output,response,null,"CHECKPOINT"));return result;
            } catch(RuntimeException invalid) {log.warn("Ignoring checkpoint that fails current validation");}
        }
        String correction="", lastFailure="INVALID_AI_ANALYSIS";
        for(int attempt=0;attempt<2;attempt++) {
            if(audit.size()>=maxChunks*2+1) throw new IllegalArgumentException("TOTAL_CALL_BUDGET_EXCEEDED");
            String submitted=prompt+(attempt==0?"":RETRY+correction),raw=null;
            budget.requireFits(system,submitted,output,limit,"ANALYSIS_INPUT_EXCEEDS_LIMIT");
            GroqChatClient.GroqChatResult response=null;
            T result;
            try {
                long started=System.nanoTime();
                log.info("AI analysis request: attempt={}, inputTokens={}, outputMax={}",audit.size()+1,QwenTokenCounter.inputTokens(system,submitted),output);
                response=client.complete(system,submitted,output,0.2);raw=response.text();model=response.model();
                if("length".equals(response.finishReason())) throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                result=parse.apply(raw);
                log.info("AI analysis response: attempt={}, latencyMs={}",audit.size()+1,(System.nanoTime()-started)/1000000);
            } catch(RuntimeException failure) {
                String error=failure instanceof oneuldo.ai.exception.CloudAiRateLimitException?"AI_RATE_LIMITED":raw==null?"AI_UNAVAILABLE":"INVALID_AI_ANALYSIS";
                audit.add(attempt(audit.size()+1,system,submitted,output,response,error,"LIVE"));
                if(raw==null) throw new IllegalStateException(error,failure);
                String reason=failure.getMessage();
                lastFailure="OUTPUT_TRUNCATED".equals(reason)?reason:"INVALID_AI_ANALYSIS";
                correction="\n재시도: 서로 다른 관찰과 근거·불확실성을 유지하고 중복 표현을 줄이세요. JSON을 끝까지 닫으세요. 검사 오류: "+(reason!=null&&reason.matches("[A-Z0-9_:= .-]{1,120}")?reason:"INVALID_JSON_OR_CONTRACT")+". 해당 오류를 수정하고 근거 없는 내용을 추가하지 마세요.";
                continue;
            }
            audit.add(attempt(audit.size()+1,system,submitted,output,response,null,"LIVE"));
            checkpoints.save(system,prompt,output,response);
            return result;
        }
        throw new IllegalStateException(lastFailure);
    }
    private AiBehaviorAnalysisRun.Attempt attempt(int number,String system,String prompt,int output,GroqChatClient.GroqChatResult response,String error,String source) {
        return new AiBehaviorAnalysisRun.Attempt(number,prompt,response==null?null:response.text(),error,source,system,output,
                response==null?null:response.finishReason(),response==null?null:response.inputTokens(),response==null?null:response.outputTokens(),
                "CHECKPOINT".equals(source)?Long.valueOf(0):response==null?null:response.latencyMs());
    }
}
