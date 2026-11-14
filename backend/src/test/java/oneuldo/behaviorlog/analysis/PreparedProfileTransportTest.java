package oneuldo.behaviorlog.analysis;
import java.nio.file.*;import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.domain.*;import oneuldo.behaviorlog.analysis.service.*;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
class PreparedProfileTransportTest {
 @Test void everyPreparedSourceRestoresCurrentSkuValuesAndReadableHistoricalOutcomes()throws Exception{
  var m=JsonMapper.builder().findAndAddModules().build();var root=Path.of("../output/concrete-sections-nine-20261025");
  org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(root.resolve("profile-budget-preflight.json")));
  int checked=0;for(var c:m.readTree(Files.readString(root.resolve("manifest.json"))).path("cases")){
   var path=root.resolve("preflight-profiles").resolve(c.path("key").asString()).resolve("profile-attempts.json");if(!Files.exists(path))continue;
   var prompt=m.readTree(Files.readString(path)).get(0).path("inputPrompt").asString();var encoded=m.readTree(prompt);var decoded=new FinalSourceEncoding(m).decode(encoded);
   assertThat(decoded.path("historyOutcomeSources")).isEqualTo(encoded.path("historyOutcomeSources"));
   var input=m.readValue(Files.readString(Path.of(c.path("sourcePath").asString())),BehaviorAnalysisInput.class);var expected=m.createObjectNode();PracticeDesignContract.attach(m,expected,m.valueToTree(input));
   assertThat(decoded.path("currentProductSources")).isEqualTo(expected.path("practiceProductSources"));checked++;
  }
  assertThat(checked).isEqualTo(9);
 }
}
