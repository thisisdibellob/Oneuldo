package oneuldo.behaviorlog.analysis;

import oneuldo.behaviorlog.profile.service.ProfileOutcomeSourceChecks;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class ProfileOutcomeSourceChecksTest {
    final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
    @Test void citedEmptyOriginalCannotBeRestatedAsCompletedPurchase() {
        var profile=m.readTree("{\"summary\":\"과거 목표 상품을 정확히 구매하고 제출하여 완료되었습니다.\",\"findings\":[{\"observation\":\"목표 4종을 정확히 구매하고 제출하여 완료되었습니다.\",\"interpretation\":\"과거 세션에서 목표를 달성했습니다.\",\"suggestedSupport\":\"과거 성공 기록은 별도로 보관합니다.\",\"alternativeExplanations\":[\"과거 세션의 성공이 현재 실패 원인을 설명하지 않습니다.\",\"다른 세션과 구분합니다.\"],\"evidenceEventIds\":[\"old-end\"]}]}");
        var source=m.readTree("[{\"terminalEvents\":[{\"sourceEventId\":\"old-end\",\"cart\":{},\"objectiveProgress\":[{\"requiredQuantity\":1,\"selectedQuantity\":0}]}]}]");
        assertThat(ProfileOutcomeSourceChecks.inspect(profile,source)).extracting(x->x.path()).contains("/summary","/findings/0/observation","/findings/0/interpretation","/findings/0/suggestedSupport","/findings/0/alternativeExplanations/0").doesNotContain("/findings/0/alternativeExplanations/1");
    }
    @Test void missingSourcesAndObservedSubskillsAreNotInventedAsPurchaseFailure() {
        var profile=m.readTree("{\"summary\":\"장바구니 열기 조작이 기록되었습니다.\",\"findings\":[{\"observation\":\"장바구니 열기에 성공했습니다.\",\"evidenceEventIds\":[\"old-end\"]}]}");
        assertThat(ProfileOutcomeSourceChecks.inspect(profile,m.createArrayNode())).isEmpty();
        var source=m.readTree("[{\"terminalEvents\":[{\"sourceEventId\":\"old-end\",\"cart\":{},\"objectiveProgress\":[{\"requiredQuantity\":1,\"selectedQuantity\":0}]}]}]");
        assertThat(ProfileOutcomeSourceChecks.inspect(profile,source)).isEmpty();
        var purchase=m.readTree("{\"summary\":\"목표를 정확히 구매하고 제출하여 완료되었습니다.\",\"findings\":[{\"observation\":\"목표를 달성했습니다.\",\"evidenceEventIds\":[\"met\"]}]}");
        var nonempty=m.readTree("[{\"terminalEvents\":[{\"sourceEventId\":\"met\",\"cart\":{\"milk\":1},\"objectiveProgress\":[{\"requiredQuantity\":1,\"selectedQuantity\":1}]}]}]");
        assertThat(ProfileOutcomeSourceChecks.inspect(purchase,nonempty)).isEmpty();
    }
    @Test void actualConcreteProfileCannotInventCurrentSubmissionTimeInFinding() {
        var profile=m.readTree("{\"summary\":\"현재 세션은 제출 기록이 없습니다.\",\"findings\":[{\"observation\":\"현재 세션(S2) 제출 시점 장바구니는 비어 있고 총액은 0원입니다. 이전 세션(S1)에서도 제출 시 장바구니가 비어 있었습니다.\",\"interpretation\":\"현재 제출 기록은 없습니다.\",\"evidenceEventIds\":[\"current-end\"]}]}");
        var source=m.readTree("[{\"terminalEvents\":[{\"sourceEventId\":\"current-end\",\"eventCode\":\"SHOP.SESSION_ENDED\",\"cart\":{}}]},{\"terminalEvents\":[{\"sourceEventId\":\"past-submit\",\"eventCode\":\"SHOP.CHECKOUT_SUBMITTED\",\"cart\":{}}]}]");
        assertThat(ProfileOutcomeSourceChecks.inspect(profile,source)).extracting(x->x.path()).containsExactly("/findings/0/observation");
        ((tools.jackson.databind.node.ObjectNode)profile.path("findings").get(0)).put("observation","현재 세션(S2) 종료 시점 장바구니는 비어 있고 총액은 0원입니다. 이전 세션(S1)에서도 제출 시 장바구니가 비어 있었습니다.");
        assertThat(ProfileOutcomeSourceChecks.inspect(profile,source)).isEmpty();
    }
    @Test void recordedSubmissionAndMissingCoverageAreNotInventedAsUnsubmitted() {
        var profile=m.readTree("{\"findings\":[{\"observation\":\"제출 시점 장바구니는 비어 있습니다.\",\"evidenceEventIds\":[\"submit\"]}]}");
        var source=m.readTree("[{\"terminalEvents\":[{\"sourceEventId\":\"submit\",\"eventCode\":\"SHOP.CHECKOUT_SUBMITTED\",\"cart\":{}}]}]");
        assertThat(ProfileOutcomeSourceChecks.inspect(profile,source)).isEmpty();assertThat(ProfileOutcomeSourceChecks.inspect(profile,m.createArrayNode())).isEmpty();
    }
    @Test void actualFirstFreshProfileClaimContradictsItsOriginalTerminalValues()throws Exception {
        var run=java.nio.file.Path.of("/Users/bluem/Documents/GitHub/Oneuldo/output/grounded-profile-final-v104-nine-20261025");var key="adult-minjae-unit-support-research-v2-1-baseline-pre";
        var profile=m.readTree(java.nio.file.Files.readString(run.resolve("initial-attempts").resolve(key).resolve("profile.json"))).path("profile");
        var context=m.readTree(java.nio.file.Files.readString(run.resolve("cases").resolve(key).resolve("profile-context.json")));var member=context.path("memberId").asString();var source=m.readTree(java.nio.file.Files.readString(run.resolve("sources/members").resolve(member+".json")));var outcomes=m.createArrayNode();
        for(var snapshot:source.path("snapshots")) {
            var input=m.treeToValue(snapshot.path("input_data"),oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput.class);
            var response=new oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
            for(var ledger:oneuldo.behaviorlog.analysis.service.SessionSourceLedger.build(m,response))outcomes.addObject().set("terminalEvents",ledger.path("terminalRecords"));
        }
        var issues=ProfileOutcomeSourceChecks.inspect(profile,outcomes);
        assertThat(issues).extracting(x->x.path()).contains("/summary","/findings/1/observation","/findings/1/interpretation");
        java.nio.file.Files.writeString(run.getParent().resolve("grounded-profile-nine-20261024/historical-outcome-actual-validation.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(java.util.Map.of("status","DETECTED","scope","Actual current-trial profile and immutable member-scoped source snapshots; no new model inference","violations",issues)));
    }
}
