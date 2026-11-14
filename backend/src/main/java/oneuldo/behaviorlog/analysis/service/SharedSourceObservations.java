package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import oneuldo.ai.client.GroqChatClient.GroqChatResult;
import oneuldo.behaviorlog.analysis.domain.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.ObjectNode;

/** Exact-owner, exact-source observation artifact. AI interpretations remain fallible. */
public final class SharedSourceObservations {
    public static final String VERSION="shared-source-observations-v1";
    public record Part(List<UUID> eventIds,AiObservationDigest digest) {
        public Part {eventIds=List.copyOf(eventIds);}
    }
    public record Document(String version,String sourceHash,List<Part> originalParts,List<Part> synthesisParts) {}
    private final ObjectMapper mapper;
    private final AnalysisCheckpoints checkpoints;
    private final BehaviorAnalysisInputResponse input;
    private final String hash,prompt,system;
    private final AiBehaviorAnalysisValidator validator;
    public SharedSourceObservations(ObjectMapper mapper,AnalysisCheckpoints checkpoints,
            BehaviorAnalysisInputResponse input,AiBehaviorAnalysisPromptFactory prompts,
            AiBehaviorAnalysisValidator validator,int outputTokens) {
        this.mapper=mapper;this.checkpoints=checkpoints;this.input=input;this.validator=validator;
        hash=QwenTokenCounter.textHash(mapper.writeValueAsString(sorted(mapper.valueToTree(input.input()))));
        prompt=mapper.writeValueAsString(Map.of("version",VERSION,"sourceHash",hash,"datasetId",input.id(),"chunkOutputTokens",outputTokens,
                "observationVersion",AiBehaviorAnalysisPromptFactory.OBSERVATION_VERSION,"movementMaxError",prompts.movementMaxError()));
        system=VERSION+"\n"+prompts.observationSystem()+"\n"+prompts.digestContract()+"\n"+prompts.reductionContract();
    }
    public Optional<Document> load() {
        var cached=checkpoints.find(system,prompt,1);if(cached.isEmpty())return Optional.empty();
        try {
            var doc=mapper.readValue(cached.get().text(),Document.class);
            if(!VERSION.equals(doc.version())||!hash.equals(doc.sourceHash()))return Optional.empty();
            validate(doc.originalParts(),true);validate(doc.synthesisParts(),true);return Optional.of(doc);
        }catch(RuntimeException invalid){return Optional.empty();}
    }
    public void save(List<Part> original,List<Part> synthesis,String model) {
        validate(original,true);validate(synthesis,true);
        var doc=new Document(VERSION,hash,List.copyOf(original),List.copyOf(synthesis));
        checkpoints.save(system,prompt,1,new GroqChatResult(mapper.writeValueAsString(doc),model,"stop",0,0,0L));
    }
    private void validate(List<Part> parts,boolean full) {
        if(parts==null||parts.isEmpty())throw new IllegalArgumentException("EMPTY_SHARED_OBSERVATIONS");
        var expected=events(input);var expectedOrder=eventList(input);var seen=new HashSet<UUID>();int position=0;
        for(var part:parts) {
            if(part.eventIds()==null||part.eventIds().isEmpty()||part.digest()==null||!part.digest().requestedSegmentIds().isEmpty())throw new IllegalArgumentException("INVALID_SHARED_OBSERVATIONS");
            for(UUID id:part.eventIds())if(!expected.contains(id)||!seen.add(id)||position>=expectedOrder.size()||!expectedOrder.get(position++).equals(id))throw new IllegalArgumentException("SHARED_SOURCE_COVERAGE_MISMATCH");
            validator.validateDigest(part.digest(),scope(part.eventIds()));
        }
        if(full&&!seen.equals(expected))throw new IllegalArgumentException("SHARED_SOURCE_COVERAGE_INCOMPLETE");
    }
    public BehaviorAnalysisInputResponse scope(Collection<UUID> ids) {
        var set=new HashSet<>(ids);var sessions=new ArrayList<BehaviorAnalysisInput.SessionTimeline>();int count=0;
        for(var s:input.input().sessions()) {
            var events=s.events().stream().filter(e->set.contains(e.behaviorLogId())).toList();
            if(!events.isEmpty()){sessions.add(new BehaviorAnalysisInput.SessionTimeline(s.sessionId(),s.startedAt(),s.endedAt(),s.integrity(),events));count+=events.size();}
        }
        var i=input.input();var data=new BehaviorAnalysisInput(i.schemaVersion(),i.datasetId(),i.generatedAt(),i.analysisWindow(),i.anonymousSubjectId(),sessions.size(),count,sessions);
        return new BehaviorAnalysisInputResponse(input.id(),input.schemaVersion(),input.generatedAt(),sessions.size(),count,data);
    }
    public static List<UUID> eventList(BehaviorAnalysisInputResponse input) {
        return input.input().sessions().stream().flatMap(s->s.events().stream()).map(BehaviorAnalysisInput.EventTimeline::behaviorLogId).toList();
    }
    private static Set<UUID> events(BehaviorAnalysisInputResponse input){return new HashSet<>(eventList(input));}
    public ObjectNode forQuest(Document doc) {
        // Retain the validated reduction AND all original part references; raw part text stays in its immutable artifact.
        var result=mapper.createObjectNode();result.put("version",VERSION).put("sourceHash",hash).put("partCount",doc.originalParts().size()).put("allOriginalEventsRead",true);
        var reports=result.putArray("parts");var cited=new LinkedHashSet<UUID>();
        for(var part:doc.synthesisParts()) {reports.add(mapper.valueToTree(part.digest()));part.digest().observations().forEach(o->cited.addAll(o.evidenceEventIds()));}
        result.set("evidenceIds",mapper.valueToTree(cited));
        result.put("scope","Previously read every raw event with exact geometry, goals, supports and actor/system boundaries for this same source hash and owner. These are fallible AI observations and reductions, not source facts. All full part reports and immutable original samples remain in the exact-source checkpoint. Verify every claim against same-ID original action, navigation and sample records. Unobserved causes, effects, mastery and independence remain unknown.");
        var refs=new AnalysisReferences(mapper,input);return (ObjectNode)mapper.readTree(refs.encode(result.toString(),false));
    }
    private JsonNode sorted(JsonNode n) {
        if(n.isObject()){var o=mapper.createObjectNode();for(String k:new TreeSet<>(n.propertyNames()))o.set(k,sorted(n.get(k)));return o;}
        if(n.isArray()){var a=mapper.createArrayNode();n.forEach(x->a.add(sorted(x)));return a;}return n;
    }
}
