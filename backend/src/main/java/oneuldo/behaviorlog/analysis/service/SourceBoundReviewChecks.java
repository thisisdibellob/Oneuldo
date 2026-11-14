package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import java.util.regex.Pattern;
import oneuldo.behaviorlog.personalization.domain.MarketRuntimePlan;
import oneuldo.behaviorlog.personalization.service.MarketAiQuestValidator;
import tools.jackson.databind.*;
import tools.jackson.databind.node.ObjectNode;

/** Literal proof/coverage checks only. Never edits source, prose, evidence or a learner judgment. */
public final class SourceBoundReviewChecks {
    public static final String VERSION = "source-bound-review-v2-alternative-cause-proofs";
    public static final int SAFETY_TOKENS = 512;
    public record Issue(String code, String path, String quote, String explanation, Object sourceProof) {}
    public record StationClaim(String path, String quote, List<String> stationIds, boolean anyStation,
            List<String> evidenceEventIds) {}
    public record CapabilityUnit(String path, String quote, List<String> fieldPaths) {}
    private record EventSource(String path, JsonNode row, String sessionId) {}
    private static final Pattern PAST_PROXIMITY = Pattern.compile(
            "(?:근처|근접|가까이|주변|매대|진열대|선반).*(?:지났|진입했|접근했|방문했|도착했|찾았)|사이.*(?:왕복|이동했)");
    private static final Pattern UNCERTAIN = Pattern.compile(
            "했는지|지났는지|진입했는지|왔는지|여부|미확인|확인되지|확인할 수 없|불확실|불명확|가능성|수 있습니다|수 있다|예정|관찰합니다|관찰할|확인할 계획|제안");
    private static final Pattern NEGATIVE_PROXIMITY = Pattern.compile("(?:접근|방문|진입|도착|지나).{0,5}(?:않|없|못)");
    private static final Pattern FUTURE_DELIVERY = Pattern.compile("제공|지원|설정|배치|변경|조절|늘리|줄이|유지|강조|제한|추가|도입|선택|연습");
    private static final Pattern NO_DELIVERY = Pattern.compile("없이|추가하지|제공하지|도입하지|지원하지|제한하지|강조하지|구현되지|미지원|미구현");
    private final ObjectMapper mapper;
    private final ObjectNode source;
    private final JsonNode analysis;
    private final Map<String,EventSource> events = new LinkedHashMap<>();
    private final Map<String,String> text = new LinkedHashMap<>();
    private final ObjectNode capabilities;
    private final String actualModelReview;

    private SourceBoundReviewChecks(ObjectMapper mapper, String candidate, String source) {
        this(mapper, candidate, source, null);
    }
    private SourceBoundReviewChecks(ObjectMapper mapper, String candidate, String source, String actualModelReview) {
        this.mapper = mapper;
        this.actualModelReview = actualModelReview;
        this.source = new FinalSourceEncoding(mapper).decode(mapper.readTree(source));
        this.analysis = mapper.readTree(candidate).path("analysis");
        indexEvents(this.source.path(SourceEventDetails.FIELD), "/" + SourceEventDetails.FIELD, null);
        int index = 0;
        for (var session : this.source.path(MovementSourceContext.FIELD).path("sessions")) {
            indexEvents(session.path("movementEventDetails"), "/" + MovementSourceContext.FIELD + "/sessions/" + index++ + "/movementEventDetails", session.path("sessionId").asString());
        }
        collect(analysis.path("summary"), "/summary");
        collect(analysis.path("uncertainties"), "/uncertainties");
        index = 0;
        for (var finding : analysis.path("findings")) {
            String path = "/findings/" + index++;
            for (String field : List.of("observation", "interpretation", "alternativeExplanations", "suggestedSupport")) collect(finding.path(field), path + "/" + field);
        }
        index = 0;
        for (var assessment : analysis.path("sessionAssessments")) collect(assessment.path("explanation"), "/sessionAssessments/" + index++ + "/explanation");
        collect(analysis.path("practicePlan").path("goal"), "/practicePlan/goal");
        collect(analysis.path("practicePlan").path("rationale").path("proposedPractice"), "/practicePlan/rationale/proposedPractice");
        capabilities = capabilities(mapper);
    }

