package oneuldo.behaviorlog.analysis;

import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.personalization.service.*;
import oneuldo.behaviorlog.profile.domain.*;
import oneuldo.behaviorlog.profile.repository.*;
import oneuldo.behaviorlog.analysis.repository.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import tools.jackson.databind.node.ObjectNode;

class AdaptivePracticeContractTest {
    final MovementProjectionTest fixture = new MovementProjectionTest();
    final tools.jackson.databind.json.JsonMapper mapper = fixture.mapper;

    @Test void selected_sku_unit_survives_final_review_without_becoming_the_goal_label() {
        var data=fixture.fixture();var e=(ObjectNode)data.path("input").path("sessions").get(0).path("events").get(0);
        ((ObjectNode)e.path("action")).put("eventCode","SHOP.QUANTITY_CHANGED");
        ((ObjectNode)e.path("payload")).put("itemId","banana-single");
        var item=((ObjectNode)e.path("payload").path("marketContent")).putObject("item");
        item.put("id","banana-single").put("name","낱개 바나나").put("detail","1개").put("salesUnit","개").put("price",1000);
        var input=fixture.input(data);var details=SourceEventDetails.build(mapper,input);
        assertThat(details.get(0).path("selectedProduct")).isEqualTo(item);
        var source=mapper.createObjectNode();source.set(SourceEventDetails.FIELD,details);
        var comparison=AnalysisReviewPrompt.taskComparisonSource(mapper,source);
        assertThat(comparison.path("selectedProducts").get(0).path("product")).isEqualTo(item);
        var history=PracticeHistoryService.project(mapper,input,input.input().sessions().getFirst().sessionId());
        assertThat(history.path("purchaseEvents").get(0).has("id")).isFalse();
        assertThat(history.path("purchaseEvents").get(0).path("selectedProduct").path("id").asString()).isEqualTo("banana-single");
        assertThat(history.toString()).doesNotContain("SUCCESS","FAILURE","matched");
    }

    @Test void single_item_custom_is_executable_but_fixed_scenario_cannot_be_silently_weakened() {
        var draft=new MarketAiQuestDraft(1,"CUSTOM","우유 용량 연습","표시 숫자를 비교해요.",3000,
            List.of(new MarketAiQuestDraft.Objective("milk",1)),List.of("흰 우유900mL1개를 골라요."),
            List.of("숫자900mL를 찾아요.","다르면 진열대에서 바꿔요."),"연습을 마쳤어요.","한 품목에 집중",List.of("FOCUSED_PRACTICE"));
        assertThat(new MarketAiQuestValidator().validate(draft,1)).isSameAs(draft);
        assertThat(MarketQuestCatalog.eligibleScenarioIds(1)).containsExactly("CUSTOM");
        var invalid=new MarketAiQuestDraft(1,"S01",draft.title(),draft.description(),7000,draft.objectives(),draft.briefing(),draft.checkoutDialogue(),draft.successMessage(),draft.adaptationSummary(),draft.reasonCodes());
        assertThatThrownBy(()->new MarketAiQuestValidator().validate(invalid)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new MarketAiDifficultyValidator().validate(new MarketAiDifficultyDraft(1,0,"LOW","LOW","SIMPLIFIED",List.of("FOCUSED_PRACTICE"))))
            .isInstanceOf(IllegalArgumentException.class);
        assertThat(new MarketAiDifficultyValidator().validate(new MarketAiDifficultyDraft(1,1,"LOW","LOW","SIMPLIFIED",List.of("FOCUSED_PRACTICE"))).itemCount()).isEqualTo(1);
    }

    @Test void reanalysis_of_same_session_does_not_count_as_another_play_and_lookups_are_member_scoped() {
        UUID member=UUID.randomUUID(),session=UUID.randomUUID(),older=UUID.randomUUID();
        var analysis=new AnalysisReferences(mapper,fixture.input(fixture.fixture())).read(new CompactPipelineTest().finalJson);
        var previous=new AiUserProfile(member,1,null,UUID.randomUUID(),UUID.randomUUID(),older,"READY","test","test","","",List.of(),analysis,null,0);
        var repeated=new AiUserProfile(member,2,previous.getId(),UUID.randomUUID(),UUID.randomUUID(),session,"READY","test","test","","",List.of(),analysis,null,0);
        var latest=new AiUserProfile(member,3,repeated.getId(),UUID.randomUUID(),UUID.randomUUID(),session,"READY","test","test","","",List.of(),analysis,null,0);
        var repo=mock(AiUserProfileRepository.class);var snapshots=mock(BehaviorAnalysisInputSnapshotRepository.class);
        when(repo.findByIdAndMemberIdAndStatus(latest.getId(),member,"READY")).thenReturn(Optional.of(latest));
        when(repo.findByIdAndMemberIdAndStatus(repeated.getId(),member,"READY")).thenReturn(Optional.of(repeated));
        when(repo.findByIdAndMemberIdAndStatus(previous.getId(),member,"READY")).thenReturn(Optional.of(previous));
        var rows=new PracticeHistoryService(repo,snapshots,mapper).forProfile(member,AiUserProfileResponse.from(latest));
        assertThat(rows.size()).isEqualTo(2);
        assertThat(rows.get(0).path("sessionId").asString()).isEqualTo(older.toString());
        assertThat(rows.get(1).path("sessionId").asString()).isEqualTo(session.toString());
        assertThat(rows.get(0).path("sourceAvailable").asBoolean()).isFalse();
        assertThat(rows.get(0).path("currentSession").asBoolean()).isFalse();
        assertThat(rows.get(1).path("currentSession").asBoolean()).isTrue();
        assertThat(rows.get(1).path("playOrder").asInt()).isEqualTo(2);
        verify(snapshots,never()).findByIdAndMemberId(repeated.getSourceDatasetId(),member);
    }
}
