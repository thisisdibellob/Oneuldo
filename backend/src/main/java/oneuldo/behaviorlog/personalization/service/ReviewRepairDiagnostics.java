package oneuldo.behaviorlog.personalization.service;
import java.util.*;
import tools.jackson.databind.ObjectMapper;
/** Bounded syntax feedback only; does not choose a verdict or modify a reviewed claim. */
final class ReviewRepairDiagnostics {
 static List<Map<String,Object>> inspect(ObjectMapper mapper,String raw) {
  var errors=new ArrayList<Map<String,Object>>();
  try {
   var root=mapper.readTree(raw);int i=0;
   for(var issue:root.path("issues")) {
    if(i>=8)break;String base="/issues/"+i++;
    if(!MarketQuestConsistencyReview.ISSUE_CODES.contains(issue.path("code").asString()))errors.add(Map.of("path",base+"/code","allowedCodes",MarketQuestConsistencyReview.ISSUE_CODES.stream().sorted().toList()));
    if(issue.path("path").asString().startsWith("/deliveredQuest/"))errors.add(Map.of("path",base+"/path","requirement","Use a candidate-relative pointer such as /adaptationSummary; do not prepend /deliveredQuest."));
    if(issue.path("explanation").asString().length()>240)errors.add(Map.of("path",base+"/explanation","maximumChars",240,"submittedChars",issue.path("explanation").asString().length()));
   }
  } catch(RuntimeException invalid) {errors.add(Map.of("path","/","requirement","Return one complete review JSON object."));}
  return List.copyOf(errors);
 }
}
