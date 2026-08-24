package oneuldo.ai.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.UUID;

import oneuldo.quest.dto.QuestChoiceResponse;
import oneuldo.quest.dto.QuestDetailResponse;
import oneuldo.quest.dto.QuestStepResponse;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class QuestGenerationPromptFactoryTest {

    private final TransportIncidentCatalog catalog = new TransportIncidentCatalog(new ObjectMapper());

    private final QuestGenerationPromptFactory factory = new QuestGenerationPromptFactory(
            new KoreanPublicTransportRuleBook(new ObjectMapper())
    );

    @Test
    void 상황과_선택지만_일반_텍스트로_요청한다() {
        String prompt = factory.build(quest(), quest().steps().getFirst(), catalog.require("BUS", "BUS_WEATHER_VISIBILITY"), null);

        assertTrue(prompt.contains("정확히 3줄만 출력하세요"));
        assertTrue(prompt.contains("원래 상황: 정류장에 버스가 도착했어요."));
        assertTrue(prompt.contains("r=true | 버스 번호를 확인한다."));
        assertFalse(prompt.contains("40000000-0000-0000-0000-000000000001"));
        assertFalse(prompt.contains("힌트"));
        assertTrue(prompt.contains("교통수단: 버스"));
        assertTrue(prompt.contains("교통카드 단말기"));
        assertFalse(prompt.contains("승강장과 열차 사이"));
    }

    @Test
    void 지하철_원문에는_지하철_규칙만_매핑한다() {
        QuestDetailResponse subwayQuest = subwayQuest();

        String prompt = factory.build(
                subwayQuest,
                subwayQuest.steps().getFirst(),
                catalog.require("SUBWAY", "SUBWAY_CROWDED_PLATFORM"),
                null
        );

        assertTrue(prompt.contains("교통수단: 지하철"));
        assertTrue(prompt.contains("승강장과 열차 사이의 틈"));
        assertFalse(prompt.contains("목적지 바로 전 정류장 무렵 하차 버튼"));
    }

    @Test
    void 상황_의미_실패_재시도는_한_문장만_요청한다() {
        String prompt = factory.build(
                quest(),
                quest().steps().getFirst(),
                catalog.require("BUS", "BUS_WEATHER_VISIBILITY"),
                "SITUATION_MEANING_LOST"
        );

        assertTrue(prompt.contains("상황 한 문장만"));
        assertTrue(prompt.contains("한 줄만 출력하세요"));
        assertFalse(prompt.contains("정확히 3줄"));
    }

    @Test
    void 버스와_지하철_돌발상황을_각각_열_개씩_제공한다() {
        assertTrue(catalog.templates("BUS").size() == 10);
        assertTrue(catalog.templates("SUBWAY").size() == 10);
    }

    static QuestDetailResponse quest() {
        QuestStepResponse step = new QuestStepResponse(
                UUID.fromString("40000000-0000-0000-0000-000000000001"),
                1,
                "도착한 버스를 확인하세요.",
                "정류장에 버스가 도착했어요.",
                "버스 앞 번호를 봐요.",
                List.of(
                        new QuestChoiceResponse(UUID.randomUUID(), 1, "버스 번호를 확인한다.", true, "맞아요."),
                        new QuestChoiceResponse(UUID.randomUUID(), 2, "확인하지 않고 탄다.", false, "번호를 확인해요.")
                )
        );
        return new QuestDetailResponse(
                UUID.fromString("30000000-0000-0000-0000-000000000001"),
                "CHECK_BUS",
                "PUBLIC_TRANSPORT",
                "대중교통",
                "버스 확인하기",
                "버스를 확인해요.",
                "올바른 버스를 구분한다.",
                "EASY",
                20,
                List.of(step)
        );
    }

    static QuestDetailResponse subwayQuest() {
        QuestStepResponse step = new QuestStepResponse(
                UUID.fromString("40000000-0000-0000-0000-000000001001"),
                1,
                "목적지로 가는 노선과 방면을 확인해 보세요.",
                "역 안의 노선도에 여러 지하철 노선이 보여요.",
                "목적지 역과 방면을 살펴봐요.",
                List.of(
                        new QuestChoiceResponse(UUID.randomUUID(), 1, "노선과 방면을 확인한다.", true, "맞아요."),
                        new QuestChoiceResponse(UUID.randomUUID(), 2, "아무 승강장으로 간다.", false, "다시 확인해요.")
                )
        );
        return new QuestDetailResponse(
                UUID.fromString("30000000-0000-0000-0000-000000000014"),
                "BOARD_SUBWAY_SAFELY",
                "PUBLIC_TRANSPORT",
                "대중교통",
                "혼자 지하철 타기",
                "지하철을 안전하게 이용해요.",
                "노선과 방면을 확인한다.",
                "EASY",
                20,
                List.of(step)
        );
    }
}
