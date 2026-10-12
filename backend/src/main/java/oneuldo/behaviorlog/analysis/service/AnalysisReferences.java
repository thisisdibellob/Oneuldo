package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Run-scoped aliases. The immutable dataset is the audit mapping; no mapping is sent to the AI. */
public final class AnalysisReferences {
    private final ObjectMapper mapper;
    private final Map<String, String> aliases = new LinkedHashMap<>();
    private final Map<String, String> originals = new LinkedHashMap<>();
    private final BehaviorAnalysisInputResponse input;
    public AnalysisReferences(ObjectMapper mapper, BehaviorAnalysisInputResponse input) {
        this.mapper = mapper;
        this.input = input;
        int sessionNumber = 0, eventNumber = 0;
        for (var session : input.input().sessions()) {
            add(session.sessionId().toString(), "S" + (++sessionNumber));
            for (var event : session.events()) add(event.behaviorLogId().toString(), "E" + (++eventNumber));
        }
        collectOtherIds(mapper.valueToTree(input.input()));
    }
    private void collectOtherIds(JsonNode node) {
        if (node.isString() && node.asString().matches("(?i)[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}")) {
            if (!aliases.containsKey(node.asString())) add(node.asString(), "U" + (aliases.size() + 1));
        } else if (node instanceof ObjectNode object) {
            for (String name : new TreeSet<>(object.propertyNames())) collectOtherIds(object.get(name));
        } else if (node.isArray()) node.forEach(this::collectOtherIds);
    }
    private void add(String uuid, String alias) {
        if (aliases.putIfAbsent(uuid, alias) != null) throw new IllegalArgumentException("DUPLICATE_ANALYSIS_REFERENCE");
        originals.put(alias, uuid);
    }
    /** Source events eligible for a summary's independent evidence list. */
    public Set<String> eventIds() {
        return originals.keySet().stream().filter(id -> id.startsWith("E"))
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    /** Read-only source values for current review contracts; no goal matching or learner scoring. */
    public JsonNode reviewSource() { return replace(mapper.valueToTree(input.input())); }
    /** A supplied task definition is background for later comparisons, not a new action at citation time. */
    public Set<String> taskDefinitionEventIds() {
        var result = new HashSet<String>();
        for (var session : input.input().sessions()) for (var event : session.events()) {
            if (event.action() == null || !"SHOP.SESSION_STARTED".equals(event.action().eventCode())) continue;
            var payload = mapper.valueToTree(event.payload());
            if (payload.path("marketContent").path("sceneSnapshot").path("mission").isObject())
                result.add(aliases.get(event.behaviorLogId().toString()));
        }
        return Set.copyOf(result);
    }
    /** Terminal snapshots delimit evidence coverage; they are not new user actions. */
    public Set<String> comparisonAnchorEventIds() {
        var result=new HashSet<String>(taskDefinitionEventIds());
        for(var session:input.input().sessions())for(var event:session.events())
            if(event.action()!=null && Set.of("SHOP.TIME_LIMIT_EXPIRED","SHOP.SESSION_ENDED").contains(event.action().eventCode()))
                result.add(aliases.get(event.behaviorLogId().toString()));
        return Set.copyOf(result);
    }
    public Map<String, ObjectNode> recordedStations() {
        var result = new LinkedHashMap<String, ObjectNode>();
        RecordedStationIdentity.byEvent(mapper, input).forEach((id, value) ->
                result.put(aliases.get(id), (ObjectNode)replace(value.deepCopy())));
        return Map.copyOf(result);
    }

    /** Dataset order only. Does not evaluate the meaning of a claim or of an event. */
    public void validateEventOrder(java.util.List<String> ids) {
        int previous = 0;
        for (String id : ids) {
            if (!id.matches("E[1-9][0-9]*") || !originals.containsKey(id))
                throw new IllegalArgumentException("UNKNOWN_REVIEW_EVIDENCE");
            int position = Integer.parseInt(id.substring(1));
            if (position <= previous) throw new IllegalArgumentException("REVIEW_EVIDENCE_OUT_OF_ORDER: E" + previous + " " + id);
            previous = position;
        }
    }
    public String encode(String json) {
        return encode(json,true);
    }
    /** Baseline mode is for offline comparisons of identical aliases and prompt content. */
    public String encode(String json,boolean compactMovement) {
        ObjectNode root = (ObjectNode) replace(mapper.readTree(json));
        // Keep the readable source copy as objects after all token-oriented encoders.
        JsonNode details = new LosslessTables(mapper).decode(root).path(SourceEventDetails.FIELD).deepCopy();
        // Alias complete IDs before factoring strings into prefixes/columns.
        if(compactMovement) root = new MovementInputEncoder(mapper).encode(root);
        if (details.isArray()) root.set(SourceEventDetails.FIELD, details);
        root.put("referenceEncoding", "E숫자는 사건, S숫자는 세션, U숫자는 기타 원본 UUID의 고정 별칭입니다. 구간 사이에도 같은 ID는 같은 대상입니다. "
                + "출력의 evidenceEventIds/sessionId에 제공된 짧은 ID를 그대로 쓰세요. UUID를 만들지 마세요.");
        return mapper.writeValueAsString(root);
    }
    private JsonNode replace(JsonNode node) {
        if (node.isString()) return aliases.containsKey(node.asString()) ? mapper.valueToTree(aliases.get(node.asString())) : node;
        if (node instanceof ObjectNode object) {
            for (String name : new ArrayList<>(object.propertyNames())) object.set(name, replace(object.get(name)));
        } else if (node instanceof ArrayNode array) {
            for (int i = 0; i < array.size(); i++) array.set(i, replace(array.get(i)));
        }
        return node;
    }
    public AiBehaviorAnalysis read(String raw) {
        JsonNode root = mapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(raw);
        if(root.has("s")) root=expandFinal((ObjectNode)root);
        for (var finding : root.path("findings")) restoreEvidence(finding);
        for (var assessment : root.path("sessionAssessments")) {
            if (assessment instanceof ObjectNode object && object.path("sessionId").isString())
                object.put("sessionId", restore(object.path("sessionId").asString(), "S"));
            restoreEvidence(assessment);
        }
        return mapper.readerFor(AiBehaviorAnalysis.class).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .readValue(root);
    }
    public AiObservationDigest readDigest(String raw) {
        JsonNode root = mapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(raw);
        if(root.has("s")) {
            ObjectNode compact=(ObjectNode)root;
            var expanded=mapper.createObjectNode();
            expanded.set("summary",compact.get("s"));expanded.set("uncertainties",compact.get("u"));
            var observations=expanded.putArray("observations");
            for(var row:compact.path("o")) {
                requireRow(row,4);
                var o=observations.addObject();o.set("observation",row.get(0));o.set("interpretation",row.get(1));
                o.set("alternativeExplanations",row.get(2));o.set("evidenceEventIds",row.get(3));
            }
            if(compact.has("requestedSegmentIds")) expanded.set("requestedSegmentIds",compact.get("requestedSegmentIds"));
            if(!Set.of("s","o","u","requestedSegmentIds").containsAll(compact.propertyNames()) || !compact.path("o").isArray()) throw new IllegalArgumentException("INVALID_COMPACT_DIGEST");
            root=expanded;
        }
        for (var observation : root.path("observations")) {
            normalizeSingleString(observation, "alternativeExplanations");
            normalizeSingleString(observation, "evidenceEventIds");
            restoreEvidence(observation);
        }
        if(root.path("requestedSegmentIds") instanceof ArrayNode ids) {
            for(int i=0;i<ids.size();i++) ids.set(i,mapper.valueToTree(restore(ids.get(i).asString(),"E")));
        }
        return mapper.readerFor(AiObservationDigest.class).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(root);
    }
    /** Wrap a single value only; never split prose, fabricate references, or repair broken JSON. */
    private void normalizeSingleString(JsonNode node, String field) {
        if (!(node instanceof ObjectNode object)) throw new IllegalArgumentException("INVALID_DIGEST_OBSERVATION");
        JsonNode value = node.path(field);
        if (value.isString()) {
            String text = value.asString();
            if (text.isBlank()) throw new IllegalArgumentException("EMPTY_DIGEST_LIST_VALUE");
            if (field.equals("evidenceEventIds")) restore(text, "E");
            object.set(field, mapper.createArrayNode().add(text));
        } else if (!value.isArray()) {
            throw new IllegalArgumentException(field.equals("evidenceEventIds")
                    ? "EVIDENCE_EVENT_IDS_MUST_BE_ARRAY" : "ALTERNATIVE_EXPLANATIONS_MUST_BE_ARRAY");
        }
    }
    private void restoreEvidence(JsonNode node) {
        if (node.path("evidenceEventIds") instanceof ArrayNode ids) {
            for (int i = 0; i < ids.size(); i++) {
                if (!ids.get(i).isString()) throw new IllegalArgumentException("INVALID_EVENT_REFERENCE");
                ids.set(i, mapper.valueToTree(restore(ids.get(i).asString(), "E")));
            }
        }
    }
    private void requireRow(JsonNode row,int length) {if(!row.isArray()||row.size()!=length)throw new IllegalArgumentException("INVALID_COMPACT_ROW:EXPECTED="+length+" ACTUAL="+(row.isArray()?row.size():0));}
    private ObjectNode expandFinal(ObjectNode source) {
        if(!Set.of("s","f","a","u","p","c").equals(source.propertyNames())||!source.path("f").isArray()||!source.path("a").isArray()) throw new IllegalArgumentException("INVALID_COMPACT_FINAL");
        var root=mapper.createObjectNode();root.set("summary",source.get("s"));root.set("uncertainties",source.get("u"));root.set("usedEvidenceCardIds",source.get("c"));
        var findings=root.putArray("findings");
        for(var row:source.path("f")) {requireRow(row,7);var item=findings.addObject();int i=0;for(String key:List.of("id","skill","observation","interpretation","alternativeExplanations","evidenceEventIds","suggestedSupport")) item.set(key,row.get(i++));}
        var assessments=root.putArray("sessionAssessments");
        for(var row:source.path("a")) {requireRow(row,4);var item=assessments.addObject();int i=0;for(String key:List.of("sessionId","judgment","explanation","evidenceEventIds")) item.set(key,row.get(i++));}
        var plan=source.path("p");
        // A single wrapped row is unambiguous transport syntax; preserve every value.
        // Do not flatten multiple plans or reinterpret the model's judgment.
        if(plan.isArray() && plan.size()==1 && plan.get(0).isArray()) plan=plan.get(0);
        requireRow(plan,9);var item=root.putObject("practicePlan");int i=0;
        for(String key:List.of("targetFindingIds","goal","rationale","recommendedDifficulty","itemCount","quantityComplexity","budgetPressure","textSupport","reasonCodes"))item.set(key,plan.get(i++));
        if(item.path("targetFindingIds").isString())
            item.set("targetFindingIds",mapper.createArrayNode().add(item.path("targetFindingIds").asString()));
        return root;
    }
    private String restore(String reference, String prefix) {
        if (reference.startsWith(prefix) && originals.containsKey(reference)) return originals.get(reference);
        // Old UUID responses remain acceptable only when they name a supplied reference of the right kind.
        if (aliases.getOrDefault(reference, "").startsWith(prefix)) return reference;
        throw new IllegalArgumentException("UNKNOWN_ANALYSIS_REFERENCE");
    }
}
