package oneuldo.behaviorlog.normalization.service;

import java.lang.reflect.InvocationTargetException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import oneuldo.behaviorlog.domain.BehaviorLog;
import oneuldo.behaviorlog.normalization.registry.BehaviorEventDefinition;
import oneuldo.behaviorlog.normalization.registry.MeasurementRule;
import org.springframework.stereotype.Component;

@Component
public class BehaviorMeasurementExtractor {

    public List<MeasurementDraft> extract(BehaviorLog log, BehaviorEventDefinition definition) {
        List<MeasurementDraft> result = new ArrayList<>();
        for (MeasurementRule rule : definition.measurementRules()) {
            Object source = rule.constantValue() != null
                    ? rule.constantValue() : readPath(log, rule.sourcePath());
            if (source == null) continue;
            Object target = rule.targetSourcePath() == null
                    ? null : readPath(log, rule.targetSourcePath());
            if (source instanceof Number number) {
                result.add(new MeasurementDraft(
                        rule.metricCode(), decimal(number), null,
                        target instanceof Number targetNumber ? decimal(targetNumber) : null,
                        rule.unit(), rule.valueSemantics()));
            } else if (source instanceof Boolean || source instanceof String || source instanceof Enum<?>
                    || source instanceof java.time.Instant) {
                result.add(new MeasurementDraft(
                        rule.metricCode(), null, source.toString(), null,
                        rule.unit(), rule.valueSemantics()));
            } else {
                throw new IllegalStateException("지원하지 않는 측정값 타입입니다: " + rule.sourcePath());
            }
        }
        return List.copyOf(result);
    }

    private Object readPath(BehaviorLog log, String path) {
        String[] parts = path.split("\\.", 2);
        Object source = switch (parts[0]) {
            case "action" -> log;
            case "payload" -> log.getPayload();
            case "error" -> log.getErrorContext();
            case "support" -> log.getSupportContext();
            case "presentation" -> log.getPresentationContext();
            case "taskResult" -> log.getTaskResultContext();
            case "sessionEnd" -> log.getSessionEndContext();
            default -> throw new IllegalStateException("지원하지 않는 측정값 경로입니다: " + path);
        };
        if (source == null || parts.length != 2) return null;
        boolean firstGetter = parts[0].equals("action");
        for (String field : parts[1].split("\\.")) {
            if (source == null) return null;
            String accessor = firstGetter
                    ? "get" + Character.toUpperCase(field.charAt(0)) + field.substring(1) : field;
            try {
                source = source.getClass().getMethod(accessor).invoke(source);
            } catch (NoSuchMethodException | IllegalAccessException | InvocationTargetException exception) {
                throw new IllegalStateException("측정값 규칙의 경로가 유효하지 않습니다: " + path, exception);
            }
            firstGetter = false;
        }
        return source;
    }

    private BigDecimal decimal(Number number) {
        return number instanceof BigDecimal decimal ? decimal : new BigDecimal(number.toString());
    }
}
