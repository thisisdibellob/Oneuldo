package oneuldo.ai.service;

import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class TransportIncidentCatalog {

    private static final String RESOURCE_PATH = "ai/transport-incident-templates.json";

    private final Catalog catalog;

    public TransportIncidentCatalog(ObjectMapper objectMapper) {
        try (InputStream input = new ClassPathResource(RESOURCE_PATH).getInputStream()) {
            this.catalog = objectMapper.readValue(input, Catalog.class);
        } catch (IOException exception) {
            throw new IllegalStateException("돌발상황 템플릿 파일을 읽을 수 없습니다.", exception);
        }
        catalog.modes().forEach((mode, templates) -> {
            if (templates.size() != 10) {
                throw new IllegalStateException(mode + " 돌발상황 템플릿은 정확히 10개여야 합니다.");
            }
        });
    }

    public IncidentTemplate require(String mode, String incidentType) {
        List<IncidentTemplate> templates = catalog.modes().get(mode);
        if (templates == null) throw new IllegalArgumentException("지원하지 않는 교통수단입니다.");
        return templates.stream()
                .filter(template -> template.id().equals(incidentType))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("선택한 교통수단에 허용되지 않은 돌발상황입니다."));
    }

    public String version() {
        return catalog.version();
    }

    public List<IncidentTemplate> templates(String mode) {
        List<IncidentTemplate> templates = catalog.modes().get(mode);
        if (templates == null) throw new IllegalArgumentException("지원하지 않는 교통수단입니다.");
        return List.copyOf(templates);
    }

    public record IncidentTemplate(
            String id,
            String title,
            String situationConstraint,
            List<String> requiredActions,
            List<String> forbiddenActions,
            List<String> situationAnchors,
            List<String> responseAnchors
    ) {
        public String promptBlock(String version) {
            StringBuilder block = new StringBuilder()
                    .append("돌발상황 템플릿 버전: ").append(version).append('\n')
                    .append("돌발상황 ID: ").append(id).append('\n')
                    .append("돌발상황: ").append(title).append('\n')
                    .append("반드시 섞을 조건: ").append(situationConstraint).append('\n')
                    .append("정답에 반영할 대처 행동:\n");
            requiredActions.forEach(action -> block.append("- ").append(action).append('\n'));
            block.append("정답으로 만들면 안 되는 행동:\n");
            forbiddenActions.forEach(action -> block.append("- ").append(action).append('\n'));
            return block.toString().trim();
        }
    }

    private record Catalog(String version, LinkedHashMap<String, List<IncidentTemplate>> modes) {
    }
}
