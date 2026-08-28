package oneuldo.behaviorlog.normalization.registry;

import java.math.BigDecimal;
import oneuldo.behaviorlog.normalization.domain.MeasurementUnit;
import oneuldo.behaviorlog.normalization.domain.ValueSemantics;

public record MeasurementRule(
        String metricCode,
        String sourcePath,
        BigDecimal constantValue,
        String targetSourcePath,
        MeasurementUnit unit,
        ValueSemantics valueSemantics
) {
    public MeasurementRule {
        if ((sourcePath == null) == (constantValue == null)) {
            throw new IllegalArgumentException("sourcePath 또는 constantValue 중 하나만 필요합니다.");
        }
    }

    public static MeasurementRule delta(String metricCode) {
        return new MeasurementRule(metricCode, null, BigDecimal.ONE, null,
                MeasurementUnit.COUNT, ValueSemantics.DELTA);
    }

    public static MeasurementRule value(String metricCode, String sourcePath,
            MeasurementUnit unit, ValueSemantics semantics) {
        return new MeasurementRule(metricCode, sourcePath, null, null, unit, semantics);
    }

    public static MeasurementRule valueWithTarget(String metricCode, String sourcePath,
            String targetSourcePath, MeasurementUnit unit, ValueSemantics semantics) {
        return new MeasurementRule(metricCode, sourcePath, null, targetSourcePath, unit, semantics);
    }
}