    /** Current adaptive schema and policy, rather than the retired text/quantity/five-slot-only list. */
    public static ObjectNode capabilities(ObjectMapper mapper) {
        var root = mapper.createObjectNode();
        try (var in = SourceBoundReviewChecks.class.getResourceAsStream("/market/adaptive-policy.json")) {
            root.set("policy", mapper.readTree(in));
        } catch (java.io.IOException failure) { throw new IllegalStateException("ADAPTIVE_POLICY_UNAVAILABLE", failure); }
        var fields = root.putObject("fields");
        runtimeFields(mapper, fields, MarketRuntimePlan.class, "/runtimePlan");
        for (String path : List.of("/objectives", "/budget", "/timeLimitSeconds", "/briefing", "/checkoutDialogue", "/environmentPlan/shelfOrder"))
            fields.putObject(path).put("implemented", true).put("scope", "Existing task setting; future choice is not a past observation or guaranteed effect");
        for (String control : List.of("staff", "requesterContact", "reportUnavailable", "cartAndList", "receiptCorrection", "pauseAndStop"))
            fields.putObject("/controls/" + control).put("implemented", true).put("scope", "Existing game control; availability and result depend on actual task/state");
        fields.putObject("/ui/automaticQuantityLock").put("implemented",false).put("scope","No automatic quantity lock or disabled quantity buttons");
        fields.putObject("/ui/targetDirectionArrow").put("implemented",false).put("scope","No target/direction arrow overlay; existing text guidance remains available");
        fields.putObject("/ui/cartShortageAlert").put("implemented",false).put("scope","No automatic cart-shortage notification; the player can inspect the existing cart/list");
        fields.putObject("/ui/automaticHelp").put("implemented",false).put("scope","No automatic opening of help or delivery of hints");
        fields.putObject("/ui/visualEmphasis").put("implemented", false).put("scope", "New visual highlight/overlay, not text wording or shelf/category placement");
        fields.putObject("/ui/forcedExplorationBounds").put("implemented", false).put("scope", "Arbitrary forced exploration boundaries, not an existing layout template or shelf placement");
        return root;
    }
    /** Lossless grouping of application-authored descriptors; no original event is changed. */
    public static ObjectNode promptCapabilities(ObjectMapper mapper) {
        var full=capabilities(mapper);var root=mapper.createObjectNode();root.set("policy",full.path("policy"));
        var groups=root.putArray("fieldGroups");var byDescriptor=new java.util.LinkedHashMap<JsonNode,tools.jackson.databind.node.ArrayNode>();
        for(String path:full.path("fields").propertyNames()) {
            var descriptor=full.path("fields").get(path);
            var paths=byDescriptor.get(descriptor);
            if(paths==null){var group=groups.addObject();group.set("descriptor",descriptor);paths=group.putArray("paths");byDescriptor.put(descriptor,paths);}
            paths.add(path);
        }
        root.put("encoding","Each fieldGroups descriptor applies unchanged to every path in that group's paths. Preserve policy bounds, implemented flags, types and scopes.");return root;
    }

    private static void runtimeFields(ObjectMapper mapper, ObjectNode fields, Class<?> type, String prefix) {
        for (var component : type.getRecordComponents()) {
            String path = prefix + "/" + component.getName();
            if (component.getType().isRecord()) runtimeFields(mapper, fields, component.getType(), path);
            else fields.putObject(path).put("implemented", true).put("type", component.getGenericType().getTypeName())
                    .put("scope", "Adaptive runtime setting, bounded by the supplied current policy/contract; not a new UI or an established past effect");
        }
    }

