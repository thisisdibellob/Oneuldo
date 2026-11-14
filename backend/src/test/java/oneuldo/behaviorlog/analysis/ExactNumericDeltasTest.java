package oneuldo.behaviorlog.analysis;

import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.service.*;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class ExactNumericDeltasTest {
    final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
    @Test void decimalCoordinatesRoundTripWithoutBinaryFloatingPointDriftOrMissingSamples(){
        var source=m.createObjectNode();var a=source.putArray("coordinates");
        for(int i=0;i<200;i++)a.add(m.readTree(new java.math.BigDecimal("430.3999999999999").add(new java.math.BigDecimal("0.25").multiply(java.math.BigDecimal.valueOf(i))).toPlainString()));
        var wire=new ExactNumericDeltas(m).encode(source);
        assertThat(wire.has(ExactNumericDeltas.FIELD)).isTrue();
        assertThat(ExactNumericDeltas.decode(m,wire).toString()).isEqualTo(source.toString());
        assertThat(QwenTokenCounter.count(wire.toString())).isLessThan(QwenTokenCounter.count(source.toString()));
    }
    @Test void integerTimeDeltasPreserveEveryOriginalTimestamp(){
        var source=m.createObjectNode();var a=source.putArray("timeMs");for(int i=0;i<200;i++)a.add(123456789L+i*1000);
        var wire=new ExactNumericDeltas(m).encode(source);assertThat(wire.has(ExactNumericDeltas.FIELD)).isTrue();
        assertThat(ExactNumericDeltas.decode(m,wire).toString()).isEqualTo(source.toString());
    }
    @Test void mixedScaleShortQuantitiesAndNegativeZeroStayLiteral(){
        var source=(tools.jackson.databind.node.ObjectNode)m.readTree("{\"quantity\":[0,1,2],\"mixed\":[1,1.0,1.00],\"negativeZero\":-0.0}");
        assertThat(new ExactNumericDeltas(m).encode(source)).isEqualTo(source);
    }
    @Test void reservedObjectsAreEscapedAndMalformedEncodingIsRejected(){
        var source=(tools.jackson.databind.node.ObjectNode)m.readTree("{\"$nd\":[1,2],\"nested\":{\"$ndl\":null}}");
        var wire=new ExactNumericDeltas(m).encode(source);assertThat(ExactNumericDeltas.decode(m,wire)).isEqualTo(source);
        var malformed=m.createObjectNode().put(ExactNumericDeltas.FIELD,ExactNumericDeltas.RULE);malformed.putArray("$nd").add(-1).add("1").addArray();
        assertThatThrownBy(()->ExactNumericDeltas.decode(m,malformed)).isInstanceOf(IllegalArgumentException.class);
    }
}
