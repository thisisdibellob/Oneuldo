package oneuldo.global.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    // JWT 인증이 필요한 API 검증 로직
    // 나중에 추가해야됨
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http)
            throws Exception {

        return http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .authorizeHttpRequests(auth -> auth
                        // 정규화 운영 API는 Controller에서 JWT role=ADMIN을 추가 검증한다.
                        .requestMatchers("/api/admin/behavior-normalization/**").authenticated()
                        // 행동 로그는 JWT 사용자에게만 귀속하여 저장한다.
                        .requestMatchers("/api/behavior-logs/**").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/market-personalization/**").authenticated()
                        // 수행 기록은 로그인한 사용자만 접근한다.
                        .requestMatchers("/api/quest/sessions/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/quest/*/sessions").authenticated()
                        // 개인화된 퀘스트 순서는 로그인한 사용자에게만 제공한다.
                        .requestMatchers(HttpMethod.GET, "/api/quest/recommended").authenticated()
                        // 외부 AI 무료 한도를 보호하기 위해 로그인 사용자만 생성할 수 있다.
                        .requestMatchers(HttpMethod.POST, "/api/ai/**").authenticated()
                        // 퀘스트 정의 데이터는 로그인 전에도 조회할 수 있다.
                        .requestMatchers(HttpMethod.GET, "/api/quest/**").permitAll()
                        .requestMatchers("/api/auth/**").permitAll()
                        // 새 사용자는 JWT가 없으므로 회원가입 요청만 공개한다.
                        .requestMatchers(HttpMethod.POST, "/api/members").permitAll()
                        .anyRequest().authenticated()
                )
                .oauth2ResourceServer(oauth -> oauth.jwt(Customizer.withDefaults()))
                .build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(List.of(
                "http://localhost:*",
                "http://127.0.0.1:*"
        ));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
