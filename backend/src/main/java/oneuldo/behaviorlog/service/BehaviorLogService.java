package oneuldo.behaviorlog.service;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.domain.BehaviorLog;
import oneuldo.behaviorlog.domain.BehaviorLogBatchRequest;
import oneuldo.behaviorlog.domain.BehaviorLogBatchResponse;
import oneuldo.behaviorlog.domain.BehaviorLogIngestStatus;
import oneuldo.behaviorlog.domain.BehaviorLogRequest;
import oneuldo.behaviorlog.domain.BehaviorLogResponse;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import oneuldo.member.domain.Member;
import oneuldo.member.repository.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class BehaviorLogService {

    public static final String SUPPORTED_SCHEMA_VERSION = "behavior-event-v1";

    private final BehaviorLogRepository behaviorLogRepository;
    private final MemberRepository memberRepository;

    @Transactional
    public BehaviorLogResponse record(UUID memberId, BehaviorLogRequest request) {
        Member member = findMember(memberId);
        return record(member, null, request);
    }

    @Transactional
    public BehaviorLogBatchResponse recordBatch(UUID memberId, BehaviorLogBatchRequest request) {
        Member member = findMember(memberId);
        List<BehaviorLogResponse> responses = request.events().stream()
                .map(event -> record(member, request.batchId(), event))
                .toList();
        return new BehaviorLogBatchResponse(request.batchId(), responses);
    }

    private BehaviorLogResponse record(Member member, UUID batchId, BehaviorLogRequest request) {
        validateSchemaVersion(request);
        UUID memberId = member.getId();
        UUID clientEventId = request.metadata().clientEventId();

        var duplicate = behaviorLogRepository.findByMemberIdAndClientEventId(memberId, clientEventId);
        if (duplicate.isPresent()) {
            BehaviorLog existing = duplicate.get();
            requireSameIdentity(existing, request);
            return response(existing, BehaviorLogIngestStatus.DUPLICATE);
        }

        var sameSequence = behaviorLogRepository.findByMemberIdAndSessionIdAndEventSequence(
                memberId,
                request.identity().sessionId(),
                request.metadata().eventSequence()
        );
        if (sameSequence.isPresent()) {
            throw conflict("같은 세션 순번으로 다른 행동 이벤트를 기록할 수 없습니다.");
        }

        BehaviorLog saved = behaviorLogRepository.save(new BehaviorLog(
                member,
                batchId,
                request,
                Instant.now()
        ));
        return response(saved, BehaviorLogIngestStatus.ACCEPTED);
    }

    private Member findMember(UUID memberId) {
        return memberRepository.findById(memberId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "사용자를 찾을 수 없습니다."
                ));
    }

    private void validateSchemaVersion(BehaviorLogRequest request) {
        if (!SUPPORTED_SCHEMA_VERSION.equals(request.metadata().eventSchemaVersion())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "지원하지 않는 행동 로그 스키마 버전입니다."
            );
        }
    }

    private void requireSameIdentity(BehaviorLog existing, BehaviorLogRequest request) {
        boolean sameSession = existing.getSessionId().equals(request.identity().sessionId());
        boolean sameSequence = existing.getEventSequence() == request.metadata().eventSequence();
        boolean sameTask = existing.getTaskId().equals(request.task().taskId());
        boolean sameEventCode = existing.getEventCode().equals(request.action().eventCode());
        boolean sameOccurredAt = existing.getOccurredAt().equals(request.metadata().occurredAt());
        boolean samePayloadType = Objects.equals(
                existing.getPayloadType(),
                request.payload() == null ? null : request.payload().type()
        );
        if (!sameSession || !sameSequence || !sameTask || !sameEventCode
                || !sameOccurredAt || !samePayloadType) {
            throw conflict("같은 clientEventId로 다른 행동 이벤트를 기록할 수 없습니다.");
        }
    }

    private BehaviorLogResponse response(BehaviorLog log, BehaviorLogIngestStatus status) {
        return new BehaviorLogResponse(
                log.getId(),
                log.getClientEventId(),
                log.getEventSequence(),
                status,
                log.getReceivedAt()
        );
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
