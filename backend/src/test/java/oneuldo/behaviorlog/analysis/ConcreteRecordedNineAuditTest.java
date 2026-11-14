package oneuldo.behaviorlog.analysis;
import java.nio.file.*;import java.util.*;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import oneuldo.behaviorlog.analysis.domain.*;import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.profile.service.ProfileOutcomeSourceChecks;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

/** Rechecks stored final results against untouched originals. No inference, database writes or scoring. */
@EnabledIfEnvironmentVariable(named="AI_CONCRETE_SOURCE_AUDIT",matches="true")
class ConcreteRecordedNineAuditTest {
 @Test void sourceAndPracticeDesignChecksAreReportedSeparately()throws Exception{
  var m=JsonMapper.builder().findAndAddModules().build();var run=Path.of(System.getenv("AI_NINE_RUN"));
  var arm=System.getenv().getOrDefault("AI_NINE_AUDIT_ARM","candidate");assertThat(arm).isIn("baseline","candidate");
  var rows=m.createArrayNode();int issues=0;
  for(var c:m.readTree(Files.readString(run.resolve("manifest.json"))).path("cases")){
   var folder=run.resolve("results").resolve(arm).resolve(c.path("key").asString());if(!Files.exists(folder.resolve("analysis.json")))continue;
   var raw=m.readTree(Files.readString(Path.of(c.path("sourcePath").asString())));var source=(ObjectNode)raw.deepCopy();PracticeDesignContract.attach(m,source,raw);
   var row=rows.addObject().put("case",c.path("originalCaseNumber").asInt()).put("key",c.path("key").asString());
   assertThat(QwenTokenCounter.textHash(Files.readString(Path.of(c.path("sourcePath").asString())))).isEqualTo(c.path("sourceSha256").asString());
   var analysis=m.readTree(Files.readString(folder.resolve("analysis.json")));
   var a=GroundedPracticeContract.inspect(analysis,source,true);row.set("analysisIssues",m.valueToTree(a));issues+=a.size();
   if(!Files.exists(folder.resolve("profile.json"))){row.put("profileStatus","NO_READY_PROFILE");continue;}
   var context=m.readTree(Files.readString(run.resolve("cases").resolve(c.path("key").asString()).resolve("profile-context.json")));
   var member=m.readTree(Files.readString(run.resolve("sources/members").resolve(context.path("memberId").asString()+".json")));
   var outcomes=m.createArrayNode();for(var snapshot:member.path("snapshots")){
    var input=m.treeToValue(snapshot.path("input_data"),BehaviorAnalysisInput.class);var response=new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
    for(var ledger:SessionSourceLedger.build(m,response))outcomes.addObject().set("terminalEvents",ledger.path("terminalRecords"));
   }
   var profile=m.readTree(Files.readString(folder.resolve("profile.json"))).path("profile");
   if(profile.isObject()){
    var profileSource=(ObjectNode)member.deepCopy();profileSource.put(PracticeDesignContract.FIELD,PracticeDesignContract.VERSION);profileSource.set("practiceProductSources",source.path("practiceProductSources"));
    var p=new ArrayList<>(GroundedPracticeContract.inspect(profile,profileSource,true));p.addAll(ProfileOutcomeSourceChecks.inspect(profile,outcomes));
    row.set("profileIssues",m.valueToTree(p));issues+=p.size();
   } else row.put("profileStatus","NO_READY_PROFILE");
  }
  var report=m.createObjectNode().put("scope","Specific source/cause/capability/design checks, not overall clinical accuracy or learning effects.").put("casesAudited",rows.size()).put("issues",issues);report.set("cases",rows);
  Files.writeString(run.resolve("concrete-source-audit-"+arm+".json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(report));
  if("true".equals(System.getenv("AI_REQUIRE_ALL_NINE")))assertThat(rows.size()).isEqualTo(9);
  if("candidate".equals(arm)&&"true".equals(System.getenv("AI_REQUIRE_ZERO_ISSUES")))assertThat(issues).isZero();
 }
}
