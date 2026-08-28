package oneuldo.behaviorlog.normalization.service;

import java.math.BigDecimal;
import oneuldo.behaviorlog.normalization.domain.MeasurementUnit;
import oneuldo.behaviorlog.normalization.domain.ValueSemantics;

public record MeasurementDraft(
        String metricCode,
        BigDecimal numericValue,
        String codeValue,
        BigDecimal targetNumericValue,
        MeasurementUnit unit,
        ValueSemantics valueSemantics
) {
}
