package oneuldo.behaviorlog.analysis;

import java.util.*;
import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.service.MovementPathCompressor;
import oneuldo.behaviorlog.analysis.service.MovementPathCompressor.Point;
import static org.assertj.core.api.Assertions.*;

class MovementPathCompressorTest {
    final MovementPathCompressor codec=new MovementPathCompressor();
    @Test void zero_preserves_every_time_and_coordinate() {
        var points=List.of(new Point(0,0,0),new Point(10,0,0),new Point(20,1,0));
        assertThat(codec.compress(points,0).retained()).containsExactly(0,1,2);
    }
    @Test void straight_constant_speed_can_be_reconstructed_at_every_original_time() {
        var points=new ArrayList<Point>();for(int i=0;i<100;i++) points.add(new Point(i*100,i,0));
        var result=codec.compress(points,0.01);
        assertThat(result.retained()).containsExactly(0,99);
        assertThat(result.observedDistance()).isEqualTo(99);
        assertThat(result.maxTimedError()).isLessThan(1e-10);
    }
    @Test void stops_and_small_reversals_are_preserved_even_inside_tolerance() {
        var points=List.of(new Point(0,0,0),new Point(100,1,0),new Point(200,1,0),new Point(300,0.9,0),new Point(400,1.1,0));
        assertThat(codec.compress(points,10).retained()).containsExactly(0,1,2,3,4);
    }
    @Test void straight_path_speed_changes_are_not_hidden_by_geometry() {
        var points=List.of(new Point(0,0,0),new Point(100,1,0),new Point(200,20,0));
        assertThat(codec.compress(points,0.5).retained()).containsExactly(0,1,2);
        assertThatThrownBy(()->codec.validate(points,List.of(0,2),0.5)).hasMessage("MOVEMENT_TIME_ERROR_EXCEEDED");
    }
    @Test void random_paths_satisfy_time_aligned_error_bound() {
        var rng=new Random(20260907);var points=new ArrayList<Point>();double x=0,y=0;
        for(int i=0;i<500;i++) {x+=rng.nextDouble()*4-2;y+=rng.nextDouble()*4-2;points.add(new Point(i*125,x,y));}
        var result=codec.compress(points,0.2);
        assertThat(codec.validate(points,result.retained(),0.2)).isLessThanOrEqualTo(0.2);
    }
    @Test void invalid_time_keeps_all_points_and_invalid_tolerance_is_rejected() {
        assertThat(codec.compress(List.of(new Point(0,0,0),new Point(0,1,1),new Point(2,2,2)),1).retained()).containsExactly(0,1,2);
        assertThatThrownBy(()->codec.compress(List.of(),Double.NaN)).hasMessage("INVALID_MOVEMENT_TOLERANCE");
    }
}