    public static JsonNode describe(ObjectMapper mapper, String candidate, String source) {
        var checks = new SourceBoundReviewChecks(mapper, candidate, source);
        var root = mapper.createObjectNode().put("version", VERSION);
        root.set("stationClaims", mapper.valueToTree(checks.stationClaims()));
        root.set("capabilityUnits", mapper.valueToTree(checks.capabilityUnits()));
        root.set("alternativeCauses", mapper.valueToTree(AlternativeCauseSourceChecks.claims(mapper,candidate,checks.source)));
        root.set("implementedCapabilities", checks.capabilities);
        var literal = root.putArray("literalEventSources");
        var ids = new LinkedHashSet<String>(); checks.stationClaims().forEach(claim -> ids.addAll(claim.evidenceEventIds()));
        for (String id : ids) {
            var event = checks.events.get(id); if (event == null) continue;
            var row = literal.addObject().put("eventId", id).put("sourcePath", event.path());
            for (String field : List.of("id", "sessionId", "eventCode", "timeMs", "x", "y", "recordedStation"))
                if (event.row().has(field)) row.set(field, event.row().get(field).deepCopy());
            row.put("sourceSessionId", event.sessionId());
        }
        root.set("coordinateScenes", checks.coordinateScenes());
        root.put("proofContract", "VALID requires sourceBoundChecks:{stations:[{path,quote,status:RECORDED|COORDINATES,proofs:[...]}],capabilities:[{path,quote,proofs:[{fieldPath,sourceValue}]}]}. "
                + "Every supplied target exactly once. RECORDED proof={eventId,stationId,sourcePath,sourceValue}, sourcePath is that cited event's recordedStation and sourceValue is copied literally. "
                + "COORDINATES proof={eventId,stationId,positionPath,positionValue:{x,y},stationPath,stationValue:{x,y},radiusPath,radiusValue}; copy every literal value, use a cited event and its actual scene/session. "
                + "No source/proof means unconfirmed, not a proven false action. Every capabilityUnit fieldPath needs a proof; fieldPath is an implementedCapabilities.fields key and sourceValue is that full unchanged descriptor; false implemented never supports delivery. "
                + "Do not equate shelf order/layout/text with a new highlight or forced bounds. Uncertainty/future observation questions are not asserted delivery. "
                + "When alternativeCauses are supplied add alternatives:[{path,quote,proofs:[{eventId,sourcePath,sourceValue}]}] to sourceBoundChecks; copy one supplied literalProofOption per alternative. "
                + "A help opening/empty cart is not a comprehension/fault report. A missing source requires a missing-evidence statement, not a named possibility or an assertion of a disproven cause. Client reports attest no independently identified human respondent or measured ability.");
        return root;
    }

    public static void validate(ObjectMapper mapper, JsonNode review, String candidate, String source) {
        validate(mapper, review, candidate, source, mapper.writeValueAsString(review));
    }
    public static void validate(ObjectMapper mapper, JsonNode review, String candidate, String source, String actualModelReview) {
        if (source == null || !"VALID".equals(review.path("verdict").asString())) return;
        var checks = new SourceBoundReviewChecks(mapper, candidate, source, actualModelReview);
        // Direct literal contradictions have their own technical origin. The actual model VALID
        // response remains untouched in audit; no synthetic model REPAIR response is generated.
        for (var claim : checks.stationClaims()) {
            var recorded = new HashSet<String>(); boolean coordinateAvailable = false;
            for (String id : claim.evidenceEventIds()) {
                var event = checks.events.get(id); if (event == null) continue;
                coordinateAvailable |= checks.point(event.row());
                var station = event.row().path("recordedStation").path("stationId");
                if (station.isString()) recorded.add(station.asString());
            }
            if (!coordinateAvailable && !checks.matches(claim, recorded))
                checks.reject(review, "STATION_PROXIMITY_MISMATCH", claim.path(), claim.quote(),
                        "Named-station proximity is not established by this claim's unchanged cited records. Do not infer false action or cognition; preserve the unconfirmed scope.", checks.literalProofs(claim));
        }
        for (var unit : checks.capabilityUnits()) for (String field : unit.fieldPaths())
            if (!checks.capabilities.path("fields").path(field).path("implemented").asBoolean())
                checks.reject(review, "UNSUPPORTED_CAPABILITY", unit.path(), unit.quote(),
                        "This concrete requested mechanism is absent from the implemented adaptive setting/control schema. Keep supported neighboring settings and unresolved effects.", Map.of(field, checks.capabilities.path("fields").path(field)));
        var requiredStations = checks.stationClaims(); var requiredCapabilities = checks.capabilityUnits();
        if (requiredStations.isEmpty() && requiredCapabilities.isEmpty() && !review.has("sourceBoundChecks")) return;
        var supplied = review.path("sourceBoundChecks");
        var keys = new HashSet<>(Set.of("stations", "capabilities"));
        if (supplied.has("alternatives")) keys.add("alternatives");
        if (!supplied.isObject() || !supplied.propertyNames().equals(keys)) checks.missing("/");
        checks.stationProofs(supplied.path("stations"), requiredStations);
        checks.capabilityProofs(supplied.path("capabilities"), requiredCapabilities);
    }

