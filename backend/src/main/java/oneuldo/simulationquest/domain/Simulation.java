package oneuldo.simulationquest.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import oneuldo.global.entity.BaseTimeEntity;

@Entity
@Table(name = "simulations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Simulation extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "quest_id", nullable = false)
    private UUID questId;

    @Column(name = "place_id", nullable = false)
    private UUID placeId;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(nullable = false, length = 1000)
    private String description;

    @Column(nullable = false)
    private boolean active;

    public Simulation(
            UUID questId,
            UUID placeId,
            String title,
            String description,
            boolean active
    ) {
        this.questId = questId;
        this.placeId = placeId;
        this.title = title;
        this.description = description;
        this.active = active;
    }
}
