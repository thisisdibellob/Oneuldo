package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

@EnabledIfEnvironmentVariable(named="AI_TOKEN_DIAGNOSTIC", matches="true")
class FinalPromptCompactionDiagnosticsTest {
    @Test void 새_퀘스트_실패는_토큰이_아닌_고정시나리오_예산_불일치다() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var report=mapper.readTree(Files.readString(Path.of("build/diagnostics/final-quest-1788610421796/report.json")));
        assertThat(report.path("analysisResponse").path("status").asString()).isEqualTo("READY");
        var validator=new oneuldo.behaviorlog.personalization.service.MarketAiQuestValidator();
        int expectedBudget=oneuldo.behaviorlog.personalization.service.MarketQuestCatalog.requireScenario("S01").budget();
        assertThat(expectedBudget).isEqualTo(7000);
        for(var attempt:report.path("questAttempts")) {
            var raw=(ObjectNode)mapper.readTree(attempt.path("rawOutput").asString());
            var draft=mapper.treeToValue(raw,oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft.class);
            assertThat(draft.budget()).isEqualTo(5800);
            assertThatThrownBy(()->validator.validate(draft,2)).hasMessage("AI 장보기 퀘스트 검증 실패: 시나리오 콘텐츠 계약");
            // Diagnostic counterfactual only; never save this edited output or replace the model response.
            raw.put("budget",expectedBudget);
            assertThatCode(()->validator.validate(mapper.treeToValue(raw,oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft.class),2)).doesNotThrowAnyException();
        }
    }

    @Test void 저장된_최종요청의_토큰과_원문동일성을_비교한다() throws Exception {
        var mapper = JsonMapper.builder().findAndAddModules().build();
        var report = mapper.readTree(Files.readString(Path.of("build/diagnostics/final-quest-1788607901682/report.json")));
        var attempts = report.path("analysisRun").path("attempts");
        var last = attempts.get(attempts.size()-1);
        String system = last.path("systemPrompt").asString(), old = last.path("inputPrompt").asString();
        var tables = new LosslessTables(mapper);
        var root = (ObjectNode) tables.decode(mapper.readTree(old));
        var compactor = new FinalAnalysisPromptCompactor(mapper);
        String compact = compactor.compact(root);
        var decoded = tables.decode(mapper.readTree(compact));
        var before = new CompactBehaviorTimeline(mapper).decodeExpanded(root.path("behaviorTimeline"));
        var after = decoded.path("behaviorTimeline");
        if (LosslessEventColumns.FORMAT.equals(after.path("encoding").asString())) after = new LosslessEventColumns(mapper).decode(after);
        else if (after.has("encoding")) after = new CompactBehaviorTimeline(mapper).decodeExpanded(after);
        assertThat(after).isEqualTo(before);
        for (String field : new String[]{"chunkAnalyses","taskContext","coverage"}) assertThat(decoded.path(field)).isEqualTo(root.path(field));
        var result = mapper.createObjectNode();
        result.put("oldReservedTokens", QwenTokenCounter.inputTokens(system, old)+900);
        result.put("instructionsOnlyReservedTokens", QwenTokenCounter.inputTokens(system, mapper.writeValueAsString(tables.encode(compactor.compactInstructions(root))))+900);
        result.put("newReservedTokens", QwenTokenCounter.inputTokens(FinalAnalysisPromptCompactor.systemPrompt(), compact)+900);
        result.put("withRetryReservedTokens", QwenTokenCounter.inputTokens(FinalAnalysisPromptCompactor.systemPrompt(), compact+"\n구조와 실제 사건 참조를 수정하세요. JSON 하나만 출력하세요.")+900);
        result.put("events", before.path("eventCount").asInt()); result.put("lossless", true);
        assertThat(result.path("events").asInt()).isEqualTo(26);
        assertThat(result.path("withRetryReservedTokens").asInt()).isLessThanOrEqualTo(7000);
        result.set("newPrompt", mapper.readTree(compact));
        Files.writeString(Path.of("build/diagnostics/final-prompt-compaction.json"), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(result));
        System.out.println("FINAL_COMPACTION before="+result.path("oldReservedTokens")+" instructions="+result.path("instructionsOnlyReservedTokens")+" after="+result.path("newReservedTokens"));
    }
}
