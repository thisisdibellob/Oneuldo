package oneuldo.behaviorlog.personalization.service;
import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
class ActualQuestRepairBudgetRegressionTest {
 @Test void actual_missing_description_repair_fits_the_real_transport_reserve() throws Exception {
  var mapper=JsonMapper.builder().findAndAddModules().build();var path=Path.of("/Users/bluem/Documents/GitHub/Oneuldo/output/persona-actual-15-v43-v34-20261011/group-02/round-02/generation-latest-v50.json");
  org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(path));var audit=mapper.readTree(Files.readString(path));var first=audit.path("attempts").get(0);var failed=audit.path("attempts").get(1);
  var original=(ObjectNode)mapper.readTree(failed.path("validationDetails").path("requestAudit").path("originalSourcePrompt").asString());var codec=new FinalSourceEncoding(mapper);var packed=codec.encode(original);assertThat(codec.decode(packed)).isEqualTo(original);
  var candidate=mapper.readTree(first.path("rawOutput").asString());var preserved=candidate.deepCopy();var details=mapper.convertValue(first.path("validationDetails"),Map.class);
  String request=MarketAiQuestService.structuralRepairRequest(mapper,packed.toString(),details,candidate);
  String system=MarketAiQuestService.structuralRepairSystemPrompt();
  int required=new AnalysisTokenBudget().total(system,request,1200);assertThat(required).isLessThanOrEqualTo(18000-256);assertThat(candidate).isEqualTo(preserved);
  Files.writeString(Path.of("../output/post-actual15-fixes-20261012/legacy-regression-reruns/actual-description-repair-v51-budget.json"),mapper.writeValueAsString(Map.of("required",required,"transportLimit",17744,"sourceAndCandidatePreserved",true)));
 }
 @Test void actual_second_round_budget_repair_keeps_source_and_candidate_and_fits() throws Exception {
  var mapper=JsonMapper.builder().findAndAddModules().build();
  var path=Path.of("/Users/bluem/Documents/GitHub/Oneuldo/output/persona-actual-15-v43-v34-20261011/group-02/round-02/generation-latest-v49.json");
  org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(path));
  var audit=mapper.readTree(Files.readString(path));var first=audit.path("attempts").get(0);var failed=audit.path("attempts").get(1);
  var original=(ObjectNode)mapper.readTree(failed.path("validationDetails").path("requestAudit").path("originalSourcePrompt").asString());
  var codec=new FinalSourceEncoding(mapper);var packed=codec.encode(original);assertThat(codec.decode(packed)).isEqualTo(original);
  var candidate=mapper.readTree(first.path("rawOutput").asString());var preserved=candidate.deepCopy();
  var details=mapper.convertValue(first.path("validationDetails"),Map.class);
  String request=MarketAiQuestService.budgetRepairRequest(mapper,packed.toString(),details,candidate);
  assertThat(candidate).isEqualTo(preserved);assertThat(request).contains("minimumBudget","maximumBudget","10100","14100");
  String system="Repair the rejected budget using the supplied numeric bounds. Preserve valid selected fields; if objectives change, recalculate their actual catalog cost. Return the complete quest JSON. "+new MarketAiQuestPromptFactory(mapper).systemPrompt();
  int required=new AnalysisTokenBudget().total(system,request,1200);assertThat(required).isLessThanOrEqualTo(18000);
  Files.writeString(Path.of("../output/post-actual15-fixes-20261012/legacy-regression-reruns/actual-budget-repair-v50-budget.json"),mapper.writeValueAsString(Map.of("required",required,"limit",18000,"sourceValuesAndCandidateUnchanged",true)));
 }
}