    private void stationProofs(JsonNode supplied, List<StationClaim> required) {
        if (!supplied.isArray() || supplied.size() != required.size()) missing(required.isEmpty() ? "/" : required.getFirst().path());
        var seen = new HashSet<String>();
        for (var check : supplied) {
            if (!check.isObject() || !check.propertyNames().equals(Set.of("path", "quote", "status", "proofs"))) missing("/sourceBoundChecks/stations");
            var claim = required.stream().filter(target -> target.path().equals(check.path("path").asString()) && target.quote().equals(check.path("quote").asString())).findFirst().orElse(null);
            if (claim == null || !seen.add(claim.path() + "\n" + claim.quote()) || !check.path("proofs").isArray() || check.path("proofs").isEmpty()) missing("/sourceBoundChecks/stations");
            var established = new HashSet<String>();
            for (var proof : check.path("proofs")) {
                String id = proof.path("eventId").asString(), station = proof.path("stationId").asString();
                var event = events.get(id);
                if (event == null || !claim.evidenceEventIds().contains(id) || !claim.stationIds().contains(station)) missing(claim.path());
                if ("RECORDED".equals(check.path("status").asString())) {
                    if (!proof.isObject() || !proof.propertyNames().equals(Set.of("eventId", "stationId", "sourcePath", "sourceValue"))
                            || !proof.path("sourcePath").asString().equals(event.path() + "/recordedStation")
                            || !proof.path("sourceValue").equals(event.row().path("recordedStation"))
                            || !station.equals(proof.path("sourceValue").path("stationId").asString())) missing(claim.path());
                } else if ("COORDINATES".equals(check.path("status").asString())) {
                    if (!coordinateProof(proof, event, station)) missing(claim.path());
                } else missing(claim.path());
                established.add(station);
            }
            if (!matches(claim, established)) missing(claim.path());
        }
    }
    private boolean coordinateProof(JsonNode proof, EventSource event, String station) {
        if (!proof.isObject() || !proof.propertyNames().equals(Set.of("eventId", "stationId", "positionPath", "positionValue", "stationPath", "stationValue", "radiusPath", "radiusValue"))
                || !proof.path("positionPath").asString().equals(event.path()) || !point(event.row())
                || !point(proof.path("positionValue")) || !proof.path("positionValue").propertyNames().equals(Set.of("x", "y"))) return false;
        for (String key : List.of("x", "y")) if (!event.row().path(key).equals(proof.path("positionValue").path(key))) return false;
        String stationPath = proof.path("stationPath").asString(), radiusPath = proof.path("radiusPath").asString();
        if (!stationPath.endsWith("/recordedGeometry/stations/" + station) || !stationPath.startsWith("/" + MovementSourceContext.FIELD + "/sessions/")
                || !stationPath.contains("/sceneSources/") || !radiusPath.endsWith("/movementContext/interactionRadius") || !radiusPath.startsWith("/" + MovementSourceContext.FIELD + "/sessions/")
                || !radiusPath.contains("/collectorContexts/")) return false;
        var sessionPath = stationPath.substring(0, stationPath.indexOf("/sceneSources/"));
        if (!Objects.equals(event.sessionId(), source.at(sessionPath).path("sessionId").asString()) || !radiusPath.startsWith(sessionPath + "/collectorContexts/")) return false;
        var scenePath = stationPath.substring(0, stationPath.indexOf("/recordedGeometry/"));
        var scene = source.at(scenePath);
        if (!scene.path("sourceEventId").asString().matches("E[1-9][0-9]*")
                || Integer.parseInt(scene.path("sourceEventId").asString().substring(1)) > Integer.parseInt(event.row().path("id").asString().substring(1))) return false;
        int latestScene = 0;
        for (var recorded : source.at(sessionPath).path("sceneSources")) {
            String id = recorded.path("sourceEventId").asString();
            if (!id.matches("E[1-9][0-9]*")) continue;
            int sequence = Integer.parseInt(id.substring(1));
            if (sequence <= Integer.parseInt(event.row().path("id").asString().substring(1))) latestScene = Math.max(latestScene, sequence);
        }
        if (Integer.parseInt(scene.path("sourceEventId").asString().substring(1)) != latestScene) return false;
        var actualStation = source.at(stationPath); var radius = source.at(radiusPath);
        if (!point(actualStation) || !actualStation.equals(proof.path("stationValue")) || !radius.isNumber() || !radius.equals(proof.path("radiusValue")) || radius.asDouble() <= 0) return false;
        double distance = Math.hypot(event.row().path("x").asDouble() - actualStation.path("x").asDouble(), event.row().path("y").asDouble() - actualStation.path("y").asDouble());
        return distance <= radius.asDouble() + 1e-7;
    }
    private void capabilityProofs(JsonNode supplied, List<CapabilityUnit> required) {
        if (!supplied.isArray() || supplied.size() != required.size()) missing(required.isEmpty() ? "/" : required.getFirst().path());
        var seen = new HashSet<String>();
        for (var check : supplied) {
            if (!check.isObject() || !check.propertyNames().equals(Set.of("path", "quote", "proofs"))) missing("/sourceBoundChecks/capabilities");
            var unit = required.stream().filter(target -> target.path().equals(check.path("path").asString()) && target.quote().equals(check.path("quote").asString())).findFirst().orElse(null);
            if (unit == null || !seen.add(unit.path() + "\n" + unit.quote()) || !check.path("proofs").isArray() || check.path("proofs").size() != unit.fieldPaths().size()) missing("/sourceBoundChecks/capabilities");
            var fields = new HashSet<String>();
            for (var proof : check.path("proofs")) {
                String field = proof.path("fieldPath").asString();
                if (!proof.isObject() || !proof.propertyNames().equals(Set.of("fieldPath", "sourceValue")) || !unit.fieldPaths().contains(field) || !fields.add(field)
                        || !proof.path("sourceValue").equals(capabilities.path("fields").path(field))
                        || !proof.path("sourceValue").path("implemented").asBoolean()) missing("/sourceBoundChecks/capabilities");
            }
        }
    }

