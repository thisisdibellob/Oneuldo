package oneuldo.behaviorlog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import oneuldo.behaviorlog.domain.context.AccessibilityContext;
import oneuldo.behaviorlog.domain.context.ErrorContext;
import oneuldo.behaviorlog.domain.context.PresentationContext;
import oneuldo.behaviorlog.domain.context.SafetyContext;
import oneuldo.behaviorlog.domain.context.SessionEndContext;
import oneuldo.behaviorlog.domain.context.SupportContext;
import oneuldo.behaviorlog.domain.context.TaskResultContext;
import oneuldo.behaviorlog.domain.context.UserExperienceContext;
import oneuldo.behaviorlog.domain.context.ValidityContext;
import oneuldo.behaviorlog.domain.payload.BehaviorPayload;
import oneuldo.behaviorlog.domain.type.BehaviorPayloadType;
import oneuldo.behaviorlog.domain.type.ContentSource;
import oneuldo.behaviorlog.domain.type.DevicePerformanceClass;
import oneuldo.behaviorlog.domain.type.EvidenceContext;
import oneuldo.behaviorlog.domain.type.StepOutcome;
import oneuldo.member.domain.Member;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Immutable
@Table(
        name = "behavior_logs",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uq_behavior_log_member_client_event",
                        columnNames = {"member_id", "client_event_id"}
                ),
                @UniqueConstraint(
                        name = "uq_behavior_log_member_session_sequence",
                        columnNames = {"member_id", "session_id", "event_sequence"}
                )
        },
        indexes = {
                @Index(name = "idx_behavior_logs_member_occurred", columnList = "member_id, occurred_at"),
                @Index(name = "idx_behavior_logs_session_sequence", columnList = "session_id, event_sequence"),
                @Index(name = "idx_behavior_logs_event_occurred", columnList = "event_code, occurred_at")
        }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BehaviorLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false, updatable = false)
    private Member member;

    @Column(name = "client_event_id", nullable = false, updatable = false)
    private UUID clientEventId;

    @Column(name = "session_id", nullable = false, updatable = false)
    private UUID sessionId;

    @Column(name = "event_sequence", nullable = false, updatable = false)
    private long eventSequence;

    @Column(name = "event_schema_version", nullable = false, length = 50, updatable = false)
    private String eventSchemaVersion;

    @Column(name = "app_version", nullable = false, length = 50, updatable = false)
    private String appVersion;

    @Column(name = "content_version", nullable = false, length = 50, updatable = false)
    private String contentVersion;

    @Column(name = "batch_id", updatable = false)
    private UUID batchId;

    @Column(name = "offline_queued", updatable = false)
    private Boolean offlineQueued;

    @Enumerated(EnumType.STRING)
    @Column(name = "device_performance_class", length = 20, updatable = false)
    private DevicePerformanceClass devicePerformanceClass;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    @Column(name = "received_at", nullable = false, updatable = false)
    private Instant receivedAt;

    @Column(name = "game_id", nullable = false, length = 100, updatable = false)
    private String gameId;

    @Column(name = "task_id", nullable = false, updatable = false)
    private UUID taskId;

    @Column(name = "task_version", nullable = false, length = 50, updatable = false)
    private String taskVersion;

    @Column(updatable = false)
    private Integer difficulty;

    @Column(name = "scenario_variant", length = 100, updatable = false)
    private String scenarioVariant;

    @Enumerated(EnumType.STRING)
    @Column(name = "evidence_context", nullable = false, length = 30, updatable = false)
    private EvidenceContext evidenceContext;

    @Column(name = "event_code", nullable = false, length = 100, updatable = false)
    private String eventCode;

    @Column(name = "micro_action_id", nullable = false, length = 100, updatable = false)
    private String microActionId;

    @Column(name = "step_id", updatable = false)
    private UUID stepId;

    @Enumerated(EnumType.STRING)
    @Column(name = "step_outcome", length = 20, updatable = false)
    private StepOutcome stepOutcome;

    @Column(name = "step_order", updatable = false)
    private Integer stepOrder;

    @Column(name = "start_latency_ms", updatable = false)
    private Long startLatencyMs;

    @Column(name = "first_action", length = 100, updatable = false)
    private String firstAction;

    @Column(name = "quest_instance_id", updatable = false)
    private UUID questInstanceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "content_source", length = 30, updatable = false)
    private ContentSource contentSource;

    @Column(name = "simulation_started", updatable = false)
    private Boolean simulationStarted;

    @Enumerated(EnumType.STRING)
    @Column(name = "payload_type", length = 30, updatable = false)
    private BehaviorPayloadType payloadType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "accessibility_context", nullable = false, columnDefinition = "jsonb", updatable = false)
    private AccessibilityContext accessibilityContext;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "presentation_context", columnDefinition = "jsonb", updatable = false)
    private PresentationContext presentationContext;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "task_result_context", columnDefinition = "jsonb", updatable = false)
    private TaskResultContext taskResultContext;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "error_context", columnDefinition = "jsonb", updatable = false)
    private ErrorContext errorContext;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "support_context", columnDefinition = "jsonb", updatable = false)
    private SupportContext supportContext;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "safety_context", columnDefinition = "jsonb", updatable = false)
    private SafetyContext safetyContext;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "validity_context", columnDefinition = "jsonb", updatable = false)
    private ValidityContext validityContext;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "session_end_context", columnDefinition = "jsonb", updatable = false)
    private SessionEndContext sessionEndContext;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "user_experience_context", columnDefinition = "jsonb", updatable = false)
    private UserExperienceContext userExperienceContext;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", updatable = false)
    private BehaviorPayload payload;

    public BehaviorLog(Member member, UUID batchId, BehaviorLogRequest request, Instant receivedAt) {
        var metadata = request.metadata();
        var task = request.task();
        var action = request.action();
        var simulation = request.simulation();

        this.member = Objects.requireNonNull(member);
        this.clientEventId = metadata.clientEventId();
        this.sessionId = request.identity().sessionId();
        this.eventSequence = metadata.eventSequence();
        this.eventSchemaVersion = metadata.eventSchemaVersion();
        this.appVersion = metadata.appVersion();
        this.contentVersion = metadata.contentVersion();
        this.batchId = batchId;
        this.offlineQueued = metadata.offlineQueued();
        this.devicePerformanceClass = metadata.devicePerformanceClass();
        this.occurredAt = metadata.occurredAt();
        this.receivedAt = Objects.requireNonNull(receivedAt);
        this.gameId = task.gameId();
        this.taskId = task.taskId();
        this.taskVersion = task.taskVersion();
        this.difficulty = task.difficulty();
        this.scenarioVariant = task.scenarioVariant();
        this.evidenceContext = task.evidenceContext();
        this.eventCode = action.eventCode();
        this.microActionId = action.microActionId();
        this.stepId = action.stepId();
        this.stepOutcome = action.stepOutcome();
        this.stepOrder = action.stepOrder();
        this.startLatencyMs = action.startLatencyMs();
        this.firstAction = action.firstAction();
        this.questInstanceId = simulation == null ? null : simulation.questInstanceId();
        this.contentSource = simulation == null ? null : simulation.contentSource();
        this.simulationStarted = simulation == null ? null : simulation.simulationStarted();
        this.payloadType = request.payload() == null ? null : request.payload().type();
        this.accessibilityContext = request.accessibility();
        this.presentationContext = request.presentation();
        this.taskResultContext = request.taskResult();
        this.errorContext = request.error();
        this.supportContext = request.support();
        this.safetyContext = request.safety();
        this.validityContext = request.validity();
        this.sessionEndContext = request.sessionEnd();
        this.userExperienceContext = request.userExperience();
        this.payload = request.payload();
    }
}
