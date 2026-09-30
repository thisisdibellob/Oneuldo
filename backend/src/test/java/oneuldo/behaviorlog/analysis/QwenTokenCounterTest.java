package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import org.junit.jupiter.api.Test;

class QwenTokenCounterTest {
    @Test void count_only_matches_full_encoding_including_unicode_and_parallel_calls() throws Exception {
        try (var stream=getClass().getResourceAsStream("/ai/tokenizers/qwen3.6-27b/tokenizer.json");
             var original=ai.djl.huggingface.tokenizers.HuggingFaceTokenizer.newInstance(stream,
                     java.util.Map.of("addSpecialTokens","false","truncation","false","padding","false"))) {
            var texts=new java.util.ArrayList<>(java.util.List.of("", "hello", " Hello WORLD ", "\t\n\r  ",
                    "장보기: 우유 2개 → 1개", "é e\u0301 Å 中文 العربية", "🛒👩‍👩‍👧‍👦\u0000", "<|im_start|>user<|im_end|>",
                    "{\"x\":null,\"y\":false,\"z\":-1.25e-4}", "장보기 😀 hello ".repeat(10000)));
            var random=new java.util.Random(20260929);
            for(int i=0;i<100;i++) {
                var text=new StringBuilder();
                for(int j=0;j<100;j++) text.appendCodePoint(new int[]{32,65,97,233,0xAC00,0x4E2D,0x1F600}[random.nextInt(7)]);
                texts.add(text.toString());
            }
            var expected=texts.stream().map(text->original.encode(text).getIds().length).toList();
            java.util.stream.IntStream.range(0,texts.size()).parallel().forEach(i ->
                    assertThat(QwenTokenCounter.count(texts.get(i))).isEqualTo(expected.get(i)));
        }
    }

    @Test void interrupted_preparation_stops_before_another_native_encoding() {
        Thread.currentThread().interrupt();
        try { assertThatThrownBy(()->QwenTokenCounter.count("hello")).isInstanceOf(java.util.concurrent.CancellationException.class); }
        finally { Thread.interrupted(); }
        assertThat(QwenTokenCounter.count("hello")).isEqualTo(1);
    }

    @Test void 실제_토크나이저는_내용에_따라_계산하고_긴_문장을_절단하지_않는다() {
        assertThat(QwenTokenCounter.count("hello")).isEqualTo(1);
        assertThat(QwenTokenCounter.count("hello ".repeat(20000))).isGreaterThan(19000);
        assertThat(QwenTokenCounter.count("가".repeat(100)))
                .isNotEqualTo(QwenTokenCounter.count("x".repeat(100)));
        assertThat(QwenTokenCounter.inputTokens("hello", "hello")).isEqualTo(66);
    }
}
