package oneuldo.quest.dto;

import java.util.UUID;

import oneuldo.quest.domain.QuestChoice;

// 퀘스트 화면에 표시할 선택지 데이터
public record QuestChoiceResponse(
        UUID id,
        int choiceOrder,
        String label,
        boolean correct,
        String feedback
) {

    // 앱은 오프라인에서도 훈련을 이어가고 서버는 기록 시 다시 판정한다.
    public static QuestChoiceResponse from(QuestChoice choice) {
        return new QuestChoiceResponse(
                choice.getId(),
                choice.getChoiceOrder(),
                choice.getLabel(),
                choice.isCorrect(),
                choice.getFeedback()
        );
    }
}
