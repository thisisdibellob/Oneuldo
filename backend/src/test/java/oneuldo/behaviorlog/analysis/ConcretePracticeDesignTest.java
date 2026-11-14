package oneuldo.behaviorlog.analysis;

import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.service.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class ConcretePracticeDesignTest {
    final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
    ObjectNode source(){
        var source=m.createObjectNode();
        PracticeDesignContract.attach(m,source,m.readTree("{\"objectives\":[{\"productId\":\"milk\",\"label\":\"흰 우유\",\"quantity\":2},{\"productId\":\"water\",\"label\":\"생수\",\"quantity\":3}]}"));
        return source;
    }
    ObjectNode candidate(String goal,String rationale,int count){
        var a=m.createObjectNode();a.putObject("practicePlan").put("goal",goal).put("rationale",rationale).put("itemCount",count);return a;
    }
    @Test void genericOneItemGoalsAreRejectedEvenWithChangeAndCheckMarkers(){
        var issues=PracticeDesignContract.inspect(candidate("상품 하나 담기","변경: 4종→1종. 확인: 선택 사건",1),source());
        assertThat(issues).extracting(GroundedPracticeContract.Violation::code).containsExactly("CONCRETE_PRODUCT_QUANTITY_REQUIRED","CONCRETE_GUIDANCE_CRITERION_REQUIRED");
    }
    @Test void actionSequenceAndExactCriteriaPassWithoutChangingTheModelPlan(){
        var a=candidate("흰 우유(milk) 2개 담아 제출","변경: 4종→우유1종. 안내: 냉장 매대를 열고 우유를 2개 담은 뒤 개수를 보고 제출해 주세요. 달성: 우유2개인 장바구니를 액터가 제출; 시스템 대행은 별도 기록. 확인: 수량2 유지 후 제출.",1);
        var before=a.deepCopy();assertThat(PracticeDesignContract.inspect(a,source())).isEmpty();assertThat(a).isEqualTo(before);
    }
    @Test void speciesCountIsNotPurchaseQuantityAndEachProductNeedsItsOwnQuantity(){
        assertThat(PracticeDesignContract.inspect(candidate("흰 우유 1종","안내: 담기. 달성: 제출.",1),source())).isNotEmpty();
        assertThat(PracticeDesignContract.inspect(candidate("milk와 water 1개","안내: 담기. 달성: 제출.",2),source())).isNotEmpty();
        assertThat(PracticeDesignContract.inspect(candidate("milk 1개, water 2병","안내: 매대를 열고 담기. 달성: 제출.",2),source())).isEmpty();
    }
    @Test void explicitSharedQuantityAppliesToAllNamedProducts(){
        assertThat(PracticeDesignContract.inspect(candidate("milk와 water를 각각 1개 담기","안내: 매대를 열고 담기. 달성: 각 1개 제출.",2),source())).isEmpty();
    }
    @Test void sourceNamesAreNotTakenFromPreviousAiAndReanalysisDoesNotRewriteOldReports(){
        var s=m.createObjectNode();PracticeDesignContract.attach(m,s,m.readTree("{\"currentAnalysis\":{\"productId\":\"invented\",\"quantity\":1}}"));
        assertThat(s).isEmpty();assertThat(PracticeDesignContract.inspect(candidate("상품 하나","",1),s)).isEmpty();
    }
    @Test void nestedReviewedRationaleUsesItsActualProposedPracticePath(){
        var a=candidate("milk 1개","",1);((ObjectNode)a.path("practicePlan")).set("rationale",m.createObjectNode().put("proposedPractice","변경: 축소. 확인: 담기."));
        assertThat(PracticeDesignContract.inspect(a,source())).extracting(GroundedPracticeContract.Violation::path).containsExactly("/practicePlan/rationale/proposedPractice");
    }
    @Test void cartOpeningCannotBeProposedAsTheProductSelectionScreen(){
        var issues=PracticeDesignContract.inspect(candidate("milk 1개 담기","변경: 1종. 안내: 장바구니를 열고 우유를 선택하세요. 달성: 우유 1개 제출. 확인: 선택 사건.",1),source());
        assertThat(issues).extracting(GroundedPracticeContract.Violation::code).containsExactly("PRODUCT_SELECTION_GUIDANCE_REQUIRED");
    }
    @Test void normalKoreanOpeningInflectionsAreNotRejected(){
        for(String guide:java.util.List.of("냉장 매대(fresh)를 엽니다. 우유 1개를 담습니다.","냉장 선반을 열어 우유 1개를 담아 주세요.","진열대 버튼을 눌러 우유 1개를 담아 주세요.","fresh 매대를 연 후 우유 1개를 담습니다.","매대를 연 뒤 우유 1개를 담습니다.","매대를 연 다음 우유 1개를 담습니다."))
            assertThat(PracticeDesignContract.inspect(candidate("milk 1개 담기","변경: 우유 1종. 안내: "+guide+" 달성: 우유 1개 제출. 확인: 담기.",1),source())).isEmpty();
    }
    @Test void shelfConnectionIsNotAnOpeningInstruction(){
        var issues=PracticeDesignContract.inspect(candidate("milk 1개 담기","변경: 우유 1종. 안내: 매대 연결을 확인하고 우유를 선택합니다. 달성: 우유 1개 제출. 확인: 담기.",1),source());
        assertThat(issues).extracting(GroundedPracticeContract.Violation::code).containsExactly("PRODUCT_SELECTION_GUIDANCE_REQUIRED");
    }
}
