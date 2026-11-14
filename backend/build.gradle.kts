plugins {
	java
	id("org.springframework.boot") version "4.1.0"
	id("io.spring.dependency-management") version "1.1.7"
}

group = "oneuldo"
version = "0.0.1-SNAPSHOT"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(25)
	}
}

repositories {
	mavenCentral()
}

dependencies {
	implementation("ai.djl.huggingface:tokenizers:0.36.0")
	implementation("org.springframework.boot:spring-boot-starter-webmvc")
	compileOnly("org.projectlombok:lombok")
	runtimeOnly("org.postgresql:postgresql")
	annotationProcessor("org.projectlombok:lombok")
	testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
	testCompileOnly("org.projectlombok:lombok")
	testRuntimeOnly("com.h2database:h2")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
	testAnnotationProcessor("org.projectlombok:lombok")
	implementation("org.springframework.boot:spring-boot-starter-data-jpa")
	implementation("org.springframework.boot:spring-boot-starter-validation")
	implementation("org.springframework.security:spring-security-crypto")
	implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")
	implementation("org.springframework.boot:spring-boot-starter-flyway")
	implementation("org.flywaydb:flyway-database-postgresql")
}

tasks.withType<Test> {
	// Recorded full-source regression fixtures require more than the 512MiB default.
	maxHeapSize = "2g"
	useJUnitPlatform()
}

// 프론트와 서버가 같은 콘텐츠 원본을 읽는다. 실행 파일에도 포함한다.
tasks.processResources {
	from(rootProject.projectDir.resolve("../shared/evidence")) {
		into("evidence")
		include("*.json")
	}
	from(rootProject.projectDir.resolve("../shared/market")) {
		into("market")
		include("*.json")
	}
}
