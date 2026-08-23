package oneuldo.ai.service;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import oneuldo.quest.dto.QuestDetailResponse;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class KoreanPublicTransportRuleBook {

    private static final String RESOURCE_PATH = "ai/korean-public-transport-rules.json";

    private final RuleBook ruleBook;

    public KoreanPublicTransportRuleBook(ObjectMapper objectMapper) {
        try (InputStream input = new ClassPathResource(RESOURCE_PATH).getInputStream()) {
            this.ruleBook = objectMapper.readValue(input, RuleBook.class);
        } catch (IOException exception) {
            throw new IllegalStateException("한국 대중교통 규칙 파일을 읽을 수 없습니다.", exception);
        }
    }

    public SelectedRules select(QuestDetailResponse quest) {
        String searchable = searchableText(quest).toUpperCase(Locale.ROOT);
        String selectedMode = ruleBook.modes().entrySet().stream()
                .filter(entry -> entry.getValue().keywords().stream()
                        .map(keyword -> keyword.toUpperCase(Locale.ROOT))
                        .anyMatch(searchable::contains))
                .map(Map.Entry::getKey)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("버스 또는 지하철 퀘스트만 AI로 생성할 수 있습니다."));
        ModeRules modeRules = ruleBook.modes().get(selectedMode);
        List<String> rules = new ArrayList<>(ruleBook.commonRules());
        rules.addAll(modeRules.rules());
        return new SelectedRules(ruleBook.version(), selectedMode, List.copyOf(rules), ruleBook.forbiddenClaims());
    }

    private String searchableText(QuestDetailResponse quest) {
        List<String> values = new ArrayList<>(List.of(
                safe(quest.code()), safe(quest.title()), safe(quest.summary()), safe(quest.goal())
        ));
        quest.steps().forEach(step -> {
            values.add(safe(step.instruction()));
            values.add(safe(step.situation()));
            values.add(safe(step.hint()));
        });
        return String.join(" ", values);
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    public record SelectedRules(
            String version,
            String mode,
            List<String> rules,
            List<String> forbiddenClaims
    ) {
        public String promptBlock() {
            List<String> lines = new ArrayList<>();
            lines.add("한국 대중교통 규칙 버전: " + version);
            lines.add("교통수단: " + ("SUBWAY".equals(mode) ? "지하철" : "버스"));
            lines.add("반드시 지킬 사실:");
            rules.forEach(rule -> lines.add("- " + rule));
            lines.add("생성 금지 내용:");
            forbiddenClaims.forEach(claim -> lines.add("- " + claim));
            return String.join("\n", lines);
        }
    }

    private record RuleBook(
            String version,
            List<String> commonRules,
            LinkedHashMap<String, ModeRules> modes,
            List<String> forbiddenClaims
    ) {
    }

    private record ModeRules(List<String> keywords, List<String> rules) {
    }
}
