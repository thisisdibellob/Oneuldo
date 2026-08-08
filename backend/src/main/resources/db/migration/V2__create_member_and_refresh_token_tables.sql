-- 회원 정보를 저장하는 테이블
CREATE TABLE member
(
    -- 회원의 고유 식별자
    id UUID PRIMARY KEY,

    -- 로그인에 사용하는 아이디
    login_id VARCHAR(255) NOT NULL UNIQUE,

    -- 암호화된 비밀번호를 저장
    password VARCHAR(255) NOT NULL,

    -- 회원 이름
    name VARCHAR(255) NOT NULL,

    -- 로그인에 사용하는 이메일
    email VARCHAR(255) NOT NULL UNIQUE,

    -- 회원 역할
    -- PARENT, CHILD, ADMIN 중 하나를 저장
    role VARCHAR(255) NOT NULL,

    -- 회원의 생년월일
    birth_date DATE NOT NULL,

    -- 회원 데이터가 처음 생성된 시각
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    -- 회원 데이터가 마지막으로 수정된 시각
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL
);

-- 로그인 상태 유지에 사용하는 Refresh Token 테이블
CREATE TABLE refresh_token
(
    -- 회원 ID를 기본 키로 사용
    -- 회원 한 명당 Refresh Token 하나만 저장
    member_id UUID PRIMARY KEY,

    -- Refresh Token 원문이 아닌 SHA-256 해시를 저장
    token_hash VARCHAR(64) NOT NULL,

    -- Refresh Token의 만료 시각
    expires_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    -- Refresh Token이 어떤 회원의 것인지 연결
    CONSTRAINT fk_refresh_token_member
        FOREIGN KEY (member_id)
        REFERENCES member (id)
        ON DELETE CASCADE
);