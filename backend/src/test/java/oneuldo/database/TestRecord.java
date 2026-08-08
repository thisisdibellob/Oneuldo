package oneuldo.database;

import oneuldo.global.entity.BaseTimeEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity //DB 테이블과 연결
@Table(name = "test_record") //DB 테이블 이름 지정
public class TestRecord extends BaseTimeEntity { //BaseTimeEntity 상속
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY) //기본키 자동 생성
    private Long id; //기본키 지정

    private String name;

    protected TestRecord() { //JPA가 DB 데이터를 JAVA 객체로 만들 때 필요
    }

    public TestRecord(String name) {
        this.name = name;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }
}
