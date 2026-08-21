package oneuldo.global.exception;

public class SimulationNotFoundException extends RuntimeException {

    public SimulationNotFoundException() {
        super("추천할 수 있는 활성 시뮬레이션이 없습니다.");
    }
}