    /** Size known proof/quote JSON plus headroom; never return it as a review or apply it. */
    public static int outputTokens(ObjectMapper mapper, String candidate, String source) {
        var checks = new SourceBoundReviewChecks(mapper, candidate, source);
        var stationClaims = checks.stationClaims(); var capabilityUnits = checks.capabilityUnits();
        var causes = AlternativeCauseSourceChecks.claims(mapper,candidate,checks.source);
        if (stationClaims.isEmpty() && capabilityUnits.isEmpty() && causes.isEmpty()) return AnalysisPlanSemanticReview.OUTPUT_TOKENS;
        var sizing = mapper.createObjectNode().put("verdict", "VALID");
        sizing.set("checkedDimensions", mapper.valueToTree(AnalysisPlanSemanticReview.DIMENSIONS)); sizing.putArray("issues");
        var bound = sizing.putObject("sourceBoundChecks"); var stations = bound.putArray("stations");
        for (var claim : stationClaims) {
            var row = stations.addObject().put("path", claim.path()).put("quote", claim.quote()).put("status", "COORDINATES");
            var proofs = row.putArray("proofs");
            for (String station : claim.stationIds()) {
                String id = claim.evidenceEventIds().stream().max(Comparator.comparingInt(String::length)).orElse("E999999999");
                var event = checks.events.get(id);
                var proof = proofs.addObject().put("eventId", id).put("stationId", station)
                        .put("positionPath", event == null ? "/sourceMovementContext/sessions/999/movementEventDetails/99999" : event.path());
                proof.set("positionValue", mapper.createObjectNode().put("x", 9999.999).put("y", 9999.999));
                proof.put("stationPath", "/sourceMovementContext/sessions/999/sceneSources/999/recordedGeometry/stations/" + station);
                proof.set("stationValue", mapper.createObjectNode().put("x", 9999.999).put("y", 9999.999));
                proof.put("radiusPath", "/sourceMovementContext/sessions/999/collectorContexts/999/movementContext/interactionRadius");
                proof.put("radiusValue", 9999.999);
            }
        }
        var units = bound.putArray("capabilities");
        for (var unit : capabilityUnits) {
            var row = units.addObject().put("path", unit.path()).put("quote", unit.quote()); var proofs = row.putArray("proofs");
            for (String field : unit.fieldPaths()) proofs.addObject().put("fieldPath", field).set("sourceValue", checks.capabilities.path("fields").path(field));
        }
        var cognition = sizing.putArray("cognitionChecks");
        for (String path : CognitionReviewClaims.locate(mapper, candidate).keySet()) cognition.addObject().put("path", path).put("status", "UNCERTAIN_OR_PROPOSED").putNull("sourcePath");
        if (!causes.isEmpty()) {
            var alternatives = bound.putArray("alternatives");
            for (var cause : causes) {
                var row=alternatives.addObject().put("path",cause.path()).put("quote",cause.quote());
                row.set("proofs",mapper.valueToTree(cause.literalProofOptions()));
            }
        }
        return Math.max(AnalysisPlanSemanticReview.OUTPUT_TOKENS, Math.addExact(QwenTokenCounter.count(sizing.toString()), 800));
    }

