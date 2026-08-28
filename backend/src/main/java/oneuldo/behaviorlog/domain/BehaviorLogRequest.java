package oneuldo.behaviorlog.domain;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import oneuldo.behaviorlog.domain.context.AccessibilityContext;
import oneuldo.behaviorlog.domain.context.ActionContext;
import oneuldo.behaviorlog.domain.context.ErrorContext;
import oneuldo.behaviorlog.domain.context.EventMetadata;
import oneuldo.behaviorlog.domain.context.IdentityContext;
import oneuldo.behaviorlog.domain.context.PresentationContext;
import oneuldo.behaviorlog.domain.context.SafetyContext;
import oneuldo.behaviorlog.domain.context.SessionEndContext;
import oneuldo.behaviorlog.domain.context.SimulationContext;
import oneuldo.behaviorlog.domain.context.SupportContext;
import oneuldo.behaviorlog.domain.context.TaskContext;
import oneuldo.behaviorlog.domain.context.TaskResultContext;
import oneuldo.behaviorlog.domain.context.UserExperienceContext;
import oneuldo.behaviorlog.domain.context.ValidityContext;
import oneuldo.behaviorlog.domain.payload.BehaviorPayload;

/**
 * 프론트에서 발생한 행동 이벤트 한 건의 수신 계약이다.
 * 종료·지원·안전·시뮬레이션 정보처럼 해당 이벤트에 없는 문맥은 null로 생략할 수 있다.
 */
public record BehaviorLogRequest(
        @NotNull @Valid EventMetadata metadata,
        @NotNull @Valid IdentityContext identity,
        @NotNull @Valid TaskContext task,
        @NotNull @Valid ActionContext action,
        @NotNull @Valid AccessibilityContext accessibility,
        @Valid PresentationContext presentation,
        @Valid TaskResultContext taskResult,
        @Valid ErrorContext error,
        @Valid SupportContext support,
        @Valid SafetyContext safety,
        @Valid ValidityContext validity,
        @Valid SimulationContext simulation,
        @Valid SessionEndContext sessionEnd,
        @Valid UserExperienceContext userExperience,
        @Valid BehaviorPayload payload
) {
}
