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
    @Test void already_validated_reductions_do_not_get_synthesized_again_because_raw_part_count_is_large(){
        var m=tools.jackson.databind.json.JsonMapper.builder().build();var observed=m.createObjectNode().put("partCount",8);
        observed.putArray("parts").addObject().put("summary","원본 전체를 읽고 검증한 결합 관찰");
        assertThat(AdaptiveMarketQuestService.requiresObservationSynthesis(observed)).isFalse();
        observed.withArray("parts").addObject();observed.withArray("parts").addObject();
        assertThat(AdaptiveMarketQuestService.requiresObservationSynthesis(observed)).isTrue();
    }
    @Test void stale_retained_budget_explanation_cannot_override_actual_setting(){
        var m=tools.jackson.databind.json.JsonMapper.builder().build();var v=new MarketAiQuestValidator();var contract=new AdaptiveQuestContract(m,v);
        var raw=m.createObjectNode().put("budget",8200);var reason=raw.putObject("observationPlan").putArray("changeReasons").addObject().put("path","/budget").put("reason","예산은 29,800원 유지");
        assertThat(contract.independentSettingIssues(raw)).anyMatch(i->"BUDGET_EXPLANATION_MISMATCH".equals(i.get("code")));
        reason.put("reason","기존 29,800원에서 8,200원으로 변경");
        assertThat(contract.independentSettingIssues(raw)).noneMatch(i->"BUDGET_EXPLANATION_MISMATCH".equals(i.get("code")));
    }
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
    @Test void tuple_change_reasons_are_rejected_at_the_actual_repair_path_before_deserialization() {
        var c=candidate();
        ((ObjectNode)c.path("observationPlan")).putArray("changeReasons").addArray().add("/objectives").add("변경 이유");
        assertThatThrownBy(()->contract.validate(c,2,2,null,evidence()))
                .isInstanceOfSatisfying(MarketQuestValidationException.class, error -> {
                    assertThat(error.details().get("path")).isEqualTo("/observationPlan/changeReasons");
                    assertThat(error.details().get("code")).isEqualTo("EXACT_KEYS_REQUIRED:[path, reason]");
                });
        var issues=List.<Map<String,Object>>of(Map.of("path","/observationPlan/changeReasons"));
        var patch=mapper.readTree("{\"patches\":[{\"path\":\"/observationPlan/changeReasons\",\"value\":[{\"path\":\"/objectives\",\"reason\":\"목표 조건을 확인합니다.\"}]}]}");
        var repaired=schema.applyRepair(c,patch,issues);
        assertThat(contract.validate(repaired,2,2,null,evidence())).isNotNull();
        assertThat(repaired.path("objectives")).isEqualTo(c.path("objectives"));
        assertThat(repaired.path("adaptationSummary")).isEqualTo(c.path("adaptationSummary"));
    }
    @Test void repair_changes_only_reviewed_fields_and_rejects_unrequested_edits(){
        var c=candidate();var issues=List.<Map<String,Object>>of(Map.of("path","/adaptationSummary"));
        var patch=mapper.readTree("{\"patches\":[{\"path\":\"/adaptationSummary\",\"value\":\"추가한 품목을 명시해요\"}]}");
        var result=schema.applyRepair(c,patch,issues);assertThat(result.path("objectives")).isEqualTo(c.path("objectives"));assertThat(result.path("runtimePlan")).isEqualTo(c.path("runtimePlan"));assertThat(c.path("adaptationSummary")).isNotEqualTo(result.path("adaptationSummary"));
        var wrong=mapper.readTree("{\"patches\":[{\"path\":\"/budget\",\"value\":10000}]}");assertThatThrownBy(()->schema.applyRepair(c,wrong,issues)).isInstanceOf(MarketQuestValidationException.class);
    }
    @Test void exact_repeat_repair_can_implement_a_supported_layout_change_without_forcing_new_products() {
        var c=candidate();var original=c.deepCopy();
        var source=evidence();source.putArray("recordedTasks").addObject().set("mission",original);
        assertThatThrownBy(()->AdaptiveQuestProgression.rejectExactRepeat(mapper,source,c)).isInstanceOf(MarketQuestValidationException.class);
        var issues=List.<Map<String,Object>>of(Map.of("path","/objectives","code","UNCHANGED_RECOMMENDATION"),
                Map.of("path","/observationPlan/changeReasons","code","EXACT_KEYS_REQUIRED:[path, reason]"));
        var patch=mapper.createObjectNode();var patches=patch.putArray("patches");
        for(String field:List.of("objectives","budget","timeLimitSeconds","runtimePlan","environmentPlan","description","briefing","adaptationSummary","observationPlan"))
            patches.addObject().put("path","/"+field).set("value",c.path(field).deepCopy());
        ((ObjectNode)patches.get(4).path("value")).putArray("shelfOrder").add("produce").add("fresh").add("drink").add("meal").add("household");
        var repaired=schema.applyRepair(c,patch,issues);
        assertThat(repaired.path("objectives")).isEqualTo(original.path("objectives"));
        assertThat(repaired.path("environmentPlan")).isNotEqualTo(original.path("environmentPlan"));
        assertThatCode(()->AdaptiveQuestProgression.rejectExactRepeat(mapper,source,repaired)).doesNotThrowAnyException();
        assertThat(contract.validate(repaired,2,2,null,evidence())).isNotNull();
        assertThat(c).isEqualTo(original);
    }
    @Test void a_review_can_repair_one_array_entry_without_rewriting_other_observations(){
        var c=candidate();var issues=List.<Map<String,Object>>of(Map.of("path","/observationPlan/unknowns/0"));
        var patch=mapper.readTree("{\"patches\":[{\"path\":\"/observationPlan/unknowns/0\",\"value\":\"품절에 대응하는 행동은 아직 관찰하지 않았어요\"}]}");
        var result=schema.applyRepair(c,patch,issues);assertThat(result.at("/observationPlan/unknowns/0").asString()).contains("품절");assertThat(result.at("/observationPlan/behaviorObservation")).isEqualTo(c.at("/observationPlan/behaviorObservation"));
    }
    @Test void semantic_repeat_repair_receives_the_computed_difference_from_the_latest_task() {
        var previous=candidate();var proposed=previous.deepCopy();proposed.putArray("briefing").add("같은 안내를 다르게 표현했어요.");
        var records=evidence();records.putArray("recordedTasks").addObject().set("mission",previous);
        var source=mapper.createObjectNode();source.set("recordedEvidence",records);
        source.set("progressionContext",AdaptiveQuestProgression.context(mapper,records));
        var issues=List.<Map<String,Object>>of(Map.of("path","/objectives","code","UNCHANGED_RECOMMENDATION"));
        var prompt=mapper.readTree(schema.repairPrompt(AdaptiveQuestTransport.encodeGeneration(mapper,source).toString(),proposed,issues));
        assertThat(prompt.at("/originalSource/progressionComparison/sameMechanics").asBoolean()).isTrue();
        assertThat(prompt.at("/originalSource/progressionComparison/changedMechanics")).isEmpty();
        assertThat(prompt.at("/originalSource/conditionRepairRequired").asBoolean()).isTrue();
        assertThat(prompt.at("/originalSource/progressionContext/latestPlayedConditions/objectives")).isEqualTo(previous.path("objectives"));
    }
    @Test void malformed_initial_json_still_receives_a_full_candidate_repair_context() {
        var source=mapper.createObjectNode();source.set("recordedEvidence",evidence());
        var issues=List.<Map<String,Object>>of(Map.of("path","/adaptationSummary","code","INVALID_JSON_OR_SCHEMA"));
        var prompt=mapper.readTree(schema.repairPrompt(AdaptiveQuestTransport.encodeGeneration(mapper,source).toString(),null,issues));
        assertThat(prompt.path("candidate").isNull()).isTrue();
        assertThat(prompt.at("/originalSource/progressionComparison").isMissingNode()).isTrue();
        assertThat(prompt.at("/originalSource/conditionRepairRequired").asBoolean()).isFalse();
    }
    @Test void semantic_repeat_repair_can_change_supported_conditions_without_changing_goals() {
        var previous=candidate();((ObjectNode)previous.at("/runtimePlan/environment")).put("employeeCount",1);
        var next=previous.deepCopy();
        next.putArray("briefing").add("목표 상품을 먼저 찾아요. 같은 안내를 바꾸어 말했어요.");
        var source=evidence();source.putArray("recordedTasks").addObject().set("mission",previous);
        var review=mapper.createObjectNode();
        review.putObject("progressionCheck").put("sameMechanics",true).put("supportChange","UNCHANGED")
                .put("questionImplemented",true).put("explanation","문장만 달라지고 실제 지원은 같습니다.");
        var issues=AdaptiveQuestProgression.reviewIssues(mapper,source,next,review);
        assertThat(issues).hasSize(1);
        var patch=mapper.createObjectNode();var patches=patch.putArray("patches");
        for(String field:List.of("objectives","budget","timeLimitSeconds","runtimePlan","environmentPlan",
                "description","briefing","adaptationSummary","observationPlan"))
            patches.addObject().put("path","/"+field).set("value",next.path(field).deepCopy());
        ((ObjectNode)patches.get(3).at("/value/environment")).put("employeeCount",2);
        var repaired=schema.applyRepair(next,patch,issues);
        assertThat(repaired.path("objectives")).isEqualTo(previous.path("objectives"));
        assertThat(repaired.at("/runtimePlan/environment/employeeCount").asInt()).isEqualTo(2);
        assertThatCode(()->AdaptiveQuestProgression.rejectExactRepeat(mapper,source,repaired)).doesNotThrowAnyException();
        assertThat(contract.validate(repaired,2,2,null,evidence())).isNotNull();
        assertThat(next.at("/runtimePlan/environment/employeeCount")).isEqualTo(previous.at("/runtimePlan/environment/employeeCount"));
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
 @Test void adaptive_guidance_has_up_to_five_short_pages_without_relaxing_legacy_limit(){
  var q=candidate();q.putArray("briefing").add("목표를 읽어요.").add("위치를 확인해요.").add("상품을 담아요.").add("장바구니를 확인해요.").add("필요하면 직원에게 물어봐요.");
  var draft=contract.validate(q,2,2,null,evidence());assertThat(draft.briefing()).hasSize(5);
  q.withArray("briefing").add("여섯 번째 안내");assertThatThrownBy(()->contract.validate(q,2,2,null,evidence())).isInstanceOf(MarketQuestValidationException.class);
  q.withArray("briefing").remove(5);q.remove(List.of("runtimePlan","observationPlan"));
  var legacy=mapper.treeToValue(q,MarketAiQuestDraft.class);assertThatThrownBy(()->validator.validate(legacy)).isInstanceOf(MarketQuestValidationException.class);
 }
}