    private JsonNode coordinateScenes() {
        var result = mapper.createArrayNode(); var required = new HashSet<String>(); stationClaims().forEach(claim -> required.addAll(claim.stationIds()));
        int sessionIndex = 0;
        for (var session : source.path(MovementSourceContext.FIELD).path("sessions")) {
            String prefix = "/" + MovementSourceContext.FIELD + "/sessions/" + sessionIndex++;
            int index = 0;
            for (var scene : session.path("sceneSources")) {
                String path = prefix + "/sceneSources/" + index++;
                var row = result.addObject().put("sessionId", session.path("sessionId").asString()).put("sourcePath", path);
                if (scene.has("sourceEventId")) row.set("sourceEventId", scene.get("sourceEventId"));
                var points = row.putArray("stationSources");
                for (String id : required) {
                    var value = scene.path("recordedGeometry").path("stations").path(id);
                    if (!point(value)) continue;
                    points.addObject().put("stationId", id).put("sourcePath", path + "/recordedGeometry/stations/" + id).set("sourceValue", value);
                }
            }
            index = 0;
            for (var context : session.path("collectorContexts")) {
                String path = prefix + "/collectorContexts/" + index++ + "/movementContext/interactionRadius";
                var radius = context.path("movementContext").path("interactionRadius");
                if (radius.isNumber()) result.addObject().put("sessionId", session.path("sessionId").asString()).put("sourcePath", path).set("sourceValue", radius);
            }
        }
        return result;
    }

