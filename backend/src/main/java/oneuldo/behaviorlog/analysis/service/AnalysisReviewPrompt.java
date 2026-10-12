package oneuldo.behaviorlog.analysis.service;

import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** A second model pass, never a server-side rewrite of behavioral judgments. */
public final class AnalysisReviewPrompt {
    public static final String VERSION = "analysis-review-v51-exact-station-columns";
    private AnalysisReviewPrompt() {}
    public static String system() {
        return "Independently review originals, not prior draft prose. Korean single-line JSON in supplied claim-evidence-v4 envelope; no separate claimChecks. Narrate actual action order, not task/termination anchor order. Every factual/absence claim needs its own nonempty supporting evidenceEventIds; no inline E numbers/ranges or unrelated citations. Alternatives require source support, otherwise[]. Preserve objective comparisons, counterevidence and unresolved scope; cognition stays uncertain. "
                + AnalysisSourceContext.FINAL_RULES + AdaptiveObservationGuidance.RULE;
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

        root.put("stage", "REVIEW originals independently; draft prose withheld.");
        root.put("taskConsistencyContract", "taskChecks: one per session/objective; compare accepted SKU/spec/unit/package quantity against cart/submission with goal/action IDs. Each objective/budget/submission status MET|UNMET|UNKNOWN; recorded submission=MET. All MET=SUCCESS; any UNMET=FAILURE; otherwise UNDETERMINED. Lifecycle/budget never erases unmet goals. AI judges; server rejects contradictions.");
        root.set("taskCheckShape", mapper.readTree("""
                [{"sessionId":"ID","objectives":[{"productId":"ID","status":"MET|UNMET|UNKNOWN","evidenceEventIds":["ID"]}],
                  "budget":{"status":"MET|UNMET|UNKNOWN","evidenceEventIds":[]},"submission":{"status":"MET|UNMET|UNKNOWN","evidenceEventIds":[]}}]
                """));
        root.put("planBasisContract", "rationale={observed:[{findingId,observationIndex}],unknownCauseIndexes:[int],proposedPractice:string,baselineDifficulty:original int|null,supportCapabilities:[TEXT_GUIDANCE|ITEM_QUANTITY_BUDGET|TIME_LIMIT|SHELF_CATEGORY_ORDER]}. Index existing finding.observation/uncertainties only; no new facts/evidence arrays. Propose an observation, not a cause. Missing difficulty=null.");
        root.put("stationIdentityContract", "stationClaims={eventId,stationId,kind}, one per cited recordedStation. Keep UNKNOWN; door/proximity/opening/exposure/selection differ. Location=recorded category/station, not storage labels.");
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
        root.put("outputContract", "Exactly {reviewFormat:'claim-evidence-v4',analysis,reviewNotes:[string],taskChecks,stationClaims}. analysis={sessionAssessments,summary,findings,uncertainties:[string],practicePlan,usedEvidenceCardIds:[]}. sessionAssessment={sessionId,judgment,explanation}; finding={id,skill,observation,interpretation,alternativeExplanations,suggestedSupport}. summary/observation/interpretation/alternatives/explanation are arrays of {text,evidenceEventIds}: supplied IDs max30, uncertain interpretation may[]; no finding-level evidence or claimChecks. practicePlan={targetFindingIds,goal,rationale:planBasisContract,recommendedDifficulty:1..3,itemCount:1..4,quantityComplexity:LOW|MEDIUM|HIGH,budgetPressure:LOW|MEDIUM|HIGH,textSupport:SIMPLIFIED|STANDARD|REDUCED,reasonCodes:[uppercase codes]}. Use taskCheckShape and exact station rows.");
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
        var stationColumns=new FinalSourceColumns(mapper).encode(stationRows);
        if(QwenTokenCounter.count(stationColumns.toString())<QwenTokenCounter.count(stationRows.toString()))encoded.set("stationClaimSources",stationColumns);
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
