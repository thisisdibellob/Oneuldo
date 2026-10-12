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
    private boolean qualityReview;
    public TimelineAnalysisPipeline withQualityReview(boolean enabled) {qualityReview=enabled;return this;}
    private boolean planSemanticReview;
    public TimelineAnalysisPipeline withPlanSemanticReview(boolean enabled) {planSemanticReview=enabled;return this;}
    private FinalAnalysisBudget.Estimate finalEstimate(String system,String source,AnalysisReferences refs) {
        return FinalAnalysisBudget.estimate(mapper,budget,system,source,refs,qualityReview,RETRY);
    }
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
        return partition(input,limit,new AnalysisReferences(mapper,input));
    }
    private List<BehaviorAnalysisInputResponse> partition(BehaviorAnalysisInputResponse input,int limit,AnalysisReferences refs) {
        List<BehaviorAnalysisInputResponse> chunks=new ArrayList<>();
        int from=0;
        while(from<input.eventCount()) {
            if(chunks.size()>=maxChunks)throw new IllegalArgumentException("CHUNK_CALL_BUDGET_EXCEEDED");
            // Bracket a fitting prefix locally. Starting every search at half of all
            // remaining events repeatedly encoded thousands of events for a small chunk.
            int best=from,remaining=input.eventCount()-from;
            int size=Math.min(remaining,chunks.isEmpty()?32:chunks.getLast().eventCount());
            int high;
            while(true) {
                int end=from+size;
                if(observationCost(slice(input,from,end),input,refs)>limit) {high=end-1;break;}
                best=end;
                if(end==input.eventCount()) {high=end;break;}
                size=(int)Math.min(remaining,(long)size*2);
            }
            int low=best+1;
            while(low<=high) {
                int end=(low+high)/2;
                if(observationCost(slice(input,from,end),input,refs)<=limit) {best=end;low=end+1;}
                else high=end-1;
            }
            if(best==from)throw new IllegalArgumentException("SINGLE_EVENT_EXCEEDS_LIMIT: required="+observationCost(slice(input,from,from+1),input,refs)+", limit="+limit);
            chunks.add(slice(input,from,best));from=best;
            AnalysisProgress.stage("PREPARING",from,input.eventCount());
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
        return analyze(input,limit,audit,new AnalysisReferences(mapper,input),null);
    }
    // Reuse the run's aliases and fingerprint prompt; never share user data across runs.
    AiBehaviorAnalysis analyze(BehaviorAnalysisInputResponse input,int limit,List<AiBehaviorAnalysisRun.Attempt> audit,
            AnalysisReferences refs,String preparedWhole) {
        // The school profile uses larger context; explicit 8K clients retain the older path.
        if(limit>8192) {
            String source=refs.encode(prompts.wholeSourcePrompt(input));
            if(finalEstimate(prompts.wholeSourceSystem(),source,refs).required()+200<=limit) {
                AnalysisProgress.stage("FINALIZING",0,1);
                var result=finalCall(prompts.wholeSourceSystem(),source,refs,limit,audit,raw->validator.validate(refs.read(raw),input));
                AnalysisProgress.stage("FINALIZING",1,1);return result;
            }
        }
        String whole=preparedWhole!=null?preparedWhole:refs.encode(prompts.userPrompt(input));
        if(finalEstimate(prompts.systemPrompt(),whole,refs).required()+200<=limit) {
            AnalysisProgress.stage("FINALIZING",0,1);
            var result=finalCall(prompts.systemPrompt(),whole,refs,limit,audit,raw->validator.validate(refs.read(raw),input));
            AnalysisProgress.stage("FINALIZING",1,1);return result;
        }
        var chunks=partition(input,limit,refs);
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
            var estimate=finalEstimate(finalSystem,finalPrompt,refs);
            log.info("AI final assembly: groups={}, draftRequestBudget={}, reviewRequestEstimate={}, required={}, limit={}",
                    groups.size(),estimate.draftRequest(),estimate.reviewRequest(),estimate.required(),limit);
            if(estimate.required()<=limit) {
                try {
                    return finalCall(finalSystem,finalPrompt,refs,limit,audit,
                            raw->validateFinal(refs.read(raw),input,finalPrompt));
                } catch(IllegalStateException failure) {
                    if(!"OUTPUT_TRUNCATED".equals(failure.getMessage()) || groups.size()<=1) throw failure;
                    log.info("AI final output truncated; reducing saved observations before retry");
                }
            }
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
                reduced.addAll(reduceBounded(groups.subList(i,end),input,refs,limit,audit));
                i=end;
            }
            groups=reduced;
        }
    }
    private List<Group> reduceBounded(List<Group> children,BehaviorAnalysisInputResponse input,AnalysisReferences refs,
            int limit,List<AiBehaviorAnalysisRun.Attempt> audit) {
        if(children.size()==1) return List.of(children.getFirst());
        Set<UUID> covered=new HashSet<>();
        children.forEach(g->g.scope.input().sessions().forEach(s->s.events().forEach(e->covered.add(e.behaviorLogId()))));
        var scope=select(input,covered);
        String prompt=mergePrompt(children,refs);
        try {
            log.info("AI reduction batch: children={}",children.size());
            return List.of(reduceOnce(children,scope,refs,prompt,limit,audit));
        } catch(IllegalStateException failure) {
            if(!"OUTPUT_TRUNCATED".equals(failure.getMessage())) throw failure;
            if(children.size()>2) {
                int middle=children.size()/2;
                log.info("AI reduction output truncated; splitting children={} into {}+{}",children.size(),middle,children.size()-middle);
                List<Group> result=new ArrayList<>(reduceBounded(children.subList(0,middle),input,refs,limit,audit));
                result.addAll(reduceBounded(children.subList(middle,children.size()),input,refs,limit,audit));
                return result;
            }
            // A pair cannot be split into smaller merges. Ask the model for a compact,
            // explicitly limited digest; never trim JSON or drop child inputs in Java.
            var brief=mapper.readTree(prompt).deepCopy();
            ((ObjectNode)brief).put("outputContract", prompts.reductionContract()
                    + " 핵심 관찰 1~2개로 줄이고 설명은 짧게 쓴다. 담지 못한 관찰은 uncertainties에 명시한다.");
            log.info("AI pair output truncated; retrying compact digest with both child inputs");
            return List.of(reduceOnce(children,scope,refs,mapper.writeValueAsString(brief),limit,audit));
        }
    }
    private Group reduceOnce(List<Group> children,BehaviorAnalysisInputResponse scope,AnalysisReferences refs,
            String prompt,int limit,List<AiBehaviorAnalysisRun.Attempt> audit) {
        var digest=callDigest(prompts.observationSystem(),prompt,budget.chunkOutputTokens(),limit,audit,
                raw->{var value=refs.readDigest(raw);noRequests(value);return validator.validateReduction(value,scope,children.stream().map(Group::digest).toList());});
        return new Group(scope,digest);
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
        var digest=callDigest(prompts.observationSystem(),prompt,budget.chunkOutputTokens(),limit,audit,raw->{
            var value=refs.readDigest(raw);
            projection.expand(value.requestedSegmentIds()); // reject fabricated/cross-session segment requests
            return validateDigestReferences(value,visible,refs);
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
        var result=callDigest(prompts.observationSystem(),detail,budget.chunkOutputTokens(),limit,audit,raw->{
            var value=refs.readDigest(raw);noRequests(value);return validateDigestReferences(value,expanded,refs);
        });
        return disclose(result,projection,expanded);
    }
    private void noRequests(AiObservationDigest digest) {
        if(!digest.requestedSegmentIds().isEmpty()) throw new IllegalArgumentException("MOVEMENT_REQUEST_NOT_ALLOWED");
    }
    private AiObservationDigest validateDigestReferences(AiObservationDigest value,BehaviorAnalysisInputResponse scope,AnalysisReferences refs) {
        try { return validator.validateDigest(value,scope); }
        catch(ReviewEvidenceException failure) {
            var encoded=mapper.readTree(refs.encode(mapper.writeValueAsString(failure.details())));
            List<String> aliases=new ArrayList<>();encoded.path("offendingIds").forEach(id->aliases.add(id.asString()));
            throw new ReviewEvidenceException(failure.details().code(),failure.details().path(),aliases);
        }
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
        var root=new FinalSourceEncoding(mapper).decode(mapper.readTree(prompt));
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
        var scopes=merge.putArray("chunkScopes");
        for(int i=0;i<groups.size();i++) {
            var scope=AnalysisSourceContext.coverage(mapper,groups.get(i).scope());scope.put("chunkAnalysisIndex",i);scopes.add(scope);
        }
        merge.put("scopeRule","각 한계는 해당 구간 범위에 한정한다. 다른 자식 구간에 기록이 있으면 그 원본 근거 ID로 확인하고 전체 미확인으로 확대하지 않는다.");
        merge.put("outputContract",prompts.reductionContract());
        return prompts.compactReductionPrompt(refs.encode(mapper.writeValueAsString(merge)));
    }
    private String finalPrompt(BehaviorAnalysisInputResponse input,List<Group> groups,AnalysisReferences refs) {
        return AnalysisSynthesisPrompt.build(mapper,prompts,input,groups.stream().map(Group::digest).toList(),refs,movementDetailLimited,
                groups.stream().map(Group::scope).toList());
    }
    private static String suffix(int n,int count) {return "\n구간 "+n+"/"+count+": 세션 일부이며 구간 밖 행동을 가정하지 마세요.";}
    private AiBehaviorAnalysis finalCall(String system,String prompt,AnalysisReferences refs,int limit,
            List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,AiBehaviorAnalysis> parse) {
        var draft=call(system,prompt,budget.finalOutputTokens(),limit,audit,parse);
        if(!qualityReview) return draft;
        AnalysisProgress.stage("REVIEWING",completedObservations,plannedObservations);
        String review=AnalysisReviewPrompt.build(mapper,prompt,draft,refs);
        return call(AnalysisReviewPrompt.system(),review,budget.finalOutputTokens(),limit,audit,
                raw->parse.apply(AnalysisReviewPrompt.reviewedCurrentAnalysis(mapper,raw,refs)),false,3);
    }
    private <T> T call(String system,String prompt,int output,int limit,List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,T> parse) {
        return call(system,prompt,output,limit,audit,parse,false);
    }
    private <T> T callDigest(String system,String prompt,int output,int limit,List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,T> parse) {
        return call(system,prompt,output,limit,audit,parse,true);
    }
    private <T> T call(String system,String prompt,int output,int limit,List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,T> parse,boolean digest) {
        return call(system,prompt,output,limit,audit,parse,digest,2);
    }
    private <T> T call(String system,String prompt,int output,int limit,List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,T> parse,boolean digest,int attempts) {
        budget.requireFits(system,prompt+RETRY,output,limit,"ANALYSIS_INPUT_EXCEEDS_LIMIT");
        var cached=checkpoints.find(system,prompt,output);
        // A draft checkpoint can be resumed. A final review checkpoint alone does not attest to the extra semantic gate.
        if(cached.isPresent() && !(planSemanticReview && system.equals(AnalysisReviewPrompt.system()))) {
            var response=cached.get();
            try {
                T result=parse.apply(response.text());
                if("length".equals(response.finishReason())) throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                model=response.model();audit.add(attempt(audit.size()+1,system,prompt,output,response,null,"CHECKPOINT"));return result;
            } catch(RuntimeException invalid) {log.warn("Ignoring checkpoint that fails current validation");}
        }
        String correction="", lastFailure="INVALID_AI_ANALYSIS";
        for(int attempt=0;attempt<attempts;attempt++) {
            if(audit.size()>=maxChunks*2+2+(qualityReview?3:0)+(planSemanticReview?3:0)) throw new IllegalArgumentException("TOTAL_CALL_BUDGET_EXCEEDED");
            String submitted=prompt+(attempt==0?"":RETRY+correction),raw=null;
            budget.requireFits(system,submitted,output,limit,"ANALYSIS_INPUT_EXCEEDS_LIMIT");
            GroqChatClient.GroqChatResult response=null;
            int recordedCandidate = -1;
            T result;
            long started=System.nanoTime();
            try {
                log.info("AI analysis request: attempt={}, inputTokens={}, outputMax={}",audit.size()+1,QwenTokenCounter.inputTokens(system,submitted),output);
                response=digest?client.completeDigest(system,submitted,output,0.2):client.complete(system,submitted,output,0.2);raw=response.text();model=response.model();
                if("length".equals(response.finishReason())) throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                result=parse.apply(raw);
                if (planSemanticReview && system.equals(AnalysisReviewPrompt.system())) {
                    recordedCandidate = audit.size();
                    audit.add(attempt(audit.size()+1, system, submitted, output, response, null, "LIVE"));
                    reviewPlanSource(prompt, raw, limit, audit);
                }
                log.info("AI analysis response: attempt={}, latencyMs={}",audit.size()+1,(System.nanoTime()-started)/1000000);
            } catch(RuntimeException failure) {
                var transport=failure instanceof oneuldo.ai.exception.AiTransportException t?t:null;
                var validation=failure instanceof ReviewEvidenceException e?e.details()
                        : failure instanceof AnalysisPlanSemanticReview.Rejected r ? r.details() : null;
                String error=failure instanceof oneuldo.ai.exception.AiInputLimitException?"INPUT_TOO_LARGE":transport!=null?transport.code().name():failure instanceof oneuldo.ai.exception.CloudAiRateLimitException?"AI_RATE_LIMITED":raw==null?"AI_UNAVAILABLE":"INVALID_AI_ANALYSIS";
                var failedAttempt = new AiBehaviorAnalysisRun.Attempt(recordedCandidate >= 0 ? recordedCandidate+1 : audit.size()+1,submitted,raw,error,"LIVE",system,output,
                        response==null?null:response.finishReason(),response==null?null:response.inputTokens(),
                        response==null?null:response.outputTokens(),(System.nanoTime()-started)/1_000_000,
                        transport==null?null:transport.details(),validation);
                if (recordedCandidate >= 0) audit.set(recordedCandidate, failedAttempt); else audit.add(failedAttempt);
                if(failure instanceof oneuldo.ai.exception.AiInputLimitException) throw failure;
                if(raw==null || transport != null) throw new IllegalStateException(error,failure);
                String reason=failure.getMessage();
                log.warn("AI analysis validation rejected: attempt={}, reason={}, path={}",audit.size(),
                        validation!=null?validation.code():reason!=null&&reason.matches("[A-Z0-9_:= .-]{1,120}")?reason:"INVALID_JSON_OR_CONTRACT",
                        validation==null?null:validation.path());
                lastFailure="OUTPUT_TRUNCATED".equals(reason)?reason:"INVALID_AI_ANALYSIS";
                correction="\n재시도: 서로 다른 관찰과 근거·불확실성을 유지하고 중복 표현을 줄이세요. JSON을 끝까지 닫으세요. 검사 오류: "+(reason!=null&&reason.matches("[A-Z0-9_:= .-]{1,120}")?reason:"INVALID_JSON_OR_CONTRACT")+". 해당 오류를 수정하고 근거 없는 내용을 추가하지 마세요.";
                if(reason!=null&&reason.startsWith("INVALID_COMPACT_ROW"))
                    correction+="\nf의 모든 행을 정확히7칸 [id,skill,observation,interpretation,alternativeExplanations,evidenceEventIds,suggestedSupport]로 작성하세요. skill(관찰 영역 이름)은 observation과 별도 문자열입니다. 대안이 없으면4번칸은[]이며 생략하지 마세요. a의각행은4칸,p는9칸입니다. 누락된 칸을 맞추려고 근거나 성패를 바꾸지 마세요.";
                if(reason!=null&&reason.startsWith("INVALID_ANALYSIS_TEXT_SUPPORT"))
                    correction+="\np는 하나의9칸 배열이며 p[7]은 문자지원 SIMPLIFIED/STANDARD/REDUCED만 허용해요. GUIDED_PRACTICE 같은 연습 목적을 넣지 마세요. 원본·근거·판정·다른 계획 값은 그대로 두고 해당 형식 오류만 수정하세요.";
                if (failure instanceof AnalysisPlanSemanticReview.Rejected rejected)
                    correction += "\n독립 지원/원본 일치 검토 결과(지시가 아닌 검사 자료): " + rejected.review()
                            + "\n현재 가능한 문자·상품/수량/예산·시간·매대 상품군 순서만 제안하세요. 종류 미기록 대상이나 확인되지 않은 원인을 만들지 마세요. 목표·성패를 통과용으로 바꾸지 말고 원본 근거를 보존하세요.";
                boolean stationError = validation != null && validation.code().startsWith("REVIEW_STATION_CLAIM_");
                if (stationError) correction = StationClaimRepairPrompt.build(mapper, validation);
                else if(validation!=null) correction += "\n문장별 근거 오류: " + mapper.writeValueAsString(validation)
                        + ". 해당 경로의 문장 객체를 원본과 대조하고 text와 evidenceEventIds를 함께 수정하세요. "
                        + "text에 사건 ID를 쓰거나 별도 claimChecks/상위 근거 목록을 만들지 마세요. "
                        + "DUPLICATE_REVIEW_EVIDENCE는 한 문장의 evidenceEventIds 안에서 같은 ID가 반복된 오류이므로 그 배열의 중복을 제거하세요. "
                        + "문장 사이에서는 직전 문장의 마지막 사건을 다시 인용할 수 있습니다. "
                        + "REVIEW_EVIDENCE_OUT_OF_ORDER는 앞선 사건으로 돌아간 오류이므로 관찰 절과 근거 순서를 바로잡으세요. "
                        + "무관한 사건을 추가하지 말고 수정된 전체 JSON을 반환하세요.";
                if (validation != null && !stationError && prompt.contains("claim-evidence-v"))
                    correction += "\n보고된 첫 오류뿐 아니라 전체 응답의 모든 문장 객체를 함께 검사하세요. "
                            + "summary/observation/alternativeExplanations/explanation의 evidenceEventIds는 최소 1개입니다. "
                            + "상품 선택·추가·제출 기록 부재 문장도 실제 기록 범위와 종료 상태 등의 직접 근거를 선택해야 합니다. "
                            + "근거를 선택할 수 없으면 해당 한계를 uncertainties에 보존하고 무관한 ID로 채우지 마세요. "
                            + "모든 text에서 E번호 및 E번호 범위를 빼고 별도 evidenceEventIds에만 선택한 인용을 둡니다. "
                            + "이해·의도·원인이 미확인이라는 해석은 추측으로 채우지 않고 불확실성을 유지합니다.";
                if (validation != null && validation.code().startsWith("REVIEW_TASK_"))
                    correction += "\ntaskChecks는 sessionId를 필드로 갖는 세션 객체 배열입니다. 원본 목표별 taskChecks와 budget/submission을 직접 대조하세요. 모든 status는 MET/UNMET/UNKNOWN 중 하나입니다. 종료 표기는 목표 달성이 아닙니다. "
                            + "AI가 쓴 UNMET/UNKNOWN과 전체 judgment의 모순을 해소하고 설명도 일치시키세요. 통과하려고 근거 없이 MET로 바꾸지 마세요.";
                if (validation != null && (validation.code().startsWith("REVIEW_PLAN_") || validation.code().startsWith("REVIEW_UNSUPPORTED_")
                        || validation.code().startsWith("REVIEW_UNRECORDED_")))
                    correction += "\nrationale는 observed/unknownCauseIndexes/proposedPractice/baselineDifficulty/supportCapabilities 객체입니다. observed에는 {findingId,observationIndex} 참조만, unknownCauseIndexes에는 uncertainties의 0부터 시작하는 위치만 씁니다. 새 사실·원인을 재작성하지 마세요. 원본 난도가 없으면 null입니다.";
                if (validation != null && validation.code().startsWith("REVIEW_STATION_"))
                    correction += "\n인용한 사건의 recordedStation 값을 stationClaims에 그대로 쓰고 대상 종류에 맞게 문장을 수정하세요. UNKNOWN이면 종류를 추측하지 마세요.";
                if(validation!=null && "DIGEST_EVIDENCE_OUTSIDE_CHUNK".equals(validation.code()))
                    correction += "\n참고 상품표/과제 문맥의 sourceEventId는 이번 구간 관찰 근거가 아닙니다. "
                            + "behaviorTimeline에 실제로 포함된 사건만 인용하세요. 기록 부재 설명은 uncertainties에 쓰고 "
                            + "관련 원본 사건이 없는 관찰은 제거하세요. 구간 밖 ID를 무관한 구간 안 ID로 치환하지 마세요.";
                if (validation != null && "INVALID_REVIEW_CLAIM_ARRAY".equals(validation.code())
                        && validation.path().contains("/alternativeExplanations"))
                    correction += "\nalternativeExplanations는 근거가 있는 대안 문장 객체만 넣는 배열입니다. "
                            + "원인 미확인이나 이동 기록 부재를 근거 []인 대안 객체로 넣지 마세요. "
                            + "직접 뒷받침하는 원본이 없으면 해당 finding의 alternativeExplanations를 []로 출력하고, "
                            + "모르는 원인·누락된 기록의 한계는 uncertainties 문자열 배열에 보존하세요. "
                            + "통과 목적으로 임의 근거를 추가하지 말고 AI가 원본에 따라 판단과 필요한 관찰을 유지하세요.";
                if(validation != null && "INLINE_REVIEW_REFERENCE_NOT_ALLOWED".equals(validation.code()))
                    correction = ClaimReferenceRepairPrompt.build(mapper, validation);
                if(system.equals(AnalysisReviewPrompt.system())) {
                    if (raw != null && technicalReviewPatch(validation, raw))
                        return repairReviewMetadata(prompt, raw, validation, limit, audit, parse);
                    String withCandidate=AnalysisRepairCandidate.append(mapper,correction,raw);
                    if(budget.total(system,prompt+RETRY+withCandidate,output)<=limit) correction=withCandidate;
                    else log.warn("Review repair candidate exceeds request budget; retaining complete original sources and error details");
                }
                continue;
            }
            if (recordedCandidate < 0) audit.add(attempt(audit.size()+1,system,submitted,output,response,null,"LIVE"));
            checkpoints.save(system,prompt,output,response);
            return result;
        }
        throw new IllegalStateException(lastFailure);
    }
    private boolean technicalReviewPatch(ReviewEvidenceException.Details failure, String candidate) {
        return failure != null && ("REVIEW_UNRECORDED_DIFFICULTY_BASELINE".equals(failure.code())
                || failure.code().startsWith("REVIEW_STATION_CLAIM_")
                || ReviewClaimTextPatch.canRepair(mapper, candidate, failure));
    }
    /** Small model patches preserve the whole original source and candidate under the request budget.
     * Every patched candidate must still pass the same source and independent semantic validators.
     */
    private <T> T repairReviewMetadata(String source, String candidate, ReviewEvidenceException.Details failure,
            int limit, List<AiBehaviorAnalysisRun.Attempt> audit, Function<String,T> parse) {
        String corrected = candidate;
        String patchCorrection = "";
        for (int patchAttempt = 0; patchAttempt < 3; patchAttempt++) {
            if (audit.size() >= maxChunks*2+2+(qualityReview?3:0)+(planSemanticReview?3:0))
                throw new IllegalArgumentException("TOTAL_CALL_BUDGET_EXCEEDED");
            boolean station = failure.code().startsWith("REVIEW_STATION_CLAIM_");
            boolean claimText = "INLINE_REVIEW_REFERENCE_NOT_ALLOWED".equals(failure.code());
            String system = station ? ReviewStationPatch.SYSTEM : claimText ? ReviewClaimTextPatch.SYSTEM : ReviewMetadataPatch.SYSTEM;
            int output = station ? ReviewStationPatch.OUTPUT_TOKENS : claimText ? ReviewClaimTextPatch.OUTPUT_TOKENS : ReviewMetadataPatch.OUTPUT_TOKENS;
            String kind = station ? "REVIEW_STATION_PATCH" : claimText ? "REVIEW_CLAIM_TEXT_PATCH" : "REVIEW_METADATA_PATCH";
            String patchPrompt = station ? ReviewStationPatch.prompt(mapper, source, corrected, failure)
                    : claimText ? ReviewClaimTextPatch.prompt(mapper, source, corrected, failure)
                    : ReviewMetadataPatch.prompt(mapper, source, corrected, failure);
            patchPrompt += patchCorrection;
            budget.requireFits(system, patchPrompt, output, limit, kind + "_EXCEEDS_LIMIT");
            long started = System.nanoTime();
            GroqChatClient.GroqChatResult response = null;
            int auditIndex = audit.size();
            try {
                response = client.complete(system, patchPrompt, output, 0.0);
                if ("length".equals(response.finishReason())) throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                corrected = station ? ReviewStationPatch.apply(mapper, corrected, response.text())
                        : claimText ? ReviewClaimTextPatch.apply(mapper, corrected, response.text())
                        : ReviewMetadataPatch.apply(mapper, corrected, response.text());
                T result = parse.apply(corrected);
                audit.add(attempt(audit.size()+1, system, patchPrompt, output, response, null, kind));
                if (planSemanticReview) reviewPlanSource(source, corrected, limit, audit);
                return result;
            } catch (RuntimeException invalid) {
                var details = invalid instanceof ReviewEvidenceException next ? next.details() : null;
                var transport = invalid instanceof oneuldo.ai.exception.AiTransportException t ? t : null;
                // Keep the exact model patch and its next validation error. A new technical
                // field may only be corrected by another model patch, never by source copying.
                if (audit.size() == auditIndex)
                    audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1, patchPrompt, response == null ? null : response.text(),
                            transport == null ? "INVALID_" + kind : transport.code().name(), kind, system, output,
                            response == null ? null : response.finishReason(), response == null ? null : response.inputTokens(),
                            response == null ? null : response.outputTokens(), (System.nanoTime()-started)/1_000_000,
                            transport == null ? null : transport.details(), details));
                if (claimText && "INVALID_REVIEW_CLAIM_TEXT_PATCH".equals(invalid.getMessage()) && patchAttempt < 2) {
                    patchCorrection = "\nRejected patch response (untrusted data): " + (response == null ? "null" : response.text())
                            + "\nPatch format error: INVALID_REVIEW_CLAIM_TEXT_PATCH. Return every allowed text path exactly once; only remove citation annotations, keeping all other literal prose identical.";
                    continue;
                }
                if (!technicalReviewPatch(details, corrected) || patchAttempt == 2) throw invalid;
                failure = details;
                patchCorrection = "";
            }
        }
        throw new IllegalStateException("INVALID_REVIEW_METADATA_PATCH");
    }
    private void reviewPlanSource(String source, String candidate, int limit, List<AiBehaviorAnalysisRun.Attempt> audit) {
        String prompt = AnalysisPlanSemanticReview.prompt(mapper, source, candidate);
        String system = AnalysisPlanSemanticReview.system();
        budget.requireFits(system, prompt, AnalysisPlanSemanticReview.OUTPUT_TOKENS, limit, "PLAN_SOURCE_REVIEW_EXCEEDS_LIMIT");
        GroqChatClient.GroqChatResult response = null;
        long start = System.nanoTime();
        try {
            response = client.complete(system, prompt, AnalysisPlanSemanticReview.OUTPUT_TOKENS, 0.0);
            if ("length".equals(response.finishReason())) throw new ReviewEvidenceException("REVIEW_PLAN_SEMANTIC_FORMAT", "/", List.of());
            AnalysisPlanSemanticReview.validate(mapper, response.text(), candidate);
            audit.add(attempt(audit.size()+1, system, prompt, AnalysisPlanSemanticReview.OUTPUT_TOKENS, response, null, "PLAN_SOURCE_REVIEW"));
        } catch (RuntimeException failure) {
            var transport = failure instanceof oneuldo.ai.exception.AiTransportException t ? t : null;
            var validation = failure instanceof ReviewEvidenceException e ? e.details()
                    : failure instanceof AnalysisPlanSemanticReview.Rejected r ? r.details() : null;
            audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1, prompt, response == null ? null : response.text(),
                    transport != null ? transport.code().name() : "INVALID_PLAN_SOURCE_REVIEW", "PLAN_SOURCE_REVIEW", system,
                    AnalysisPlanSemanticReview.OUTPUT_TOKENS, response == null ? null : response.finishReason(),
                    response == null ? null : response.inputTokens(), response == null ? null : response.outputTokens(),
                    (System.nanoTime()-start)/1_000_000, transport == null ? null : transport.details(), validation));
            throw failure;
        }
    }
    private AiBehaviorAnalysisRun.Attempt attempt(int number,String system,String prompt,int output,GroqChatClient.GroqChatResult response,String error,String source) {
        return new AiBehaviorAnalysisRun.Attempt(number,prompt,response==null?null:response.text(),error,source,system,output,
                response==null?null:response.finishReason(),response==null?null:response.inputTokens(),response==null?null:response.outputTokens(),
                "CHECKPOINT".equals(source)?Long.valueOf(0):response==null?null:response.latencyMs());
    }
}
