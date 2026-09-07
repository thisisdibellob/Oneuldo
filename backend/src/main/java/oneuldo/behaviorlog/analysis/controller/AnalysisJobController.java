package oneuldo.behaviorlog.analysis.controller;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.behaviorlog.analysis.service.AnalysisJobService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/analysis-jobs") @RequiredArgsConstructor
public class AnalysisJobController {
    private final AnalysisJobService jobs;
    @PostMapping("/sessions/{session}") public ResponseEntity<AnalysisJobService.Job> start(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID session) {
        return ResponseEntity.accepted().body(jobs.enqueue(UUID.fromString(jwt.getSubject()),session));
    }
    @PostMapping("/latest") public ResponseEntity<AnalysisJobService.Job> latest(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.accepted().body(jobs.enqueueLatest(UUID.fromString(jwt.getSubject())));
    }
    @GetMapping("/current") public ResponseEntity<AnalysisJobService.Job> current(@AuthenticationPrincipal Jwt jwt) {
        var job=jobs.current(UUID.fromString(jwt.getSubject()));return job==null?ResponseEntity.noContent().build():ResponseEntity.ok(job);
    }
    @GetMapping("/{id}") public AnalysisJobService.Job find(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        return jobs.find(UUID.fromString(jwt.getSubject()),id);
    }
}
