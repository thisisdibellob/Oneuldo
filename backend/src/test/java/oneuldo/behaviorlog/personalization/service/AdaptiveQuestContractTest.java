package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import oneuldo.ai.client.AiOperationDeadline;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdaptiveQuestContractTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    final MarketAiQuestValidator validator=new MarketAiQuestValidator();
    final AdaptiveQuestContract contract=new AdaptiveQuestContract(mapper,validator);
    final AdaptiveMarketQuestService schema=new AdaptiveMarketQuestService(null,null,null,null,null,validator,contract,null,mapper);
    ObjectNode candidate(){return (ObjectNode)schema.schema();}
    ObjectNode evidence(){return (ObjectNode)mapper.readTree("{\"events\":[[\"E1\",\"S1\",\"E1\",0,\"SHOP.SESSION_STARTED\",{}],[\"E2\",\"S1\",\"E2\",1,\"SHOP.MOVEMENT_SAMPLED\",{}]]}");}
    @Test void executable_stockout_and_runtime_choices_are_validated_without_overriding_ai(){
        var c=candidate();((ObjectNode)c.at("/runtimePlan/learning")).put("stockoutProductId","banana");
        var result=contract.validate(c,2,2,null,evidence());assertThat(result.runtimePlan().learning().stockoutProductId()).isEqualTo("banana");
        ((ObjectNode)c.at("/runtimePlan/environment")).put("employeeCount",0);assertThatThrownBy(()->contract.validate(c,2,2,null,evidence())).isInstanceOf(MarketQuestValidationException.class);
    }
    @Test void impossible_stock_and_fabricated_citations_are_rejected(){
        var badStock=candidate();((ObjectNode)badStock.at("/runtimePlan/stockOverrides")).put("milk",0);assertThatThrownBy(()->contract.validate(badStock,2,2,null,evidence())).hasMessageContaining("적응형");
        var c=candidate();((ObjectNode)c.path("observationPlan")).putArray("movementEvidenceIds").add("E999");var invalid=c;assertThatThrownBy(()->contract.validate(invalid,2,2,null,evidence())).isInstanceOf(MarketQuestValidationException.class);
    }
    @Test void repair_changes_only_reviewed_fields_and_rejects_unrequested_edits(){
        var c=candidate();var issues=List.<Map<String,Object>>of(Map.of("path","/adaptationSummary"));
        var patch=mapper.readTree("{\"patches\":[{\"path\":\"/adaptationSummary\",\"value\":\"추가한 품목을 명시해요\"}]}");
        var result=schema.applyRepair(c,patch,issues);assertThat(result.path("objectives")).isEqualTo(c.path("objectives"));assertThat(result.path("runtimePlan")).isEqualTo(c.path("runtimePlan"));assertThat(c.path("adaptationSummary")).isNotEqualTo(result.path("adaptationSummary"));
        var wrong=mapper.readTree("{\"patches\":[{\"path\":\"/budget\",\"value\":10000}]}");assertThatThrownBy(()->schema.applyRepair(c,wrong,issues)).isInstanceOf(MarketQuestValidationException.class);
    }
    @Test void a_review_can_repair_one_array_entry_without_rewriting_other_observations(){
        var c=candidate();var issues=List.<Map<String,Object>>of(Map.of("path","/observationPlan/unknowns/0"));
        var patch=mapper.readTree("{\"patches\":[{\"path\":\"/observationPlan/unknowns/0\",\"value\":\"품절에 대응하는 행동은 아직 관찰하지 않았어요\"}]}");
        var result=schema.applyRepair(c,patch,issues);assertThat(result.at("/observationPlan/unknowns/0").asString()).contains("품절");assertThat(result.at("/observationPlan/behaviorObservation")).isEqualTo(c.at("/observationPlan/behaviorObservation"));
    }
    @Test void movement_can_cite_related_actions_but_must_include_actual_navigation(){
        var c=candidate();((ObjectNode)c.path("observationPlan")).putArray("movementEvidenceIds").add("E1").add("E2");
        assertThat(contract.validate(c,2,2,null,evidence())).isNotNull();
        ((ObjectNode)c.path("observationPlan")).putArray("movementEvidenceIds").add("E1");
        assertThatThrownBy(()->contract.validate(c,2,2,null,evidence())).isInstanceOf(MarketQuestValidationException.class);
    }
    @Test void substantive_review_issues_keep_their_actual_repair_path(){
        var review=mapper.createObjectNode().put("verdict","REPAIR");
        review.putArray("checked").add("BEHAVIOR").add("MOVEMENT").add("DELIVERY").add("COMPLETION").add("SUPPORT");
        review.putArray("issues").addObject().put("path","/observationPlan/changeReasons").put("explanation","가격 합계 근거를 수정해야 합니다. ".repeat(20)).putArray("sourceEvidenceIds").add("E1");
        var issues=schema.validateReview(review,candidate(),evidence());
        assertThat(issues).hasSize(1);assertThat(issues.get(0).get("path")).isEqualTo("/observationPlan/changeReasons");
        review.put("verdict","VALID");assertThatThrownBy(()->schema.validateReview(review,candidate(),evidence())).isInstanceOf(MarketQuestValidationException.class);
    }
    @Test void reviewer_receives_original_rows_by_event_id_instead_of_array_position(){
        var source=evidence();source.putArray("sourceEventDetails").addObject().put("id","E291").put("eventCode","SHOP.STAFF_HELP_REQUESTED");
        var c=candidate();((ObjectNode)c.path("observationPlan")).putArray("behaviorEvidenceIds").add("E291");
        var cited=schema.citedOriginalRecords(source,c);
        assertThat(cited.path("E291").get(0).path("eventCode").asString()).isEqualTo("SHOP.STAFF_HELP_REQUESTED");
        assertThat(cited.path("E2").get(0).get(4).asString()).isEqualTo("SHOP.MOVEMENT_SAMPLED");
    }
    @Test void a_sequence_with_nine_real_behavior_citations_is_not_reported_as_missing_evidence(){
        var source=evidence();var records=source.putArray("sourceEventDetails");var c=candidate();var citations=((ObjectNode)c.path("observationPlan")).putArray("behaviorEvidenceIds");
        for(int n=3;n<=11;n++){records.addObject().put("id","E"+n).put("eventCode","SHOP.QUANTITY_CHANGED");citations.add("E"+n);}
        assertThat(contract.validate(c,2,2,null,source).observationPlan().behaviorEvidenceIds()).hasSize(9);
    }
    @Test void one_inflight_job_is_shared_owner_scoped_and_cancellation_is_terminal()throws Exception{
        var service=mock(AdaptiveMarketQuestService.class);var freshness=mock(MarketProfileFreshnessService.class);var profile=mock(AiUserProfileResponse.class);when(profile.profileId()).thenReturn(UUID.randomUUID());when(freshness.requireCurrent(any())).thenReturn(profile);
        var entered=new CountDownLatch(1);var released=new CountDownLatch(1);
        when(service.generate(any(),any(),any())).thenAnswer(call->{entered.countDown();released.await();return null;});
        var jobs=new MarketQuestJobService(service,freshness,mapper);UUID member=UUID.randomUUID();
        try{var first=jobs.start(member,null);assertThat(first.deadlineSeconds()).isEqualTo(AdaptiveQuestContract.GENERATION_DEADLINE_SECONDS);assertThat(entered.await(2,java.util.concurrent.TimeUnit.SECONDS)).isTrue();assertThat(jobs.start(member,null).jobId()).isEqualTo(first.jobId());
            assertThatThrownBy(()->jobs.get(UUID.randomUUID(),first.jobId())).hasMessageContaining("404");var canceled=jobs.cancel(member,first.jobId());assertThat(canceled.status()).isEqualTo("FAILED");assertThat(canceled.errorCode()).isEqualTo("QUEST_GENERATION_CANCELLED");released.countDown();assertThat(jobs.get(member,first.jobId()).status()).isEqualTo("FAILED");
        }finally{released.countDown();jobs.close();}
    }
    @Test void an_expired_operation_cannot_make_another_provider_call(){try(var limit=new AiOperationDeadline(Duration.ofNanos(-1))){assertThatThrownBy(AiOperationDeadline::remaining).hasMessageContaining("TIMEOUT");}assertThat(AiOperationDeadline.remaining()).isNull();}
}
