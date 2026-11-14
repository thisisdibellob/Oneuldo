package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import java.util.regex.Pattern;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Literal product choices plus a completeness boundary. The model still chooses the next task. */
public final class PracticeDesignContract {
    public static final String FIELD = "concretePracticeDesignVersion";
    public static final String VERSION = "practice-design-v1";
    public static final String RULE = """
        goal: 실제 상품명(productId)과 각 상품의 정확한 수량·단위(예: 1개). itemCount=서로 다른 상품 종류 수.
        rationale/proposedPractice 필수: 변경: 기존→다음 조건; 안내: 플레이어가 따라 할 짧은 순서 문구;
        달성: 정확한 상품·수량·종료/제출 조건, 지원/시스템 대행 구분; 확인: 다음 로그의 확인 행동.
        예산·재고·시간·배치·직원은 원본 값만 사용하고 미기록은 미확인. 유지/변경 조건을 구분. 효과·품목 우월성 단정 금지.
        상품은 매대를 열어 선택/수량 조절한 뒤 장바구니를 확인한다. 장바구니 화면에서 새 상품을 고르는 안내는 잘못이다.
        미선택과 수량 도달 후 유지 실패를 구분하고 부분 수행·반증 보존. 해석은 관찰과 목표의 관계;
        근거 없는 원인 후보 금지. 원인 미확인은 uncertainties에서 한 번만 설명.
        """;
    private PracticeDesignContract() {}

