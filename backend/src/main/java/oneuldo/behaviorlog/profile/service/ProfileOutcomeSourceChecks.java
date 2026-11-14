package oneuldo.behaviorlog.profile.service;

import java.util.*;
import java.util.regex.Pattern;
import oneuldo.behaviorlog.analysis.service.GroundedPracticeContract;
import tools.jackson.databind.JsonNode;

/** Rejects a purchase-completion claim only when its cited original terminal cart/quantities contradict it. */
public final class ProfileOutcomeSourceChecks {
    private ProfileOutcomeSourceChecks() {}
    private static final Pattern PURCHASE = Pattern.compile("정확히\\s*구매(?:하고|하여|했|하였)|목표[^.!?\\n]{0,60}(?<!미)달성(?:했|하였|되었)|구매[^.!?\\n]{0,40}완료(?:했|하였|되었)");
    private static final Pattern PAST_SUCCESS = Pattern.compile("과거\\s*(?:세션(?:\\([^)]*\\))?의?\\s*)?성공|성공\\s*기록");
    private static final Pattern NO_SUBMISSION = Pattern.compile("제출(?:\\s*기록)?(?:이|은|도)?\\s*(?:없|기록되지|관찰되지|이루어지지)");
    private static final Pattern SUBMISSION_TIME = Pattern.compile("(?:최종\\s*)?제출\\s*(?:시점|당시|시)(?:의|에)?\\s*[^。.!?\\n]{0,25}(?:장바구니|총액|수량|상품)");
    private static final Pattern NEGATED = Pattern.compile("^(?:\\s|[은는이가을를])*?(?:아니|않|못|없|확인되지|확인할 수 없|입증되지|볼 수 없|뜻하지).*");

