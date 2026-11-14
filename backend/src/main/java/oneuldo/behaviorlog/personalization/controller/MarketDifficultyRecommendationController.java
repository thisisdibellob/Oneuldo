package oneuldo.behaviorlog.personalization.controller;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendationResponse;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestResponse;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestRequest;
import oneuldo.behaviorlog.personalization.service.MarketAiQuestService;
import oneuldo.behaviorlog.personalization.service.MarketDifficultyRecommendationService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/market-personalization")
@RequiredArgsConstructor
public class MarketDifficultyRecommendationController {

    private final MarketDifficultyRecommendationService recommendationService;
    private final MarketAiQuestService marketAiQuestService;
    @org.springframework.beans.factory.annotation.Autowired
    private oneuldo.behaviorlog.personalization.service.MarketQuestJobService jobs;

    @PostMapping("/quest-jobs")
    public org.springframework.http.ResponseEntity<oneuldo.behaviorlog.personalization.service.MarketQuestJobService.Status> startQuest(
            @AuthenticationPrincipal Jwt jwt,@RequestBody(required=false) MarketAiQuestRequest request) {
        return org.springframework.http.ResponseEntity.accepted().body(jobs.start(UUID.fromString(jwt.getSubject()),request==null?null:request.environmentContext()));
    }
    @org.springframework.web.bind.annotation.GetMapping("/quest-jobs/{id}")
    public oneuldo.behaviorlog.personalization.service.MarketQuestJobService.Status questStatus(
            @AuthenticationPrincipal Jwt jwt,@org.springframework.web.bind.annotation.PathVariable UUID id) {
        return jobs.get(UUID.fromString(jwt.getSubject()),id);
    }
    @org.springframework.web.bind.annotation.DeleteMapping("/quest-jobs/{id}")
    public oneuldo.behaviorlog.personalization.service.MarketQuestJobService.Status cancelQuest(
            @AuthenticationPrincipal Jwt jwt,@org.springframework.web.bind.annotation.PathVariable UUID id) {
        return jobs.cancel(UUID.fromString(jwt.getSubject()),id);
    }

    @PostMapping("/recommendation")
    public MarketDifficultyRecommendationResponse recommendation(@AuthenticationPrincipal Jwt jwt) {
        return recommendationService.recommend(UUID.fromString(jwt.getSubject()));
    }

    @PostMapping("/quest")
    public MarketAiQuestResponse quest(@AuthenticationPrincipal Jwt jwt,
            @RequestBody(required = false) MarketAiQuestRequest request) {
        return marketAiQuestService.generate(UUID.fromString(jwt.getSubject()),
                request == null ? null : request.environmentContext());
    }
}
