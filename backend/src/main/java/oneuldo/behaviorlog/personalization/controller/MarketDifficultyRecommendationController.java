package oneuldo.behaviorlog.personalization.controller;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendationResponse;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestResponse;
import oneuldo.behaviorlog.personalization.service.MarketAiQuestService;
import oneuldo.behaviorlog.personalization.service.MarketDifficultyRecommendationService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/market-personalization")
@RequiredArgsConstructor
public class MarketDifficultyRecommendationController {

    private final MarketDifficultyRecommendationService recommendationService;
    private final MarketAiQuestService marketAiQuestService;

    @PostMapping("/recommendation")
    public MarketDifficultyRecommendationResponse recommendation(@AuthenticationPrincipal Jwt jwt) {
        return recommendationService.recommend(UUID.fromString(jwt.getSubject()));
    }

    @PostMapping("/quest")
    public MarketAiQuestResponse quest(@AuthenticationPrincipal Jwt jwt) {
        return marketAiQuestService.generate(UUID.fromString(jwt.getSubject()));
    }
}
