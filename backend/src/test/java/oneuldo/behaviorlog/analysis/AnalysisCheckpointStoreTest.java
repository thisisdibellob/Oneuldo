package oneuldo.behaviorlog.analysis;

import java.util.UUID;
import oneuldo.behaviorlog.analysis.repository.AiAnalysisCheckpointRepository;
import oneuldo.behaviorlog.analysis.service.AnalysisCheckpointStore;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class AnalysisCheckpointStoreTest {
    private final AnalysisCheckpointStore store = new AnalysisCheckpointStore(mock(AiAnalysisCheckpointRepository.class),JsonMapper.builder().build());
    private final UUID member=UUID.randomUUID(),dataset=UUID.randomUUID();
    String key(UUID owner, UUID source, String prompt) {
        return ReflectionTestUtils.invokeMethod(store,"key",owner,source,"fixed-system",prompt,1800);
    }
    @Test void repair_candidates_corrections_and_owner_are_part_of_the_checkpoint_key() {
        String source="{\"source\":\"original\"}\nCandidate: ";
        String first=key(member,dataset,source+"{\"judgment\":\"FAILURE\"}");
        assertThat(key(member,dataset,source+"{\"judgment\":\"SUCCESS\"}")).isNotEqualTo(first);
        assertThat(key(member,dataset,source+"{\"judgment\":\"FAILURE\"}\nRepair all citations")).isNotEqualTo(first);
        assertThat(key(UUID.randomUUID(),dataset,source+"{\"judgment\":\"FAILURE\"}")).isNotEqualTo(first);
        assertThat(key(member,UUID.randomUUID(),source+"{\"judgment\":\"FAILURE\"}")).isNotEqualTo(first);
    }
    @Test void one_json_document_reuses_only_equivalent_object_order_and_same_suffix() {
        assertThat(key(member,dataset,"{\"a\":1,\"b\":2}\nfixed suffix"))
                .isEqualTo(key(member,dataset,"{\"b\":2,\"a\":1}\nfixed suffix"));
        assertThat(key(member,dataset,"{\"a\":1,\"b\":2}\nchanged suffix"))
                .isNotEqualTo(key(member,dataset,"{\"a\":1,\"b\":2}\nfixed suffix"));
    }
}
