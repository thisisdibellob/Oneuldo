package oneuldo.behaviorlog.profile.service;

import java.time.Instant;
import java.util.*;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import oneuldo.behaviorlog.profile.domain.*;
import oneuldo.behaviorlog.profile.repository.AiUserProfileRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProfileContractRegressionTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    final UUID member=UUID.randomUUID(), session=UUID.randomUUID();
    final List<UUID> evidence=java.util.stream.IntStream.range(0,10).mapToObj(i->UUID.randomUUID()).toList();
    AiBehaviorAnalysis analysis() {
        return new AiBehaviorAnalysis("우유 900mL 1개, 바나나 1송이(R17, R18)",
                List.of(new AiBehaviorAnalysis.Finding("F1","상품 선택","바나나 1송이를 담았다(R8, R9)",
                        "규격이 목표와 일치한다",List.of(),evidence,"목록 단위와 상품 단위 비교")),
                List.of(new AiBehaviorAnalysis.SessionAssessment(session,"SUCCESS","목표와 제출 비교",evidence)),
                List.of(),new AiBehaviorAnalysis.PracticePlan(List.of("F1"),"같은 규격 선택","관찰 연습",2,2,
                        "LOW","LOW","SIMPLIFIED",List.of("OBSERVATION_PRACTICE")));
    }
    AiUserProfile previous() {
        return new AiUserProfile(member,1,null,UUID.randomUUID(),UUID.randomUUID(),session,"READY","old","model",
                "","",List.of(),analysis(),null,0);
    }
    AiBehaviorAnalysisResponse current() {
        return new AiBehaviorAnalysisResponse(UUID.randomUUID(),UUID.randomUUID(),"READY","model","v","v",10,0,Instant.now(),null,analysis());
    }
    ObjectNode draft() {
        var root=(ObjectNode)mapper.valueToTree(analysis());root.remove("sessionAssessments");return root;
    }
    @Test void removes_stale_parenthesized_numbers_but_preserves_quantities_and_structured_evidence() {
        var refs=new AiUserProfileReferences(mapper,previous(),current());
        var encoded=mapper.readTree(refs.encode(mapper.writeValueAsString(draft())));
        assertThat(encoded.path("summary").asString()).isEqualTo("우유 900mL 1개, 바나나 1송이");
        assertThat(encoded.path("findings").get(0).path("observation").asString()).isEqualTo("바나나 1송이를 담았다");
        assertThat(encoded.path("findings").get(0).path("evidenceEventIds").size()).isEqualTo(10);
        // Normalize generated inline citations on storage too, without guessing their correspondence.
        var restored=refs.read(mapper.writeValueAsString(draft()));
        assertThat(restored.findings().getFirst().evidenceEventIds()).containsExactlyElementsOf(evidence);
        assertThat(restored.summary()).doesNotContain("R18");
    }
    @Test void known_full_ids_pass_but_unknown_aliases_and_other_session_ids_do_not() {
        var refs=new AiUserProfileReferences(mapper,previous(),current());
        assertThat(refs.read(draft().toString()).findings().getFirst().evidenceEventIds()).containsExactlyElementsOf(evidence);
        for(String invalid:List.of("R18","S1",UUID.randomUUID().toString())) {
            var root=draft();((ObjectNode)root.path("findings").get(0)).putArray("evidenceEventIds").add(invalid);
            assertThatThrownBy(()->refs.read(root.toString())).isInstanceOfSatisfying(ReviewEvidenceException.class,e->{
                assertThat(e.details().code()).isEqualTo("UNKNOWN_PROFILE_EVENT_REFERENCE");
                assertThat(e.details().path()).isEqualTo("/findings/0/evidenceEventIds/0");
                assertThat(e.details().offendingIds()).containsExactly(invalid);
            });
        }
    }
    @Test void does_not_require_invented_uncertainty_or_drop_relevant_evidence_to_meet_a_small_cap() {
        var validator=new AiUserProfileValidator(new MarketAiDifficultyValidator());
        var value=mapper.convertValue(draft(),AiUserProfileDraft.class);
        assertThat(validator.validate(value,previous(),current())).isSameAs(value);
        var root=draft();((ObjectNode)root.path("findings").get(0)).putArray("evidenceEventIds");
        assertThatThrownBy(()->validator.validate(mapper.convertValue(root,AiUserProfileDraft.class),previous(),current()))
                .hasMessage("INVALID_USER_PROFILE_CONTRACT");
    }
    @Test void bounded_retry_identifies_the_bad_reference_and_preserves_the_failed_attempt() {
        var repository=mock(AiUserProfileRepository.class);
        when(repository.findFirstByMemberIdAndStatusOrderByCreatedAtDesc(member,"READY")).thenReturn(Optional.of(previous()));
        when(repository.save(any())).thenAnswer(i->i.getArgument(0));
        var broken=draft();((ObjectNode)broken.path("findings").get(0)).putArray("evidenceEventIds").add("R18");
        var client=mock(GroqChatClient.class);
        when(client.complete(anyString(),anyString(),anyInt(),anyDouble())).thenReturn(
                new GroqChatClient.GroqChatResult(broken.toString(),"model","stop",100,100,1L),
                new GroqChatClient.GroqChatResult(draft().toString(),"model","stop",100,100,1L));
        var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",18000);
        var service=new AiUserProfileService(repository,new AiUserProfilePromptFactory(mapper),
                new AiUserProfileValidator(new MarketAiDifficultyValidator()),client,mapper,budget, org.mockito.Mockito.mock(oneuldo.behaviorlog.personalization.service.PracticeHistoryService.class));
        assertThat(service.updateFromSession(member,session,current()).status()).isEqualTo("READY");
        var saved=org.mockito.ArgumentCaptor.forClass(AiUserProfile.class);verify(repository).save(saved.capture());
        var calls=saved.getValue().getAttempts();assertThat(calls).hasSize(2);
        assertThat(calls.getFirst().validationFailure().offendingIds()).containsExactly("R18");
        assertThat(calls.get(1).inputPrompt()).contains("UNKNOWN_PROFILE_EVENT_REFERENCE","/findings/0/evidenceEventIds/0","R18");
        assertThat(calls.getFirst().rawOutput()).contains("R18");
    }
    @Test void no_finding_requires_an_explicit_limit_and_cannot_target_a_nonexistent_finding() {
        var validator=new AiUserProfileValidator(new MarketAiDifficultyValidator());
        var root=draft();root.putArray("findings");
        ((ObjectNode)root.path("practicePlan")).putArray("targetFindingIds");
        assertThatThrownBy(()->validator.validate(mapper.convertValue(root,AiUserProfileDraft.class),previous(),current()))
                .hasMessage("INVALID_USER_PROFILE_CONTRACT");
        root.putArray("uncertainties").add("현재 자료에서 확정할 관찰이 부족하다.");
        assertThatCode(()->validator.validate(mapper.convertValue(root,AiUserProfileDraft.class),previous(),current()))
                .doesNotThrowAnyException();
        ((ObjectNode)root.path("practicePlan")).putArray("targetFindingIds").add("F1");
        assertThatThrownBy(()->validator.validate(mapper.convertValue(root,AiUserProfileDraft.class),previous(),current()))
                .hasMessage("INVALID_USER_PROFILE_CONTRACT");
    }

    @Test void oversized_evidence_reports_the_exact_field_and_retries_without_trimming_in_java() {
        var ids=java.util.stream.IntStream.range(0,33).mapToObj(i->UUID.randomUUID()).toList();
        var broken=draft();var array=((ObjectNode)broken.path("findings").get(0)).putArray("evidenceEventIds");ids.forEach(id->array.add(id.toString()));
        var priorAnalysis=mapper.convertValue(mapper.valueToTree(analysis()),AiBehaviorAnalysis.class);
        var priorRoot=(ObjectNode)mapper.valueToTree(priorAnalysis);
        ((ObjectNode)priorRoot.path("findings").get(0)).set("evidenceEventIds",mapper.valueToTree(ids));
        var prior=new AiUserProfile(member,1,null,UUID.randomUUID(),UUID.randomUUID(),session,"READY","old","model","","",List.of(),mapper.treeToValue(priorRoot,AiBehaviorAnalysis.class),null,0);
        var valid=broken.deepCopy();((ObjectNode)valid.path("findings").get(0)).set("evidenceEventIds",mapper.valueToTree(ids.subList(0,30)));
        var repository=mock(AiUserProfileRepository.class);when(repository.findFirstByMemberIdAndStatusOrderByCreatedAtDesc(member,"READY")).thenReturn(Optional.of(prior));when(repository.save(any())).thenAnswer(i->i.getArgument(0));
        var client=mock(GroqChatClient.class);when(client.complete(anyString(),anyString(),anyInt(),anyDouble())).thenReturn(new GroqChatClient.GroqChatResult(broken.toString(),"model"),new GroqChatClient.GroqChatResult(valid.toString(),"model"));
        var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",18000);
        var service=new AiUserProfileService(repository,new AiUserProfilePromptFactory(mapper),new AiUserProfileValidator(new MarketAiDifficultyValidator()),client,mapper,budget,mock(oneuldo.behaviorlog.personalization.service.PracticeHistoryService.class));
        var result=service.updateFromSession(member,session,current());assertThat(result.status()).isEqualTo("READY");
        assertThat(result.profile().findings().getFirst().evidenceEventIds()).containsExactlyElementsOf(ids.subList(0,30));
        var saved=org.mockito.ArgumentCaptor.forClass(AiUserProfile.class);verify(repository).save(saved.capture());var attempts=saved.getValue().getAttempts();
        assertThat(mapper.readTree(attempts.getFirst().rawOutput()).path("findings").get(0).path("evidenceEventIds").size()).isEqualTo(33);
        assertThat(attempts.getFirst().validationFailure().code()).isEqualTo("PROFILE_EVIDENCE_COUNT_EXCEEDS_LIMIT");
        assertThat(attempts.get(1).inputPrompt()).contains("/findings/0/evidenceEventIds","최대 30개","그 관찰을 실제로 지지하는 근거만 선택");
    }
}
