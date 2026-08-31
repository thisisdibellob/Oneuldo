package oneuldo.behaviorlog.personalization.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestGeneration;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestResponse;
import oneuldo.behaviorlog.personalization.repository.MarketAiQuestGenerationRepository;
import oneuldo.behaviorlog.profile.repository.BehaviorProfileSnapshotRepository;
import oneuldo.member.repository.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class MarketAiQuestAuditService {

    private final MemberRepository memberRepository;
    private final BehaviorProfileSnapshotRepository profileRepository;
    private final MarketAiQuestGenerationRepository generationRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID memberId, MarketAiQuestResponse response,
            MarketAiQuestDraft validatedQuest, List<MarketAiQuestGeneration.Attempt> attempts,
            String failureReason) {
        var member = memberRepository.findById(memberId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."));
        var profile = profileRepository.findFirstByMemberIdOrderByGeneratedAtDesc(memberId)
                .orElse(null);
        generationRepository.save(new MarketAiQuestGeneration(
                response.generationId(), member, profile, response.source(), response.model(),
                response.latencyMs(), response.personalizationMode(), response.promptVersion(),
                attempts, validatedQuest, failureReason, Instant.now()));
    }
}
