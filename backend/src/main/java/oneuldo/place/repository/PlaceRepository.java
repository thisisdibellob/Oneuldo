package oneuldo.place.repository;

import java.util.Optional;
import java.util.UUID;
import oneuldo.place.domain.Place;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlaceRepository extends JpaRepository<Place, UUID> {
    Optional<Place> findByIdAndActiveTrue(UUID id);
}
