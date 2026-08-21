package oneuldo.global.exception;

public class DailyQuestLimitExceededException extends RuntimeException {

    public DailyQuestLimitExceededException() {
        super("오늘 생성할 수 있는 퀘스트 수를 초과했습니다.");
    }
}
