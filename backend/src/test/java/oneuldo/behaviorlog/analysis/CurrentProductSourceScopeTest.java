package oneuldo.behaviorlog.analysis;
import java.nio.file.*;import java.util.*;
import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputSnapshotRepository;
import oneuldo.behaviorlog.profile.repository.AiUserProfileRepository;
import oneuldo.behaviorlog.personalization.service.PracticeHistoryService;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class CurrentProductSourceScopeTest {
 @Test void skuConditionsStayBoundToTheOriginalMemberAndSession()throws Exception{
  var m=JsonMapper.builder().findAndAddModules().build();var manifest=Path.of("../output/grounded-profile-final-v104-nine-20261025/manifest.json");
  org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(manifest));
  var c=m.readTree(Files.readString(manifest)).path("cases").get(0);var input=m.readValue(Files.readString(Path.of(c.path("sourcePath").asString())),BehaviorAnalysisInput.class);
  String before=m.writeValueAsString(input);var member=UUID.randomUUID();var snapshots=mock(BehaviorAnalysisInputSnapshotRepository.class);
  when(snapshots.findByIdAndMemberId(input.datasetId(),member)).thenReturn(Optional.of(new BehaviorAnalysisInputSnapshot(mock(oneuldo.member.domain.Member.class),input)));
  var history=new PracticeHistoryService(mock(AiUserProfileRepository.class),snapshots,m);
  var rows=history.currentProductSources(member,input.datasetId(),input.sessions().getFirst().sessionId());
  assertThat(rows).isNotEmpty();assertThat(rows.valueStream().anyMatch(r->r.path("productId").asString().equals("milk")&&r.has("price")&&r.has("initialStock"))).isTrue();
  assertThat(history.currentProductSources(UUID.randomUUID(),input.datasetId(),input.sessions().getFirst().sessionId())).isEmpty();
  assertThat(history.currentProductSources(member,input.datasetId(),UUID.randomUUID())).isEmpty();
  assertThat(m.writeValueAsString(input)).isEqualTo(before);
 }
}
