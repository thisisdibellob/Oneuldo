package oneuldo.ai.service;

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

    private final QuestService questService;
    private final QuestGenerationPromptFactory promptFactory;
    private final KoreanPublicTransportRuleBook ruleBook;
    private final TransportIncidentCatalog incidentCatalog;
    private final GroqChatClient groqChatClient;
    private final GroqProperties properties;

    public QuestGenerationResponse generate(QuestGenerationRequest request) {
        QuestDetailResponse quest = questService.findQuestDetail(request.questId());
        if (!"PUBLIC_TRANSPORT".equals(quest.categoryCode())) {
            throw new IllegalArgumentException("AI 생성 대상 퀘스트가 아닙니다.");
        }
        String mode = ruleBook.select(quest).mode();
        TransportIncidentCatalog.IncidentTemplate incident = incidentCatalog.require(mode, request.incidentType());
        QuestStepResponse step = quest.steps().stream()
                .filter(candidate -> candidate.id().equals(request.stepId()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("퀘스트에 포함되지 않은 단계입니다."));

        String prompt = promptFactory.build(
                quest,
                step,
                incident,
                request.retryFailureCode()
        );
        long startedAt = System.nanoTime();
        GroqChatClient.GroqChatResult result = groqChatClient.complete(
                "한국의 아동용 대중교통 퀘스트를 작성합니다. 제공된 규칙·원문·돌발상황 템플릿만 사실로 사용하고, "
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
