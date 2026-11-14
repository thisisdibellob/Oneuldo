package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import java.util.regex.Pattern;
import tools.jackson.databind.*;

/** Shared output boundaries; rejects unsupported prose, never rewrites source or model findings. */
public final class GroundedPracticeContract {
    private GroundedPracticeContract() {}
    public static final String RULE = """
        No guessed cognition, faults, time/opportunity shortage or absent search. State missing evidence; controller stop reasons do not prove why choices were absent.
        No proposed quantity locks, disabled buttons, auto-stop, highlights, target arrows, automatic cart-shortage alerts or voice. Change an implemented condition;
        match goal/itemCount/support. No-selection multi-item task: reduce item burden. Reached-then-lost quantity: consider maintaining it.
        rationale/proposedPractice requires '변경: [old→new condition]. 확인: [next observable action/result]'.
        Retained conditions require another change; effects untested.
        source=synthetic인 기록에서 실제 조작의 주어는 '합성 배우'다. '사용자/학습자가 조작했다'고 쓰지 않는다. 사람의 능력·의도는 미확인이다.
        장바구니 열기는 담기·제거의 증거가 아니며 도움말 열기 횟수는 도움 의존이나 그 감소의 증거가 아니다.
        """;
    private static final Pattern CAUSE = Pattern.compile(
        "(?:이해|인지|인식|사용법|조작법|사용\\s*방법|조작\\s*방법|(?:상품|품목).{0,5}식별).{0,25}(?:부족|못했|못해|미숙|어려움|곤란|혼란)|(?:시스템|기기|장치|기술적?|앱|네트워크|조작|에이전트|액터).{0,15}(?:오류|고장|버그)|(?:입력|반응).{0,5}지연|의도적.{0,8}(?:포기|중단)|실수(?:로|일| 가능| 등|[,，])|조작.{0,8}미숙|(?:능력|전략).{0,12}(?:부재|부족|결핍)|정책.{0,35}(?:생략|건너뛰|직접 제출|생성하지|생성되지)|시스템.{0,15}제한.{0,15}(?:인해|때문).{0,40}(?:선택|행동|조작).{0,15}(?:기록되지|생성되지)|(?:시간|기회).{0,10}(?:부족|없었|없을|잃)|탐색.{0,8}부재|(?:위치\\s*파악|선택\\s*조작\\s*방법|사용\\s*방법).{0,25}(?:적용하지\\s*못|알지\\s*못|몰랐|익숙하지)");
    private static final Pattern NAMED_CAUSES = Pattern.compile("(?:동기|원인|이유|의도)[^。.!?\\n]{0,50}[(（][^）)]*(?:[,，·/]|vs|또는|혹은)[^）)]*[)）]|(?:원인|이유).{0,80}(?:인지[,，]|오류인지|방해|때문인지)|오류.{0,6}(?:가능|등|배제)|(?:오류|실수|피로|불안)(?:인지|였는지|일 수)|(?:탐색|확인|연습|집중|흥미).{0,12}(?:인지|였는지|했는지|었는지).{0,15}(?:[,，]|아니면|혹은|또는)");
    private static final Pattern EXECUTION_CAUSE=Pattern.compile("(?:실행|행동|에이전트|액터|합성\\s*배우).{0,15}로직.{0,45}(?:누락|생략|기록되지)|탐색\\s*실패.{0,15}(?:인한|때문|인지)");
    private static final Pattern UNPROVEN_CAUSE_LIST=Pattern.compile("(?:원인|이유)(?:이|가|은|는)?\\s*(?:탐색|확인|실수|오류|실패|인식|인지|이해|동기|피로|불안|집중|정책|실행|시스템)[^。.!?\\n]{0,90}(?:인지|가능|추정|수\\s*있)");
    private static final Pattern CAUSAL_ALTERNATIVES=Pattern.compile("(?:원인|이유)[^。.!?\\n]{0,100}인지[^。.!?\\n]{0,100}인지");
    private static final Pattern UNRECORDED_ACTION_HYPOTHESIS=Pattern.compile("일시.{0,35}(?:추가|제거|변경).{0,70}(?:었는지|가능|수 있)");
    private static final Pattern MOTIVE_WORDS=Pattern.compile("확인|탐색|연습|의도|동기|실수|우연|이해|인지|피로|흥미|집중|불안|정책|오류|지연|시간|기회|종료");
    private static final Pattern HYPOTHESIS=Pattern.compile("수 있|(?<![가-힣])수도|가능|일 수");
    private static final Pattern INFERRED_PURPOSE=Pattern.compile("(?:집중|몰두).{0,15}(?:하여|해서|하느라|때문|인해)|(?:매대|상품).{0,20}(?:찾지 못|못 찾|식별하지 못|인지하지 못|파악하지 못)|탐색.{0,8}부재|탐색\\s*실패(?:의|로\\s*인|가|를|인지|했)");
    private static final Pattern SYSTEM_CLEAR=Pattern.compile("(?:시스템|SYSTEM_COMPLETION).{0,80}(?:장바구니|카트).{0,20}(?:비우|비운|초기화)");
    private static final Pattern CONTROL_AS_BEHAVIOR_CAUSE=Pattern.compile("(?:실행\\s*주체|실행\\s*컨텍스트).{0,25}(?:변경|전환).{0,40}(?:이로 인해|으로 인해).{0,45}(?:행동|선택|조작).{0,20}(?:기록되지|생략|부재)");
    private static final Pattern UNRECORDED_SEARCH_INTENT=Pattern.compile("탐색\\s*의도.{0,12}(?:있었|있다|있는|보였|보인다|드러났|드러난|확인되었|확인되어)|탐색\\s*시도.{0,30}단절");
    private static final Pattern ACTOR_SUBMISSION=Pattern.compile("(?:합성\\s*(?:배우|액터|에이전트)|PERSONA_ACTOR|액터)(?:는|가)?.{0,180}(?:제출했|제출하였|제출함|제출을\\s*완료)");
    private static final Pattern REMOVAL_HYPOTHESIS=Pattern.compile("(?:담았|담은|추가했|추가한).{0,35}(?:제거|뺐|빼|비웠)|(?:선택|담기|추가).{0,15}(?:후|뒤|다음).{0,20}(?:제거|비우|취소)");
    private static final Pattern HELP_DEPENDENCE=Pattern.compile("(?:도움말|도움|직원).{0,15}의존.{0,15}(?:감소|증가|높|낮|줄|나타|보이|추정|판단|확인되)|(?:도움말|도움|직원).{0,15}의존(?:했|한다|하는\\s*경향)");
    private static final Pattern NAMED_PURPOSE_ALTERNATIVES=Pattern.compile("(?:행동|열기|닫기|선택).{0,80}(?:목표\\s*확인|오류\\s*수정|단순\\s*탐색|의도적).{0,80}(?:혹은|또는|아니면).{0,80}(?:인지|했는지|의도)");
    private static final Pattern POLICY_AS_CAUSE=Pattern.compile("(?:실행|배우|액터|에이전트).{0,20}정책.{0,15}(?:인해|때문).{0,45}(?:행동|탐색|선택).{0,20}(?:기록되지|생략)|의도적으로.{0,12}선택.{0,10}생략");
    private static final Pattern UNIMPLEMENTED = Pattern.compile(
        "자동.{0,12}잠금|수량.{0,15}(?:버튼.{0,8})?(?:제한|잠금)|버튼.{0,8}비활성|목표.{0,12}자동.{0,8}(?:정지|고정)|시각.{0,8}강조|시각적.{0,10}(?:지원|안내)|피드백.{0,5}(?:강화|추가)|시각적.{0,10}확인.{0,6}(?:제공|표시)|가시성.{0,8}(?:강화|개선|높이)|하이라이트|highlight|음성.{0,8}(?:안내|지원)|(?:목표|매대|이동|방향).{0,12}화살표|(?:장바구니|카트|수량|상품).{0,20}(?:부족|미달).{0,12}(?:알림|경고)|자동.{0,12}(?:도움말|힌트).{0,8}(?:열|표시|제공)",Pattern.CASE_INSENSITIVE);
    private static final Pattern DENIAL = Pattern.compile("미지원|미구현|구현되지|제안하지|사용하지|제공하지");
    public record Violation(String code,String path,String quote,String explanation) {}
    /** Exact unsupported spans help the model delete a rejected cause, rather than append a disclaimer. */
    public static List<String> unsupportedCauseSpans(Violation issue) {
        if(!issue.code().equals("UNCONFIRMED_CAUSE"))return List.of();
        var out=new LinkedHashSet<String>();
        for(var pattern:List.of(CAUSE,NAMED_CAUSES,INFERRED_PURPOSE,CONTROL_AS_BEHAVIOR_CAUSE,UNRECORDED_SEARCH_INTENT,UNRECORDED_ACTION_HYPOTHESIS,CAUSAL_ALTERNATIVES,EXECUTION_CAUSE,UNPROVEN_CAUSE_LIST,HELP_DEPENDENCE,NAMED_PURPOSE_ALTERNATIVES,POLICY_AS_CAUSE)) {
            var matcher=pattern.matcher(issue.quote());while(matcher.find())out.add(matcher.group());
        }
        return List.copyOf(out);
    }
    public static List<Violation> inspect(JsonNode analysis,JsonNode source,boolean requirePlanDesign) {
        var texts=new LinkedHashMap<String,String>();collect(analysis,"",texts);
        var proofs=new ArrayList<String>();proofs(source,proofs);
        var issues=new ArrayList<Violation>();
        boolean systemOnlySubmission=onlySystemSubmission(source);
        boolean hasQuantityAction=recordedCode(source,"SHOP.ITEM_SELECTED")||recordedCode(source,"SHOP.QUANTITY_CHANGED");
        for(var entry:texts.entrySet()) {
            String path=entry.getKey(),text=entry.getValue();
            if(path.contains("evidenceEventIds")||path.contains("reasonCodes")||path.endsWith("/id")||path.endsWith("/skill"))continue;
            boolean pastClaim=!path.startsWith("/practicePlan/")&&!path.contains("suggestedSupport");
            if((NAMED_PURPOSE_ALTERNATIVES.matcher(text).find()||POLICY_AS_CAUSE.matcher(text).find())&&proofs.stream().noneMatch(p->!p.isBlank()&&text.contains(p)))
                issues.add(new Violation("UNCONFIRMED_CAUSE",path,text,"행동의 목적이나 실행 정책을 원인 후보로 나열할 직접 근거가 없다. 실제 조작과 알려진 제어 종료 사유를 보존하고 배우의 원인·의도만 미확인으로 남긴다."));
            if(pastClaim&&!hasQuantityAction&&REMOVAL_HYPOTHESIS.matcher(text).find())
                issues.add(new Violation("UNRECORDED_ACTION_HYPOTHESIS",path,text,"완전한 원본에 상품 선택·수량 변경이 없다. 담았다가 제거했다는 과거 행동이나 가능성을 만들지 말고 장바구니 열기와 최종 상태만 보존한다."));
            if(pastClaim&&HELP_DEPENDENCE.matcher(text).find()&&proofs.stream().noneMatch(p->!p.isBlank()&&text.contains(p)))
                issues.add(new Violation("UNCONFIRMED_CAUSE",path,text,"도움말 열기·도움 요청은 도움 의존이나 의존 감소를 입증하지 않는다. 기록된 열기/요청/실제 제공과 이해 여부를 구분한다."));
            if((CAUSE.matcher(text).find()||UNPROVEN_CAUSE_LIST.matcher(text).find()||EXECUTION_CAUSE.matcher(text).find()||NAMED_CAUSES.matcher(text).find()||CAUSAL_ALTERNATIVES.matcher(text).find()||INFERRED_PURPOSE.matcher(text).find()||CONTROL_AS_BEHAVIOR_CAUSE.matcher(text).find()||UNRECORDED_SEARCH_INTENT.matcher(text).find()||((path.startsWith("/uncertainties/")||path.contains("/interpretation")||path.contains("/alternativeExplanations")||path.startsWith("/practicePlan/rationale"))&&UNRECORDED_ACTION_HYPOTHESIS.matcher(text).find())||(path.contains("/alternativeExplanations/")&&HYPOTHESIS.matcher(text).find())||(path.contains("/interpretation")&&MOTIVE_WORDS.matcher(text).find()&&HYPOTHESIS.matcher(text).find())) && proofs.stream().noneMatch(p->!p.isBlank()&&text.contains(p)))
                issues.add(new Violation("UNCONFIRMED_CAUSE",path,text,UNRECORDED_SEARCH_INTENT.matcher(text).find()?"ITEM_SEARCH_STARTED는 이동 시작의 자동 기록이다. 탐색 의도가 있었다는 해석을 삭제하고 실제 이동·선반 열기·선택 기록만 보존한다.":Pattern.compile("(?:시간|기회).{0,10}(?:부족|없었|없을|잃)").matcher(text).find()?"시간 부족·구매 기회 부재라는 가설을 삭제한다. 제어 종료나 남은 시간만으로 선택 부재의 원인을 추정하지 말고 기록된 종료 조건과 원인 미확인만 보존한다.":INFERRED_PURPOSE.matcher(text).find()?"선택 기록 부재는 탐색 부재·찾지 못함·집중·놓침의 증거가 아니다. 원문이 보여 주는 선택·수량 변경 기록의 유무만 서술하고 찾지 못했다는 전제 자체를 제거한다.":"명명한 원인을 입증하는 직접 원문이 없다. 가능성 목록을 옮기지 말고 관찰 사실과 원인 미확인만 보존한다."));
            if(originalHas(source,"controllerReason","action-limit")&&Pattern.compile("(?:종료|제출|중단)인지.{0,20}(?:구분|미확인|명확하지|확인할 수 없)|(?:전환|종료|제출|중단).{0,65}때문인지.{0,70}(?:명확하지|구분|확인할 수 없)").matcher(text).find())
                issues.add(new Violation("KNOWN_CONTROLLER_REASON_OBSCURED",path,text,"controllerReason=action-limit는 원본에 기록된 제어 종료 사유다. 알려진 제어 사유를 미확인으로 바꾸지 말고, 배우의 내적 동기만 미확인으로 구분한다."));
            if(systemOnlySubmission&&Arrays.stream(text.split("(?<=[.!?。])\\s+|\\n")).anyMatch(sentence->ACTOR_SUBMISSION.matcher(sentence).find()&&!Pattern.compile("시스템|SYSTEM_COMPLETION|SYSTEM_STOP").matcher(sentence).find()))
                issues.add(new Violation("SYSTEM_SUBMISSION_ACTOR_ATTRIBUTION",path,text,"원본의 제출 주체는 SYSTEM_COMPLETION/SYSTEM_STOP뿐이다. 합성 배우가 제출했다는 요약을 제거하고 배우의 기록된 수량 조작과 시스템 제출을 분리한다. 숫자·목표·최종 상태·근거 ID는 유지한다."));
            if(SYSTEM_CLEAR.matcher(text).find()&&!recordedClear(source))
                issues.add(new Violation("UNRECORDED_SYSTEM_CLEAR",path,text,"인용 문장의 시스템이 비웠다는 전제는 잘못된 AI 주장이다. 비우다·초기화하다 동작을 삭제한다. 원본이 확인하는 빈 장바구니 상태와 SYSTEM_COMPLETION 주체의 제출만 분리해 서술한다. 시스템이 비운 동작은 원본에 없다."));
            if(path.contains("suggestedSupport")&&text.matches("[A-Z_]{3,}"))
                issues.add(new Violation("UNACTIONABLE_SUPPORT",path,text,"내부 목적 코드만으로는 지원 행동을 알 수 없다. 고정 과제 조건 안에서 실행할 구체적인 안내를 문장으로 쓴다."));
            if(text.contains("수행이 전혀 이루어지지")&&recordedCode(source,"SHOP.CART_OPENED"))
                issues.add(new Violation("OVERBROAD_NONPERFORMANCE",path,text,"장바구니 열기 등 실제 조작이 있다. 목표 미달·상품 추가 부재와 전체 수행 부재를 구분하고 관찰된 행동을 보존한다."));
            if(!path.startsWith("/practicePlan/")&&!path.contains("suggestedSupport")&&recordedSynthetic(source)
                &&Pattern.compile("(?:학습자|사용자)(?:\\(PERSONA_ACTOR\\))?(?:는|가).{0,45}(?:열|닫|선택|조정|추가|찾|담|포기)|학습자.{0,25}(?:행동을 완료할 기회|의도적 행동 범위)|학습자.{0,30}의도적\\s*행동.{0,25}(?:대체|방해)").matcher(text).find())
                issues.add(new Violation("SYNTHETIC_ACTOR_ATTRIBUTION",path,text,"원본은 합성 PERSONA_ACTOR 기록이다. 기록된 조작을 합성 배우에게 귀속하고 인간 학습자 행동이나 의도로 바꾸지 않는다. 인간 능력의 미확인 한계는 보존한다."));
            if((path.contains("suggestedSupport")||path.startsWith("/practicePlan/"))&&Arrays.stream(text.split("(?<=[.!?。])\\s+|\\n")).anyMatch(clause->UNIMPLEMENTED.matcher(clause).find()&&!DENIAL.matcher(clause).find()))
                issues.add(new Violation("UNSUPPORTED_CAPABILITY",path,text,"현재 구현되지 않은 자동 잠금/버튼 제한/강조/화살표/자동 부족 알림/음성 지원이다. 원본 관찰과 수치를 유지하고 실제 안내/과제 조건으로 제안한다."));
        }
        if(requirePlanDesign && analysis.path("practicePlan").isObject()) {
            var r=analysis.at("/practicePlan/rationale");String text=r.isString()?r.asString():r.path("proposedPractice").asString();
            if(!text.contains("변경:")||!text.contains("확인:"))issues.add(new Violation("PRACTICE_DESIGN_REQUIRED",r.isString()?"/practicePlan/rationale":"/practicePlan/rationale/proposedPractice",text,"기존 과제 대비 구체적 변경 조건과 다음 로그로 확인할 행동을 '변경:' 및 '확인:'으로 설명한다. 목표·itemCount·지원 조건을 일치시킨다."));
        }
        issues.addAll(PracticeDesignContract.inspect(analysis,source));
        return List.copyOf(issues);
    }
    public static final class Rejected extends IllegalArgumentException {
        private final String candidate; private final List<Violation> issues;
        public Rejected(String candidate,List<Violation> issues){super("GROUNDED_OUTPUT_REQUIRED");this.candidate=candidate;this.issues=issues;}
        public String candidate(){return candidate;} public List<Violation> issues(){return issues;}
    }
    private static void collect(JsonNode node,String path,Map<String,String> out) {
        if(node.isString())out.put(path,node.asString());
        else if(node.isObject())for(String key:node.propertyNames())collect(node.get(key),path+"/"+key,out);
        else if(node.isArray())for(int i=0;i<node.size();i++)collect(node.get(i),path+"/"+i,out);
    }
    private static boolean onlySystemSubmission(JsonNode source) {
        var index=source.path(LiteralEventIndex.FIELD).path("eventsById");var owners=new HashSet<String>();
        if(index.isObject())for(String id:index.propertyNames()) {var row=index.get(id);if(checkoutCode(row.path("eventCode")))owners.add(row.path("recordedExecutionOwner").isString()?row.path("recordedExecutionOwner").asString():"UNKNOWN");}
        if(owners.isEmpty())submissionOwners(source,owners);
        return !owners.isEmpty()&&owners.stream().allMatch(v->Set.of("SYSTEM_COMPLETION","SYSTEM_STOP").contains(v));
    }
    private static boolean checkoutCode(JsonNode value){return value.isString()&&value.asString().equals("SHOP.CHECKOUT_SUBMITTED");}
    private static void submissionOwners(JsonNode n,Set<String> owners) {
        if(n==null)return;
        if(n.isObject()) {
            boolean rawEvent=checkoutCode(n.path("action").path("eventCode"));
            boolean identifiedRow=checkoutCode(n.path("eventCode"))&&List.of("id","sourceEventId","behaviorLogId","sessionId","sequence","recordedOwner","recordedExecutionOwner","replayExecutionContext").stream().anyMatch(n::has);
            if(rawEvent||identifiedRow) {
                String owner="UNKNOWN";for(var value:List.of(n.path("recordedOwner"),n.path("recordedExecutionOwner"),n.path("replayExecutionContext").path("executionOwner"),n.path("payload").path("marketContent").path("replayExecutionContext").path("executionOwner")))if(value.isString()){owner=value.asString();break;}owners.add(owner);
            }
            for(String key:n.propertyNames())if(!Set.of("currentAnalysis","previousProfile","chunkAnalyses","retrievedKnowledge").contains(key))submissionOwners(n.get(key),owners);
        } else if(n.isArray())n.forEach(x->submissionOwners(x,owners));
    }
    private static boolean recordedSynthetic(JsonNode n) {return originalHas(n,"source","synthetic");}
    private static boolean recordedCode(JsonNode n,String value) {
        if(originalHas(n,"eventCode",value))return true;
        if(n==null)return false;
        if(n.isObject()) {
            if(n.path("eventCounts").path(value).isIntegralNumber()&&n.path("eventCounts").path(value).asInt()>0)return true;
            for(String k:n.propertyNames()) {
                if(Set.of("currentAnalysis","previousProfile","chunkAnalyses","retrievedKnowledge").contains(k))continue;
                if(recordedCode(n.get(k),value))return true;
            }
        } else if(n.isArray())for(var row:n)if(recordedCode(row,value))return true;
        return false;
    }
    private static boolean originalHas(JsonNode n,String key,String value) {
        if(n==null)return false;
        if(n.isObject())for(String k:n.propertyNames()) {
            if(Set.of("currentAnalysis","previousProfile","chunkAnalyses","retrievedKnowledge").contains(k))continue;
            if(k.equals(key)&&n.get(k).isString()&&n.get(k).asString().equals(value))return true;
            if(originalHas(n.get(k),key,value))return true;
        } else if(n.isArray())for(var row:n)if(originalHas(row,key,value))return true;
        return false;
    }
    private static boolean recordedClear(JsonNode n) {
        if(n==null)return false;
        if(n.isObject())for(String key:n.propertyNames()) {
            if(Set.of("currentAnalysis","previousProfile","chunkAnalyses","retrievedKnowledge").contains(key))continue;
            var v=n.get(key);
            if(key.equals("eventCode")&&v.isString()&&v.asString().equals("SHOP.CART_CLEARED"))return true;
            if(Set.of("cartCleared","clearCartPerformed").contains(key)&&v.isBoolean()&&v.asBoolean())return true;
            if(recordedClear(v))return true;
        } else if(n.isArray())for(var row:n)if(recordedClear(row))return true;
        return false;
    }
    private static void proofs(JsonNode n,List<String> out) {
        if(n==null)return;
        if(n.isObject())for(String k:n.propertyNames()) {
            if(Set.of("currentAnalysis","previousProfile","chunkAnalyses","retrievedKnowledge").contains(k))continue;
            if(Set.of("feedbackNote","renderErrorCode").contains(k)&&n.get(k).isString()) {
                String v=n.get(k).asString();if(!Set.of("NONE","UNKNOWN","NO_ERROR","").contains(v))out.add(v);
            } else proofs(n.get(k),out);
        } else if(n.isArray())n.forEach(x->proofs(x,out));
    }
    public static boolean hasDirectCauseEvidence(JsonNode source){var values=new ArrayList<String>();proofs(source,values);return !values.isEmpty();}
}
