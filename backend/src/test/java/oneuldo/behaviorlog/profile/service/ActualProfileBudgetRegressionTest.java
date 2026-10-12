package oneuldo.behaviorlog.profile.service;
import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
class ActualProfileBudgetRegressionTest {
 private static Path recordOutput(String name) throws java.io.IOException {
  var directory=Path.of(System.getenv().getOrDefault("ONEULDO_TEST_RECORD_OUTPUT","build/test-records/actual-regression"));
  Files.createDirectories(directory);return directory.resolve(name);
 }

 @Test void lossless_transport_keeps_all_actual_profile_sources_and_fits() throws Exception {
  var mapper=JsonMapper.builder().findAndAddModules().build();
  var path=Path.of("/Users/bluem/Documents/GitHub/Oneuldo/output/persona-actual-15-v43-v34-20261011/group-01/round-03/profile-failed-v20-after-v54-audit.json");
  org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(path));
  var audit=mapper.readTree(Files.readString(path));var attempt=audit.path("attempts").get(0);
  var original=(tools.jackson.databind.node.ObjectNode)mapper.readTree(attempt.path("inputPrompt").asString());
  var codec=new FinalSourceEncoding(mapper);var packed=codec.encode(original);
  assertThat(codec.decode(packed)).isEqualTo(original);
  var budget=new AnalysisTokenBudget();String system=attempt.path("systemPrompt").asString();
  int before=budget.total(system,attempt.path("inputPrompt").asString(),2400);
  int after=budget.total(system,packed.toString(),2400);
  assertThat(after).isLessThanOrEqualTo(18000);
  Files.writeString(recordOutput("profile-lossless-transport-budget.json"),mapper.writeValueAsString(Map.of("before",before,"after",after,"limit",18000,"allOriginalFieldsAndValuesPreserved",true,"semanticProfileVersionUnchanged",AiUserProfilePromptFactory.VERSION)));
 }
 @Test void measure_actual_minsu_profile_failure_without_rewriting_source() throws Exception {
  var mapper=JsonMapper.builder().findAndAddModules().build();
  var path=Path.of("/Users/bluem/Documents/GitHub/Oneuldo/output/persona-actual-15-v43-v34-20261011/group-03/round-03/profile-failed-v20-audit.json");
  org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(path));
  String unchanged=Files.readString(path);var a=mapper.readTree(unchanged).path("attempts").get(0);
  int required=new AnalysisTokenBudget().total(a.path("systemPrompt").asString(),a.path("inputPrompt").asString(),a.path("outputMax").asInt());
  assertThat(Files.readString(path)).isEqualTo(unchanged);
  Files.writeString(recordOutput("actual-profile-failed-input-budget.json"),mapper.writeValueAsString(Map.of("required",required,"transportLimit",17744,"exceedsTransportLimit",required>17744,"rawAuditUnchanged",true,"actualModelCallMadeByThisCheck",false)));
 }

}
