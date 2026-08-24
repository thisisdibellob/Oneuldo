package oneuldo.ai.service;

import java.util.List;

import lombok.RequiredArgsConstructor;
import oneuldo.quest.dto.QuestChoiceResponse;
import oneuldo.quest.dto.QuestDetailResponse;
import oneuldo.quest.dto.QuestStepResponse;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class QuestGenerationPromptFactory {

    private final KoreanPublicTransportRuleBook ruleBook;

    public String build(
            QuestDetailResponse quest,
            QuestStepResponse step,
            TransportIncidentCatalog.IncidentTemplate incident,
            String retryFailureCode
    ) {
        KoreanPublicTransportRuleBook.SelectedRules selectedRules = ruleBook.select(quest);
        String serializedInput = String.join("\n",
                "제목: " + oneLine(quest.title()),
                "목표: " + oneLine(quest.goal()),
                "난이도: " + oneLine(quest.difficulty()),
                "돌발상황 ID: " + oneLine(incident.id()),
                "원래 상황: " + oneLine(step.situation()),
                "지시문: " + oneLine(step.instruction()),
                "선택지:",
                step.choices().stream()
                        .map(this::choiceInput)
                        .collect(java.util.stream.Collectors.joining("\n"))
        );

        boolean situationOnly = "INCIDENT_NOT_APPLIED".equals(retryFailureCode)
                || "SITUATION_MEANING_LOST".equals(retryFailureCode);
        if (situationOnly) {
            return String.join("\n",
                    "원래 단계의 목적을 수행하는 도중 돌발상황이 발생한 구체적인 상황 한 문장만 한국어로 작성하세요.",
                    "원래 상황과 아래 돌발상황 조건을 자연스럽게 결합하세요. 템플릿 제목을 접두어처럼 붙이지 마세요.",
                    "원래 교통수단과 학습 목표를 유지하고, 허용된 돌발상황 외의 새로운 사건·설비·숫자는 만들지 마세요.",
                    incident.promptBlock("transport-incidents-v1"),
                    "번호·글머리표·따옴표·설명 없이 한 줄만 출력하세요.",
                    selectedRules.promptBlock(),
                    "입력: " + serializedInput
            );
        }

        int choiceCount = step.choices().size();
        List<String> lines = new java.util.ArrayList<>(List.of(
                "아동용 사회기술 퀘스트에서 원래 목표를 유지하면서 돌발상황 대처를 연습할 상황 1문장과 선택지 " + choiceCount + "문장을 한국어로 작성하세요.",
                "1번째 줄은 원래 상황과 허용된 돌발상황을 자연스럽게 결합하세요. 템플릿 제목을 접두어처럼 붙이지 마세요.",
                "2~" + (choiceCount + 1) + "번째 줄은 입력 선택지의 순서와 정답 위치를 유지하되, 정답에는 원래 행동과 돌발상황의 필수 대처를 함께 반영하세요.",
                "r=true는 원래 목표를 달성하며 돌발상황에 안전하게 대처하는 행동, r=false는 원래 오답 의미 또는 금지 행동으로 유지하세요.",
                "원래 목표·교통수단·숫자는 유지하고 허용된 돌발상황 밖의 사건은 추가하지 마세요. 각 줄은 80자 이하로 쓰세요.",
                incident.promptBlock("transport-incidents-v1"),
                "아래 한국 대중교통 규칙에 없는 운영 방식·설비·요금·법규를 추측하지 마세요.",
                selectedRules.promptBlock(),
                "정확히 " + (choiceCount + 1) + "줄만 출력하세요. JSON·키·번호·글머리표·따옴표·설명은 출력하지 마세요.",
                "입력: " + serializedInput
        ));
        if (retryFailureCode != null && !retryFailureCode.isBlank()) {
            lines.add("이전 출력 실패(" + retryFailureCode + "): 1번째 줄에 s/i의 핵심 대상이나 행동을 넣고 총 "
                    + (choiceCount + 1) + "줄을 완성하세요.");
        }
        return String.join("\n", lines);
    }

    private String choiceInput(QuestChoiceResponse choice) {
        return "- r=" + choice.correct() + " | " + oneLine(choice.label());
    }

    private String oneLine(String value) {
        return value == null ? "" : value.replaceAll("[\\r\\n]+", " ").trim();
    }
}
