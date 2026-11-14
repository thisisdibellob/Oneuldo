package oneuldo.behaviorlog.analysis;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
class GroundedPracticeContractTest {
 final JsonMapper m=JsonMapper.builder().build();
 @Test void speculationCannotEscapeIntoUncertaintiesOrProfileSupport(){
  var a=m.readTree("{\"uncertainties\":[\"기술적 오류나 입력 지연의 가능성을 배제할 수 없다\"],\"findings\":[{\"suggestedSupport\":\"수량 2개 도달 시 자동 잠금 기능 제공 검토\"}]}");
  assertThat(GroundedPracticeContract.inspect(a,m.createObjectNode(),false)).extracting(GroundedPracticeContract.Violation::code).contains("UNCONFIRMED_CAUSE","UNSUPPORTED_CAPABILITY");
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"uncertainties\":[\"원인은 기록만으로 확인할 수 없다\"]}"),m.createObjectNode(),false)).isEmpty();
 }
 @Test void actualReportIsPreservedButPriorAiIsNotSourceProof(){
  var a=m.readTree("{\"summary\":\"기록된 자기보고는 '사용법을 이해 못했어요'이다\"}");
  assertThat(GroundedPracticeContract.inspect(a,m.readTree("{\"userExperience\":{\"feedbackNote\":\"사용법을 이해 못했어요\"}}"),false)).isEmpty();
  assertThat(GroundedPracticeContract.inspect(a,m.readTree("{\"currentAnalysis\":{\"feedbackNote\":\"사용법을 이해 못했어요\"}}"),false)).isNotEmpty();
 }
 @Test void planRequiresConcreteChangeAndObservableQuestion(){
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"practicePlan\":{\"rationale\":\"동일 과제를 반복한다\"}}"),m.createObjectNode(),true)).extracting(GroundedPracticeContract.Violation::code).contains("PRACTICE_DESIGN_REQUIRED");
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"practicePlan\":{\"rationale\":\"변경: 4품목에서 우유 1품목으로 줄인다. 확인: 수량 2 유지 후 제출하는지 본다.\"}}"),m.createObjectNode(),true)).isEmpty();
 }
 @Test void batchPatchCannotAlterNumbersEvidenceJudgmentsOrUnflaggedFields(){
  String candidate="{\"analysis\":{\"summary\":\"장바구니 4회 열기 후 입력 지연 가능성\",\"uncertainties\":[\"원인 미확인\"],\"evidenceEventIds\":[\"E1\"],\"judgment\":\"FAILURE\"}}";
  var original=m.readTree(candidate);var rejected=new GroundedPracticeContract.Rejected(candidate,GroundedPracticeContract.inspect(original.path("analysis"),m.createObjectNode(),false));
  var result=m.readTree(GroundedTextPatch.apply(m,rejected,"{\"patches\":[{\"path\":\"/summary\",\"value\":\"장바구니 4회 열었고 원인은 미확인\"}]}"));
  assertThat(result.at("/analysis/evidenceEventIds")).isEqualTo(original.at("/analysis/evidenceEventIds"));
  assertThat(result.at("/analysis/judgment")).isEqualTo(original.at("/analysis/judgment"));
  assertThatThrownBy(()->GroundedTextPatch.apply(m,rejected,"{\"patches\":[{\"path\":\"/summary\",\"value\":\"장바구니 3회 열었고 원인 미확인\"}]}" )).hasMessage("GROUNDED_PATCH_CHANGED_NUMBERS");
  assertThatThrownBy(()->GroundedTextPatch.apply(m,rejected,"{\"patches\":[{\"path\":\"/judgment\",\"value\":\"SUCCESS\"}]}" )).hasMessage("INVALID_GROUNDED_PATCH");
 }
 @Test void batchRepairUsesOneModelCallAndRetainsWholeSource() {
  var client=org.mockito.Mockito.mock(oneuldo.ai.client.GroqChatClient.class);
  org.mockito.Mockito.when(client.complete(org.mockito.ArgumentMatchers.eq(GroundedTextPatch.SYSTEM),org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyInt(),org.mockito.ArgumentMatchers.eq(0.0)))
   .thenReturn(new oneuldo.ai.client.GroqChatClient.GroqChatResult("{\"patches\":[{\"path\":\"/summary\",\"value\":\"4회 열었고 원인 미확인\"},{\"path\":\"/uncertainties/0\",\"value\":\"원인은 기록으로 확인할 수 없다\"}]}","mock"));
  String candidate="{\"analysis\":{\"summary\":\"4회 열고 입력 지연 가능성\",\"uncertainties\":[\"기술적 오류 가능성\"],\"evidenceEventIds\":[\"E1\"]}}";
  var rejected=new GroundedPracticeContract.Rejected(candidate,GroundedPracticeContract.inspect(m.readTree(candidate).path("analysis"),m.createObjectNode(),false));
  var pipeline=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(m),new AiBehaviorAnalysisValidator(new oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator()),client,m).withPlanSemanticReview(false);
  var audit=new java.util.ArrayList<oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisRun.Attempt>();
  java.util.function.Function<String,String> parser=raw->{assertThat(GroundedPracticeContract.inspect(m.readTree(raw).path("analysis"),m.createObjectNode(),false)).isEmpty();return raw;};
  String result=org.springframework.test.util.ReflectionTestUtils.invokeMethod(pipeline,"repairGroundedText","FULL_UNCHANGED_SOURCE",rejected,32000,audit,parser);
  assertThat(m.readTree(result).at("/analysis/evidenceEventIds/0").asString()).isEqualTo("E1");
  assertThat(audit).hasSize(1);assertThat(audit.getFirst().inputPrompt()).startsWith("FULL_UNCHANGED_SOURCE");
 } @Test void structuredBatchUsesGatewayCapabilityAndPreservesEvidence() {
  var client=org.mockito.Mockito.mock(oneuldo.ai.client.GroqChatClient.class);
  org.mockito.Mockito.when(client.supportsGroundedTextPatchSchemas()).thenReturn(true);
  org.mockito.Mockito.when(client.completeStructured(org.mockito.ArgumentMatchers.eq(GroundedTextPatch.SYSTEM),org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyInt(),org.mockito.ArgumentMatchers.eq(0.0),org.mockito.ArgumentMatchers.any()))
   .thenReturn(new oneuldo.ai.client.GroqChatClient.GroqChatResult("{\"patches\":[{\"path\":\"/summary\",\"value\":\"4회 열었고 원인 미확인\"},{\"path\":\"/uncertainties/0\",\"value\":\"원인은 기록으로 확인할 수 없다\"}]}","mock"));
  String candidate="{\"analysis\":{\"summary\":\"4회 열고 입력 지연 가능성\",\"uncertainties\":[\"기술적 오류 가능성\"],\"evidenceEventIds\":[\"E1\"]}}";
  var rejected=new GroundedPracticeContract.Rejected(candidate,GroundedPracticeContract.inspect(m.readTree(candidate).path("analysis"),m.createObjectNode(),false));
  var pipeline=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(m),new AiBehaviorAnalysisValidator(new oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator()),client,m).withPlanSemanticReview(false);
  var audit=new java.util.ArrayList<oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisRun.Attempt>();
  java.util.function.Function<String,String> parser=raw->{assertThat(GroundedPracticeContract.inspect(m.readTree(raw).path("analysis"),m.createObjectNode(),false)).isEmpty();return raw;};
  String result=org.springframework.test.util.ReflectionTestUtils.invokeMethod(pipeline,"repairGroundedText","FULL_UNCHANGED_SOURCE",rejected,32000,audit,parser);
  assertThat(m.readTree(result).at("/analysis/evidenceEventIds/0").asString()).isEqualTo("E1");
  assertThat(audit).hasSize(1);assertThat(audit.getFirst().inputPrompt()).startsWith("FULL_UNCHANGED_SOURCE");
 }
 @Test void exactPatchSchemaAllowsOnlyBoundedProseKeysAndRejectsDecisionMutations() {
  assertThat(oneuldo.ai.client.SourceOutputSchemas.allowed(oneuldo.ai.client.SourceOutputSchemas.groundedTextPatch(java.util.List.of("/findings/0/alternativeExplanations/0")))).isTrue();
  var schema=oneuldo.ai.client.SourceOutputSchemas.groundedTextPatch(java.util.List.of("/findings/0/interpretation/0/text","/uncertainties/0"));
  assertThat(oneuldo.ai.client.SourceOutputSchemas.allowed(schema)).isTrue();
  assertThat(schema.at("/properties/patches/additionalProperties").asBoolean()).isFalse();
  assertThat(schema.at("/properties/patches/properties").propertyNames()).containsExactlyInAnyOrder("/findings/0/interpretation/0/text","/uncertainties/0");
  assertThatThrownBy(()->oneuldo.ai.client.SourceOutputSchemas.groundedTextPatch(java.util.List.of("/sessionAssessments/0/judgment"))).hasMessage("INVALID_GROUNDED_PATCH_PATHS");
  ((tools.jackson.databind.node.ObjectNode)schema.path("properties").path("patches")).put("additionalProperties",true);
  assertThat(oneuldo.ai.client.SourceOutputSchemas.allowed(schema)).isFalse();
  String candidate="{\"analysis\":{\"summary\":\"4회 열고 입력 지연 가능성\"}}";
  var rejected=new GroundedPracticeContract.Rejected(candidate,GroundedPracticeContract.inspect(m.readTree(candidate).path("analysis"),m.createObjectNode(),false));
  assertThat(m.readTree(GroundedTextPatch.apply(m,rejected,"{\"patches\":{\"/summary\":\"4회 열었고 원인 미확인\"}}" )).at("/analysis/summary").asString()).isEqualTo("4회 열었고 원인 미확인");
  assertThatThrownBy(()->GroundedTextPatch.apply(m,rejected,"{\"patches\":{\"/summary\":\"4회 열었고 원인 미확인\",\"/reviewFormat\":\"changed\"}}" )).hasMessage("INVALID_GROUNDED_PATCH");
 }

 @Test void causeListsAreNotMissingEvidenceButActualReportsRemainSources() {
  var a=m.readTree("{\"uncertainties\":[\"장바구니 행동의 동기(확인, 탐색, 오류 등)는 명확하지 않습니다.\"]}");
  assertThat(GroundedPracticeContract.inspect(a,m.createObjectNode(),false)).hasSize(1);
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"uncertainties\":[\"원인은 기록으로 확인할 수 없다. 위치 자료는 없다.\"]}"),m.createObjectNode(),false)).isEmpty();
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"summary\":\"자기보고: 입력 지연이 있어요\"}"),m.readTree("{\"feedbackNote\":\"입력 지연이 있어요\"}"),false)).isEmpty();
 }

 @Test void observedCartOpeningDoesNotProvePurposeEvenWhenHedgedAsAnAlternative() {
  var a=m.readTree("{\"findings\":[{\"alternativeExplanations\":[\"장바구니 열기가 단순 화면 확인이었을 수 있음\",\"상품 탐색 중이었으나 선택 조작 전 세션이 종료되었을 수 있음\"]}]}");
  assertThat(GroundedPracticeContract.inspect(a,m.createObjectNode(),false)).hasSize(2);
  var fact=m.readTree("{\"findings\":[{\"alternativeExplanations\":[\"선택 수량 2는 목표 수량 2와 같다\"]}]}");
  assertThat(GroundedPracticeContract.inspect(fact,m.createObjectNode(),false)).isEmpty();
 }

 @Test void conditionalCauseSynonymsCannotUseAnUncertaintyLoophole() {
  var a=m.readTree("{\"uncertainties\":[\"장바구니를 열었지만 상품을 담지 않은 원인이 인지적 어려움인지, 조작 오류인지, 아니면 다른 방해 요인인지 명확하지 않습니다.\"]}");
  assertThat(GroundedPracticeContract.inspect(a,m.createObjectNode(),false)).hasSize(1);
  assertThat(AnalysisPlanSemanticReview.system()).doesNotContain("Missing source retains an unconfirmed possibility").contains("not named possible causes","known controller");
 }

 @Test void KoreanVisualEmphasisIsTheSameUnsupportedUiAndCanBatchWithCauses() {
  var a=m.readTree("{\"findings\":[{\"suggestedSupport\":\"구매 목록의 카테고리별 위치를 시각적으로 강조하거나 단계별 안내 제공\"}],\"uncertainties\":[\"원인이 인지적 어려움인지, 조작 오류인지 불확실합니다\"]}");
  assertThat(GroundedPracticeContract.inspect(a,m.createObjectNode(),false)).extracting(GroundedPracticeContract.Violation::code).containsExactlyInAnyOrder("UNSUPPORTED_CAPABILITY","UNCONFIRMED_CAUSE");
 }

 @Test void sourceMissingIntentAndUnrecordedSystemClearingCannotBeInvented() {
  var a=m.readTree("{\"uncertainties\":[\"흰 우유 수량 반복 변경의 의도(탐색 vs 오류)는 명확하지 않습니다.\"],\"findings\":[{\"interpretation\":\"다른 카테고리 매대를 찾지 못했거나, 흰 우유 조작에 집중하여 다른 상품을 놓친 것으로 보입니다.\"}],\"summary\":\"시스템이 자동으로 장바구니를 비우고 제출했습니다.\"}");
  assertThat(GroundedPracticeContract.inspect(a,m.createObjectNode(),false)).extracting(GroundedPracticeContract.Violation::code).contains("UNCONFIRMED_CAUSE","UNRECORDED_SYSTEM_CLEAR");
  var clear=m.readTree("{\"summary\":\"시스템이 장바구니를 비웠다\"}");
  assertThat(GroundedPracticeContract.inspect(clear,m.readTree("{\"events\":[{\"eventCode\":\"SHOP.CART_CLEARED\"}]}"),false)).isEmpty();
 }

 @Test void supportMayRepeatPlanCountsButCannotChangeObservedNumbersOrInventASetting() {
  String candidate="{\"analysis\":{\"findings\":[{\"suggestedSupport\":\"목표 항목에 대한 시각적 강조 제공\"}],\"practicePlan\":{\"itemCount\":1}}}";
  var r=new GroundedPracticeContract.Rejected(candidate,GroundedPracticeContract.inspect(m.readTree(candidate).path("analysis"),m.createObjectNode(),false));
  assertThat(m.readTree(GroundedTextPatch.apply(m,r,"{\"patches\":{\"/findings/0/suggestedSupport\":\"1개 목표를 텍스트로 안내한다\"}}" )).at("/analysis/practicePlan/itemCount").asInt()).isEqualTo(1);
  assertThatThrownBy(()->GroundedTextPatch.apply(m,r,"{\"patches\":{\"/findings/0/suggestedSupport\":\"7개 목표를 안내한다\"}}" )).hasMessage("GROUNDED_PATCH_CHANGED_NUMBERS");
 }

 @Test void citationAliasesAreNotObservedQuantitiesButActualCountsStayImmutable() {
  String candidate="{\"analysis\":{\"summary\":\"10회 열고 입력 지연 가능성(E3)\",\"evidenceEventIds\":[\"E3\"]}}";
  var r=new GroundedPracticeContract.Rejected(candidate,GroundedPracticeContract.inspect(m.readTree(candidate).path("analysis"),m.createObjectNode(),false));
  assertThat(m.readTree(GroundedTextPatch.apply(m,r,"{\"patches\":{\"/summary\":\"10회 열었고 원인은 미확인\"}}" )).at("/analysis/evidenceEventIds/0").asString()).isEqualTo("E3");
  assertThatThrownBy(()->GroundedTextPatch.apply(m,r,"{\"patches\":{\"/summary\":\"11회 열었고 원인은 미확인\"}}" )).hasMessage("GROUNDED_PATCH_CHANGED_NUMBERS");
 }

 @Test void actualMinsuConditionalCauseAndUnimplementedVisualAlternativeAreRejected() {
  var m=JsonMapper.builder().findAndAddModules().build();var a=m.createObjectNode();a.putArray("uncertainties").add("장바구니를 열었다 닫은 행위가 상품 탐색의 일부인지, 아니면 오류인지 명확하지 않습니다.");a.putArray("findings").addObject().put("suggestedSupport","상품 선택 버튼의 위치와 기능을 명확히 안내하는 시각적 또는 텍스트 지원 제공");
  assertThat(GroundedPracticeContract.inspect(a,m.createObjectNode(),false)).extracting(GroundedPracticeContract.Violation::code).containsExactlyInAnyOrder("UNCONFIRMED_CAUSE","UNSUPPORTED_CAPABILITY");
 }
 @Test void actualSyntheticAttributionAndOverbroadNonperformanceCannotHideRecordedActions() {
  var a=m.readTree("{\"summary\":\"학습자(PERSONA_ACTOR)는 장바구니를 열었다 닫았습니다.\",\"findings\":[{\"interpretation\":\"구매 목표 수행이 전혀 이루어지지 않았습니다.\",\"suggestedSupport\":\"GUIDED_PRACTICE\",\"alternativeExplanations\":[\"시스템 액션 제한으로 인해 학습자가 행동을 완료할 기회를 잃었을 수 있습니다.\"]}]}");
  var source=m.readTree("{\"events\":[{\"eventCode\":\"SHOP.CART_OPENED\",\"replayExecutionContext\":{\"source\":\"synthetic\"}}]}");
  assertThat(GroundedPracticeContract.inspect(a,source,false)).extracting(GroundedPracticeContract.Violation::code).contains("SYNTHETIC_ACTOR_ATTRIBUTION","OVERBROAD_NONPERFORMANCE","UNACTIONABLE_SUPPORT","UNCONFIRMED_CAUSE");
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"summary\":\"합성 배우가 장바구니를 열었으며 인간 학습자의 능력으로 해석할 수 없습니다.\"}"),source,false)).isEmpty();
 }
 @Test void actualCommaSeparatedPurposeCandidatesAreNotSourceEvidence() {
  var a=m.readTree("{\"uncertainties\":[\"장바구니 열기 조작이 단순 확인인지, 선택 시도 후 실패인지 명확하지 않습니다.\"]}");
  assertThat(GroundedPracticeContract.inspect(a,m.createObjectNode(),false)).extracting(GroundedPracticeContract.Violation::code).contains("UNCONFIRMED_CAUSE");
 }
 @Test void correctionReceivesTheSpecificReasonAndKnownControllerCauseIsNotUnknown() {
  var a=m.readTree("{\"uncertainties\":[\"다른 상품을 찾지 못한 원인은 기록으로 확인할 수 없다.\",\"배우의 의도적 완료인지 시스템 제한에 의한 종료인지 구분할 수 없습니다.\"]}");
  var source=m.readTree("{\"replayExecutionContext\":{\"controllerReason\":\"action-limit\"}}");var issues=GroundedPracticeContract.inspect(a,source,false);
  assertThat(issues).extracting(GroundedPracticeContract.Violation::code).contains("UNCONFIRMED_CAUSE","KNOWN_CONTROLLER_REASON_OBSCURED");var wrapper=m.createObjectNode();wrapper.set("analysis",a);
  String prompt=GroundedTextPatch.prompt(m,"COMPLETE_SOURCE",new GroundedPracticeContract.Rejected(wrapper.toString(),issues));
  assertThat(prompt).startsWith("COMPLETE_SOURCE").contains("explanation","전제 자체를 제거","알려진 제어 사유");
 }
 @Test void correctionNamesNumericBoundaryAndInvalidDraftIsNotAnAuthoritativeAction() {
  var a=m.readTree("{\"summary\":\"시스템이 장바구니를 비우고 제출했다.\"}");var wrapper=m.createObjectNode();wrapper.set("analysis",a);var r=new GroundedPracticeContract.Rejected(wrapper.toString(),GroundedPracticeContract.inspect(a,m.createObjectNode(),false));
  String p=GroundedTextPatch.prompt(m,"ALL_ORIGINAL_SOURCES",r);
  assertThat(p).startsWith("ALL_ORIGINAL_SOURCES").contains("preserveNumericSequence", "동작을 삭제");
  assertThat(GroundedTextPatch.SYSTEM).contains("invalid model draft", "no new digits");
 }
 @Test void literalSourceLedgerCountsAlsoPreventProfileNonperformanceOverclaim() {
  var a=m.readTree("{\"findings\":[{\"interpretation\":\"구매 목표 수행이 전혀 이루어지지 않았습니다. 장바구니 조작은 있었습니다.\"}]}");
  var source=m.readTree("{\"sessionSourceLedger\":[{\"eventCounts\":{\"SHOP.CART_OPENED\":5}}]}");
  assertThat(GroundedPracticeContract.inspect(a,source,false)).extracting(GroundedPracticeContract.Violation::code).contains("OVERBROAD_NONPERFORMANCE");
  assertThat(GroundedPracticeContract.inspect(a,m.readTree("{\"currentAnalysis\":{\"eventCounts\":{\"SHOP.CART_OPENED\":5}}}"),false)).isEmpty();
 }
 @Test void numericRetryExplainsExactFieldWithoutAllowingExtraFacts() {
  var a=m.readTree("{\"analysis\":{\"summary\":\"원인은 기기 오류일 수 있다\"}}");var r=new GroundedPracticeContract.Rejected(a.toString(),GroundedPracticeContract.inspect(a.path("analysis"),m.createObjectNode(),false));
  try {GroundedTextPatch.apply(m,r,"{\"patches\":{\"/summary\":\"4개 목표는 미달성\"}}");fail("numeric mutation accepted");}
  catch(GroundedTextPatch.NumericMismatch e){assertThat(e.feedback(m)).contains("/summary","Expected exactly []","received [\"4\"]","no full regeneration");}
 }
 @Test void exactExistingObservationCanReplaceAnUnfoundedInterpretationWithoutInventingNumbers() {
  var a=m.readTree("{\"analysis\":{\"findings\":[{\"observation\":\"4개 목표 품목은 미달성입니다. 장바구니 조작은 있습니다.\",\"interpretation\":\"인지 부족일 수 있다\",\"evidenceEventIds\":[\"E1\"]}]}}");var r=new GroundedPracticeContract.Rejected(a.toString(),GroundedPracticeContract.inspect(a.path("analysis"),m.createObjectNode(),false));
  var fixed=m.readTree(GroundedTextPatch.apply(m,r,"{\"patches\":{\"/findings/0/interpretation\":\"4개 목표 품목은 미달성입니다.\"}}"));
  assertThat(fixed.at("/analysis/findings/0/observation")).isEqualTo(a.at("/analysis/findings/0/observation"));assertThat(fixed.at("/analysis/findings/0/evidenceEventIds")).isEqualTo(a.at("/analysis/findings/0/evidenceEventIds"));
  assertThatThrownBy(()->GroundedTextPatch.apply(m,r,"{\"patches\":{\"/findings/0/interpretation\":\"5개 목표 품목은 미달성입니다.\"}}" )).hasMessage("GROUNDED_PATCH_CHANGED_NUMBERS");
 }
 @Test void timeOpportunityAndNoSearchCausesAreNotEstablishedByAControllerStop() {
  var a=m.readTree("{\"findings\":[{\"interpretation\":\"다른 목표 상품 탐색 부재로 인해 전체 목표 달성이 이루어지지 않았습니다.\",\"alternativeExplanations\":[\"시간 부족이나 시스템 종료로 인해 다른 상품 구매 기회가 없었을 수 있습니다.\"]}]}");
  assertThat(GroundedPracticeContract.inspect(a,m.createObjectNode(),false)).extracting(GroundedPracticeContract.Violation::code).containsOnly("UNCONFIRMED_CAUSE");
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"summary\":\"제어 종료 사유는 action-limit로 기록되었습니다. 배우의 내적 동기는 기록으로 확인할 수 없습니다.\"}"),m.createObjectNode(),false)).isEmpty();
 }
 @Test void numericInterpretationDoesNotOfferAnObservationWithDifferentNumbers() {
  var a=m.createObjectNode();var analysis=a.putObject("analysis");var finding=analysis.putArray("findings").addObject();finding.putArray("observation").addObject().put("text","흰 우유 수량을 0에서 6까지 증가시켰다가 다시 0으로 감소시키는 반복적인 변경이 발생했습니다.");finding.putArray("interpretation").addObject().put("text","수량 조절 인터페이스에 대한 탐색이나 실수로 인해 목표 수량(2개)을 유지하지 못했을 가능성이 있습니다.");
  var r=new GroundedPracticeContract.Rejected(a.toString(),GroundedPracticeContract.inspect(analysis,m.createObjectNode(),false));
  String text=GroundedTextPatch.prompt(m,"",r);var prompt=m.readTree(text.substring(text.indexOf("{\"permittedTextTargets\"")));
  assertThat(prompt.at("/permittedTextTargets/0/preserveNumericSequence/0").asString()).isEqualTo("2");assertThat(prompt.at("/permittedTextTargets/0/readOnlyObservationSentences")).isEmpty();
  var good=m.createObjectNode();good.putObject("patches").put("/findings/0/interpretation/0/text","목표 수량 2개를 유지하지 못했습니다. 원인은 기록으로 확인할 수 없습니다.");
  assertThat(GroundedPracticeContract.inspect(m.readTree(GroundedTextPatch.apply(m,r,good.toString())).path("analysis"),m.createObjectNode(),false)).isEmpty();
  good.withObject("/patches").put("/findings/0/interpretation/0/text",finding.at("/observation/0/text").asString());
  assertThatThrownBy(()->GroundedTextPatch.apply(m,r,good.toString())).hasMessage("GROUNDED_PATCH_CHANGED_NUMBERS");
 }
 @Test void actualV100UnfoundedLocationInferenceAndNewFeedbackUiAreRejected() {
  var a=m.createObjectNode();var f=a.putArray("findings").addObject();f.put("interpretation","목표 상품 중 흰 우유 외 다른 상품의 위치나 카테고리를 파악하지 못했거나, 탐색을 시작하지 못했을 수 있습니다.");f.put("suggestedSupport","수량 변경 버튼의 피드백 강화 또는 목표 수량 도달 시 시각적 확인 제공");
  assertThat(GroundedPracticeContract.inspect(a,m.createObjectNode(),false)).extracting(GroundedPracticeContract.Violation::code).containsExactlyInAnyOrder("UNCONFIRMED_CAUSE","UNSUPPORTED_CAPABILITY");
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"findings\":[{\"suggestedSupport\":\"기존 장바구니 화면의 수량을 확인하도록 텍스트로 안내한다.\"}]}"),m.createObjectNode(),false)).isEmpty();
 }

 @Test void systemOnlySubmissionCannotBecomeActorSubmissionInSummary() {
  var source=m.readTree("{\"literalEventIndex\":{\"eventsById\":{\"E1043\":{\"eventCode\":\"SHOP.CHECKOUT_SUBMITTED\",\"recordedExecutionOwner\":\"SYSTEM_COMPLETION\"}}}}");
  var a=m.createObjectNode().put("summary","목표는 우유 2개였습니다. 합성 배우는 수량을 변경하다가 장바구니를 비우고 제출했습니다.");
  assertThat(GroundedPracticeContract.inspect(a,source,false)).extracting(GroundedPracticeContract.Violation::code).containsExactly("SYSTEM_SUBMISSION_ACTOR_ATTRIBUTION");
  a.put("summary","합성 배우는 수량을 변경했습니다. 이후 시스템이 빈 장바구니를 제출했습니다.");assertThat(GroundedPracticeContract.inspect(a,source,false)).isEmpty();
  a.put("summary","합성 배우는 제출하지 않았습니다. 시스템이 제출했습니다.");assertThat(GroundedPracticeContract.inspect(a,source,false)).isEmpty();
 }
 @Test void encodedEventColumnsAreNotCoercedToLiteralStrings() {
  var encoded=m.readTree("{\"columns\":{\"eventCode\":{\"=\":\"SHOP.CHECKOUT_SUBMITTED\"},\"recordedOwner\":{\"=\":\"SYSTEM_COMPLETION\"}}}");
  assertThat(GroundedPracticeContract.inspect(m.createObjectNode().put("summary","기록된 행동을 관찰했습니다."),encoded,false)).isEmpty();
  ((tools.jackson.databind.node.ObjectNode)encoded).putArray("actual").addObject().put("sourceEventId","E1").put("eventCode","SHOP.CHECKOUT_SUBMITTED").put("recordedOwner","SYSTEM_COMPLETION");
  assertThat(GroundedPracticeContract.inspect(m.createObjectNode().put("summary","합성 배우는 제출했습니다."),encoded,false)).extracting(GroundedPracticeContract.Violation::code).containsExactly("SYSTEM_SUBMISSION_ACTOR_ATTRIBUTION");
 }
 @Test void rawActionMetadataDoesNotBecomeASecondUnknownSubmission() {
  var source=m.readTree("{\"sessions\":[{\"events\":[{\"behaviorLogId\":\"one\",\"action\":{\"eventCode\":\"SHOP.CHECKOUT_SUBMITTED\"},\"payload\":{\"marketContent\":{\"replayExecutionContext\":{\"executionOwner\":\"SYSTEM_COMPLETION\"}}}}]}]}");
  assertThat(GroundedPracticeContract.inspect(m.createObjectNode().put("summary","합성 배우는 제출했습니다."),source,false)).extracting(GroundedPracticeContract.Violation::code).containsExactly("SYSTEM_SUBMISSION_ACTOR_ATTRIBUTION");
  assertThat(GroundedPracticeContract.inspect(m.createObjectNode().put("summary","시스템이 제출했습니다."),source,false)).isEmpty();
 }
 @Test void actorOrUnknownSubmissionIsNotReclassifiedAsSystem() {
  for(String owner:java.util.List.of("PERSONA_ACTOR","UNKNOWN")) {
   var source=m.createObjectNode();source.putObject(LiteralEventIndex.FIELD).putObject("eventsById").putObject("E1").put("eventCode","SHOP.CHECKOUT_SUBMITTED").put("recordedExecutionOwner",owner);
   assertThat(GroundedPracticeContract.inspect(m.createObjectNode().put("summary","합성 배우는 제출했습니다."),source,false)).isEmpty();
  }
 }

 @Test void unknownReasonDoesNotEstablishAnUnobservedSearchFailure() {
  var a=m.readTree("{\"uncertainties\":[\"이동 기록만으로는 매대 접근 시도 여부나 탐색 실패의 원인을 특정할 수 없습니다.\"]}");
  assertThat(GroundedPracticeContract.inspect(a,m.createObjectNode(),false)).extracting(GroundedPracticeContract.Violation::code).containsExactly("UNCONFIRMED_CAUSE");
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"uncertainties\":[\"이동 기록은 있으나 상품 미선택의 원인은 확인되지 않습니다.\"]}"),m.createObjectNode(),false)).isEmpty();
 }
 @Test void unparenthesizedCauseListsAreStillUnconfirmedCauses() {
  var a=m.createObjectNode();a.putArray("uncertainties").add("장바구니 열기/닫기 빈번 발생(E127-E2818)의 원인이 탐색, 오류, 또는 시스템 자동화인지 명확하지 않습니다.");
  var issues=GroundedPracticeContract.inspect(a,m.createObjectNode(),false);assertThat(issues).extracting(GroundedPracticeContract.Violation::code).containsExactly("UNCONFIRMED_CAUSE");
  assertThat(GroundedPracticeContract.unsupportedCauseSpans(issues.getFirst())).isNotEmpty();
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"uncertainties\":[\"원인은 기록으로 확인할 수 없습니다.\",\"인간의 인지 과정은 미확인입니다.\"]}"),m.createObjectNode(),false)).isEmpty();
 }
 @Test void actualConcreteCaseCannotGuessExecutionLogicOrSearchFailure() {
  String quote="합성 배우의 실행 로직으로 인해 상호작용이 누락되었는지, 아니면 탐색 실패로 인한 것인지 구분할 수 없습니다. 실제 사용자의 능력은 미확인입니다.";
  var a=m.createObjectNode();a.putArray("uncertainties").add(quote);
  var issues=GroundedPracticeContract.inspect(a,m.createObjectNode(),false);
  assertThat(issues).extracting(GroundedPracticeContract.Violation::code).containsExactly("UNCONFIRMED_CAUSE");
  assertThat(GroundedPracticeContract.unsupportedCauseSpans(issues.getFirst())).isNotEmpty();
  var wrapper=m.createObjectNode();wrapper.set("analysis",a);
  var rejected=new GroundedPracticeContract.Rejected(wrapper.toString(),issues);
  assertThat(GroundedTextPatch.outputSchema(m,rejected,true).at("/properties/patches/properties").get("/uncertainties/0").path("enum")).hasSize(1);
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"summary\":\"실행 정책 action-limit로 제어가 종료되었습니다. 이동은 있었으나 상품 선택은 기록되지 않았고 원인은 미확인입니다.\"}"),m.createObjectNode(),false)).isEmpty();
 }

 @Test void actualV100CauseWithAppendedDisclaimerMustDeleteTheCauseSpan() {
  var a=m.createObjectNode();a.putArray("uncertainties").add("SYSTEM_COMPLETION에 의한 자동 제출이 학습자의 실제 능력 부족 때문인지, 아니면 다른 원인 때문인지는 명확하지 않으며 원인은 기록으로 확인할 수 없습니다.");var wrapper=m.createObjectNode();wrapper.set("analysis",a);var r=new GroundedPracticeContract.Rejected(wrapper.toString(),GroundedPracticeContract.inspect(a,m.createObjectNode(),false));
  assertThat(r.issues()).hasSize(1);assertThat(GroundedPracticeContract.unsupportedCauseSpans(r.issues().getFirst())).contains("능력 부족");
  assertThat(GroundedTextPatch.prompt(m,"ALL_SOURCE",r)).contains("mustRemoveUnsupportedSpans","능력 부족");
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"uncertainties\":[\"SYSTEM_COMPLETION에 의한 제출은 기록되었습니다. 그 전 선택 부재의 원인은 기록으로 확인할 수 없습니다.\"]}"),m.createObjectNode(),false)).isEmpty();
 }

 @Test void sameUnchangedWholeObservationCanResolveActualMultiSentenceCopyRejection() {
  var wrapper=m.createObjectNode();var a=wrapper.putObject("analysis");var f=a.putArray("findings").addObject();String observation="세션 종료 시점 장바구니가 비어 있으며, SHOP.CHECKOUT_SUBMITTED 사건이 기록되지 않음. GENERAL_HELP_OPENED를 2회 열람했으나, 이후에도 상품 선택(ITEM_SELECTED) 또는 수량 변경(QUANTITY_CHANGED) 사건이 없음.";
  f.put("observation",observation).put("interpretation","도움말 이해 부족일 수 있다");f.putArray("evidenceEventIds").add("E1");
  var r=new GroundedPracticeContract.Rejected(wrapper.toString(),GroundedPracticeContract.inspect(a,m.createObjectNode(),false));var patch=m.createObjectNode();patch.putObject("patches").put("/findings/0/interpretation",observation);
  var fixed=m.readTree(GroundedTextPatch.apply(m,r,patch.toString()));assertThat(fixed.at("/analysis/findings/0/interpretation").asString()).isEqualTo(observation);assertThat(fixed.at("/analysis/findings/0/observation").asString()).isEqualTo(observation);assertThat(fixed.at("/analysis/findings/0/evidenceEventIds")).isEqualTo(f.path("evidenceEventIds"));
  patch.withObject("/patches").put("/findings/0/interpretation",observation.replace("2회","3회"));assertThatThrownBy(()->GroundedTextPatch.apply(m,r,patch.toString())).hasMessage("GROUNDED_PATCH_CHANGED_NUMBERS");
 }

 @Test void actualFreshSevenControllerTransitionDoesNotExplainMissingActorChoices() {
  var a=m.createObjectNode();a.putArray("findings").addObject().putArray("alternativeExplanations").add("실행 주체 전환은 기록되었으나, 이로 인해 사용자 의도적 행동이 기록되지 않았다는 원인은 기록으로 확인할 수 없다.");
  var source=m.readTree("{\"executionContextChanges\":[{\"executionOwner\":\"SYSTEM_COMPLETION\"}]}");
  assertThat(GroundedPracticeContract.inspect(a,source,false)).extracting(GroundedPracticeContract.Violation::code).contains("UNCONFIRMED_CAUSE");
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"uncertainties\":[\"실행 주체 전환은 기록되었습니다. 그 전에 선택이 없었던 원인은 확인할 수 없습니다.\"]}"),source,false)).isEmpty();
 }

 @Test void actualFreshSevenProfileCannotReplaceCognitiveGuessWithUnrecordedActionGuess() {
  var a=m.createObjectNode();a.putArray("findings").addObject().putArray("alternativeExplanations").add("실행 컨텍스트 변경으로 인해 사용자의 실제 조작이 기록되지 않았을 수 있다.").add("장바구니를 열었지만 상품 추가 버튼을 누르지 않고 닫았을 수 있다.");
  assertThat(GroundedPracticeContract.inspect(a,m.createObjectNode(),false)).hasSize(2);
  var fact=m.createObjectNode();fact.putArray("findings").addObject().putArray("alternativeExplanations").add("장바구니를 열었을 때 생수도 없었습니다.");assertThat(GroundedPracticeContract.inspect(fact,m.createObjectNode(),false)).isEmpty();
  var statement="버튼을 누르지 않았을 수 있어요";var actual=m.createObjectNode().put("summary","자기보고: "+statement);var source=m.createObjectNode().putObject("userExperience").put("feedbackNote",statement);var parent=m.createObjectNode();parent.set("userExperience",source);
  assertThat(GroundedPracticeContract.inspect(actual,parent,false)).isEmpty();
 }

 @Test void actualFreshEightAutomaticMovementIsNotSearchIntent() {
  var a=m.createObjectNode().put("summary","ITEM_SEARCH_STARTED가 반복적으로 발생했습니다. 이는 탐색 시도와 실제 선택 행동 사이의 단절을 시사합니다.");a.putArray("findings").addObject().put("interpretation","탐색 의도는 있었으나, 선반을 실제로 열어 상품을 확인하거나 선택하는 단계로 전환하지 못했습니다.");
  var source=m.readTree("{\"events\":[{\"eventCode\":\"SHOP.ITEM_SEARCH_STARTED\",\"microActionId\":\"MOVE_IN_MARKET\"}]}");assertThat(GroundedPracticeContract.inspect(a,source,false)).hasSize(2);
  assertThat(GroundedPracticeContract.inspect(m.readTree("{\"summary\":\"이동 시작 기록은 있지만 선반 열기나 상품 선택은 기록되지 않았습니다. 탐색 의도는 기록으로 확인할 수 없습니다.\"}"),source,false)).isEmpty();
 }

 @Test void actualFreshNinePolicyVersionIsNotAnObservedQuantity() {
  var wrapper=m.createObjectNode();var a=wrapper.putObject("analysis");a.putArray("findings").addObject().putArray("alternativeExplanations").addObject().put("text","합성 에이전트의 정책(episodic-choice-v10)이 상품 선택을 수행하도록 설계되지 않았을 수 있습니다.");var r=new GroundedPracticeContract.Rejected(wrapper.toString(),GroundedPracticeContract.inspect(a,m.createObjectNode(),false));var patch=m.createObjectNode();patch.putObject("patches").put("/findings/0/alternativeExplanations/0/text","원인은 기록으로 확인할 수 없다.");
  assertThat(GroundedPracticeContract.inspect(m.readTree(GroundedTextPatch.apply(m,r,patch.toString())).path("analysis"),m.createObjectNode(),false)).isEmpty();
  var factual=m.createObjectNode();factual.putObject("analysis").put("summary","장바구니 4회 열기 후 정책 episodic-choice-v10 오류 가능성");var rr=new GroundedPracticeContract.Rejected(factual.toString(),GroundedPracticeContract.inspect(factual.path("analysis"),m.createObjectNode(),false));patch=m.createObjectNode();patch.putObject("patches").put("/summary","장바구니 4회 열었고 원인은 미확인");assertThat(m.readTree(GroundedTextPatch.apply(m,rr,patch.toString())).at("/analysis/summary").asString()).contains("4회");var invalid=m.createObjectNode();invalid.putObject("patches").put("/summary","장바구니 3회 열었고 원인은 미확인");assertThatThrownBy(()->GroundedTextPatch.apply(m,rr,invalid.toString())).hasMessage("GROUNDED_PATCH_CHANGED_NUMBERS");
 }

 @Test void sourceFreeCauseFieldsHaveFiniteEvidenceStateButNumericFactsStayEditableOnlyByGuard() {
  var wrapper=m.createObjectNode();var a=wrapper.putObject("analysis");a.putArray("uncertainties").add("능력 부족인지 확인되지 않습니다.").add("장바구니 4회 열기 후 입력 지연 가능성");a.putArray("findings").addObject().put("interpretation","인지 부족일 수 있다");var r=new GroundedPracticeContract.Rejected(wrapper.toString(),GroundedPracticeContract.inspect(a,m.createObjectNode(),false));
  var schema=GroundedTextPatch.outputSchema(m,r,true);assertThat(schema.at("/properties/patches/properties").get("/uncertainties/0").path("enum").get(0).asString()).isEqualTo(oneuldo.ai.client.SourceOutputSchemas.UNKNOWN_CAUSE_TEXT);assertThat(schema.at("/properties/patches/properties").get("/uncertainties/1").has("enum")).isFalse();assertThat(schema.at("/properties/patches/properties").get("/findings/0/interpretation").has("enum")).isFalse();assertThat(oneuldo.ai.client.SourceOutputSchemas.allowed(schema)).isTrue();
  ((tools.jackson.databind.node.ObjectNode)schema.at("/properties/patches/properties").get("/uncertainties/0")).putArray("enum").add("다른 원인 추측");assertThat(oneuldo.ai.client.SourceOutputSchemas.allowed(schema)).isFalse();
 }
 @Test void oldGatewaysRetainBoundedStringPatchCompatibility() {
  var a=m.readTree("{\"analysis\":{\"uncertainties\":[\"기술 오류일 수 있다\"]}}");var r=new GroundedPracticeContract.Rejected(a.toString(),GroundedPracticeContract.inspect(a.path("analysis"),m.createObjectNode(),false));var schema=GroundedTextPatch.outputSchema(m,r,false);assertThat(schema.at("/properties/patches/properties").get("/uncertainties/0").has("enum")).isFalse();assertThat(oneuldo.ai.client.SourceOutputSchemas.allowed(schema)).isTrue();
 }

 @Test void causeOutputConstraintSurvivesActualPipelineBudgetWrapper() {
  var client=org.mockito.Mockito.mock(oneuldo.ai.client.GroqChatClient.class);org.mockito.Mockito.when(client.supportsGroundedTextPatchSchemas()).thenReturn(true);org.mockito.Mockito.when(client.supportsGroundedCauseEnums()).thenReturn(true);
  org.mockito.Mockito.when(client.completeStructured(org.mockito.ArgumentMatchers.eq(GroundedTextPatch.SYSTEM),org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyInt(),org.mockito.ArgumentMatchers.eq(0.0),org.mockito.ArgumentMatchers.any())).thenAnswer(inv->{var schema=(tools.jackson.databind.JsonNode)inv.getArgument(4);assertThat(schema.at("/properties/patches/properties").get("/uncertainties/0").path("enum").get(0).asString()).isEqualTo(oneuldo.ai.client.SourceOutputSchemas.UNKNOWN_CAUSE_TEXT);return new oneuldo.ai.client.GroqChatClient.GroqChatResult("{\"patches\":{\"/uncertainties/0\":\"원인은 기록으로 확인할 수 없습니다.\"}}","mock");});
  var a=m.readTree("{\"analysis\":{\"uncertainties\":[\"능력 부족인지 확인되지 않습니다.\"]}}");var r=new GroundedPracticeContract.Rejected(a.toString(),GroundedPracticeContract.inspect(a.path("analysis"),m.createObjectNode(),false));var pipeline=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(m),new AiBehaviorAnalysisValidator(new oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator()),client,m).withPlanSemanticReview(false);var audit=new java.util.ArrayList<oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisRun.Attempt>();java.util.function.Function<String,String> parse=raw->{assertThat(GroundedPracticeContract.inspect(m.readTree(raw).path("analysis"),m.createObjectNode(),false)).isEmpty();return raw;};String result=org.springframework.test.util.ReflectionTestUtils.invokeMethod(pipeline,"repairGroundedText","ALL_ORIGINAL_SOURCE",r,32000,audit,parse);assertThat(result).contains(oneuldo.ai.client.SourceOutputSchemas.UNKNOWN_CAUSE_TEXT);assertThat(audit).hasSize(1);
 }

 @Test void unchangedObservationMayHaveOnlyTheCanonicalMissingCauseSuffix() {
  var wrapper=m.createObjectNode();var a=wrapper.putObject("analysis");var f=a.putArray("findings").addObject();String observed="흰 우유 수량을 0~6 사이에서 반복적으로 증감시키며 최종 0으로 유지했습니다.";f.putArray("observation").addObject().put("text",observed);f.putArray("interpretation").addObject().put("text","실수로 과다 추가했을 가능성이 있습니다.");var r=new GroundedPracticeContract.Rejected(wrapper.toString(),GroundedPracticeContract.inspect(a,m.createObjectNode(),false));var patch=m.createObjectNode();patch.putObject("patches").put("/findings/0/interpretation/0/text",observed+" 원인은 기록으로 확인할 수 없습니다.");assertThat(m.readTree(GroundedTextPatch.apply(m,r,patch.toString())).at("/analysis/findings/0/observation")).isEqualTo(f.path("observation"));patch.withObject("/patches").put("/findings/0/interpretation/0/text",observed+" 우유 3개를 추가했습니다.");assertThatThrownBy(()->GroundedTextPatch.apply(m,r,patch.toString())).hasMessage("GROUNDED_PATCH_CHANGED_NUMBERS");
 }

}
