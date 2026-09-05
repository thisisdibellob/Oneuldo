package oneuldo.behaviorlog.analysis.domain;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.*;
import oneuldo.ai.client.GroqChatClient.GroqChatResult;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity @Table(name="ai_analysis_checkpoints") @Getter
@NoArgsConstructor(access=AccessLevel.PROTECTED)
public class AiAnalysisCheckpoint {
    @Id @Column(length=64) private String id;
    @Column(nullable=false) private UUID memberId;
    @Column(nullable=false) private UUID datasetId;
    @Column(nullable=false,columnDefinition="text") private String systemPrompt;
    @Column(nullable=false,columnDefinition="text") private String inputPrompt;
    @Column(nullable=false) private int outputMax;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb") private GroqChatResult response;
    @Column(nullable=false) private Instant createdAt;
    public AiAnalysisCheckpoint(String id,UUID member,UUID dataset,String system,String prompt,int output,GroqChatResult response) {
        this.id=id;memberId=member;datasetId=dataset;systemPrompt=system;inputPrompt=prompt;outputMax=output;this.response=response;createdAt=Instant.now();
    }
}
