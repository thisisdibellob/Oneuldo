package oneuldo.quest.dto;

import java.util.List;
import java.util.UUID;

import oneuldo.quest.domain.QuestStep;

// 퀘스트 상세 화면에 표시할 단계 데이터
public record QuestStepResponse(
        UUID id,
        int stepOrder,
        String instruction,
        String situation,
        String hint,
        List<QuestChoiceResponse> choices
) {

    // 단계와 해당 선택지 응답을 하나로 묶는다.
    public static QuestStepResponse from(
            QuestStep step,
            List<QuestChoiceResponse> choices
    ) {
        return new QuestStepResponse(
                step.getId(),
                step.getStepOrder(),
                step.getInstruction(),
                step.getSituation(),
                step.getHint(),
                List.copyOf(choices)
        );
    }
}
