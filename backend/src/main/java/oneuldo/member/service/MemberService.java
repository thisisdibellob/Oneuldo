package oneuldo.member.service;


import lombok.RequiredArgsConstructor;
import oneuldo.auth.service.RefreshTokenService;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;
import oneuldo.member.dto.MemberResponse;
import oneuldo.member.dto.MemberSignUpRequest;
import oneuldo.member.dto.MemberUpdateRequest;
import oneuldo.global.exception.DuplicateMemberException;
import oneuldo.global.exception.MemberNotFoundException;
import oneuldo.member.repository.MemberRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MemberService {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokenService;

    @Transactional
    public MemberResponse register(MemberSignUpRequest request) {

        // 비밀번호 확인
        if (!Objects.equals(
                request.password(),
                request.passwordConfirm()
        )) {
            throw new IllegalArgumentException("비밀번호가 일치하지 않습니다.");
        }

        // 이메일 확인
        String email = request.email()
                .trim()
                .toLowerCase(Locale.ROOT);

        if (memberRepository.existsByEmail(email)) {
            throw new DuplicateMemberException("이미 사용 중인 이메일입니다.");
        }

        // 아이디 확인
        String loginId = request.loginId()
                .trim()
                .toLowerCase(Locale.ROOT);

        if (memberRepository.existsByLoginId(loginId)) {
            throw new DuplicateMemberException(
                    "이미 사용 중인 아이디입니다."
            );
        }

        // 비밀번호 암호화
        String encodedPassword = passwordEncoder.encode(request.password());

        // 새 Member 객체 생성
        Member newMember = new Member(
                loginId,
                encodedPassword,
                request.name(),
                email,
                MemberRole.PARENT,
                request.birthDate()
        );

        // DB에 저장
        Member savedMember = memberRepository.save(newMember);

        // MemberResponse 생성 후 반환
        return MemberResponse.from(savedMember);
    }

    @Transactional(readOnly = true)
    public MemberResponse findMember(UUID id) {

        Member findMember = memberRepository.findById(id)
                .orElseThrow(MemberNotFoundException::new);

        return MemberResponse.from(findMember);
    }

    @Transactional
    public MemberResponse modifyMember(UUID id, MemberUpdateRequest request) {
        Member member = memberRepository.findById(id)
                .orElseThrow(MemberNotFoundException::new);

        member.updateProfile(
                request.name(),
                request.birthDate()
        );

        // save 할 필요가 없음. @Transactional 안이면 JPA가 감지해서 알아서 저장해줌

        return MemberResponse.from(member);
    }

    @Transactional
    public void deleteMember(UUID id) {
        Member member = memberRepository.findById(id)
                .orElseThrow(MemberNotFoundException::new);

        memberRepository.delete(member);
        refreshTokenService.delete(id);
    }


}
