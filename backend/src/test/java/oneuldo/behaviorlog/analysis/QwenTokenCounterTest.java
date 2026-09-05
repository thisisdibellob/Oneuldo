package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import org.junit.jupiter.api.Test;

class QwenTokenCounterTest {
    @Test void 실제_토크나이저는_내용에_따라_계산하고_긴_문장을_절단하지_않는다() {
        assertThat(QwenTokenCounter.count("hello")).isEqualTo(1);
        assertThat(QwenTokenCounter.count("hello ".repeat(20000))).isGreaterThan(19000);
        assertThat(QwenTokenCounter.count("가".repeat(100)))
                .isNotEqualTo(QwenTokenCounter.count("x".repeat(100)));
        assertThat(QwenTokenCounter.inputTokens("hello", "hello")).isEqualTo(66);
    }
}
