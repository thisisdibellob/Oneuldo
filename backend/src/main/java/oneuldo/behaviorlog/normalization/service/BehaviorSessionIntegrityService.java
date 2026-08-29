package oneuldo.behaviorlog.normalization.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import oneuldo.behaviorlog.normalization.domain.BehaviorSessionIntegrity;
import oneuldo.behaviorlog.normalization.repository.BehaviorSessionIntegrityRepository;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import oneuldo.member.domain.Member;
import oneuldo.member.repository.MemberRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BehaviorSessionIntegrityService {

    private static final int MISSING_SEQUENCE_SAMPLE_LIMIT = 100;

    private final BehaviorLogRepository behaviorLogRepository;
    private final BehaviorSessionIntegrityRepository integrityRepository;
    private final MemberRepository memberRepository;

    public BehaviorSessionIntegrityService(BehaviorLogRepository behaviorLogRepository,
            BehaviorSessionIntegrityRepository integrityRepository,
            MemberRepository memberRepository) {
        this.behaviorLogRepository = behaviorLogRepository;
        this.integrityRepository = integrityRepository;
        this.memberRepository = memberRepository;
    }

    @Transactional
    public BehaviorSessionIntegrity reconcile(UUID memberId, UUID sessionId) {
        Member member = memberRepository.findByIdForUpdate(memberId)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다: " + memberId));
        List<Long> sequences = behaviorLogRepository.findEventSequencesByMemberIdAndSessionId(
                memberId, sessionId);
        long highest = sequences.isEmpty() ? 0 : sequences.getLast();
        List<Long> missingSample = findMissingSample(sequences, highest);
        boolean finalized = behaviorLogRepository
                .existsByMemberIdAndSessionIdAndSessionEndContextIsNotNull(memberId, sessionId);
        BehaviorSessionIntegrity integrity = integrityRepository.findByMemberIdAndSessionId(memberId, sessionId)
                .orElseGet(() -> new BehaviorSessionIntegrity(member, sessionId));
        integrity.reconcile(highest, sequences.size(), missingSample, finalized, Instant.now());
        return integrityRepository.save(integrity);
    }

    private List<Long> findMissingSample(List<Long> sequences, long highest) {
        List<Long> missing = new ArrayList<>();
        int index = 0;
        for (long expected = 1; expected <= highest && missing.size() < MISSING_SEQUENCE_SAMPLE_LIMIT;
                expected++) {
            while (index < sequences.size() && sequences.get(index) < expected) index++;
            if (index >= sequences.size() || sequences.get(index) != expected) missing.add(expected);
        }
        return List.copyOf(missing);
    }
}