    public static List<GroundedPracticeContract.Violation> inspect(JsonNode profile, JsonNode outcomes) {
        var zeroByEvent = new HashMap<String,Boolean>();
        var recordedSubmissions=new HashSet<String>();
        var endedWithoutSubmission=new HashSet<String>();
        for(var session:outcomes){boolean submitted=false,ended=false;for(var event:session.path("terminalEvents")){submitted|="SHOP.CHECKOUT_SUBMITTED".equals(event.path("eventCode").asString());ended|="SHOP.SESSION_ENDED".equals(event.path("eventCode").asString());}if(ended&&!submitted)for(var event:session.path("terminalEvents"))endedWithoutSubmission.add(event.path("sourceEventId").asString());}
        for (var session : outcomes) for (var event : session.path("terminalEvents")) {
            if (!event.path("sourceEventId").isString()) continue;
            if("SHOP.CHECKOUT_SUBMITTED".equals(event.path("eventCode").asString()))recordedSubmissions.add(event.path("sourceEventId").asString());
            var progress = event.path("objectiveProgress");
            if (!progress.isArray() || progress.isEmpty() || !event.path("cart").isObject()) continue;
            boolean known = true, zero = event.path("cart").isEmpty();
            for (var item : progress) {
                if (!item.path("requiredQuantity").isNumber() || !item.path("selectedQuantity").isNumber()) { known=false; break; }
                zero &= item.path("requiredQuantity").asDouble()>0 && item.path("selectedQuantity").asDouble()==0;
            }
            if (known) zeroByEvent.put(event.path("sourceEventId").asString(),zero);
        }
        var issues = new ArrayList<GroundedPracticeContract.Violation>();
        var global = new ArrayList<Boolean>();
        boolean anyCitedSubmission=false;
        boolean anyCitedUnsubmittedEnd=false;
        int index=0;
        for (var finding : profile.path("findings")) {
            var states = new ArrayList<Boolean>();
            boolean citesSubmission=false;
            boolean citesUnsubmittedEnd=false;
            for(var id:finding.path("evidenceEventIds"))if(recordedSubmissions.contains(id.asString()))citesSubmission=true;
            anyCitedSubmission|=citesSubmission;
            for(var id:finding.path("evidenceEventIds"))if(endedWithoutSubmission.contains(id.asString())){anyCitedUnsubmittedEnd=true;citesUnsubmittedEnd=true;}
            for (var id : finding.path("evidenceEventIds")) if (zeroByEvent.containsKey(id.asString())) states.add(zeroByEvent.get(id.asString()));
            global.addAll(states);
            var texts = new LinkedHashMap<String,String>();
            for (String field : List.of("observation","interpretation","suggestedSupport")) if (finding.path(field).isString()) texts.put("/findings/"+index+"/"+field,finding.path(field).asString());
            int alternative=0;
            for (var text : finding.path("alternativeExplanations")) if (text.isString()) texts.put("/findings/"+index+"/alternativeExplanations/"+(alternative++),text.asString());
            if (!states.isEmpty() && states.stream().allMatch(Boolean::booleanValue) && texts.values().stream().anyMatch(t->positive(t,PURCHASE)))
                texts.forEach((path,text)->{if(positive(text,PURCHASE)||positive(text,PAST_SUCCESS)) issues.add(issue(path,text));});
            if(citesUnsubmittedEnd&&!citesSubmission)texts.forEach((path,text)->{if(SUBMISSION_TIME.matcher(beforePast(text)).find())issues.add(unrecordedSubmissionIssue(path,text));});
            if(citesSubmission)texts.forEach((path,text)->{if(NO_SUBMISSION.matcher(text).find())issues.add(submissionIssue(path,text));});
            index++;
        }
        if (!global.isEmpty() && global.stream().allMatch(Boolean::booleanValue) && positive(profile.path("summary").asString(),PURCHASE))
            issues.add(issue("/summary",profile.path("summary").asString()));
        if(anyCitedSubmission){String summary=profile.path("summary").asString();int past=summary.indexOf("과거 세션");if(past>=0&&NO_SUBMISSION.matcher(summary.substring(past)).find())issues.add(submissionIssue("/summary",summary));}
        String currentSummary=profile.path("summary").asString();int pastBoundary=currentSummary.indexOf("과거");if(pastBoundary>=0)currentSummary=currentSummary.substring(0,pastBoundary);
        if(anyCitedUnsubmittedEnd&&!anyCitedSubmission&&SUBMISSION_TIME.matcher(currentSummary).find())
            issues.add(unrecordedSubmissionIssue("/summary",profile.path("summary").asString()));
        return List.copyOf(issues);
    }
    private static String beforePast(String text){int p=text.length();for(String marker:List.of("과거","이전 세션","이전세션")){int i=text.indexOf(marker);if(i>=0)p=Math.min(p,i);}return text.substring(0,p);}
    private static GroundedPracticeContract.Violation unrecordedSubmissionIssue(String path,String text) {
        return new GroundedPracticeContract.Violation("PROFILE_UNRECORDED_SUBMISSION_REFERENCE",path,text,
            "이 finding이 인용한 현재 세션의 전체 제출·종료 원본에는 세션 종료만 있고 제출 사건은 없다. 제출 시점/제출 시라는 현재 상태를 종료 시점으로 바로잡는다. 현재 미제출과 과거의 실제 제출을 구분하고 원래 숫자·근거·관찰과 다른 필드는 보존한다.");
    }
    private static boolean positive(String text,Pattern pattern) {
        var match=pattern.matcher(text);
        while(match.find()) if(!NEGATED.matcher(text.substring(match.end())).matches()) return true;
        return false;
    }
    private static GroundedPracticeContract.Violation submissionIssue(String path,String text) {
        return new GroundedPracticeContract.Violation("PROFILE_SUBMISSION_CONTRADICTS_ORIGINAL",path,text,
            "이 finding이 인용한 원본에는 SHOP.CHECKOUT_SUBMITTED가 있다. 제출 기록 없음이라고 쓰지 않는다. 빈 장바구니의 시스템 제출과 목표 미달을 구매 성공/인간의 독립 제출과 구분해 직접 서술한다. 현재 미제출 세션과 이 과거 제출 세션을 혼동하지 않는다.");
    }
    private static GroundedPracticeContract.Violation issue(String path,String text) {
        return new GroundedPracticeContract.Violation("PROFILE_OUTCOME_CONTRADICTS_ORIGINAL",path,text,
            "인용된 제출·종료 원본의 장바구니는 비어 있고 모든 목표의 selectedQuantity가 0이다. 과거 AI의 성공 표시가 아니라 이 원본을 따른다. 정확히 구매·목표 달성·성공 기록이라는 주장을 삭제하고, 기록된 목표와 빈 장바구니 제출을 직접 서술한다. 잘못된 성공 문장을 다시 인용한 뒤 단서만 붙이지 않는다. 제출 사건이 원본에 있으면 제출 기록이 없다고 바꾸지 말고 빈 장바구니의 시스템 제출이라고 쓴다. 기존 수치를 보존하고 새 숫자 대신 '빈 장바구니'처럼 표현한다.");
    }
}
