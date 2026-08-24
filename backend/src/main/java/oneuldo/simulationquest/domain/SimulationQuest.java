package oneuldo.simulationquest.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import oneuldo.global.entity.BaseTimeEntity;
import oneuldo.place.domain.Place;
import oneuldo.quest.domain.Quest;
import oneuldo.simulationquest.domain.dialogue.Dialogue;
import oneuldo.simulationquest.dto.payload.SimulationPayload;
import oneuldo.simulationquest.dto.payload.SimulationType;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "simulation_quests")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SimulationQuest extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quest_id", nullable = false)
    private Quest quest;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "place_id", nullable = false)
    private Place place;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(nullable = false, length = 1000)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "simulation_type", nullable = false, length = 30)
    private SimulationType type;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private SimulationPayload payload;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<Dialogue> dialogues;

    @Column(nullable = false)
    private boolean active;

    public SimulationQuest(
            Quest quest,
            Place place,
            String title,
            String description,
            SimulationPayload payload,
            List<Dialogue> dialogues,
            boolean active
    ) {
        this.quest = Objects.requireNonNull(quest);
        this.place = Objects.requireNonNull(place);
        this.title = Objects.requireNonNull(title);
        this.description = Objects.requireNonNull(description);
        this.payload = Objects.requireNonNull(payload);
        this.type = payload.type();
        this.dialogues = List.copyOf(dialogues);
        this.active = active;
    }
}
