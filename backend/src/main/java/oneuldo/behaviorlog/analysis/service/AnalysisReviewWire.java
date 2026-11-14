package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.ObjectNode;

/** Copies literal lookup rows only. Never derives task checks, judgments, citations or prose. */
public final class AnalysisReviewWire {
    public static final String FORMAT="claim-evidence-v5-source-lookups";
    private AnalysisReviewWire() {}

    public static JsonNode expand(JsonNode envelope,AnalysisReferences refs) {
        if(!FORMAT.equals(envelope.path("reviewFormat").asString()))return envelope;
        envelope=ConcretePracticeSections.review(null,envelope);
        if(!envelope.isObject()||!envelope.propertyNames().equals(Set.of("reviewFormat","taskChecks","analysis","reviewNotes")))
            throw new ReviewEvidenceException("INVALID_REVIEW_WIRE_FIELDS","/",List.of());
        var expanded=(ObjectNode)envelope.deepCopy();
        expanded.put("reviewFormat",AnalysisReviewConsistency.FORMAT);
        var rows=expanded.putArray("stationClaims");
        refs.recordedStations().entrySet().stream().sorted(Comparator.comparingInt(e->Integer.parseInt(e.getKey().substring(1))))
            .forEach(entry->{var row=rows.addObject().put("eventId",entry.getKey());
                row.set("stationId",entry.getValue().path("stationId").deepCopy());row.set("kind",entry.getValue().path("kind").deepCopy());});
        return expanded;
    }

    public static String prompt(ObjectMapper mapper,String original) {
        return prompt(mapper,original,false);
    }
    public static String prompt(ObjectMapper mapper,String original,boolean concreteSections) {
        var decoded=new FinalSourceEncoding(mapper).decode(mapper.readTree(original));
        if("analysis-review-v59-concrete-sections".equals(decoded.path("reviewVersion").asString())&&decoded.path("concretePracticeResponseSections").asBoolean()==concreteSections)return original;
        decoded.put("reviewVersion","analysis-review-v59-concrete-sections");
        decoded.put("outputContract","""
            JSON exactly {reviewFormat:'claim-evidence-v5-source-lookups',taskChecks,analysis,reviewNotes:[string]}.
            taskChecks follows taskCheckShape. analysis fields: sessionAssessments,summary,findings,uncertainties,practicePlan,usedEvidenceCardIds:[];
            assessment={sessionId,judgment,explanation}; finding={id,skill,observation,interpretation,alternativeExplanations,suggestedSupport}.
            summary/observation/interpretation/alternatives/explanation are arrays of {text,evidenceEventIds}. No finding-level evidenceEventIds or claimChecks.
            Each finding/assessment has at most30 DISTINCT source IDs across all its claims; select relevant evidence or split distinct observations.
            practicePlan={targetFindingIds,goal,rationale:planBasisContract,recommendedDifficulty:1..3,itemCount:1..4,
            quantityComplexity:LOW|MEDIUM|HIGH,budgetPressure:LOW|MEDIUM|HIGH,textSupport:SIMPLIFIED|STANDARD|REDUCED,reasonCodes:[uppercase codes]}.
            Cite supplied same-session originals only. stationClaimSources is immutable source data, not an output field.
            """);
        decoded.put("stationIdentityContract","Read stationClaimSources when interpreting a cited station. UNKNOWN stays unknown; proximity/opening/exposure/selection differ. Runtime copies these exact immutable rows for existing checks; do not output stationClaims. Independent claim-to-source semantic review remains required.");
        decoded.put("generationOrder","Write taskChecks from original requirements/actions first; then sessionAssessments consistent with those AI-authored checks. Any UNMET=FAILURE; otherwise any UNKNOWN=UNDETERMINED; otherwise SUCCESS. Preserve unknown independent ability separately. Write findings and uncertainties before practicePlan references. Do not revise facts to fit a desired verdict. Each distinct fact/limitation once; retain source-backed differences and counterevidence.");
        decoded.put("taskConsistencyContract","Use taskCheckShape once per original session/objective. Compare accepted SKU/spec/package quantities and budget with actual cart/submission. Submission MET means a recorded submission, never task success/payment; task outcome follows system rules.");
        decoded.put("planBasisContract","rationale={observed:[{findingId,observationIndex}],unknownCauseIndexes:[int],proposedPractice:string,baselineDifficulty:original int|null,supportCapabilities:[TEXT_GUIDANCE|ITEM_QUANTITY_BUDGET|TIME_LIMIT|SHELF_CATEGORY_ORDER]}. Index existing findings/uncertainties; no new facts/citations. Only findings=[] permits findingId='$summary' with an existing cited summary index. Missing baseline difficulty=null. Include concretePracticeDesignRule in proposedPractice.");
        if(concreteSections) {
            decoded.put("concretePracticeResponseSections",true);
            decoded.put("planBasisContract",decoded.path("planBasisContract").asString().replace("proposedPractice:string","proposedPractice:{change:string,instructions:string,successCriteria:string,nextObservation:string}"));
            decoded.put("concretePracticeResponseRule","Write proposedPractice as exactly four nonempty Korean strings change,instructions,successCriteria,nextObservation; actual condition change, player steps (open shelf before selection/quantity, then check cart), exact achievement criteria, next recorded actions. Values have no section labels. This negotiated shape overrides the generic string example; no new facts or decisions are added by transport normalization.");
        }
        if(decoded.has("sessionSourceLedgerRule"))decoded.put("sessionSourceLedgerRule","Counts cover provided events, not ability: check integrity before absence claims. Opening cart/help proves no addition/reading/understanding. No submission proves no submission intent; nonexpired is not timeout. Synthetic provenance is known, human ability unknown. Separate execution owners and current/history sessions. Preserve partial steps and reached-then-lost quantities. Sources outrank ledger; anchors grant no extra citations. Samples are not a continuous route. AI chooses evidence-linked practice, never automatic advancement or mere goal copying.");
        var encoded = new FinalSourceEncoding(mapper).encodeReadable(decoded);
        encoded.set(LiteralEventIndex.FIELD, LiteralEventIndex.build(mapper, decoded));
        return mapper.writeValueAsString(encoded);
    }
}
