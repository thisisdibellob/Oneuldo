package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;

/** Request-local projection. Exact segment membership is rebuilt from the immutable snapshot. */
public final class MovementProjection {
    public static final String VERSION="movement-projection-v1";
    public record Segment(UUID segmentId, UUID sessionId, List<UUID> sourceEventIds,
            List<UUID> retainedEventIds, double observedDistance, double maxTimedPositionError) {}
    private final BehaviorAnalysisInputResponse source;
    private final List<Segment> segments=new ArrayList<>();
    private final Set<UUID> retained=new LinkedHashSet<>();
    public MovementProjection(ObjectMapper mapper,BehaviorAnalysisInputResponse source,double tolerance) {
        this.source=source;
        for(var session:source.input().sessions()) {
            List<BehaviorAnalysisInput.EventTimeline> run=new ArrayList<>();
            JsonNode previous=null;
            for(var event:session.events()) {
                JsonNode node=mapper.valueToTree(event), payload=node.path("payload");
                boolean eligible=tolerance>0 && event.action()!=null && "SHOP.MOVEMENT_SAMPLED".equals(event.action().eventCode())
                        && payload.path("x").isNumber() && payload.path("y").isNumber()
                        && payload.path("blocked").isBoolean() && !payload.path("blocked").asBoolean()
                        && payload.path("controlMode").isString()
                        && payload.path("marketContent").path("sceneRef").isString()
                        && event.support()==null && event.safety()==null && event.validity()==null
                        && event.error()==null && event.taskResult()==null && event.sessionEnd()==null && event.userExperience()==null
                        && event.action().firstAction()==null && event.action().startLatencyMs()==null;
                // Only collector-versioned, unambiguous world coordinates may be approximated.
                eligible &= payload.path("marketContent").path("movementContext").path("coordinateSpace").asString().equals("market-world");
                eligible &= !nearStation(payload,tolerance);
                if(!run.isEmpty() && (!eligible || event.sequence()!=run.getLast().sequence()+1
                        || event.elapsedFromSessionStartMs()<=run.getLast().elapsedFromSessionStartMs()
                        || event.elapsedFromSessionStartMs()-run.getLast().elapsedFromSessionStartMs()>1000
                        || !sameContext(previous,node))) {
                    flush(mapper,session.sessionId(),run,tolerance);run.clear();
                }
                if(eligible) run.add(event);else retained.add(event.behaviorLogId());
                previous=node;
            }
            flush(mapper,session.sessionId(),run,tolerance);
        }
    }
    private boolean nearStation(JsonNode payload,double tolerance) {
        var context=payload.path("marketContent").path("movementContext");
        if(!context.path("interactionRadius").isNumber() || !context.path("stations").isObject()) return true;
        double radius=context.path("interactionRadius").asDouble();
        if(!Double.isFinite(radius)||radius<=0) return true;
        for(var station:context.path("stations")) {
            if(!station.path("x").isNumber()||!station.path("y").isNumber()) return true;
            if(Math.hypot(payload.path("x").asDouble()-station.path("x").asDouble(),payload.path("y").asDouble()-station.path("y").asDouble())<=radius+tolerance) return true;
        }
        return false;
    }
    private boolean sameContext(JsonNode a,JsonNode b) {
        for(String key:List.of("task","accessibility","simulation","offlineQueued","devicePerformanceClass","eventSchemaVersion","appVersion","contentVersion")) if(!a.path(key).equals(b.path(key))) return false;
        var pa=((tools.jackson.databind.node.ObjectNode)a.path("payload")).deepCopy();
        var pb=((tools.jackson.databind.node.ObjectNode)b.path("payload")).deepCopy();
        pa.remove(List.of("x","y"));pb.remove(List.of("x","y"));
        if(!pa.equals(pb)) return false;
        return a.path("payload").path("controlMode").equals(b.path("payload").path("controlMode"))
                && a.path("payload").path("marketContent").equals(b.path("payload").path("marketContent"));
    }
    private void flush(ObjectMapper mapper,UUID session,List<BehaviorAnalysisInput.EventTimeline> run,double tolerance) {
        if(run.isEmpty()) return;
        var points=run.stream().map(e -> {var p=mapper.valueToTree(e.payload());return new MovementPathCompressor.Point(
                e.elapsedFromSessionStartMs(),p.path("x").asDouble(),p.path("y").asDouble());}).toList();
        var result=new MovementPathCompressor().compress(points,tolerance);
        // A shortcut must not create a new station-zone crossing between retained points.
        var context=mapper.valueToTree(run.getFirst().payload()).path("marketContent").path("movementContext");
        boolean crossing=false;
        for(int k=1;k<result.retained().size();k++) {
            int a=result.retained().get(k-1),b=result.retained().get(k);
            if(b==a+1) continue;
            var p=points.get(a);var q=points.get(b);double dx=q.x()-p.x(),dy=q.y()-p.y(),length=dx*dx+dy*dy;
            for(var station:context.path("stations")) {
                double x=station.path("x").asDouble(),y=station.path("y").asDouble();
                double u=length==0?0:Math.max(0,Math.min(1,((x-p.x())*dx+(y-p.y())*dy)/length));
                crossing |= Math.hypot(x-p.x()-u*dx,y-p.y()-u*dy)<=context.path("interactionRadius").asDouble()+tolerance;
            }
        }
        if(crossing) {run.forEach(e->retained.add(e.behaviorLogId()));return;}
        List<UUID> ids=result.retained().stream().map(i->run.get(i).behaviorLogId()).toList();retained.addAll(ids);
        if(ids.size()<run.size()) segments.add(new Segment(run.getFirst().behaviorLogId(),session,
                run.stream().map(BehaviorAnalysisInput.EventTimeline::behaviorLogId).toList(),ids,result.observedDistance(),result.maxTimedError()));
    }
    public List<Segment> segments() {return List.copyOf(segments);}
    public BehaviorAnalysisInputResponse visible() {return select(source,retained);}
    public BehaviorAnalysisInputResponse expand(List<UUID> requested) {
        Set<UUID> ids=new LinkedHashSet<>(retained);
        if(requested.size()>8 || new HashSet<>(requested).size()!=requested.size()) throw new IllegalArgumentException("INVALID_MOVEMENT_REQUEST");
        for(UUID id:requested) {
            var segment=segments.stream().filter(s->s.segmentId.equals(id)).findFirst()
                    .orElseThrow(()->new IllegalArgumentException("UNKNOWN_MOVEMENT_SEGMENT"));
            ids.addAll(segment.sourceEventIds);
        }
        return select(source,ids);
    }
    public static BehaviorAnalysisInputResponse select(BehaviorAnalysisInputResponse source,Set<UUID> ids) {
        var sessions=source.input().sessions().stream().map(s->new BehaviorAnalysisInput.SessionTimeline(s.sessionId(),s.startedAt(),s.endedAt(),s.integrity(),
                s.events().stream().filter(e->ids.contains(e.behaviorLogId())).toList())).filter(s->!s.events().isEmpty()).toList();
        int count=sessions.stream().mapToInt(s->s.events().size()).sum();var old=source.input();
        var data=new BehaviorAnalysisInput(old.schemaVersion(),old.datasetId(),old.generatedAt(),old.analysisWindow(),old.anonymousSubjectId(),sessions.size(),count,sessions);
        return new BehaviorAnalysisInputResponse(source.id(),source.schemaVersion(),source.generatedAt(),sessions.size(),count,data);
    }
}
