plugins {
    java
    id("org.springframework.boot") version "4.1.0"
    id("io.spring.dependency-management") version "1.1.7"
}
group = "oneuldo"
version = "1.0.0"
java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }
repositories { mavenCentral() }
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("ai.djl.huggingface:tokenizers:0.36.0")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
// Share the verified tokenizer, without including the application or its DB dependencies.
sourceSets.main {
    java.srcDir("../backend/src/main/java")
    java.include("oneuldo/gateway/**", "oneuldo/behaviorlog/analysis/service/QwenTokenCounter.java", "oneuldo/ai/client/ObservationOutputSchema.java")
}
tasks.processResources {
    from("../backend/src/main/resources/ai/tokenizers") { into("ai/tokenizers") }
}
tasks.test { useJUnitPlatform() }
tasks.bootJar { archiveFileName.set("oneuldo-ai-gateway.jar") }