    public static void attach(ObjectMapper m, ObjectNode target, JsonNode original) {
        var conflicts=oneuldo.behaviorlog.personalization.service.ProductSpecificationChecks.recordedConflicts(original);
        if(!conflicts.isEmpty()) {
            target.set("recordedProductSpecificationConflicts",m.valueToTree(conflicts));
            target.put("recordedConflictRule","원본 안내 문구와 같은 catalogVersion의 실제 목표 SKU 규격이 충돌한다. 양쪽 원문을 보존하고 분석 요약/한계에 불일치를 명시한다. 이 모순이 미선택을 유발했다고 추측하지 않는다. 다음 안내에는 실제 선택한 SKU 규격을 사용한다.");
        }
        var products=m.createArrayNode();collect(m,original,"",products,new HashSet<>());
        if(products.isEmpty())return;
        // This is an additional readable view, not the full catalog. All original catalog
        // rows remain in their original source; do not duplicate every SKU in every stage.
        var currentIds=new HashSet<String>();objectiveIds(original,currentIds);
        if(!currentIds.isEmpty()) {
            var relevant=m.createArrayNode();for(var row:products)if(currentIds.contains(row.path("productId").asString()))relevant.add(row);
            products=relevant;
        }
        var detailedIds=new HashSet<String>();for(var row:products)if(row.has("name")&&row.has("price"))detailedIds.add(row.path("productId").asString());
        var compact=m.createArrayNode();
        for(var row:products)if(!detailedIds.contains(row.path("productId").asString())||row.has("name")&&row.has("price"))compact.add(row);
        products=compact;
        target.put(FIELD,VERSION);
        target.put("concretePracticeDesignRule",RULE);
        target.set("practiceProductSources",products);
    }
    private static void objectiveIds(JsonNode n,Set<String> ids){
        if(n==null)return;
        if(n.isObject())for(String k:n.propertyNames()) {
            if(Set.of("currentAnalysis","previousProfile","observationPlan","practicePlan","retrievedKnowledge").contains(k))continue;
            if(k.equals("objectives")&&n.get(k).isArray())for(var row:n.get(k))if(row.path("productId").isString())ids.add(row.path("productId").asString());
            objectiveIds(n.get(k),ids);
        } else if(n.isArray())n.forEach(row->objectiveIds(row,ids));
    }
    private static void collect(ObjectMapper m,JsonNode n,String path,ArrayNode rows,Set<String> seen) {
        if(n==null)return;
        if(n.isObject()) {
            String id=n.path("productId").asString(n.path("id").asString(""));
            boolean product=n.has("productId")&&(n.has("label")||n.has("quantity"))
                ||n.has("id")&&n.has("name")&&(n.has("price")||n.has("salesUnit"));
            if(product&&!id.isBlank()) {
                var row=m.createObjectNode().put("productId",id).put("sourcePath",path);
                for(String k:List.of("name","label","detail","quantity","quantityUnit","salesUnit","price","initialStock","categoryId","storage"))
                    if(n.hasNonNull(k))row.set(k,n.get(k).deepCopy());
                var values=row.deepCopy();values.remove("sourcePath");
                String signature=values.toString();if(seen.add(signature))rows.add(row);
            }
            for(String k:n.propertyNames()) {
                if(Set.of("currentAnalysis","previousProfile","observationPlan","practicePlan","retrievedKnowledge",FIELD,"practiceProductSources").contains(k))continue;
                collect(m,n.get(k),path+"/"+k.replace("~","~0").replace("/","~1"),rows,seen);
            }
        } else if(n.isArray())for(int i=0;i<n.size();i++)collect(m,n.get(i),path+"/"+i,rows,seen);
    }
    public static List<GroundedPracticeContract.Violation> inspect(JsonNode analysis,JsonNode source) {
        if(!VERSION.equals(source.path(FIELD).asString()))return List.of();
        var plan=analysis.path("practicePlan");if(!plan.isObject())return List.of();
        String goal=plan.path("goal").asString();
        var choices=new ArrayList<JsonNode>();source.path("practiceProductSources").forEach(choices::add);
        source.path("catalogProductCategories").path("products").forEach(choices::add);
        source.path("matchingContentCatalog").path("products").forEach(choices::add);
        source.path("currentProductSources").forEach(choices::add);
        var named=namedProducts(goal,choices);
        var issues=new ArrayList<GroundedPracticeContract.Violation>();
        var ledger=source.path(SessionSourceLedger.FIELD);
        boolean partial=hasReachedThenDifferentQuantity(ledger);
        for(var current:source.path("currentTaskComparisonSource"))partial|=hasReachedThenDifferentQuantity(current.path(SessionSourceLedger.FIELD));
        String observations=analysis.path("summary").toString()+analysis.path("findings").valueStream().map(f->f.path("observation").toString()+f.path("interpretation").toString()).collect(java.util.stream.Collectors.joining());
        if(partial&&!Pattern.compile("일시|중간|도달|맞췄|맞춘|맞았|목표\\s*수량.{0,15}같|정확한?\\s*(?:목표|수량).{0,15}(?:만들|설정)").matcher(observations).find()) {
            String path=analysis.path("summary").isString()?"/summary":analysis.at("/summary/0/text").isString()?"/summary/0/text":null;
            if(path!=null)issues.add(new GroundedPracticeContract.Violation("PARTIAL_QUANTITY_EVIDENCE_OMITTED",path,analysis.at(path).asString(),
                "같은 세션 원본 수량 기록에 목표 수량 도달이 있고 최종 수량은 다르다. 최종 실패와 중간 목표 수량 도달을 함께 보존한다. 도달이 이해·숙달을 입증하지는 않는다. 기존 숫자를 유지하고 새 횟수를 만들지 않는다."));
        }
        if(!source.path("recordedProductSpecificationConflicts").isEmpty()
                &&!Pattern.compile("(?:안내|규격|용량|조건).{0,50}(?:불일치|모순|다르|충돌)").matcher(analysis.toString()).find()) {
            String path=analysis.path("summary").isString()?"/summary":analysis.at("/summary/0/text").isString()?"/summary/0/text":null;
            if(path!=null)issues.add(new GroundedPracticeContract.Violation("RECORDED_PRODUCT_CONFLICT_OMITTED",path,analysis.at(path).asString(),
                "제공된 recordedProductSpecificationConflicts의 안내/실제 SKU 규격 불일치를 설명한다. 양쪽 원본과 기존 숫자는 보존하고 배우의 이해 부족이나 행동 원인으로 단정하지 않는다. 새 숫자를 덧붙이지 않아도 규격 불일치를 명시할 수 있다."));
        }
        long quantities=Pattern.compile("(?<![0-9.-])[1-9][0-9]*\\s*(?:개|병|팩|봉지|봉|송이|묶음|통|상자|세트)").matcher(goal).results().count();
        boolean sharedQuantity=Pattern.compile("(?:각각|각)\\s*[1-9][0-9]*\\s*(?:개|병|팩|봉지|봉|송이|묶음|통|상자|세트)").matcher(goal).find();
        if(named.size()!=plan.path("itemCount").asInt(1)||!sharedQuantity&&quantities<plan.path("itemCount").asInt(1))
            issues.add(new GroundedPracticeContract.Violation("CONCRETE_PRODUCT_QUANTITY_REQUIRED","/practicePlan/goal",goal,
                "목표에 나열한 서로 다른 실제 상품 수를 itemCount와 정확히 맞추고 각 상품의 구매 수량·단위를 지정한다. 이전 4종 목표를 복사하고 itemCount만 1로 쓰지 않는다."));
        var raw=plan.path("rationale");String rationale=raw.isString()?raw.asString():raw.path("proposedPractice").asString();
        if(!rationale.contains("안내:")||!rationale.contains("달성:"))
            issues.add(new GroundedPracticeContract.Violation("CONCRETE_GUIDANCE_CRITERION_REQUIRED",raw.isString()?"/practicePlan/rationale":"/practicePlan/rationale/proposedPractice",rationale,
                "안내: 뒤에 플레이어가 따라 할 실제 문구·순서를 쓰고 달성: 뒤에 정확한 상품·수량과 종료/제출 조건을 쓴다. 변경:/확인:과 원본 근거·한계를 유지한다."));
        else {
            String guide=rationale.substring(rationale.indexOf("안내:")+3,rationale.indexOf("달성:")>rationale.indexOf("안내:")?rationale.indexOf("달성:"):rationale.length());
            if(Pattern.compile("선택|구매|담|수량").matcher(goal).find()&&!Pattern.compile("(?:매대|진열대|선반).{0,25}(?:열|엽|연\\s*(?:후|뒤|다음)|클릭|누르|누른|눌)").matcher(guide).find())
                issues.add(new GroundedPracticeContract.Violation("PRODUCT_SELECTION_GUIDANCE_REQUIRED",raw.isString()?"/practicePlan/rationale":"/practicePlan/rationale/proposedPractice",rationale,
                    "상품 선택 화면은 매대 열기에서 시작한다. 안내:에 목표 매대를 열고 상품/수량을 정한 뒤 장바구니를 확인하는 실제 순서를 쓴다. 장바구니를 열어 새 상품을 선택하라고 안내하지 않는다."));
            String criterion=rationale.substring(rationale.indexOf("달성:")+3);
            if(criterion.contains("확인:"))criterion=criterion.substring(0,criterion.indexOf("확인:"));
            var criterionProducts=namedProducts(criterion,choices);
            if(!criterionProducts.isEmpty()&&criterionProducts.size()<named.size()&&!Pattern.compile("부분|중간|첫\\s*(?:단계|품목|상품)|전체\\s*목표").matcher(criterion).find())
                issues.add(new GroundedPracticeContract.Violation("PRACTICE_CRITERION_SCOPE_MISMATCH",raw.isString()?"/practicePlan/rationale":"/practicePlan/rationale/proposedPractice",rationale,
                    "여러 상품 목표에서 한 상품만 담은 것을 전체 달성으로 쓰지 않는다. 전체 목표 조건을 맞추거나 한 품목의 부분 관찰임을 명시하고 전체 완료와 구분한다."));
        }
        return List.copyOf(issues);
    }
    private static Set<String> namedProducts(String text,List<JsonNode> choices) {
        var explicit=new HashSet<String>();var names=new LinkedHashMap<String,Set<String>>();
        for(var row:choices) {
            String id=row.path("productId").asString(row.path("id").asString(""));if(id.isBlank())continue;
            if(Pattern.compile("(?<![A-Za-z0-9_-])"+Pattern.quote(id)+"(?![A-Za-z0-9_-])",Pattern.CASE_INSENSITIVE).matcher(text).find())explicit.add(id);
            for(String k:List.of("name","label")){String label=row.path(k).asString("").replaceAll("\\s+","");if(!label.isBlank())names.computeIfAbsent(label,x->new HashSet<>()).add(id);}
        }
        if(names.isEmpty())return explicit;
        var pattern=Pattern.compile(names.keySet().stream().sorted(Comparator.comparingInt(String::length).reversed()).map(Pattern::quote).collect(java.util.stream.Collectors.joining("|")));
        var result=new HashSet<>(explicit);String compact=text.replaceAll("\\s+","");var matcher=pattern.matcher(compact);
        while(matcher.find()) {
            // A label immediately annotated with its explicit SKU refers to that SKU;
            // other human-named products in the same goal still count normally.
            var annotation=Pattern.compile("^[(（]([^）)]{1,120})[)）]").matcher(compact.substring(matcher.end()));
            boolean resolved=annotation.find()&&explicit.stream().anyMatch(id->annotation.group(1).equals(id));
            if(!resolved&&names.get(matcher.group()).size()==1)result.addAll(names.get(matcher.group()));
        }
        return result;
    }
    private static boolean hasReachedThenDifferentQuantity(JsonNode ledger) {
        for(var session:ledger) {
            var requirements=session.path("requirements");if(requirements.isEmpty())continue;
            var terminals=session.path("terminalRecords");JsonNode cart=null;
            for(var terminal:terminals)if(terminal.path("cart").isObject())cart=terminal.path("cart");
            if(cart==null)continue;
            for(var goal:requirements.get(requirements.size()-1).path("objectives")) {
                String id=goal.path("productId").asString();var quantity=goal.path("quantity");if(!quantity.isIntegralNumber())continue;
                var counts=session.path("quantityRanges").path(id).path("afterValueCounts");
                if(counts.path(quantity.toString()).asInt()>0&&cart.path(id).asInt(0)!=quantity.asInt())return true;
            }
        }
        return false;
    }
}
