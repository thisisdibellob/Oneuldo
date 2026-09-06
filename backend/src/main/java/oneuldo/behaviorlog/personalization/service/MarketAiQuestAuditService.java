package oneuldo.behaviorlog.personalization.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestGeneration;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestResponse;
import oneuldo.behaviorlog.personalization.repository.MarketAiQuestGenerationRepository;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputSnapshotRepository;
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
    private final BehaviorAnalysisInputSnapshotRepository analysisInputRepository;
    private final MarketAiQuestGenerationRepository generationRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID memberId, UUID analysisInputSnapshotId, MarketAiQuestResponse response,
            MarketAiQuestDraft validatedQuest, List<MarketAiQuestGeneration.Attempt> attempts,
            String failureReason) {
        record(memberId,analysisInputSnapshotId,response,validatedQuest,attempts,failureReason,null);
    }

    @Transactional(readOnly=true)
    public java.util.Optional<MarketAiQuestResponse> findReusable(UUID memberId,String requestKey) {
        return generationRepository.findFirstByMemberIdAndRequestKeyAndSourceOrderByCreatedAtDesc(memberId,requestKey,"AI")
                .filter(g->g.getValidatedQuest()!=null).map(g->MarketAiQuestResponse.from(g.getId(),g.getAnalysisId(),g.getProfileId(),g.getSource(),g.getModel(),
                        g.getLatencyMs(),g.getPersonalizationMode(),g.getPromptVersion(),g.getValidatedQuest()));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID memberId, UUID analysisInputSnapshotId, MarketAiQuestResponse response,
            MarketAiQuestDraft validatedQuest, List<MarketAiQuestGeneration.Attempt> attempts,
            String failureReason,String requestKey) {
        var member = memberRepository.findById(memberId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."));
        var analysisInput = analysisInputRepository.findByIdAndMemberId(
                analysisInputSnapshotId, memberId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "행동 분석 입력을 찾을 수 없습니다."));
        generationRepository.save(new MarketAiQuestGeneration(
                response.generationId(), member, analysisInput, response.analysisId(), response.profileId(), response.source(), response.model(),
                response.latencyMs(), response.personalizationMode(), response.promptVersion(),
                attempts, validatedQuest, failureReason, Instant.now(),requestKey));
    }
}
