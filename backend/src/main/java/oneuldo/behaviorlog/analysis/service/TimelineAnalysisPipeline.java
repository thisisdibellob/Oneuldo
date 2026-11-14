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
    private boolean directSourceReview;
    public TimelineAnalysisPipeline withDirectSourceReview(boolean enabled) {directSourceReview=enabled;return this;}
    private FinalAnalysisBudget.Estimate finalEstimate(String system,String source,AnalysisReferences refs) {
        var estimate=FinalAnalysisBudget.estimate(mapper,budget,system,source,refs,qualityReview,directSourceReview,RETRY);
        if(estimate.preparedReview()!=null&&client.supportsCompactSourceSchemas()) {
            String prepared=AnalysisReviewWire.prompt(mapper,estimate.preparedReview(),client.supportsConcretePracticeSchemas());
            return new FinalAnalysisBudget.Estimate(estimate.draftRequest(),
                budget.total(AnalysisReviewPrompt.system(),prepared+RETRY,budget.finalOutputTokens())+256,prepared);
        }
        return estimate;
    }
    private int observationParallelism=1;
    public TimelineAnalysisPipeline withObservationParallelism(int count) {
        if(count<1||count>2)throw new IllegalArgumentException("INVALID_OBSERVATION_PARALLELISM");observationParallelism=count;return this;
    }
    private SharedSourceObservations sharedObservations;
    public TimelineAnalysisPipeline withSharedObservations(SharedSourceObservations source) {sharedObservations=source;return this;}
    private java.util.Map<String,String> preparedObservations=java.util.Collections.synchronizedMap(new java.util.LinkedHashMap<String,String>(64,0.75f,true) {
        protected boolean removeEldestEntry(java.util.Map.Entry<String,String> entry){return size()>64;}
    });
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
        prompts=p;validator=v;mapper=m;maxChunks=max;budget=b;this.pacer=pacer;
        client=c instanceof oneuldo.ai.client.InferenceBudgetClient?c:new oneuldo.ai.client.InferenceBudgetClient(c,()->maxChunks*2+2+(qualityReview?3:0)+(planSemanticReview?3:0));
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
            if(prompts.movementMaxError()==0) {
                int remaining=input.eventCount()-from,size=Math.min(remaining,256);
                int cost=observationCost(slice(input,from,from+size),input,refs);
                while(cost>limit&&size>1) {
                    size=Math.max(1,Math.min(size-1,(int)((long)size*limit/cost*9/10)));
                    cost=observationCost(slice(input,from,from+size),input,refs);
                }
                if(cost>limit)throw new oneuldo.ai.exception.AiInputLimitException("SINGLE_EVENT_EXCEEDS_LIMIT",cost,limit);
                // One bounded growth probe replaces repeated near-identical binary-search encodings.
                // Estimate marginal cost from measured prefixes, not total cost (which includes
                // fixed task/scene context). Each chosen prefix still gets an exact budget check.
                int upper=size,upperCost=cost;
                while(size<remaining) {
                    int next=(int)Math.min(remaining,(long)size*2);
                    int nextCost=observationCost(slice(input,from,from+next),input,refs);
                    if(nextCost>limit){upper=next;upperCost=nextCost;break;}
                    size=next;cost=nextCost;
                }
                for(int probe=0;probe<2 && upper>size+1;probe++) {
                    long estimate=(long)(upper-size)*Math.max(0,limit-200-cost)/Math.max(1,upperCost-cost);
                    int next=size+(int)Math.max(1,Math.min(upper-size-1,estimate));
                    int nextCost=observationCost(slice(input,from,from+next),input,refs);
                    if(nextCost<=limit){size=next;cost=nextCost;}else{upper=next;upperCost=nextCost;}
                }
                chunks.add(slice(input,from,from+size));from+=size;
                AnalysisProgress.stage("PREPARING",from,input.eventCount());continue;
            }
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
            if(best==from)throw new oneuldo.ai.exception.AiInputLimitException("SINGLE_EVENT_EXCEEDS_LIMIT",observationCost(slice(input,from,from+1),input,refs),limit);
            chunks.add(slice(input,from,best));from=best;
            AnalysisProgress.stage("PREPARING",from,input.eventCount());
        }
        return chunks;
    }
    private int observationCost(BehaviorAnalysisInputResponse part,BehaviorAnalysisInputResponse full,AnalysisReferences refs) {
        return budget.total(prompts.observationSystem(),preparedObservation(part,full,refs)+suffix(maxChunks,maxChunks)+RETRY,budget.chunkOutputTokens())+200;
    }
    private String preparedObservation(BehaviorAnalysisInputResponse part,BehaviorAnalysisInputResponse full,AnalysisReferences refs) {
        String key=full.id()+":"+prompts.movementMaxError()+":"+QwenTokenCounter.textHash(SharedSourceObservations.eventList(part).toString());
        synchronized(preparedObservations){var saved=preparedObservations.get(key);if(saved!=null)return saved;
            String value=refs.encode(observationPrompt(part,full));preparedObservations.put(key,value);return value;}
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
        if(part.eventCount()<=1) throw new oneuldo.ai.exception.AiInputLimitException("SINGLE_EVENT_EXCEEDS_LIMIT",required,limit);
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
        preparedObservations.clear();
        try{return analyzePrepared(input,limit,audit,refs,preparedWhole);}
        finally{preparedObservations.clear();}
    }
    private AiBehaviorAnalysis analyzePrepared(BehaviorAnalysisInputResponse input,int limit,List<AiBehaviorAnalysisRun.Attempt> audit,
            AnalysisReferences refs,String preparedWhole) {
        // The school profile uses larger context; explicit 8K clients retain the older path.
        if(limit>8192) {
            String source=refs.encode(prompts.wholeSourcePrompt(input));
            var estimate=finalEstimate(prompts.wholeSourceSystem(),source,refs);
            if(estimate.required()+200<=limit) {
                AnalysisProgress.stage("FINALIZING",0,1);
                var result=finalCall(prompts.wholeSourceSystem(),source,refs,limit,audit,raw->validator.validate(refs.read(raw),input),estimate.preparedReview());
                AnalysisProgress.stage("FINALIZING",1,1);return result;
            }
        }
        String whole=preparedWhole!=null?preparedWhole:refs.encode(prompts.userPrompt(input));
        var wholeEstimate=finalEstimate(prompts.systemPrompt(),whole,refs);
        if(wholeEstimate.required()+200<=limit) {
            AnalysisProgress.stage("FINALIZING",0,1);
            var result=finalCall(prompts.systemPrompt(),whole,refs,limit,audit,raw->validator.validate(refs.read(raw),input),wholeEstimate.preparedReview());
            AnalysisProgress.stage("FINALIZING",1,1);return result;
        }
        List<Group> groups=new ArrayList<>();
        var shared=sharedObservations==null||prompts.movementMaxError()!=0?Optional.<SharedSourceObservations.Document>empty():sharedObservations.load();
        List<Group> originalGroups;
        if(shared.isPresent()) {
            for(var part:shared.get().synthesisParts())groups.add(new Group(sharedObservations.scope(part.eventIds()),part.digest()));
            originalGroups=shared.get().originalParts().stream().map(p->new Group(sharedObservations.scope(p.eventIds()),p.digest())).toList();
            completedObservations=plannedObservations=originalGroups.size();
            audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1,"Exact source artifact",mapper.writeValueAsString(shared.get()),null,"SHARED_OBSERVATIONS",SharedSourceObservations.VERSION,1,"stop",0,0,0L));
        } else {
            var chunks=partition(input,limit,refs);
            log.info("AI analysis partition: events={}, chunks={}, parallelism={}",input.eventCount(),chunks.size(),observationParallelism);
            plannedObservations=chunks.size();AnalysisProgress.stage("OBSERVING",0,plannedObservations);
            if(Math.min(observationParallelism,Math.max(1,client.maxConcurrency()))>1 && chunks.size()>1) groups.addAll(observeParallel(chunks,input,refs,limit,audit));
            else for(var chunk:chunks)groups.addAll(observeBounded(chunk,input,refs,limit,audit));
            originalGroups=List.copyOf(groups);
        }
        while(true) {
            AnalysisProgress.stage("FINALIZING",completedObservations,plannedObservations);
            String finalPrompt=finalPrompt(input,groups,refs);
            String finalSystem=FinalAnalysisPromptCompactor.systemPrompt();
            var estimate=finalEstimate(finalSystem,finalPrompt,refs);
            log.info("AI final assembly: groups={}, draftRequestBudget={}, reviewRequestEstimate={}, required={}, limit={}",
                    groups.size(),estimate.draftRequest(),estimate.reviewRequest(),estimate.required(),limit);
            if(estimate.required()<=limit) {
                if(sharedObservations!=null && !movementDetailLimited && prompts.movementMaxError()==0 && shared.isEmpty())
                    sharedObservations.save(parts(originalGroups),parts(groups),model);
                try {
                    return finalCall(finalSystem,finalPrompt,refs,limit,audit,
                            raw->validateFinal(refs.read(raw),input,finalPrompt),estimate.preparedReview());
                } catch(IllegalStateException failure) {
                    if(!"OUTPUT_TRUNCATED".equals(failure.getMessage()) || groups.size()<=1) throw failure;
                    log.info("AI final output truncated; reducing saved observations before retry");
                }
            }
            if(groups.size()<=1) {
                audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1,finalPrompt,null,"FINAL_EVIDENCE_EXCEEDS_LIMIT","PREFLIGHT",finalSystem,budget.finalOutputTokens(),null,null,null,0L));
                throw new oneuldo.ai.exception.AiInputLimitException("FINAL_EVIDENCE_EXCEEDS_LIMIT",estimate.required(),limit);
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
    private List<SharedSourceObservations.Part> parts(List<Group> groups) {
        return groups.stream().map(g->new SharedSourceObservations.Part(SharedSourceObservations.eventList(g.scope()),g.digest())).toList();
    }
    private List<Group> observeParallel(List<BehaviorAnalysisInputResponse> chunks,BehaviorAnalysisInputResponse input,
            AnalysisReferences refs,int limit,List<AiBehaviorAnalysisRun.Attempt> audit) {
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        var futures=new ArrayList<java.util.concurrent.Future<List<Group>>>();
        var localAudits=new ArrayList<List<AiBehaviorAnalysisRun.Attempt>>();
        var children=new ArrayList<TimelineAnalysisPipeline>();
        var deadline=oneuldo.ai.client.AiOperationDeadline.remaining();long submitted=System.nanoTime();
        try {
            for(int i=0;i<chunks.size();i++) {
                var child=new TimelineAnalysisPipeline(prompts,validator,client,mapper,maxChunks,budget,pacer).withCheckpoints(checkpoints);
                child.preparedObservations=preparedObservations;child.completedObservations=i;child.plannedObservations=chunks.size();children.add(child);
                var local=new java.util.concurrent.CopyOnWriteArrayList<AiBehaviorAnalysisRun.Attempt>();localAudits.add(local);
                var chunk=chunks.get(i);
                futures.add(pool.submit(()->{
                    var remaining=deadline==null?null:deadline.minusNanos(System.nanoTime()-submitted);
                    if(remaining!=null&&(remaining.isNegative()||remaining.isZero()))throw new IllegalStateException("AI_OPERATION_TIMEOUT");
                    try(var bound=remaining==null?null:new oneuldo.ai.client.AiOperationDeadline(remaining)) {
                        return child.observeBounded(chunk,input,refs,limit,local);
                    }
                }));
            }
            var groups=new ArrayList<Group>();
            for(int i=0;i<futures.size();i++) {
                var completed=futures.get(i).get();groups.addAll(completed);model=children.get(i).model;
                movementDetailLimited|=children.get(i).movementDetailLimited;
                completedObservations+=completed.size();plannedObservations+=completed.size()-1;
                AnalysisProgress.stage("OBSERVING",completedObservations,plannedObservations);
            }
            return groups;
        }catch(java.util.concurrent.ExecutionException e){if(e.getCause() instanceof RuntimeException r)throw r;throw new IllegalStateException(e.getCause());}
        catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("AI_REQUEST_INTERRUPTED",e);}
        finally {
            futures.forEach(f->f.cancel(true));pool.shutdownNow();
            try{pool.awaitTermination(5,java.util.concurrent.TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}
            for(var local:localAudits)for(var a:local)audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1,a.inputPrompt(),a.rawOutput(),a.errorCode(),a.source(),a.systemPrompt(),a.outputMax(),a.finishReason(),a.inputTokens(),a.outputTokens(),a.latencyMs(),a.transportFailure(),a.validationFailure()));
        }
    }
    private GroqChatClient.GroqChatResult digestRequest(String system,String prompt,int output) {
        if(!client.supportsSourceSchemas()||prompts.movementMaxError()!=0)return client.completeDigest(system,prompt,output,0.2);
        // Aliases are explicit source facts, not every E-looking string in reference/coverage metadata.
        String json=prompt.substring(0,prompt.lastIndexOf('}')+1);var root=ObservationWireEncoding.decode(mapper,mapper.readTree(json));
        var ids=new LinkedHashSet<String>();
        if(root.has("behaviorTimeline")) {
            var timeline=new CompactBehaviorTimeline(mapper).decodeExpanded(root.path("behaviorTimeline"));
            for(var session:timeline.path("sessions"))for(var event:session.path("events"))ids.add(event.path("behaviorLogId").asString());
        } else root.path("allowedEvidenceEventIds").forEach(e->ids.add(e.asString()));
        return client.completeStructured(system,prompt,output,0.2,oneuldo.ai.client.SourceOutputSchemas.digest(ids));
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
        String prompt=preparedObservation(chunk,full,refs)+suffix(number,total);
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
            List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,AiBehaviorAnalysis> parse,String preparedReview) {
        var draft=qualityReview&&directSourceReview?null:call(system,prompt,budget.finalOutputTokens(),limit,audit,parse);
        if(!qualityReview) return draft;
        AnalysisProgress.stage("REVIEWING",completedObservations,plannedObservations);
        // Use the very request that was counted. Building it again can extend the
        // reference registry and make a near-limit preflight disagree with transmission.
        String review=preparedReview!=null?preparedReview:AnalysisReviewPrompt.build(mapper,prompt,draft,refs);
        if(client.supportsCompactSourceSchemas())review=AnalysisReviewWire.prompt(mapper,review,client.supportsConcretePracticeSchemas());
        return call(AnalysisReviewPrompt.system(),review,budget.finalOutputTokens(),limit,audit,
                raw->{
                    var result=parse.apply(AnalysisReviewPrompt.reviewedCurrentAnalysis(mapper,raw,refs));
                    var source=new FinalSourceEncoding(mapper).decode(mapper.readTree(prompt));
                    if(source.has("groundedPracticeContractVersion")) {
                        var expanded=AnalysisReviewWire.expand(mapper.readTree(raw),refs);
                        var issues=GroundedPracticeContract.inspect(expanded.path("analysis"),source,true);
                        if(!issues.isEmpty())throw new GroundedPracticeContract.Rejected(mapper.writeValueAsString(expanded),issues);
                    }
                    return result;
                },false,3);
    }
    private <T> T call(String system,String prompt,int output,int limit,List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,T> parse) {
        return call(system,prompt,output,limit,audit,parse,false);
    }
    private <T> T callDigest(String system,String prompt,int output,int limit,List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,T> parse) {
        return call(system,prompt,output,limit,audit,parse,true);
    }
    private Object reviewSchema(String originalPrompt) {
        var source=new FinalSourceEncoding(mapper).decode(mapper.readTree(originalPrompt));
        var ids=new LinkedHashSet<String>();source.path("evidenceReferences").forEach(e->ids.add(e.path("id").asString()));
        source.path(SourceEventDetails.FIELD).forEach(e->ids.add(e.path("id").asString()));
        var sessions=new TreeSet<String>();var baselines=new TreeSet<Integer>();
        for(var task:source.path("taskContext")) {
            sessions.add(task.path("sessionId").asString());var level=task.path("mission").path("difficulty");
            if(level.isIntegralNumber()&&level.canConvertToInt())baselines.add(level.asInt());
        }
        for(var session:source.path("sourceCoverage").path("sessions"))sessions.add(session.path("sessionId").asString());
        var rows=mapper.createArrayNode();var stations=ObservationWireEncoding.decode(mapper,source).path("stationClaimSources");
        // The review input carries literal recorded lookup rows, not interpreted shelf locations.
        for(var row:stations)rows.add(row.deepCopy());
        var schema=client.supportsCompactSourceSchemas()
            ?oneuldo.ai.client.SourceOutputSchemas.compactAnalysisReview(ids,sessions,rows,baselines)
            :oneuldo.ai.client.SourceOutputSchemas.analysisReview(ids,sessions,rows,baselines);
        if(client.supportsConcretePracticeSchemas()&&source.has(PracticeDesignContract.FIELD))
            schema=oneuldo.ai.client.SourceOutputSchemas.concretePractice(schema,GroundedPracticeContract.hasDirectCauseEvidence(source));
        return schema;
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
                response=digest?digestRequest(system,submitted,output):system.equals(AnalysisReviewPrompt.system())&&client.supportsSourceSchemas()
                        ?client.completeStructured(system,submitted,output,0.2,reviewSchema(prompt))
                        :client.complete(system,submitted,output,0.2);raw=response.text();model=response.model();
                if("length".equals(response.finishReason())) throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                if(system.equals(AnalysisReviewPrompt.system()))raw=ConcretePracticeSections.reviewText(mapper,raw);
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
                if(validation!=null && Set.of("ANALYSIS_FINDING_EVIDENCE_COUNT_EXCEEDS_LIMIT","ANALYSIS_SESSION_EVIDENCE_COUNT_EXCEEDS_LIMIT").contains(validation.code()))
                    correction += "\n지정된 finding 또는 sessionAssessment의 모든 문장 근거 합집합은 최대 30개입니다. 각 문장이 30개 이하여도 합집합이 넘으면 실패합니다. "
                            +"원본 사건을 삭제하거나 처음 30개로 자동 절단하지 말고, AI가 각 관찰을 뒷받침하는 관련 근거를 선택하세요. "
                            +"서로 다른 행동의 모든 근거가 필요하면 finding을 분리하고 practicePlan의 참조도 일치시키세요. "
                            +"finding 최상위 evidenceEventIds 필드를 추가하지 말고 기존 문장 객체의 evidenceEventIds만 사용하세요. 전체 원본·실제 수량·판정 기준은 그대로 보존합니다.";
                if(validation!=null && "REVIEW_TASK_JUDGMENT_CONTRADICTION".equals(validation.code()))
                    correction += "\n"+AnalysisReviewPrompt.taskOutcomeScope();
                if (validation != null && validation.code().startsWith("REVIEW_TASK_"))
                    correction += "\ntaskChecks는 sessionId를 필드로 갖는 세션 객체 배열입니다. 원본 목표별 taskChecks와 budget/submission을 직접 대조하세요. 모든 status는 MET/UNMET/UNKNOWN 중 하나입니다. 종료 표기는 목표 달성이 아닙니다. "
                            + "AI가 쓴 UNMET/UNKNOWN과 전체 judgment의 모순을 해소하고 설명도 일치시키세요. 통과하려고 근거 없이 MET로 바꾸지 마세요.";
                if (validation != null && (validation.code().startsWith("REVIEW_PLAN_") || validation.code().startsWith("REVIEW_UNSUPPORTED_")
                        || validation.code().startsWith("REVIEW_UNRECORDED_")))
                    correction += "\nrationale는 observed/unknownCauseIndexes/proposedPractice/baselineDifficulty/supportCapabilities 객체입니다. observed에는 {findingId,observationIndex} 참조만, unknownCauseIndexes에는 uncertainties의 0부터 시작하는 위치만 씁니다. 새 사실·원인을 재작성하지 마세요. 원본 난도가 없으면 null입니다.";
                if (validation != null && "REVIEW_PLAN_OBSERVATION_REFERENCE".equals(validation.code()))
                    correction += ReviewPlanReferenceFeedback.build(mapper, raw);
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
                    if(failure instanceof GroundedPracticeContract.Rejected rejected)
                        return repairGroundedText(prompt,rejected,limit,audit,parse);
                    if(raw != null && failure instanceof AnalysisPlanSemanticReview.Rejected rejected
                            && ReviewAlternativeExplanationPatch.canRepair(mapper,raw,rejected))
                        return repairReviewCauseAlternatives(prompt,raw,rejected,limit,audit,parse);
                    if(raw != null && failure instanceof AnalysisPlanSemanticReview.Rejected rejected
                            && ReviewSemanticTextPatch.canRepair(mapper,raw,rejected))
                        return repairReviewSemanticText(prompt,raw,rejected,limit,audit,parse);
                    if (raw != null && technicalReviewPatch(validation, raw)) {
                        try {
                            return repairReviewMetadata(prompt, raw, validation, limit, audit, parse);
                        } catch (ReviewEvidenceException next) {
                            // Formatting can expose a different domain error. Keep the rejected
                            // provider response and ask the model to repair it within this call's
                            // existing bound; never insert observations or uncertainty in Java.
                            if (!AiBehaviorAnalysisValidator.OBSERVATIONS_OR_LIMITS_REQUIRED.equals(next.details().code())) throw next;
                            correction = observationsOrLimitsFeedback(raw);
                            continue;
                        }
                    }
                    if (validation != null && AiBehaviorAnalysisValidator.OBSERVATIONS_OR_LIMITS_REQUIRED.equals(validation.code()))
                        correction = observationsOrLimitsFeedback(raw);
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
                || ReviewClaimTextPatch.canRepair(mapper, candidate, failure)
                || ReviewAlternativeExplanationPatch.canRepair(mapper, candidate, failure)
                || ReviewEvidenceUnionPatch.canRepair(mapper, candidate, failure)
                || ReviewObservationOrderPatch.canRepair(mapper, candidate, failure));
    }
    private String observationsOrLimitsFeedback(String candidate) {
        return AnalysisRepairCandidate.append(mapper,
                "\nANALYSIS_OBSERVATIONS_OR_LIMITS_REQUIRED: findings와 uncertainties를 동시에 비울 수 없습니다. "
                + "원본에 기록된 관찰은 문장별 실제 근거와 함께 findings에 유지하거나, 관찰을 제시할 수 없다면 실제 미확인 범위·원인·이해의 한계를 uncertainties에 명시하세요. "
                + "미확인 원인을 새 가설로 채우거나 통과용 사실·근거·성공을 만들지 마세요. targetFindingIds도 실제 findings와 일치시키세요. "
                + "원본 전체·과제 조건·성패 기준은 그대로이며 서버가 문장을 채우지 않습니다. 전체 검토 JSON을 반환하세요.", candidate);
    }
    /** A semantic repair changes only the model-selected prose path and must pass both existing gates again. */
    private <T> T repairReviewSemanticText(String source,String candidate,AnalysisPlanSemanticReview.Rejected issue,
            int limit,List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,T> parse) {
        String corrected=candidate,correction="";
        for(int patchAttempt=0;patchAttempt<3;patchAttempt++) {
            if(audit.size()>=maxChunks*2+2+(qualityReview?3:0)+(planSemanticReview?3:0)) throw new IllegalArgumentException("TOTAL_CALL_BUDGET_EXCEEDED");
            String system=ReviewSemanticTextPatch.SYSTEM;
            String prompt=ReviewSemanticTextPatch.prompt(mapper,source,corrected,issue)+correction;
            budget.requireFits(system,prompt,ReviewSemanticTextPatch.OUTPUT_TOKENS+ReviewSemanticTextPatch.SAFETY_TOKENS,limit,"REVIEW_SEMANTIC_TEXT_PATCH_EXCEEDS_LIMIT");
            GroqChatClient.GroqChatResult response=null;
            long started=System.nanoTime();int index=audit.size();
            String before=corrected;
            try {
                var cached=checkpoints.find(system,prompt,ReviewSemanticTextPatch.OUTPUT_TOKENS);
                response=cached.orElseGet(()->client.complete(system,prompt,ReviewSemanticTextPatch.OUTPUT_TOKENS,0.0));
                if("length".equals(response.finishReason())) throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                String proposed=ReviewSemanticTextPatch.apply(mapper,before,issue,response.text());
                T result=parse.apply(proposed);
                corrected=proposed;
                audit.add(attempt(audit.size()+1,system,prompt,ReviewSemanticTextPatch.OUTPUT_TOKENS,response,null,
                        cached.isPresent()?"REVIEW_SEMANTIC_TEXT_PATCH_CHECKPOINT":"REVIEW_SEMANTIC_TEXT_PATCH"));
                if(audit.size()>=maxChunks*2+2+(qualityReview?3:0)+(planSemanticReview?3:0)) throw new IllegalArgumentException("TOTAL_CALL_BUDGET_EXCEEDED");
                reviewPlanSource(source,corrected,limit,audit);
                // Cache the actual patch response only after source and independent semantic approval.
                // The reconstructed candidate is never labeled as an original provider response.
                checkpoints.save(system,prompt,ReviewSemanticTextPatch.OUTPUT_TOKENS,response);
                return result;
            } catch(RuntimeException failure) {
                var details=failure instanceof ReviewEvidenceException e?e.details()
                        :failure instanceof AnalysisPlanSemanticReview.Rejected r?r.details():null;
                var transport=failure instanceof oneuldo.ai.exception.AiTransportException t?t:null;
                if(audit.size()==index) audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1,prompt,response==null?null:response.text(),
                        transport==null?"INVALID_REVIEW_SEMANTIC_TEXT_PATCH":transport.code().name(),"REVIEW_SEMANTIC_TEXT_PATCH",system,ReviewSemanticTextPatch.OUTPUT_TOKENS,
                        response==null?null:response.finishReason(),response==null?null:response.inputTokens(),response==null?null:response.outputTokens(),
                        (System.nanoTime()-started)/1_000_000,transport==null?null:transport.details(),details));
                if(failure instanceof GroundedPracticeContract.Rejected grounded) return repairGroundedText(source,grounded,limit,audit,parse);
                if(failure instanceof AnalysisPlanSemanticReview.Rejected cause && ReviewAlternativeExplanationPatch.canRepair(mapper,corrected,cause))
                    return repairReviewCauseAlternatives(source,corrected,cause,limit,audit,parse);
                if(patchAttempt==2) throw failure;
                if(failure instanceof AnalysisPlanSemanticReview.Rejected next && ReviewSemanticTextPatch.canRepair(mapper,corrected,next)) {
                    issue=next;correction="";continue;
                }
                if("INVALID_REVIEW_SEMANTIC_TEXT_PATCH".equals(failure.getMessage()) || "OUTPUT_TRUNCATED".equals(failure.getMessage())
                        || details!=null && "INLINE_REVIEW_REFERENCE_NOT_ALLOWED".equals(details.code())) {
                    corrected=before;
                    correction="\nRepair attempt "+(patchAttempt+2)+": previous patch failed its string contract. Return one allowedTextPath string, concise Korean, no inline E IDs; all other candidate fields stay unchanged.";
                    continue;
                }
                throw failure;
            }
        }
        throw new IllegalStateException("INVALID_REVIEW_SEMANTIC_TEXT_PATCH");
    }
    private <T> T normalizeReviewCitations(String source, String candidate, ReviewEvidenceException.Details failure,
            int limit, List<AiBehaviorAnalysisRun.Attempt> audit, Function<String,T> parse) {
        String corrected = ReviewClaimTextPatch.normalizeAnnotations(mapper, candidate, failure);
        // The rejected provider response is already retained verbatim in audit. Formatting is
        // not a model call and must not be recorded as a fabricated provider response.
        log.info("Normalized citation annotations without inference; original claims, evidence and judgments retained");
        try {
            T result = parse.apply(corrected);
            if (planSemanticReview) reviewPlanSource(source, corrected, limit, audit);
            return result;
        } catch (RuntimeException invalid) {
            if (invalid instanceof AnalysisPlanSemanticReview.Rejected cause
                    && ReviewAlternativeExplanationPatch.canRepair(mapper, corrected, cause))
                return repairReviewCauseAlternatives(source, corrected, cause, limit, audit, parse);
            if (invalid instanceof AnalysisPlanSemanticReview.Rejected rejected
                    && ReviewSemanticTextPatch.canRepair(mapper, corrected, rejected))
                return repairReviewSemanticText(source, corrected, rejected, limit, audit, parse);
            if(invalid instanceof GroundedPracticeContract.Rejected rejected)
                return repairGroundedText(source,rejected,limit,audit,parse);
            if (invalid instanceof ReviewEvidenceException next && technicalReviewPatch(next.details(), corrected))
                return repairReviewMetadata(source, corrected, next.details(), limit, audit, parse);
            throw invalid;
        }
    }
    /** Small model patches preserve the whole original source and candidate under the request budget.
     * Every patched candidate must still pass the same source and independent semantic validators.
     */
    private <T> T repairReviewMetadata(String source, String candidate, ReviewEvidenceException.Details failure,
            int limit, List<AiBehaviorAnalysisRun.Attempt> audit, Function<String,T> parse) {
        if (ReviewObservationOrderPatch.canRepair(mapper, candidate, failure))
            return repairReviewObservationOrder(source, candidate, failure, limit, audit, parse);
        if (ReviewEvidenceUnionPatch.canRepair(mapper, candidate, failure))
            return repairReviewEvidenceUnion(source, candidate, failure, limit, audit, parse);
        if (ReviewAlternativeExplanationPatch.canRepair(mapper, candidate, failure))
            return repairReviewAlternatives(source, candidate, failure, limit, audit, parse);
        String corrected = candidate;
        String patchCorrection = "";
        for (int patchAttempt = 0; patchAttempt < 3; patchAttempt++) {
            if (audit.size() >= maxChunks*2+2+(qualityReview?3:0)+(planSemanticReview?3:0))
                throw new IllegalArgumentException("TOTAL_CALL_BUDGET_EXCEEDED");
            if (ReviewClaimTextPatch.canRepair(mapper, corrected, failure))
                return normalizeReviewCitations(source, corrected, failure, limit, audit, parse);
            boolean station = failure.code().startsWith("REVIEW_STATION_CLAIM_");
            boolean claimText = "INLINE_REVIEW_REFERENCE_NOT_ALLOWED".equals(failure.code());
            String system = station ? ReviewStationPatch.SYSTEM : claimText ? ReviewClaimTextPatch.SYSTEM : ReviewMetadataPatch.SYSTEM;
            int output = station ? ReviewStationPatch.OUTPUT_TOKENS : claimText ? ReviewClaimTextPatch.outputTokens(mapper, corrected) : ReviewMetadataPatch.OUTPUT_TOKENS;
            String kind = station ? "REVIEW_STATION_PATCH" : claimText ? "REVIEW_CLAIM_TEXT_PATCH" : "REVIEW_METADATA_PATCH";
            String patchPrompt = station ? ReviewStationPatch.prompt(mapper, source, corrected, failure)
                    : claimText ? ReviewClaimTextPatch.prompt(mapper, source, corrected, failure)
                    : ReviewMetadataPatch.prompt(mapper, source, corrected, failure);
            patchPrompt += patchCorrection;
            budget.requireFits(system, patchPrompt, output, limit, kind + "_EXCEEDS_LIMIT");
            long started = System.nanoTime();
            GroqChatClient.GroqChatResult response = null;
            int auditIndex = audit.size();
            boolean applied = false;
            try {
                response = client.complete(system, patchPrompt, output, 0.0);
                if ("length".equals(response.finishReason())) throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                corrected = station ? ReviewStationPatch.apply(mapper, corrected, response.text())
                        : claimText ? ReviewClaimTextPatch.apply(mapper, corrected, response.text())
                        : ReviewMetadataPatch.apply(mapper, corrected, response.text());
                applied = true;
                T result = parse.apply(corrected);
                audit.add(attempt(audit.size()+1, system, patchPrompt, output, response, null, kind));
                if (planSemanticReview) reviewPlanSource(source, corrected, limit, audit);
                return result;
            } catch (RuntimeException invalid) {
                var details = invalid instanceof ReviewEvidenceException next ? next.details()
                        : invalid instanceof AnalysisPlanSemanticReview.Rejected rejected ? rejected.details() : null;
                var transport = invalid instanceof oneuldo.ai.exception.AiTransportException t ? t : null;
                // Keep the exact model patch and its next validation error. A new technical
                // field may only be corrected by another model patch, never by source copying.
                if (audit.size() == auditIndex)
                    audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1, patchPrompt, response == null ? null : response.text(),
                            transport == null ? applied ? "PATCH_RECHECK_REJECTED" : "INVALID_" + kind : transport.code().name(), kind, system, output,
                            response == null ? null : response.finishReason(), response == null ? null : response.inputTokens(),
                            response == null ? null : response.outputTokens(), (System.nanoTime()-started)/1_000_000,
                            transport == null ? null : transport.details(), details));
                if(invalid instanceof GroundedPracticeContract.Rejected grounded) return repairGroundedText(source,grounded,limit,audit,parse);
                if (invalid instanceof AnalysisPlanSemanticReview.Rejected cause
                        && ReviewAlternativeExplanationPatch.canRepair(mapper,corrected,cause))
                    return repairReviewCauseAlternatives(source,corrected,cause,limit,audit,parse);
                if (invalid instanceof AnalysisPlanSemanticReview.Rejected rejected
                        && ReviewSemanticTextPatch.canRepair(mapper,corrected,rejected))
                    return repairReviewSemanticText(source,corrected,rejected,limit,audit,parse);
                if (claimText && "INVALID_REVIEW_CLAIM_TEXT_PATCH".equals(invalid.getMessage()) && patchAttempt < 2) {
                    // The complete rejected response is already immutable in audit. Repeating
                    // it here adds no original evidence and can exhaust a near-limit request.
                    patchCorrection = "\nRepair attempt " + (patchAttempt+2)
                            + ": previous patch failed INVALID_REVIEW_CLAIM_TEXT_PATCH. Remove every annotationRemoval substring; copy all other prose literally. Each allowedTextPath exactly once. Original sources/candidate and evidence arrays are unchanged.";
                    continue;
                }
                if (station && "INVALID_REVIEW_STATION_PATCH".equals(invalid.getMessage()) && patchAttempt < 2) {
                    patchCorrection = "\nRepair attempt " + (patchAttempt+2)
                            + ": previous patch failed INVALID_REVIEW_STATION_PATCH. Null is not a station-row deletion. Follow stationPatchMode; WHOLE_ARRAY means one /stationClaims array, preserving valid rows and all event/evidence IDs. Original sources/candidate unchanged.";
                    continue;
                }
                if (ReviewEvidenceUnionPatch.canRepair(mapper, corrected, details))
                    return repairReviewEvidenceUnion(source, corrected, details, limit, audit, parse);
                if (ReviewAlternativeExplanationPatch.canRepair(mapper, corrected, details))
                    return repairReviewAlternatives(source, corrected, details, limit, audit, parse);
                if (!technicalReviewPatch(details, corrected) || patchAttempt == 2) throw invalid;
                failure = details;
                patchCorrection = "";
            }
        }
        throw new IllegalStateException("INVALID_REVIEW_METADATA_PATCH");
    }
    private <T> T repairReviewObservationOrder(String source,String candidate,ReviewEvidenceException.Details issue,
            int limit,List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,T> parse) {
        String correction="";
        for(int n=0;n<2;n++) {
            if(audit.size()>=maxChunks*2+2+(qualityReview?3:0)+(planSemanticReview?3:0))
                throw new IllegalArgumentException("TOTAL_CALL_BUDGET_EXCEEDED");
            String system=ReviewObservationOrderPatch.SYSTEM;
            String prompt=ReviewObservationOrderPatch.prompt(mapper,source,candidate,issue)+correction;
            int output=256;budget.requireFits(system,prompt,output,limit,"REVIEW_ORDER_PATCH_EXCEEDS_LIMIT");
            String corrected=candidate;boolean applied=false;
            GroqChatClient.GroqChatResult response=null;long started=System.nanoTime();int auditIndex=audit.size();
            try {
                response=client.complete(system,prompt,output,0.0);
                if("length".equals(response.finishReason()))throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                corrected=ReviewObservationOrderPatch.apply(mapper,candidate,issue,response.text());applied=true;
                T result=parse.apply(corrected);
                audit.add(attempt(audit.size()+1,system,prompt,output,response,null,"REVIEW_OBSERVATION_ORDER_PATCH"));
                if(planSemanticReview)reviewPlanSource(source,corrected,limit,audit);
                return result;
            } catch(RuntimeException invalid) {
                var details=invalid instanceof ReviewEvidenceException e?e.details():null;
                var transport=invalid instanceof oneuldo.ai.exception.AiTransportException e?e:null;
                if(audit.size()==auditIndex)audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1,prompt,response==null?null:response.text(),
                    transport==null?"REVIEW_ORDER_PATCH_REJECTED":transport.code().name(),"REVIEW_OBSERVATION_ORDER_PATCH",system,output,
                    response==null?null:response.finishReason(),response==null?null:response.inputTokens(),response==null?null:response.outputTokens(),
                    (System.nanoTime()-started)/1_000_000,transport==null?null:transport.details(),details));
                if(invalid instanceof GroundedPracticeContract.Rejected grounded) return repairGroundedText(source,grounded,limit,audit,parse);
                if(applied && invalid instanceof AnalysisPlanSemanticReview.Rejected cause
                        && ReviewAlternativeExplanationPatch.canRepair(mapper,corrected,cause))
                    return repairReviewCauseAlternatives(source,corrected,cause,limit,audit,parse);
                if(applied && invalid instanceof AnalysisPlanSemanticReview.Rejected rejected
                        && ReviewSemanticTextPatch.canRepair(mapper,corrected,rejected))
                    return repairReviewSemanticText(source,corrected,rejected,limit,audit,parse);
                boolean orderFailure=details!=null&&details.code().equals("REVIEW_EVIDENCE_OUT_OF_ORDER");
                if(transport!=null||n==1||(!orderFailure&&!"INVALID_REVIEW_ORDER_PATCH".equals(invalid.getMessage())&&!"OUTPUT_TRUNCATED".equals(invalid.getMessage())))throw invalid;
                correction="\nPrevious permutation failed. Return a different complete chronological permutation; every existing clause once. Diagnostic: "+mapper.writeValueAsString(details);
            }
        }
        throw new IllegalStateException("INVALID_REVIEW_ORDER_PATCH");
    }

    /** Repair only the model finding whose aggregate citation set exceeds the existing limit. */
    private <T> T repairReviewEvidenceUnion(String source,String candidate,ReviewEvidenceException.Details issue,
            int limit,List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,T> parse) {
        String correction="";
        for(int patchAttempt=0;patchAttempt<3;patchAttempt++) {
            if(audit.size()>=maxChunks*2+2+(qualityReview?3:0)+(planSemanticReview?3:0))throw new IllegalArgumentException("TOTAL_CALL_BUDGET_EXCEEDED");
            String system=ReviewEvidenceUnionPatch.SYSTEM;
            int output=ReviewEvidenceUnionPatch.outputTokens(mapper,candidate,issue);
            String prompt=ReviewEvidenceUnionPatch.prompt(mapper,source,candidate,issue)+correction;
            Object schema=client.supportsCitationPoolSchemas()?ReviewEvidenceUnionPatch.schema(mapper,candidate,issue):null;
            budget.requireFits(system,prompt+(schema==null?"":mapper.writeValueAsString(schema)),output,limit,"REVIEW_EVIDENCE_UNION_PATCH_EXCEEDS_LIMIT");
            long started=System.nanoTime();GroqChatClient.GroqChatResult response=null;int index=audit.size();boolean applied=false;String corrected=candidate;
            try {
                response=schema==null?client.complete(system,prompt,output,0.0):client.completeStructured(system,prompt,output,0.0,schema);
                if("length".equals(response.finishReason()))throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                corrected=ReviewEvidenceUnionPatch.apply(mapper,candidate,issue,response.text());applied=true;
                T result=parse.apply(corrected);
                audit.add(attempt(audit.size()+1,system,prompt,output,response,null,"REVIEW_EVIDENCE_UNION_PATCH"));
                if(planSemanticReview)reviewPlanSource(source,corrected,limit,audit);
                return result;
            } catch(RuntimeException invalid) {
                var details=invalid instanceof ReviewEvidenceException next?next.details():invalid instanceof AnalysisPlanSemanticReview.Rejected rejected?rejected.details():null;
                var transport=invalid instanceof oneuldo.ai.exception.AiTransportException t?t:null;
                if(audit.size()==index)audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1,prompt,response==null?null:response.text(),
                        transport==null?applied?"PATCH_RECHECK_REJECTED":"INVALID_REVIEW_EVIDENCE_UNION_PATCH":transport.code().name(),"REVIEW_EVIDENCE_UNION_PATCH",system,output,
                        response==null?null:response.finishReason(),response==null?null:response.inputTokens(),response==null?null:response.outputTokens(),
                        (System.nanoTime()-started)/1_000_000,transport==null?null:transport.details(),details));
                if(invalid instanceof GroundedPracticeContract.Rejected grounded) return repairGroundedText(source,grounded,limit,audit,parse);
                if(applied&&invalid instanceof AnalysisPlanSemanticReview.Rejected rejected&&ReviewAlternativeExplanationPatch.canRepair(mapper,corrected,rejected))
                    return repairReviewCauseAlternatives(source,corrected,rejected,limit,audit,parse);
                if(applied&&invalid instanceof AnalysisPlanSemanticReview.Rejected rejected&&ReviewSemanticTextPatch.canRepair(mapper,corrected,rejected))
                    return repairReviewSemanticText(source,corrected,rejected,limit,audit,parse);
                if(applied&&technicalReviewPatch(details,corrected))return repairReviewMetadata(source,corrected,details,limit,audit,parse);
                if(applied||transport!=null||patchAttempt==2)throw invalid;
                correction=ReviewEvidenceUnionPatch.retryFeedback(mapper,response==null?"null":response.text(),patchAttempt+2);
            }
        }
        throw new IllegalStateException("INVALID_REVIEW_EVIDENCE_UNION_PATCH");
    }
    /** Bounded one-finding model patches, separate from metadata's three attempts and under the same total call budget. */
    private <T> T repairReviewAlternatives(String source, String candidate, ReviewEvidenceException.Details failure,
            int limit, List<AiBehaviorAnalysisRun.Attempt> audit, Function<String,T> parse) {
        String corrected = candidate, correction = "";
        for (int patchAttempt = 0; patchAttempt < 3; patchAttempt++) {
            if (audit.size() >= maxChunks*2+2+(qualityReview?3:0)+(planSemanticReview?3:0))
                throw new IllegalArgumentException("TOTAL_CALL_BUDGET_EXCEEDED");
            String system = ReviewAlternativeExplanationPatch.SYSTEM;
            int output = ReviewAlternativeExplanationPatch.outputTokens(mapper, corrected, failure);
            String prompt = ReviewAlternativeExplanationPatch.prompt(mapper, source, corrected, failure) + correction;
            budget.requireFits(system, prompt, output + ReviewAlternativeExplanationPatch.SAFETY_TOKENS,
                    limit, "REVIEW_ALTERNATIVE_PATCH_EXCEEDS_LIMIT");
            GroqChatClient.GroqChatResult response = null;
            long started = System.nanoTime();
            int auditIndex = audit.size();
            boolean applied = false;
            try {
                response = client.complete(system, prompt, output, 0.0);
                if ("length".equals(response.finishReason())) throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                corrected = ReviewAlternativeExplanationPatch.apply(mapper, corrected, failure, response.text());
                applied = true;
                T result = parse.apply(corrected);
                audit.add(attempt(audit.size()+1, system, prompt, output, response, null, "REVIEW_ALTERNATIVE_PATCH"));
                if (planSemanticReview) reviewPlanSource(source, corrected, limit, audit);
                return result;
            } catch (RuntimeException invalid) {
                var details = invalid instanceof ReviewEvidenceException next ? next.details()
                        : invalid instanceof AnalysisPlanSemanticReview.Rejected rejected ? rejected.details() : null;
                var transport = invalid instanceof oneuldo.ai.exception.AiTransportException t ? t : null;
                if (audit.size() == auditIndex)
                    audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1, prompt, response == null ? null : response.text(),
                            transport != null ? transport.code().name() : applied ? "REVIEW_CANDIDATE_REJECTED" : "INVALID_REVIEW_ALTERNATIVE_PATCH",
                            "REVIEW_ALTERNATIVE_PATCH", system, output,
                            response == null ? null : response.finishReason(), response == null ? null : response.inputTokens(),
                            response == null ? null : response.outputTokens(), (System.nanoTime()-started)/1_000_000,
                            transport == null ? null : transport.details(), details));
                if(invalid instanceof GroundedPracticeContract.Rejected grounded) return repairGroundedText(source,grounded,limit,audit,parse);
                if (invalid instanceof AnalysisPlanSemanticReview.Rejected cause
                        && ReviewAlternativeExplanationPatch.canRepair(mapper,corrected,cause))
                    return repairReviewCauseAlternatives(source,corrected,cause,limit,audit,parse);
                if (invalid instanceof AnalysisPlanSemanticReview.Rejected rejected
                        && ReviewSemanticTextPatch.canRepair(mapper,corrected,rejected))
                    return repairReviewSemanticText(source,corrected,rejected,limit,audit,parse);
                if (!applied && "INVALID_REVIEW_ALTERNATIVE_PATCH".equals(invalid.getMessage()) && patchAttempt < 2) {
                    correction = "\nRepair attempt " + (patchAttempt+2)
                            + ": previous response failed INVALID_REVIEW_ALTERNATIVE_PATCH. Return only the allowed finding array with all nonempty-evidence rows unchanged. Optional uncertainties must retain their exact original prefix. No new evidence or other paths.";
                    continue;
                }
                if (!ReviewAlternativeExplanationPatch.canRepair(mapper, corrected, details) || patchAttempt == 2) throw invalid;
                failure = details;
                correction = "";
            }
        }
        throw new IllegalStateException("INVALID_REVIEW_ALTERNATIVE_PATCH");
    }
    /** Three model attempts at only the exact comprehension/fault row reported by the literal source guard. */
    private <T> T repairReviewCauseAlternatives(String source,String candidate,AnalysisPlanSemanticReview.Rejected issue,
            int limit,List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,T> parse) {
        String corrected=candidate,correction="";
        for(int patchAttempt=0;patchAttempt<3;patchAttempt++) {
            if(audit.size()>=maxChunks*2+2+(qualityReview?3:0)+(planSemanticReview?3:0)) throw new IllegalArgumentException("TOTAL_CALL_BUDGET_EXCEEDED");
            String system=ReviewAlternativeExplanationPatch.SYSTEM;
            int output=ReviewAlternativeExplanationPatch.outputTokens(mapper,corrected,issue);
            String prompt=ReviewAlternativeExplanationPatch.prompt(mapper,source,corrected,issue)+correction;
            budget.requireFits(system,prompt,output+ReviewAlternativeExplanationPatch.SAFETY_TOKENS,limit,"REVIEW_ALTERNATIVE_SOURCE_PATCH_EXCEEDS_LIMIT");
            GroqChatClient.GroqChatResult response=null;long started=System.nanoTime();int index=audit.size();boolean applied=false;
            try {
                response=client.complete(system,prompt,output,0.0);
                if("length".equals(response.finishReason()))throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                corrected=ReviewAlternativeExplanationPatch.apply(mapper,corrected,issue,response.text());applied=true;
                T result=parse.apply(corrected);
                audit.add(attempt(audit.size()+1,system,prompt,output,response,null,"REVIEW_ALTERNATIVE_SOURCE_PATCH"));
                if(planSemanticReview)reviewPlanSource(source,corrected,limit,audit);
                return result;
            } catch(RuntimeException failure) {
                var details=failure instanceof ReviewEvidenceException e?e.details():failure instanceof AnalysisPlanSemanticReview.Rejected r?r.details():null;
                var transport=failure instanceof oneuldo.ai.exception.AiTransportException t?t:null;
                if(audit.size()==index)audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1,prompt,response==null?null:response.text(),
                        transport!=null?transport.code().name():applied?"PATCH_RECHECK_REJECTED":"INVALID_REVIEW_ALTERNATIVE_PATCH",
                        "REVIEW_ALTERNATIVE_SOURCE_PATCH",system,output,response==null?null:response.finishReason(),response==null?null:response.inputTokens(),
                        response==null?null:response.outputTokens(),(System.nanoTime()-started)/1_000_000,transport==null?null:transport.details(),details));
                if(failure instanceof GroundedPracticeContract.Rejected grounded) return repairGroundedText(source,grounded,limit,audit,parse);
                if(failure instanceof AnalysisPlanSemanticReview.Rejected next && ReviewAlternativeExplanationPatch.canRepair(mapper,corrected,next) && patchAttempt<2) {
                    issue=next;correction="";continue;
                }
                if(failure instanceof AnalysisPlanSemanticReview.Rejected next && ReviewSemanticTextPatch.canRepair(mapper,corrected,next))
                    return repairReviewSemanticText(source,corrected,next,limit,audit,parse);
                if(!applied && "INVALID_REVIEW_ALTERNATIVE_PATCH".equals(failure.getMessage()) && patchAttempt<2) {
                    correction="\nRepair attempt "+(patchAttempt+2)+": retain every unreported row and the uncertainty prefix exactly. Remove only the reported unsupported row; no new claim, citation, grade or other path.";continue;
                }
                throw failure;
            }
        }
        throw new IllegalStateException("INVALID_REVIEW_ALTERNATIVE_PATCH");
    }
    private <T> T repairGroundedText(String source,GroundedPracticeContract.Rejected rejected,int limit,
            List<AiBehaviorAnalysisRun.Attempt> audit,Function<String,T> parse) {
        var current=rejected;String feedback="";
        for(int n=0;n<2;n++) {
            if(audit.size()>=maxChunks*2+2+(qualityReview?3:0)+(planSemanticReview?3:0)) throw new IllegalArgumentException("TOTAL_CALL_BUDGET_EXCEEDED");
            String system=GroundedTextPatch.SYSTEM;
            String prompt=GroundedTextPatch.prompt(mapper,source,current,client.supportsGroundedTextPatchSchemas()&&client.supportsGroundedCauseEnums())+feedback;
            int output=GroundedTextPatch.outputTokens(mapper,current);budget.requireFits(system,prompt,output,limit,"GROUNDED_PATCH_EXCEEDS_LIMIT");
            GroqChatClient.GroqChatResult response=null;int index=audit.size();long started=System.nanoTime();String corrected=current.candidate();
            try {
                var paths=current.issues().stream().map(GroundedPracticeContract.Violation::path).distinct().toList();
                response=client.supportsGroundedTextPatchSchemas()?client.completeStructured(system,prompt,output,0.0,GroundedTextPatch.outputSchema(mapper,current,client.supportsGroundedCauseEnums())):client.complete(system,prompt,output,0.0);
                if("length".equals(response.finishReason()))throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                corrected=GroundedTextPatch.apply(mapper,current,response.text());
                T result=parse.apply(corrected);
                audit.add(attempt(audit.size()+1,system,prompt,output,response,null,"GROUNDED_TEXT_PATCH"));
                if(planSemanticReview)reviewPlanSource(source,corrected,limit,audit);
                return result;
            }catch(RuntimeException failure){
                var transport=failure instanceof oneuldo.ai.exception.AiTransportException t?t:null;
                if(audit.size()==index)audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1,prompt,response==null?null:response.text(),
                    transport==null?"GROUNDED_PATCH_REJECTED":transport.code().name(),"GROUNDED_TEXT_PATCH",system,output,
                    response==null?null:response.finishReason(),response==null?null:response.inputTokens(),response==null?null:response.outputTokens(),
                    (System.nanoTime()-started)/1_000_000,transport==null?null:transport.details(),null));
                if(failure instanceof GroundedPracticeContract.Rejected remaining){current=remaining;feedback=GroundedTextPatch.retryFeedback(remaining);continue;}
                if(failure instanceof AnalysisPlanSemanticReview.Rejected next && ReviewAlternativeExplanationPatch.canRepair(mapper,corrected,next))
                    return repairReviewCauseAlternatives(source,corrected,next,limit,audit,parse);
                if(failure instanceof AnalysisPlanSemanticReview.Rejected next && ReviewSemanticTextPatch.canRepair(mapper,corrected,next))
                    return repairReviewSemanticText(source,corrected,next,limit,audit,parse);
                if(failure instanceof ReviewEvidenceException technical && technicalReviewPatch(technical.details(),corrected))
                    return repairReviewMetadata(source,corrected,technical.details(),limit,audit,parse);
                if(n==0 && ("INVALID_GROUNDED_PATCH".equals(failure.getMessage())||"GROUNDED_PATCH_CHANGED_NUMBERS".equals(failure.getMessage()))) {
                    feedback="\nPrevious repair rejected: "+failure.getMessage()+". Return patches OBJECT containing exactly these keys: "+mapper.writeValueAsString(current.issues().stream().map(GroundedPracticeContract.Violation::path).distinct().toList())+". Every value must be a string; do not include reviewFormat, evidence, stationClaims or arrays. Preserve numeric facts.";if(failure instanceof GroundedTextPatch.NumericMismatch mismatch)feedback+=mismatch.feedback(mapper);continue;
                }
                throw failure;
            }
        }
        throw current;
    }

    private void reviewPlanSource(String source, String candidate, int limit, List<AiBehaviorAnalysisRun.Attempt> audit) {
        String prompt = AnalysisPlanSemanticReview.prompt(mapper, source, candidate);
        String system = AnalysisPlanSemanticReview.system();
        int output = SourceBoundReviewChecks.outputTokens(mapper, candidate, source);
        String correction="";
        for(int reviewAttempt=0;reviewAttempt<3;reviewAttempt++) {
          if(audit.size()>=maxChunks*2+2+(qualityReview?3:0)+(planSemanticReview?3:0)) throw new IllegalArgumentException("TOTAL_CALL_BUDGET_EXCEEDED");
          String submitted=prompt+correction;
          budget.requireFits(system, submitted, output + SourceBoundReviewChecks.SAFETY_TOKENS, limit, "PLAN_SOURCE_REVIEW_EXCEEDS_LIMIT");
          GroqChatClient.GroqChatResult response = null;
          long start = System.nanoTime();
          String auditSource=reviewAttempt==0?"PLAN_SOURCE_REVIEW":"PLAN_SOURCE_REVIEW_FORMAT_REPAIR";
          try {
            response = client.complete(system, submitted, output, 0.0);
            if ("length".equals(response.finishReason())) throw new ReviewEvidenceException("REVIEW_PLAN_SEMANTIC_FORMAT", "/", List.of());
            AnalysisPlanSemanticReview.validate(mapper, response.text(), candidate, source);
            audit.add(attempt(audit.size()+1, system, submitted, output, response, null, auditSource));
            return;
          } catch (RuntimeException failure) {
            var transport = failure instanceof oneuldo.ai.exception.AiTransportException t ? t : null;
            var validation = failure instanceof ReviewEvidenceException e ? e.details()
                    : failure instanceof AnalysisPlanSemanticReview.Rejected r ? r.details() : null;
            audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size()+1, submitted, response == null ? null : response.text(),
                    transport != null ? transport.code().name() : "INVALID_PLAN_SOURCE_REVIEW", auditSource, system,
                    output, response == null ? null : response.finishReason(),
                    response == null ? null : response.inputTokens(), response == null ? null : response.outputTokens(),
                    (System.nanoTime()-start)/1_000_000, transport == null ? null : transport.details(), validation));
            boolean formatOnly=failure instanceof ReviewEvidenceException && validation!=null
                    && Set.of("REVIEW_SOURCE_BOUND_CHECK_REQUIRED","REVIEW_PLAN_SEMANTIC_FORMAT").contains(validation.code());
            if(!formatOnly || response==null || reviewAttempt==2) throw failure;
            // Correct the review's technical envelope locally. The original analysis,
            // source, verdict rules and both semantic gates remain unchanged.
            correction="\nPrevious actual review response (untrusted): "+response.text()
                    +"\nTechnical review-format error: "+mapper.writeValueAsString(validation)
                    +"\nReturn the complete review JSON again. Copy each full literal capability descriptor OBJECT, including implemented/type/scope when present, from sourceBoundReview. Never substitute its scope string. Keep candidate and original evidence unchanged; reapply all semantic checks. This is not an instruction to return VALID.";
          }
        }
    }
    private AiBehaviorAnalysisRun.Attempt attempt(int number,String system,String prompt,int output,GroqChatClient.GroqChatResult response,String error,String source) {
        return new AiBehaviorAnalysisRun.Attempt(number,prompt,response==null?null:response.text(),error,source,system,output,
                response==null?null:response.finishReason(),response==null?null:response.inputTokens(),response==null?null:response.outputTokens(),
                "CHECKPOINT".equals(source)?Long.valueOf(0):response==null?null:response.latencyMs());
    }
}
