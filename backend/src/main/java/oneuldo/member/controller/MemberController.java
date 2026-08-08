package oneuldo.member.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import oneuldo.member.dto.MemberResponse;
import oneuldo.member.dto.MemberSignUpRequest;
import oneuldo.member.dto.MemberUpdateRequest;
import oneuldo.member.service.MemberService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/members")
@RequiredArgsConstructor
public class MemberController {

    private final MemberService memberService;

    @PostMapping
    public MemberResponse register(@Valid @RequestBody MemberSignUpRequest request) {
        return memberService.register(request);
    }

    @GetMapping("/me")
    public MemberResponse findMe(@AuthenticationPrincipal Jwt jwt) {
        return memberService.findMember(getMemberId(jwt));
    }

    @PatchMapping("/me")
    public MemberResponse modifyMe(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody MemberUpdateRequest request
    ) {
        return memberService.modifyMember(getMemberId(jwt), request);
    }

    @DeleteMapping("/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMe(@AuthenticationPrincipal Jwt jwt) {
        memberService.deleteMember(getMemberId(jwt));
    }

    private UUID getMemberId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }




}
