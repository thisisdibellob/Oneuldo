package oneuldo.behaviorlog.analysis.service;

import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** A second model pass, never a server-side rewrite of behavioral judgments. */
public final class AnalysisReviewPrompt {
    public static final String VERSION = "analysis-review-v50-grounded-repairs";
    private AnalysisReviewPrompt() {}
    public static String system() {
        return "Arrange observation clauses by the actual action timeline. Do not group all key presses across the session before describing earlier interleaved movements. A concise combined chronological clause can retain several related facts. Task definitions, time expiry and session end are comparison/coverage anchors, not new user actions. Cite them where needed without inventing missing actions. " + "Output compact single-line JSON without indentation or formatting whitespace. Preserve every needed source citation and objective comparison; do not repeat the same fact across several lengthy paragraphs. " + AnalysisSourceContext.FINAL_RULES
                + AdaptiveObservationGuidance.RULE
                + "원본에서 독립적으로 재검토하고 이전 초안을 답으로 삼지 않는다. "
                + "Write each claim with its supporting source IDs. Reconcile partial limitations against full raw coverage and retain unresolved limitations. "
                + "Output one JSON with reviewFormat, analysis, reviewNotes, taskChecks, stationClaims. Do not emit separate claimChecks; follow the supplied reviewed-claim format. "
                + "No stock reservation or real payment instructions. No directly supported alternative: use alternativeExplanations:[]; preserve unknown causes in uncertainties. Never put an object with empty evidenceEventIds inside alternativeExplanations or invent citations to fill it. "
                + "Every summary/observation/explanation claim needs nonempty evidenceEventIds, including absence claims. No E-number or E-number range in any claim text; citations belong only in evidenceEventIds. Check the whole response, not just a reported error path.";
    }

