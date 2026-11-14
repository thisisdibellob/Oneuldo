package oneuldo.behaviorlog.analysis;
import java.nio.file.*;import java.util.*;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.profile.service.ProfileOutcomeSourceChecks;
/** Read-only audit of already recorded output against original sources. No model or application DB. */
@EnabledIfEnvironmentVariable(named="AI_FINAL_RECORD_AUDIT",matches="true")
class FinalRecordedSourceAuditTest {
 @Test void audit_recorded_originals_and_final_prose()throws Exception {
  var m=JsonMapper.builder().findAndAddModules().build();var run=Path.of(System.getenv("AI_NINE_RUN"));var reports=m.createArrayNode();var arm=System.getenv().getOrDefault("AI_NINE_AUDIT_ARM","candidate");if(!Set.of("candidate","baseline").contains(arm))throw new IllegalArgumentException("INVALID_AUDIT_ARM");
  for(var c:m.readTree(Files.readString(run.resolve("manifest.json"))).path("cases")) {
   var folder=run.resolve("results/"+arm).resolve(c.path("key").asString());if(!Files.exists(folder.resolve("analysis.json")))continue;
   var raw=m.readTree(Files.readString(Path.of(c.path("sourcePath").asString())));var row=reports.addObject().put("case",c.path("originalCaseNumber").asInt()).put("key",c.path("key").asString());
   var analysis=m.readTree(Files.readString(folder.resolve("analysis.json")));row.set("analysisIssues",m.valueToTree(GroundedPracticeContract.inspect(analysis,raw,true)));
   var context=m.readTree(Files.readString(run.resolve("cases").resolve(c.path("key").asString()).resolve("profile-context.json")));var source=m.readTree(Files.readString(run.resolve("sources/members").resolve(context.path("memberId").asString()+".json")));var outcomes=m.createArrayNode();
   for(var snapshot:source.path("snapshots")) {var input=m.treeToValue(snapshot.path("input_data"),BehaviorAnalysisInput.class);var response=new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);for(var ledger:SessionSourceLedger.build(m,response))outcomes.addObject().set("terminalEvents",ledger.path("terminalRecords"));}
   if(Files.exists(folder.resolve("profile.json"))) {var profile=m.readTree(Files.readString(folder.resolve("profile.json"))).path("profile");var issues=new ArrayList<>(GroundedPracticeContract.inspect(profile,source,true));issues.addAll(ProfileOutcomeSourceChecks.inspect(profile,outcomes));row.set("profileIssues",m.valueToTree(issues));}
  }
  Files.writeString(run.resolve(arm.equals("candidate")?"final-recorded-source-audit.json":"final-recorded-source-audit-baseline.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(reports));System.out.println("READ_ONLY_SOURCE_AUDIT_CASES="+reports.size());
 }
}
