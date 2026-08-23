package oneuldo.ai.service;

import java.util.Map;
import java.util.Set;

import lombok.RequiredArgsConstructor;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.ai.config.GroqProperties;
import oneuldo.ai.dto.QuestGenerationRequest;
import oneuldo.ai.dto.QuestGenerationResponse;
import oneuldo.quest.dto.QuestDetailResponse;
import oneuldo.quest.dto.QuestStepResponse;
import oneuldo.quest.service.QuestService;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class QuestGenerationService {

    private static final Map<String, Set<String>> APPROVED_THEMES = Map.of(
            "NORMAL", Set.of("사람이 많은 퇴근 시간", "안내가 잘 들리지 않는 순간", "비가 와서 이동이 느린 날"),
            "DEFAULT", Set.of("한산한 낮", "비가 살짝 오는 날", "사람이 조금 있는 시간")
    );

    private final QuestService questService;
    private final QuestGenerationPromptFactory promptFactory;
    private final GroqChatClient groqChatClient;
    private final GroqProperties properties;

    public QuestGenerationResponse generate(QuestGenerationRequest request) {
        QuestDetailResponse quest = questService.findQuestDetail(request.questId());
        if (!"PUBLIC_TRANSPORT".equals(quest.categoryCode())) {
            throw new IllegalArgumentException("AI 생성 대상 퀘스트가 아닙니다.");
        }
        Set<String> approved = "NORMAL".equals(quest.difficulty())
                ? APPROVED_THEMES.get("NORMAL")
                : APPROVED_THEMES.get("DEFAULT");
        if (!approved.contains(request.theme())) {
            throw new IllegalArgumentException("허용되지 않은 퀘스트 테마입니다.");
        }
        QuestStepResponse step = quest.steps().stream()
                .filter(candidate -> candidate.id().equals(request.stepId()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("퀘스트에 포함되지 않은 단계입니다."));

        String prompt = promptFactory.build(
                quest,
                step,
                request.theme(),
                request.retryFailureCode()
        );
        long startedAt = System.nanoTime();
        GroqChatClient.GroqChatResult result = groqChatClient.complete(
                "한국의 아동용 대중교통 퀘스트를 작성합니다. 제공된 규칙과 원문만 사실로 사용하고, "
                        + "모르는 운영 방식·설비·요금·법규는 추측하지 마세요. 간결하고 자연스러운 한국어와 요청한 출력 형식을 정확히 따르세요.",
                prompt
        );
        long latencyMs = (System.nanoTime() - startedAt) / 1_000_000L;
        return new QuestGenerationResponse(
                request.requestId(),
                result.text().trim(),
                result.model() == null ? properties.model() : result.model(),
                latencyMs
        );
    }
}
