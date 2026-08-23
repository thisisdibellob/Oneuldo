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
            String theme,
            String retryFailureCode
    ) {
        KoreanPublicTransportRuleBook.SelectedRules selectedRules = ruleBook.select(quest);
        String serializedInput = String.join("\n",
                "제목: " + oneLine(quest.title()),
                "목표: " + oneLine(quest.goal()),
                "난이도: " + oneLine(quest.difficulty()),
                "테마: " + oneLine(theme),
                "원래 상황: " + oneLine(step.situation()),
                "지시문: " + oneLine(step.instruction()),
                "선택지:",
                step.choices().stream()
                        .map(this::choiceInput)
                        .collect(java.util.stream.Collectors.joining("\n"))
        );

        boolean situationOnly = "THEME_NOT_APPLIED".equals(retryFailureCode)
                || "SITUATION_MEANING_LOST".equals(retryFailureCode);
        if (situationOnly) {
            return String.join("\n",
                    "지시문을 실제로 수행할 수 있는 구체적인 상황 한 문장만 한국어로 작성하세요.",
                    "문장을 \"" + theme + "\"으로 시작하고, 원래 상황의 장소·대상·사건을 새롭게 표현하세요. 테마 이름만 쓰면 실패입니다.",
                    "규칙은 사실 확인에만 사용하세요. 원문의 핵심 사건과 교통수단을 다른 사건이나 교통수단으로 바꾸면 실패입니다.",
                    "숫자와 의미를 유지하고 새로운 사실이나 위험한 행동을 추가하지 마세요. 번호·글머리표·따옴표·설명 없이 한 줄만 출력하세요.",
                    selectedRules.promptBlock(),
                    "입력: " + serializedInput
            );
        }

        int choiceCount = step.choices().size();
        List<String> lines = new java.util.ArrayList<>(List.of(
                "아동용 사회기술 퀘스트에서 지시문에 맞는 새로운 상황 1문장과 선택지 " + choiceCount + "문장을 한국어로 작성하세요.",
                "1번째 줄은 \"" + theme + "\"으로 시작하고, 원래 상황의 구체적인 장소·대상·사건을 같은 의미로 바꿔 쓰세요. 테마 이름만 쓰면 실패입니다.",
                "2~" + (choiceCount + 1) + "번째 줄은 입력 선택지의 순서·핵심 대상·행동·정답 의미를 유지해 바꿔 쓰세요. r=true는 도움이 되는 행동, r=false는 잘못되거나 도움이 안 되는 행동으로 유지하세요.",
                "규칙은 사실 확인에만 사용하세요. 원문의 개찰구 사건을 환승 사건으로 바꾸는 것처럼 핵심 사건을 다른 규칙의 사건으로 교체하면 실패입니다.",
                "숫자를 유지하고 새로운 사실이나 위험한 행동을 추가하지 마세요. 각 줄은 60자 이하로 쓰세요.",
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
