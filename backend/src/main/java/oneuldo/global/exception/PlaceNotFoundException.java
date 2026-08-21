package oneuldo.global.exception;

public class PlaceNotFoundException extends RuntimeException {

    public PlaceNotFoundException() {
        super("시뮬레이션에 사용할 수 있는 활성 장소가 없습니다.");
    }
}
