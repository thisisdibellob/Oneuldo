package oneuldo.global.entity;

import java.time.Instant;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;

//다른 entity가 이 클래스를 상속하면 아래 필드를 물려받음
@MappedSuperclass

//Entity가 생성되거나 수정될 때 자동으로 시간을 기록하도록 설정
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseTimeEntity {

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false) // DB 컬럼 이름 지정, null 허용 안함, 수정 불가
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false) // DB 컬럼 이름 지정, null 허용 안함
    private Instant updatedAt;

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}