    public static String build(ObjectMapper mapper, String source, AiBehaviorAnalysis draft, AnalysisReferences refs) {
        ObjectNode original = new FinalSourceEncoding(mapper).decode(mapper.readTree(source));
        // Put the unchanged task and raw events before intermediate interpretations.
        ObjectNode root = mapper.createObjectNode();
        var decoded = original;
        for (String field : java.util.List.of("taskContext", SourceEventDetails.FIELD, MovementSourceContext.FIELD, "sourceCoverage"))
            if (decoded.has(field)) root.set(field, decoded.get(field));
        for (String field : original.propertyNames()) if (!root.has(field)) root.set(field, original.get(field));
        // Only replace this known application-authored rule; recorded movement values remain intact.
        if (root.path(MovementSourceContext.FIELD) instanceof ObjectNode movement
                && MovementSourceContext.LEGACY_RULE.equals(movement.path("rule").asString()))
            movement.put("rule", MovementSourceContext.RULE);
        root.put("reviewVersion", VERSION);
        // These application instructions are already covered by system and the review contracts.
        root.remove(java.util.List.of("sourceEventDetailsRule", "interpretationRule", "practiceCapabilities", "draftRule", "reviewSourcePolicy", "claimExample", "finalReviewInstruction"));
        root.put("eventSemantics", "ITEM_SEARCH_STARTED/MOVE_IN_MARKET automatically records movement start/restart, not search UI. Samples depend on collection/input, not wandering. Categories: produce=과일/채소,fresh=냉장 식품,drink=음료,meal=간편 식품; product location follows categoryId. STAFF_HELP_REQUESTED with viewHelp/VIEWHELP means general help, not staff consultation. GENERAL_HELP_OPENED proves no reading/dependence. Legacy market-micro-behavior-v2-content USER_ABORTED may mean completion/exit after submission. Follow system timing/termination boundaries.");
        root.put("stage", "REVIEW: independently write the final analysis from original events; prior draft prose is withheld.");
        root.put("assessmentScope", "Judge virtual shopping from original goals and actual actions. Real payment confirmation is unnecessary; cognition/motives/everyday ability stay uncertain.");
        root.put("taskConsistencyContract", "taskChecks: array, once per session. Compare EVERY accepted ID/spec/unit/purchase quantity with final cart/submission; each objective once, cite goal and action. All objective/budget/submission statuses MET|UNMET|UNKNOWN. Recorded submission=MET. SUCCESS requires all MET; any UNMET=FAILURE, otherwise UNKNOWN=UNDETERMINED. Lifecycle completion and budget cannot erase unmet goals. Apply consistently across analysis/plan; AI judges, server rejects contradictions.");
        root.set("taskCheckShape", mapper.readTree("""
                [{"sessionId":"제공된 세션 ID","objectives":[{"productId":"원본 목표 ID","status":"MET|UNMET|UNKNOWN","evidenceEventIds":["제공된 사건 ID"]}],
                  "budget":{"status":"MET|UNMET|UNKNOWN","evidenceEventIds":[]},"submission":{"status":"MET|UNMET|UNKNOWN","evidenceEventIds":[]}}]
                """));
        root.put("planBasisContract", "practicePlan.rationale={observed:[{findingId,observationIndex}],unknownCauseIndexes:[integer],proposedPractice:string,baselineDifficulty:original integer|null,supportCapabilities:[code]}. observed indexes existing finding.observation claims; unknownCauseIndexes indexes uncertainties or []. Add no new facts or evidence arrays. Proposed practice states next observation question, never a proven cause. Missing mission difficulty stays null. Capabilities: TEXT_GUIDANCE,ITEM_QUANTITY_BUDGET,TIME_LIMIT,SHELF_CATEGORY_ORDER only.");
        root.put("stationIdentityContract", "stationClaims: exact {eventId,stationId,kind} for each cited recordedStation, once. UNKNOWN stays unknown; doors are not shelves. Proximity/opening/exposure/selection differ. Product location follows catalog category and actual station, never frozen/chilled storage labels.");
        // Detailed judgment/support instructions occur once in system(), not in every source copy.
        root.remove(java.util.List.of("sourceReview", "goalComparison", "learningEvidence"));
        // Even an "observation" in the draft can contain an unsupported claim about reading or intent.
        // Keep that draft in the run audit, but do not prime the independent reviewer with its prose.
        root.remove("draftToReview");
        var rawIds=new java.util.HashSet<String>();
        for(var event:decoded.path(SourceEventDetails.FIELD)) rawIds.add(event.path("id").asString());
        for(var session:decoded.path(MovementSourceContext.FIELD).path("sessions"))
            for(var event:session.path("movementEventDetails")) rawIds.add(event.path("id").asString());
        int rawBackedObservations=0;
        // Preserve raw sources and uncovered observations; avoid repeating raw-backed AI prose.
        var oldChunks=root.path("chunkAnalyses");
        if(oldChunks.isArray()) {
            var chunks=root.putArray("chunkAnalyses");
            for(var chunk:oldChunks) {
                var context=mapper.createObjectNode();context.set("localLimitationsToRecheck",chunk.has("localLimitationsToRecheck") ? chunk.path("localLimitationsToRecheck") : chunk.path("uncertainties"));
                var observations=context.putArray("observations");
                for(var observation:chunk.path("observations")) {
                    var ids=observation.path("evidenceEventIds");
                    boolean covered=ids.isArray() && !ids.isEmpty();
                    for(var id:ids) covered &= rawIds.contains(id.asString());
                    // Deduplicate by source coverage, never by a behavioral label or interpretation.
                    // Raw events remain intact. Movement observations without raw detail remain available.
                    if(covered) {rawBackedObservations++;continue;}
                    var fact=observations.addObject();fact.set("observation",observation.path("observation"));
                    fact.set("evidenceEventIds",observation.path("evidenceEventIds"));
                }
                // Retain coverage limitations even when raw-backed observations are deduplicated.
                // Full raw actions do not establish missing dynamic map/NPC state.
                if (!observations.isEmpty() || !context.path("localLimitationsToRecheck").isEmpty()) chunks.add(context);
            }
        }
        root.put("rawBackedObservationsNotRepeated",rawBackedObservations);
        root.put("observationDefinition", "Narrate original actions chronologically. Opening/closing proves no checking/understanding. Submission is not end; last event/aggregate endedAt creates no end action. Cite recorded end separately. Summary may combine terminal observations; preserve detailed chronology and consistent scope.");
        root.put("interpretationDefinition", "Explain action-to-goal relationships and changes after actual support. Possibly does not ground a cognitive/intent claim; omit unsupported guesses, preserve uncertainty. Support is proposed. Missing goals/support limits scope. Goal fulfillment is separate from comprehension.");
        root.put("reviewChecklist", "Compare full coverage and counterevidence. Quantity1→2 proves no initial mistake/correction. Match plan and prose; preserve limits.");
        root.put("outputContract", "Envelope exactly {reviewFormat:'claim-evidence-v4',analysis,reviewNotes:[strings],taskChecks,stationClaims}. analysis={sessionAssessments,summary,findings,uncertainties:[strings],practicePlan,usedEvidenceCardIds:[supplied card IDs]}. Compare goals/cart/submission before verdict. Each sessionAssessment={sessionId,judgment:SUCCESS|FAILURE|UNDETERMINED,explanation}, once per session. Each finding={id,skill,observation,interpretation,alternativeExplanations,suggestedSupport}. summary/observation/interpretation/alternativeExplanations/explanation are arrays of {text,evidenceEventIds}, even one sentence. Factual claims need IDs; uncertain interpretation may use []. Each claim: unique supplied IDs, original order, max30; no inline E numbers, finding-level evidence arrays or claimChecks. Summary may cite task/start anchors independently. Keep new actions chronological; reused task/terminal anchors are not new actions. practicePlan={targetFindingIds,goal,rationale:planBasisContract,recommendedDifficulty:1-3,itemCount:1-4 distinct types,quantityComplexity:LOW|MEDIUM|HIGH,budgetPressure:LOW|MEDIUM|HIGH,textSupport:SIMPLIFIED|STANDARD|REDUCED,reasonCodes:[uppercase codes]}. No cards:usedEvidenceCardIds=[].");
        root.put("negativeObservationRule", "Absence needs relevant coverage anchors/citations; empty terminal cart alone does not rule out intermediate add/remove. No unrelated substitute IDs. Put interval absence with early/late anchors in a separate finding from sequential actions; never append earlier new actions after later ones.");
        root.put("movementChronologyRule", "Search/movement request is not arrival, opening or perception. Verify approach/exposure against proximity/position/screen records. Approach claimed after help requires later approach sources. Later movement and absent shelf opening are distinct; no add/change/remove across full coverage means no invented add-then-remove hypothesis.");
        root.set("taskComparisonSource", taskComparisonSource(mapper, decoded));
        var encoded = new FinalSourceEncoding(mapper).encodeReadable(root);
        var stationRows = encoded.putArray("stationClaimSources");
        refs.recordedStations().entrySet().stream()
                .sorted(java.util.Comparator.comparingInt(entry -> Integer.parseInt(entry.getKey().substring(1))))
                .forEach(entry -> {
                    var row = stationRows.addObject().put("eventId", entry.getKey());
                    row.set("stationId", entry.getValue().path("stationId").deepCopy());
                    row.set("kind", entry.getValue().path("kind").deepCopy());
                });
        encoded.put("stationClaimCopyInstruction", "Copy exact cited stationClaimSources rows, once per ID; UNKNOWN stays UNKNOWN. Omit unused rows. AI separately judges original goals/actions.");
        return mapper.writeValueAsString(encoded);
    }
    /** Read-only projection of provided requirements and submission records; no match or verdict computation. */
    public static ObjectNode taskComparisonSource(ObjectMapper mapper, tools.jackson.databind.JsonNode decoded) {
        var source = mapper.createObjectNode();
        var requirements = source.putArray("requirements");
        for (var task : decoded.path("taskContext")) {
            var requirement = requirements.addObject();
            for (String field : java.util.List.of("sessionId", "sourceEventId"))
                if (task.has(field)) requirement.set(field, task.get(field).deepCopy());
            // The full mission stays in taskContext. A predefined successMessage is not a play result.
            for (String field : java.util.List.of("objectives", "budget"))
                if (task.path("mission").has(field)) requirement.set(field, task.path("mission").get(field).deepCopy());
        }
        var products = source.putArray("selectedProducts");
        for (var event : decoded.path(SourceEventDetails.FIELD)) if (event.has("selectedProduct")) {
            var row = products.addObject();
            row.set("sourceEventId", event.path("id").deepCopy());
            row.set("sessionId", event.path("sessionId").deepCopy());
            row.set("product", event.path("selectedProduct").deepCopy());
        }
        var submissions = source.putArray("submissions");
        for (var event : decoded.path(SourceEventDetails.FIELD))
            if ("SHOP.CHECKOUT_SUBMITTED".equals(event.path("eventCode").asString())) submissions.add(event.deepCopy());
        return source;
    }
    public static String reviewedAnalysis(ObjectMapper mapper, String raw, AnalysisReferences refs) {
        var value=mapper.reader().with(tools.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(raw);
        return ReviewedClaimOutput.read(mapper,value,refs);
    }
    /** Live requests require current semantic checks; old saved responses remain readable through reviewedAnalysis. */
    public static String reviewedCurrentAnalysis(ObjectMapper mapper, String raw, AnalysisReferences refs) {
        var value=mapper.reader().with(tools.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(raw);
        AnalysisReviewConsistency.validate(value, refs);
        return ReviewedClaimOutput.read(mapper, value, refs);
    }
    /** Saved legacy claimChecks responses only. The live pipeline never falls back to this legacy contract. */
    public static String reviewedLegacyAnalysis(ObjectMapper mapper, String raw, AnalysisReferences refs) {
        var value=mapper.reader().with(tools.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(raw);
        if(!value.isObject() || !value.path("reviewNotes").isArray() || !value.path("analysis").isObject()
                || !value.path("claimChecks").isArray())
            throw new IllegalArgumentException("INVALID_REVIEW_ENVELOPE");
        for(var note:value.path("reviewNotes")) if(!note.isString()) throw new IllegalArgumentException("INVALID_REVIEW_NOTE");
        // Normalize the existing compact/full output contract and reference aliases before auditing paths.
        var analysis=refs.read(mapper.writeValueAsString(value.path("analysis")));
        var normalized=mapper.readTree(refs.encode(mapper.writeValueAsString(java.util.Map.of("analysis",analysis)))).path("analysis");
        ReviewEvidenceChecks.validate(normalized, value.path("claimChecks"), refs);
        return mapper.writeValueAsString(normalized);
    }
}
