package oneuldo.behaviorlog.normalization;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.UUID;
import oneuldo.auth.token.JwtTokenProvider;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;
import oneuldo.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class BehaviorNormalizationAdminControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtTokenProvider tokenProvider;
    @Autowired private MemberRepository memberRepository;

    @Test
    void 정규화_운영_현황은_ADMIN만_조회할_수_있다() throws Exception {
        Member admin = saveMember(MemberRole.ADMIN);
        Member child = saveMember(MemberRole.CHILD);

        mockMvc.perform(get("/api/admin/behavior-normalization/summary")
                        .header("Authorization", "Bearer " + tokenProvider.createAccessToken(child)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/admin/behavior-normalization/summary")
                        .header("Authorization", "Bearer " + tokenProvider.createAccessToken(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rawLogCount").isNumber())
                .andExpect(jsonPath("$.deadLetterCount").isNumber());
    }

    private Member saveMember(MemberRole role) {
        String suffix = UUID.randomUUID().toString();
        return memberRepository.save(new Member(
                "normalization-admin-" + suffix,
                "encoded-password",
                "정규화 운영자",
                suffix + "@example.com",
                role,
                LocalDate.of(2000, 1, 1)
        ));
    }
}
