package oneuldo.global.exception;

public class ActiveQuestNotFoundException extends RuntimeException {

    public ActiveQuestNotFoundException() {
        super("추천할 수 있는 활성 퀘스트가 없습니다.");
    }
}
