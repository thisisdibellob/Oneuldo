package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;

class PracticeDesignPromptTest {
    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void checksAreOffByDefaultAndLeaveThePromptUnchanged() {
        var factory = new MarketAiQuestPromptFactory(mapper);
        assertThat(factory.skillTransferChecks()).isFalse();
        assertThat(factory.reservedProductIds()).isEmpty();
        assertThat(factory.withPracticeDesign("{\"goal\":\"g\"}", mapper.createArrayNode())).isEqualTo("{\"goal\":\"g\"}");
    }

    @Test
    void enabledChecksAddCatalogFactsAndTheMissedFamilyFromRecordedPurchases() {
        var factory = new MarketAiQuestPromptFactory(mapper);
        ReflectionTestUtils.setField(factory, "skillTransferChecks", true);
        ReflectionTestUtils.setField(factory, "reservedProductIds", List.of("barley-tea", "barley-tea-small", "instant-rice", "instant-rice-single"));
        ReflectionTestUtils.setField(factory, "heldOutScenarioIds", List.of("S01"));
        var history = mapper.readTree("[{\"recordedPractice\":{\"tasks\":[{\"mission\":{\"objectives\":[{\"productId\":\"milk\",\"quantity\":1}]}}],"
                + "\"purchaseEvents\":[{\"eventCode\":\"SHOP.CHECKOUT_SUBMITTED\",\"cart\":{\"milk-small\":1}}]}}]");
        var root = mapper.readTree(factory.withPracticeDesign("{}", history));
        assertThat(root.path("missedSizeFamilies").toString()).contains("milk-small", "milk-large");
        assertThat(root.path("sizeVariantFamilies").toString()).contains("banana-single").doesNotContain("instant-rice");
        assertThat(root.path("reservedProductIds").toString()).contains("barley-tea");
        assertThat(root.path("practiceDesignRule").asString()).contains("S01");
    }
}
