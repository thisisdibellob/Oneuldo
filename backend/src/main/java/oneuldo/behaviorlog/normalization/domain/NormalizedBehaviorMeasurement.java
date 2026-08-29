package oneuldo.behaviorlog.normalization.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.Objects;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

@Entity
@Immutable
@Table(name = "normalized_behavior_measurements")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NormalizedBehaviorMeasurement {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "normalized_event_id", nullable = false, updatable = false)
    private NormalizedBehaviorEvent normalizedEvent;

    @Column(name = "metric_code", nullable = false, length = 100, updatable = false)
    private String metricCode;
    @Column(name = "numeric_value", precision = 20, scale = 6, updatable = false)
    private BigDecimal numericValue;
    @Column(name = "code_value", length = 100, updatable = false)
    private String codeValue;
    @Column(name = "target_numeric_value", precision = 20, scale = 6, updatable = false)
    private BigDecimal targetNumericValue;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30, updatable = false)
    private MeasurementUnit unit;
    @Enumerated(EnumType.STRING)
    @Column(name = "value_semantics", nullable = false, length = 20, updatable = false)
    private ValueSemantics valueSemantics;

    public NormalizedBehaviorMeasurement(NormalizedBehaviorEvent normalizedEvent, String metricCode,
            BigDecimal numericValue, String codeValue, BigDecimal targetNumericValue,
            MeasurementUnit unit, ValueSemantics valueSemantics) {
        if ((numericValue == null) == (codeValue == null)) {
            throw new IllegalArgumentException("numericValue 또는 codeValue 중 하나만 필요합니다.");
        }
        this.normalizedEvent = Objects.requireNonNull(normalizedEvent);
        this.metricCode = Objects.requireNonNull(metricCode);
        this.numericValue = numericValue;
        this.codeValue = codeValue;
        this.targetNumericValue = targetNumericValue;
        this.unit = Objects.requireNonNull(unit);
        this.valueSemantics = Objects.requireNonNull(valueSemantics);
    }
}
