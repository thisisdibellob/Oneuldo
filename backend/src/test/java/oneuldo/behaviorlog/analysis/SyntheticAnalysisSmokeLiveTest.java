package oneuldo.behaviorlog.analysis;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.function.Function;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.ai.client.RestOllamaChatClient;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.assertThat;

/** Technical fixtures only: no browser, behavior uploads, real participant or profile writes. */
class SyntheticAnalysisSmokeLiveTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private static final Path OUT = Path.of(System.getProperty("oneuldo.analysis-smoke.output",
            Path.of("..", "output", "analysis-smoke-20261011").toAbsolutePath().normalize().toString()));
    private static final List<String> CASES = List.of(System.getProperty("oneuldo.analysis-smoke.cases",
            "corrected-selection,wrong-specification,help-movement-timeout").split(","));
    private final AnalysisTokenBudget budget = new AnalysisTokenBudget();
    private record Prepared(String name, BehaviorAnalysisInputResponse input, AnalysisReferences refs, String prompt) {}

    @Test void three_technical_sources_fit_and_preserve_literal_requirements_and_actions() throws Exception {
        for (String name : CASES) {
            var item = prepare(name);
            var decoded = new FinalSourceEncoding(mapper).decode(mapper.readTree(item.prompt()));
            assertThat(decoded.path("taskContext").get(0).path("mission").path("budget").asInt()).isEqualTo(10000);
            assertThat(decoded.path("taskContext").get(0).path("mission").path("objectives")).hasSize(2);
            assertThat(decoded.has("draftToReview")).isFalse();
            assertThat(item.prompt()).doesNotContain("operatorExpectedJudgment", "expectedOutcome");
            assertThat(item.input().eventCount()).isEqualTo(12);
            var facts = decoded.path(ReadableSourceFacts.FIELD);
            var terminal = facts.path("terminalSnapshots").get(0);
            var cart = mapper.createObjectNode();
            terminal.path("recordedCart").forEach(row -> cart.set(row.path("productId").asString(), row.path("quantity")));
            if (name.startsWith("corrected-selection")) {
                assertThat(cart.path("milk").asInt()).isEqualTo(2);
                assertThat(cart.path("banana").asInt()).isEqualTo(1);
                assertThat(cart.has("milk-small")).isFalse();
                assertThat(facts.path("eventsById").path("E6").path("quantityAfter").asInt()).isZero();
                assertThat(facts.path("eventsById").path("E7").path("recordedProductDetail").asString()).isEqualTo("900mL");
            } else if (name.startsWith("wrong-specification")) {
                assertThat(cart.path("milk-small").asInt()).isEqualTo(2);
                assertThat(cart.has("milk")).isFalse();
                assertThat(facts.path("eventsById").path("E5").path("recordedProductDetail").asString()).isEqualTo("200mL");
            } else {
                assertThat(cart.isEmpty()).isTrue();
                assertThat(terminal.path("eventCode").asString()).isEqualTo("SHOP.TIME_LIMIT_EXPIRED");
                var afterHelp = facts.path("recordedActionPresence").get(0).path("afterGeneralHelp").get(0).path("providedLaterEventCounts");
                assertThat(afterHelp.path("SHOP.ITEM_SEARCH_STARTED").asInt()).isEqualTo(2);
                assertThat(afterHelp.path("SHOP.SHELF_OPENED").asInt()).isZero();
                assertThat(afterHelp.path("SHOP.QUANTITY_CHANGED").asInt()).isZero();
            }
        }
    }

    @Test
    @EnabledIfEnvironmentVariable(named="AI_SYNTHETIC_ANALYSIS_SMOKE_LIVE", matches="true")
    void three_technical_cases_receive_current_real_qwen_review() throws Exception {
        var prepared = new ArrayList<Prepared>();
        for (String name : CASES) prepared.add(prepare(name));
        var key = Files.readString(Path.of(System.getProperty("user.home"), ".local/share/oneuldo/school-gateway-client.key")).strip();
        var properties = new OllamaProperties("http://127.0.0.1:18083", "qwen3.6:27b-q4_K_M", 18432,
                Duration.ofMinutes(10), Duration.ofSeconds(10), 8, "10m", key);
        var http = new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
        http.setReadTimeout(Duration.ofMinutes(10));
        var real = new RestOllamaChatClient(RestClient.builder().baseUrl(properties.baseUrl()).requestFactory(http).build(), properties);
        var results = new ArrayList<Boolean>();
        for (var item : prepared) results.add(run(item, real));
        var summary = mapper.createObjectNode().put("syntheticTechnicalFixtures", true).put("newGamePlays", 0)
                .put("profileUpdates", 0).put("questGenerations", 0).put("analysisVersion", AiBehaviorAnalysisPromptFactory.VERSION)
                .put("reviewVersion", AnalysisReviewPrompt.VERSION).put("planSourceReviewVersion", AnalysisPlanSemanticReview.VERSION)
                .put("scope", "independent final analysis review and plan source review; synthetic inputs; no gameplay or observation/draft generation")
                .put("caseCount", prepared.size())
                .put("allTaskJudgmentsMatched", results.stream().allMatch(Boolean::booleanValue));
        var cases = summary.putArray("cases");
        for (var item : prepared) cases.add(mapper.readTree(Files.readString(OUT.resolve(item.name()).resolve("result.json"))));
        save(OUT.resolve("live-summary.json"), summary);
        assertThat(results).allMatch(Boolean::booleanValue);
    }

    private Prepared prepare(String name) throws Exception {
        Path dir = OUT.resolve(name); Files.createDirectories(dir);
        Path inputFile = dir.resolve("input.json");
        if (!Files.exists(inputFile)) save(inputFile, fixture(name));
        var bytes = Files.readAllBytes(inputFile);
        var input = mapper.readValue(bytes, BehaviorAnalysisInputResponse.class);
        var refs = new AnalysisReferences(mapper, input);
        var finalSource = AnalysisSynthesisPrompt.build(mapper, new AiBehaviorAnalysisPromptFactory(mapper), input, List.of(), refs, false);
        var prompt = AnalysisReviewPrompt.build(mapper, finalSource, null, refs);
        budget.requireFits(AnalysisReviewPrompt.system(), prompt + "\n구조와 실제 사건 참조를 수정하세요. JSON 하나만 출력하세요.", 2400, 18000, "SMOKE_SOURCE_TOO_LARGE");
        var record = mapper.createObjectNode().put("case", name).put("syntheticTechnicalFixture", true)
                .put("newGamePlays", 0).put("credentialsReadByPreflight", false).put("inputSha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)))
                .put("eventCount", input.eventCount()).put("inputTokens", QwenTokenCounter.inputTokens(AnalysisReviewPrompt.system(), prompt))
                .put("expectedAnswerProvidedToModel", false).put("sourceSchemaVersion", input.schemaVersion());
        record.put("systemPrompt", AnalysisReviewPrompt.system()).put("inputPrompt", prompt);
        save(dir.resolve("preflight.json"), record);
        return new Prepared(name, input, refs, prompt);
    }

    private boolean run(Prepared item, RestOllamaChatClient real) throws Exception {
        Path target = OUT.resolve(item.name()).resolve("result.json");
        if (Files.exists(target)) throw new IllegalStateException("SMOKE_ACTUAL_CALL_MUST_NOT_BE_OVERWRITTEN");
        var report = mapper.createObjectNode().put("case", item.name()).put("syntheticTechnicalFixture", true)
                .put("newGamePlays", 0).put("status", "RUNNING").put("startedAt", Instant.now().toString());
        var responses = report.putArray("providerResponses");
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        var validator = new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        GroqChatClient recording = new GroqChatClient() {
            @Override public GroqChatResult complete(String s, String u) { return complete(s, u, 2400, .2); }
            @Override public GroqChatResult complete(String s, String u, int max, double temperature) {
                saveUnchecked(target, report);
                var response = real.complete(s, u, max, temperature);
                responses.addObject().put("systemPrompt", s).put("inputPrompt", u).put("outputMax", max)
                        .put("actualProviderCall", true).set("response", mapper.valueToTree(response));
                saveUnchecked(target, report); return response;
            }
        };
        var pipeline = new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(mapper), validator, recording, mapper,
                64, budget, new AnalysisCallPacer()).withQualityReview(true).withPlanSemanticReview(true);
        Function<String, AiBehaviorAnalysis> parse = raw -> validator.validate(
                item.refs().read(AnalysisReviewPrompt.reviewedCurrentAnalysis(mapper, raw, item.refs())), item.input());
        long start = System.nanoTime(); boolean matched = false;
        try {
            System.out.println("SYNTHETIC_ANALYSIS_START " + item.name());
            AiBehaviorAnalysis analysis = ReflectionTestUtils.invokeMethod(pipeline, "call", AnalysisReviewPrompt.system(),
                    item.prompt(), 2400, 18000, audit, parse, false, 3);
            report.put("status", "READY").set("analysis", mapper.valueToTree(analysis));
            // Operator contract check is performed only after the real model returns.
            String expected = item.name().startsWith("corrected-selection") ? "SUCCESS" : "FAILURE";
            matched = analysis.sessionAssessments().size()==1 && analysis.sessionAssessments().getFirst().judgment().equals(expected);
            report.put("operatorExpectedJudgment", expected).put("operatorTaskJudgmentMatched", matched);
            System.out.println("SYNTHETIC_ANALYSIS_DONE " + item.name() + " " + analysis.sessionAssessments().getFirst().judgment() + " match=" + matched);
        } catch (RuntimeException error) {
            report.put("status", "FAILED").put("error", error.getMessage()==null?error.getClass().getSimpleName():error.getMessage());
        } finally {
            report.put("wallSeconds", (System.nanoTime()-start)/1e9).put("completedAt", Instant.now().toString());
            report.set("attempts", mapper.valueToTree(audit)); save(target, report);
        }
        return matched;
    }

    ObjectNode fixture(String name) {
        var root = new MovementProjectionTest().fixture();
        root.put("schemaVersion", "analysis-smoke-synthetic-v1");
        ((ObjectNode)root.path("input")).put("schemaVersion", "analysis-smoke-synthetic-v1");
        var events = (ArrayNode)root.path("input").path("sessions").get(0).path("events");
        boolean timeout = name.startsWith("help-movement"), corrected = name.startsWith("corrected-selection");
        var mission = mapper.createObjectNode().put("id", "synthetic-shopping-smoke").put("budget", 10000).put("timeLimitSeconds", 300);
        var goals = mission.putArray("objectives");
        goals.addObject().put("productId", "milk").put("quantity", 2).put("name", "흰 우유 900mL").putArray("acceptedProductIds").add("milk");
        goals.addObject().put("productId", "banana").put("quantity", 1).put("name", "바나나 1송이").putArray("acceptedProductIds").add("banana");
        mission.putArray("briefing").add("흰 우유 900mL 2개와 바나나 1송이를 구매합니다.");
        var cart = mapper.createObjectNode();
        List<String> codes = timeout ? List.of("SHOP.SESSION_STARTED", "SHOP.TIME_LIMIT_STARTED", "SHOP.GENERAL_HELP_OPENED", "SHOP.ITEM_SEARCH_STARTED",
                "SHOP.SHELF_PROXIMITY_ENTERED", "SHOP.MOVEMENT_SAMPLED", "SHOP.MOVEMENT_STOPPED", "SHOP.ITEM_SEARCH_STARTED", "SHOP.MOVEMENT_SAMPLED",
                "SHOP.APP_BACKGROUNDED", "SHOP.TIME_LIMIT_EXPIRED", "SHOP.SESSION_ENDED")
                : List.of("SHOP.SESSION_STARTED", "SHOP.TIME_LIMIT_STARTED", "SHOP.GENERAL_HELP_OPENED", "SHOP.SHELF_OPENED", "SHOP.QUANTITY_CHANGED",
                corrected?"SHOP.QUANTITY_CHANGED":"SHOP.CART_OPENED", corrected?"SHOP.QUANTITY_CHANGED":"SHOP.SHELF_CLOSED",
                "SHOP.SHELF_OPENED", "SHOP.QUANTITY_CHANGED", "SHOP.CART_OPENED", "SHOP.CHECKOUT_SUBMITTED", "SHOP.SESSION_ENDED");
        Instant start = Instant.parse("2026-10-11T00:00:00Z");
        root.put("generatedAt", start.plusMillis(302000).toString());
        ((ObjectNode)root.path("input")).put("generatedAt", start.plusMillis(302000).toString());
        for (int i=0;i<12;i++) {
            var e=(ObjectNode)events.get(i); long ms=timeout && i>=10 ? 301000 : i*1000L;
            e.put("elapsedFromSessionStartMs", ms).put("occurredAt", start.plusMillis(ms).toString()).put("receivedAt", start.plusMillis(ms+100).toString());
            ((ObjectNode)e.path("action")).put("eventCode", codes.get(i));
            var p=(ObjectNode)e.path("payload"); p.removeAll(); p.put("type", "SHOPPING").put("budgetAmount", 10000);
            var c=p.putObject("marketContent");
            if(i==0) {
                var scene = c.putObject("sceneSnapshot"); scene.set("mission", mission.deepCopy());
                if (name.contains("recorded-door")) scene.putObject("startingConditions").putObject("geometry").putArray("stationDetails")
                        .addObject().put("id", "common-door").put("kind", "common-door");
            }
            if(!timeout && i==4) change(p,c,cart,"milk-small",0,2);
            if(corrected && i==5) change(p,c,cart,"milk-small",2,0);
            if(corrected && i==6) change(p,c,cart,"milk",0,2);
            if(!timeout && i==8) change(p,c,cart,"banana",0,1);
            if(codes.get(i).equals("SHOP.SHELF_OPENED"))p.put("stationId", i<7?"fresh":"produce");
            if(timeout && i==4)p.put("stationId", "common-door").put("isTargetZone", false);
            if(codes.get(i).contains("MOVEMENT") || codes.get(i).equals("SHOP.ITEM_SEARCH_STARTED"))p.put("x", i*10).put("y",20).put("blocked",false).put("controlMode","touch");
            if(i>=9 || i==0 || codes.get(i).equals("SHOP.QUANTITY_CHANGED"))c.set("cart",cart.deepCopy());
            if(i>=9)p.put("cartTotalAmount",timeout?0:(corrected?8000:5600)).put("cartItemCount",timeout?0:3);
            if(i==1 || i>=9) p.putObject("timing").put("timeLimitSeconds",300).put("elapsedMs",i==1?0:ms-1000)
                    .put("remainingMs",timeout && i>=10?0:300000-(ms-1000)).put("expired",timeout && i>=10)
                    .put("clockBasis","WALL_CLOCK").put("startedAt",start.plusMillis(1000).toString());
            if(i==11)e.putObject("sessionEnd").put("reason",timeout?"TIME_LIMIT_EXPIRED":name.endsWith("flow")?"FLOW_FINISHED":name.endsWith("exit")?"EXIT_AFTER_SUBMISSION":"COMPLETED");
        }
        return root;
    }

    private void change(ObjectNode p, ObjectNode content, ObjectNode cart, String sku, int before, int after) {
        p.put("itemId",sku).put("quantityBefore",before).put("quantityAfter",after);
        p.put("priceAmount", sku.equals("banana")?3600:sku.equals("milk-small")?1000:2200);
        if(after==0)cart.remove(sku);else cart.put(sku,after);
        content.putObject("item").put("id",sku).put("name",sku.equals("banana")?"바나나":"흰 우유")
                .put("detail",sku.equals("banana")?"1송이":sku.equals("milk-small")?"200mL":"900mL").put("salesUnit",sku.equals("banana")?"송이":"개");
    }
    private void save(Path path, ObjectNode data) throws Exception { Files.writeString(path, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(data)+"\n"); }
    private void saveUnchecked(Path path, ObjectNode data) { try { save(path,data); } catch(Exception e) { throw new IllegalStateException("SMOKE_RECORD_SAVE_FAILED",e); } }
}