    private List<StationClaim> stationClaims() {
        var result = new ArrayList<StationClaim>();
        for (var entry : text.entrySet()) for (String clause : clauses(entry.getValue())) {
            if (!PAST_PROXIMITY.matcher(clause).find() || UNCERTAIN.matcher(clause).find() || NEGATIVE_PROXIMITY.matcher(clause).find()) continue;
            var ids = namedStations(clause); if (ids.isEmpty()) continue;
            var parent = entry.getKey().endsWith("/text") ? analysis.at(entry.getKey().substring(0, entry.getKey().length()-5)) : mapper.createObjectNode();
            var citations = new ArrayList<String>(); parent.path("evidenceEventIds").forEach(id -> citations.add(id.asString()));
            result.add(new StationClaim(entry.getKey(), clause, ids, Pattern.compile("또는|혹은|\\bor\\b|중 한|중 하나").matcher(clause).find(), citations));
        }
        return result;
    }
    private List<CapabilityUnit> capabilityUnits() {
        var result = new ArrayList<CapabilityUnit>();
        for (var entry : text.entrySet()) {
            if (!entry.getKey().startsWith("/practicePlan/") && !entry.getKey().endsWith("/suggestedSupport")) continue;
            for (String clause : clauses(entry.getValue())) {
                if (!FUTURE_DELIVERY.matcher(clause).find() || NO_DELIVERY.matcher(clause).find() || UNCERTAIN.matcher(clause).find()) continue;
                var fields = new LinkedHashSet<String>();
                if(Pattern.compile("(?:목표|매대|이동|방향).{0,12}화살표").matcher(clause).find())fields.add("/ui/targetDirectionArrow");
                if(Pattern.compile("(?:장바구니|카트|수량|상품).{0,20}(?:부족|미달).{0,12}(?:알림|경고)").matcher(clause).find())fields.add("/ui/cartShortageAlert");
                if(Pattern.compile("자동.{0,12}(?:도움말|힌트).{0,8}(?:열|표시|제공)").matcher(clause).find())fields.add("/ui/automaticHelp");
                if (Pattern.compile("시각적으로\\s*강조|시각적\\s*강조|강조\\s*표시|\\bhighlight\\b").matcher(clause).find()) fields.add("/ui/visualEmphasis");
                if (Pattern.compile("탐색\\s*범위.{0,8}제한|강제.{0,8}이동\\s*범위").matcher(clause).find()) fields.add("/ui/forcedExplorationBounds");
                if (fields.isEmpty()) {
                    // Explicit setting vocabulary binds to the actual full adaptive schema;
                    // generic observation/reading questions do not promise a new mechanism.
                    for (String path : capabilities.path("fields").propertyNames()) {
                        String field = path.substring(path.lastIndexOf('/') + 1);
                        if (clause.contains(field)) fields.add(path);
                    }
                    if (Pattern.compile("직원\\s*(?:수|배치)|종업원\\s*(?:수|배치)").matcher(clause).find()) fields.add("/runtimePlan/environment/employeeCount");
                    if (Pattern.compile("손님\\s*수|고객\\s*수").matcher(clause).find()) fields.add("/runtimePlan/environment/customerCount");
                    if (clause.contains("기둥")) fields.add("/runtimePlan/environment/pillarCount");
                    if (clause.contains("의자")) fields.add("/runtimePlan/environment/chairCount");
                    if (clause.contains("계산원")) fields.add("/runtimePlan/environment/cashierCount");
                    if (clause.contains("키오스크")) fields.add("/runtimePlan/environment/kioskLane");
                    if (clause.contains("공사")) fields.add("/runtimePlan/environment/entranceConstruction");
                    if (Pattern.compile("레이아웃|매장\\s*(?:구조|형태)|지도\\s*(?:구조|템플릿)|맵\\s*(?:구조|템플릿)").matcher(clause).find()) fields.add("/runtimePlan/environment/layoutId");
                    if (Pattern.compile("매대\\s*(?:순서|배치)|상품군\\s*(?:순서|배치)").matcher(clause).find()) fields.add("/environmentPlan/shelfOrder");
                    if (clause.contains("품절")) fields.add("/runtimePlan/learning/stockoutProductId");
                    if (clause.contains("대체")) fields.add("/runtimePlan/learning/allowSubstitution");
                    if (Pattern.compile("추가\\s*음료|추가\\s*상품").matcher(clause).find()) fields.add("/runtimePlan/learning/budgetChoiceEnabled");
                    if (Pattern.compile("영수증|과다\\s*청구|결제\\s*오류").matcher(clause).find()) fields.add("/runtimePlan/learning/checkoutReviewMode");
                    if (clause.contains("재고")) fields.add("/runtimePlan/stockOverrides");
                    if (Pattern.compile("제한\\s*시간|시간\\s*제한").matcher(clause).find()) fields.add("/timeLimitSeconds");
                    if (Pattern.compile("문자\\s*지원|텍스트\\s*안내|안내\\s*문장|SIMPLIFIED|STANDARD|REDUCED").matcher(clause).find()) fields.add("/briefing");
                    if (Pattern.compile("직원\\s*(?:문의|도움|요청)").matcher(clause).find()) fields.add("/controls/staff");
                }
                if (!fields.isEmpty()) result.add(new CapabilityUnit(entry.getKey(), clause, List.copyOf(fields)));
            }
        }
        return result;
    }
    private List<String> namedStations(String clause) {
        var ids = new LinkedHashSet<String>();
        for (String id : MarketAiQuestValidator.SHELF_CATEGORY_IDS)
            if (Pattern.compile("(?<![A-Za-z0-9_-])" + Pattern.quote(id) + "(?![A-Za-z0-9_-])").matcher(clause).find()) ids.add(id);
        var names = Map.of("exit", List.of("출구", "퇴장문"), "entrance", List.of("입구", "출입구"), "common-door", List.of("공동 출입문", "common-door"));
        names.forEach((id, labels) -> { if (labels.stream().anyMatch(clause::contains)) ids.add(id); });
        return List.copyOf(ids);
    }
    private List<String> clauses(String value) {
        return Arrays.stream(value.split("(?<=[,，;.!?。])\\s*|(?<=으나)|(?<=지만)")).map(String::strip).filter(part -> !part.isEmpty()).toList();
    }
    private boolean matches(StationClaim claim, Set<String> stations) {
        return claim.anyStation() ? claim.stationIds().stream().anyMatch(stations::contains) : stations.containsAll(claim.stationIds());
    }
    private boolean point(JsonNode node) { return node.path("x").isNumber() && node.path("y").isNumber() && Double.isFinite(node.path("x").asDouble()) && Double.isFinite(node.path("y").asDouble()); }
    private void indexEvents(JsonNode rows, String path, String parentSession) {
        int index = 0;
        for (var row : rows) {
            if (row.path("id").asString().matches("E[1-9][0-9]*")) events.put(row.path("id").asString(),
                    new EventSource(path + "/" + index, row, row.has("sessionId") ? row.path("sessionId").asString() : parentSession));
            index++;
        }
    }
    private void collect(JsonNode node, String path) {
        if (node.isString()) text.put(path, node.asString());
        else if (node.isArray()) { int index = 0; for (var row : node) collect(row, path + "/" + index++); }
        else if (node.isObject() && node.path("text").isString()) text.put(path + "/text", node.path("text").asString());
    }
    private void missing(String path) { throw new ReviewEvidenceException("REVIEW_SOURCE_BOUND_CHECK_REQUIRED", path, List.of()); }
    private JsonNode literalProofs(StationClaim claim) {
        var proofs = mapper.createArrayNode();
        for (String id : claim.evidenceEventIds()) {
            var event = events.get(id); if (event == null) continue;
            var proof = proofs.addObject().put("eventId", id).put("sourcePath", event.path());
            for (String field : List.of("eventCode", "timeMs", "recordedStation", "x", "y"))
                if (event.row().has(field)) proof.set(field, event.row().get(field).deepCopy());
            if (!event.row().has("recordedStation")) proof.put("stationFieldStatus", "NOT_RECORDED");
        }
        return proofs;
    }
    private void reject(JsonNode review, String code, String path, String quote, String explanation, Object proof) {
        throw AnalysisPlanSemanticReview.Rejected.sourceBound(actualModelReview == null ? mapper.writeValueAsString(review) : actualModelReview, new Issue(code, path, quote, explanation, proof));
    }
}
