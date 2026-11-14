package oneuldo.behaviorlog.personalization.service;

import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class ActualAdaptiveReviewBudgetTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    @Test void previous_v4_literal_cited_records_keep_reserved_values_without_new_decoder_interpretation() {
        var originals=mapper.readTree("{\"E1\":[{\"id\":\"E1\",\"eventCode\":\"SHOP.CART_OPENED\",\"$r\":7,\"$a\":[3,{\"=\":false}]}]}");
        var source=mapper.createObjectNode();source.put("datasetId","previous-v4");
        var previous=new oneuldo.behaviorlog.analysis.service.FinalSourceEncoding(mapper).encode(source);
        previous.put("adaptiveTransportVersion","shared-environment-v4");previous.set("citedOriginalRecords",originals);
        var decoded=AdaptiveQuestTransport.decode(mapper,previous);
        assertThat(decoded.path("citedOriginalRecords")).isEqualTo(originals);
        source.set("citedOriginalRecords",originals);
        assertThat(AdaptiveQuestTransport.decode(mapper,AdaptiveQuestTransport.encode(mapper,source))).isEqualTo(source);
    }
    @Test void actual_25889_token_review_retains_all_cited_originals_and_candidate_under_the_limit() throws Exception {
        var path=Path.of("../output/persona45-mcp-20261013/careful-checker-1/recommendation-2/v70-generation-stage-9cf5090a-952f-42b7-b636-2a0e1fc72d82-11.json");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(path));
        var attempt=mapper.readTree(Files.readString(path));
        String packed=attempt.path("validationDetails").path("submittedPrompt").asString();
        var source=AdaptiveQuestTransport.decode(mapper,mapper.readTree(packed));
        var candidate=mapper.readTree(attempt.path("rawOutput").asString());var draft=mapper.treeToValue(candidate,MarketAiQuestDraft.class);
        BehaviorAnalysisInput input=null;
        for(var row:mapper.readTree(Files.readString(Path.of("../output/persona45-mcp-20261013/auditor/input-snapshots.json"))))
            if("bc93a88d-e42c-47ba-b38f-de0881262da1".equals(row.path("id").asString()))input=mapper.treeToValue(row.path("input_data"),BehaviorAnalysisInput.class);
        assertThat(input).isNotNull();var evidence=AdaptiveQuestEvidence.build(mapper,input);
        // Rebuild the current lossless source projection from the saved immutable input;
        // old request fixtures predate actualConditions provenance.
        ((ObjectNode)source.path("recordedEvidence")).set("recordedTasks",evidence.path("recordedTasks"));
        packed=AdaptiveQuestTransport.encodeGeneration(mapper,source).toString();
        var service=new AdaptiveMarketQuestService(null,null,null,null,null,null,null,null,mapper);
        String review=service.reviewPrompt(source,evidence,candidate,draft,packed);
        int required=QwenTokenCounter.inputTokens(AdaptiveMarketQuestService.reviewSystem(),review)+AdaptiveMarketQuestService.REVIEW_OUTPUT_TOKENS+32;
        var envelope=mapper.readTree(review);
        assertThat(envelope.path("literalDeliveryFacts").path("scope").asString()).contains("FUTURE");
        var decoded=AdaptiveQuestTransport.decode(mapper,envelope.path("sourceAndCandidate"));
        assertThat(decoded.path("candidate")).isEqualTo(candidate);
        assertThat(decoded.path("citedOriginalRecords")).isEqualTo(service.citedOriginalRecords(evidence,candidate));
        for(String field:List.of("sourceEventDetails","navigationContext","recordedTasks"))
            assertThat(decoded.path("originalSource").path("recordedEvidence").path(field)).isEqualTo(evidence.path(field));
        var out=Path.of("build/test-records");Files.createDirectories(out);
        Files.writeString(out.resolve("actual-adaptive-review-budget.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("previousActualRequiredTokens",25889,"requiredTokens",required,"limit",24000,"allOriginalSourcesAndCandidatePreserved",true,"noModelCallOrNewPlay",true)));
        assertThat(required).isLessThanOrEqualTo(24000);
    }
}
