package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.*;

class AdaptiveQuestPracticeSettingsTest {
    final JsonMapper m=JsonMapper.builder().build();
    final Set<String> ids=Set.of("E1","E2","E3");

    ObjectNode answer(String main,String... codes) {
        var a=m.createObjectNode();var problems=a.putArray("problems");
        for(String c:codes){var p=problems.addObject().put("code",c);if(!c.equals("NONE"))p.putArray("evidenceIds").add("E1");}
        a.put("mainBlocker",main);return a;
    }
    ObjectNode mission(int cashiers,boolean construction) {
        var mission=m.createObjectNode();mission.putObject("runtimePlan").putObject("environment").put("cashierCount",cashiers).put("entranceConstruction",construction);
        return mission;
    }
    ObjectNode candidate(int cashiers,boolean construction,String... lines) {
        var c=mission(cashiers,construction);var b=c.putArray("briefing");for(String l:lines)b.add(l);return c;
    }

    @Test void valid_answers_pass_and_unknown_codes_or_ids_are_reported() {
        assertThat(AdaptiveQuestPracticeSettings.violations(answer("NO_STAFF_HELP","NO_STAFF_HELP","OFF_LIST_INTEREST"),ids)).isEmpty();
        assertThat(AdaptiveQuestPracticeSettings.violations(answer("NONE","NONE"),ids)).isEmpty();
        assertThat(AdaptiveQuestPracticeSettings.violations(answer("CONFUSION","SHELF_FINDING"),ids)).extracting(v->v.get("code")).containsExactly("UNKNOWN_DIFFICULTY_CODE");
        var badId=answer("SHELF_FINDING","SHELF_FINDING");((ArrayNode)badId.path("problems").get(0).path("evidenceIds")).set(0,m.getNodeFactory().stringNode("E99"));
        assertThat(AdaptiveQuestPracticeSettings.violations(badId,ids)).extracting(v->v.get("code")).containsExactly("UNKNOWN_EVENT_CITATION");
        var noIds=answer("SHELF_FINDING","SHELF_FINDING");((ObjectNode)noIds.path("problems").get(0)).putArray("evidenceIds");
        assertThat(AdaptiveQuestPracticeSettings.violations(noIds,ids)).extracting(v->v.get("code")).containsExactly("ONE_TO_SIX_EVIDENCE_IDS_REQUIRED");
        assertThat(AdaptiveQuestPracticeSettings.violations(m.createArrayNode(),ids)).extracting(v->v.get("code")).containsExactly("JSON_OBJECT_REQUIRED");
    }

    @Test void checkout_practice_follows_the_main_blocker_or_a_listed_staff_problem_only() {
        var empty=m.createObjectNode();
        assertThat(AdaptiveQuestPracticeSettings.decide(answer("CHECKOUT_NO_CASHIER","CHECKOUT_NO_CASHIER"),mission(2,false),empty).checkout).isTrue();
        assertThat(AdaptiveQuestPracticeSettings.decide(answer("SHELF_FINDING","SHELF_FINDING","NO_STAFF_HELP"),mission(2,false),empty).checkout).isTrue();
        // A met-but-not-main cashierless checkout says little about this round: nearly every recorded round met one.
        var mere=AdaptiveQuestPracticeSettings.decide(answer("SHELF_FINDING","SHELF_FINDING","CHECKOUT_NO_CASHIER"),mission(2,false),empty);
        assertThat(mere.checkout).isFalse();assertThat(mere.cashierCount).isEqualTo(2);assertThat(mere.line).isNull();
        var entrance=AdaptiveQuestPracticeSettings.decide(answer("SHELF_FINDING","ENTRANCE_WAYFINDING"),mission(2,false),empty);
        assertThat(entrance.entranceConstruction).isTrue();assertThat(entrance.cashierCount).isEqualTo(2);
        assertThat(entrance.line).isEqualTo("앞 입구가 막혀 있으면 다른 문을 찾아 들어가요.");
        var both=AdaptiveQuestPracticeSettings.decide(answer("NO_STAFF_HELP","NO_STAFF_HELP","ENTRANCE_WAYFINDING"),mission(1,false),empty);
        assertThat(both.cashierCount).isZero();assertThat(both.entranceConstruction).isTrue();assertThat(both.line.length()).isLessThanOrEqualTo(80);
    }

    @Test void locked_settings_are_never_changed_and_no_previous_play_leaves_the_candidate_value() {
        var locked=m.createObjectNode().put(AdaptiveQuestPracticeSettings.CASHIER,2);
        var decision=AdaptiveQuestPracticeSettings.decide(answer("NO_STAFF_HELP","NO_STAFF_HELP"),mission(2,false),locked);
        assertThat(decision.checkout).isFalse();assertThat(decision.cashierCount).isNull();assertThat(decision.line).isNull();
        var first=AdaptiveQuestPracticeSettings.decide(answer("NONE","NONE"),null,m.createObjectNode());
        var c=candidate(1,false,"사과 1개를 사요.");
        assertThat(first.apply(c)).isFalse();assertThat(c.at("/runtimePlan/environment/cashierCount").asInt()).isEqualTo(1);
    }

    @Test void settings_are_written_and_the_line_is_added_only_to_the_delivered_copy() {
        var decision=AdaptiveQuestPracticeSettings.decide(answer("NO_STAFF_HELP","NO_STAFF_HELP"),mission(2,false),m.createObjectNode());
        var c=candidate(2,true,"사과 1개를 사요.","장바구니를 확인해요.");
        assertThat(decision.apply(c)).isTrue();
        assertThat(c.at("/runtimePlan/environment/cashierCount").asInt()).isZero();
        assertThat(c.at("/runtimePlan/environment/entranceConstruction").asBoolean()).isFalse();
        decision.requireApplied(c);
        var delivered=decision.withLine(c);
        assertThat(delivered.path("briefing")).hasSize(3);assertThat(c.path("briefing")).hasSize(2);
        assertThat(delivered.path("briefing").get(2).asString()).isEqualTo("계산원이 없으면 직원에게 계산원을 불러 달라고 해요.");
        ((ObjectNode)c.at("/runtimePlan/environment")).put("cashierCount",1);
        assertThatThrownBy(()->decision.requireApplied(c)).isInstanceOf(MarketQuestValidationException.class);
    }

    @Test void a_review_issue_on_the_program_line_is_pointed_at_the_briefing() {
        var c=candidate(0,false,"a","b");
        var issues=AdaptiveMarketQuestService.withinCandidate(List.of(Map.of("path","/briefing/2","explanation","x"),Map.of("path","/briefing/1","explanation","y")),c);
        assertThat(issues).extracting(i->i.get("path")).containsExactly("/briefing","/briefing/1");
    }
}
