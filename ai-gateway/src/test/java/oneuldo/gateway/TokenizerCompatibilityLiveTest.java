package oneuldo.gateway;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;

/** Native reference for a separately verified older Linux Python tokenizer bridge. */
@EnabledIfEnvironmentVariable(named="AI_SPEED_QUALITY_TOKENIZER_REFERENCE", matches="true")
class TokenizerCompatibilityLiveTest {
    @Test void pinned_native_reference_covers_unicode_numeric_and_source_rows() throws Exception {
        var texts = List.of("", "한국어 수량 2개, 예산 10000원", "원본 좌표 710.123456789 / false / 0 / 수량2",
                "{\"eventId\":\"E2336\",\"position\":[-0.000001,710.123456789],\"controlSource\":\"SYSTEM_COMPLETION\"}",
                "👩🏽‍💻 이동→매대\n한글\t日本語 é é", "token ".repeat(10000));
        var nativeCounts = texts.stream().map(QwenTokenCounter::count).toList();
        var mapper = JsonMapper.builder().build();
        var settings = new GatewaySettings(java.net.URI.create("http://127.0.0.1:11434"),
                java.time.Duration.ofMinutes(30), java.time.Duration.ofSeconds(1), 1,
                Map.of("reference", "a".repeat(64)));
        assertThat(new GatewayTokenCounter(mapper, settings).count(texts)).isEqualTo(nativeCounts);
        var out = Path.of("../output/analysis-speed-quality-20261013/tokenizer-native-reference.json");
        Files.writeString(out, mapper.writeValueAsString(Map.of("texts",texts,"nativeCounts",nativeCounts)) + "\n");
    }
}
