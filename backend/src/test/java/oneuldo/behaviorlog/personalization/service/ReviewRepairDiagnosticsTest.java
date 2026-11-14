package oneuldo.behaviorlog.personalization.service;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
class ReviewRepairDiagnosticsTest {
 @Test void wrong_relative_path_and_overlong_prose_are_reported_without_rewriting_raw_review() {
  var mapper=JsonMapper.builder().build();String raw="{\"issues\":[{\"code\":\"PLAN_IMPLEMENTATION_MISMATCH\",\"path\":\"/deliveredQuest/adaptationSummary\",\"explanation\":\""+"x".repeat(277)+"\"}]}";
  var result=ReviewRepairDiagnostics.inspect(mapper,raw);assertThat(result).hasSize(2);
  assertThat(result.get(0)).containsEntry("path","/issues/0/path");assertThat(result.get(1)).containsEntry("submittedChars",277).containsEntry("maximumChars",240);
  assertThat(raw).contains("/deliveredQuest/adaptationSummary","x".repeat(277));
 }
}
