package oneuldo.member.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import oneuldo.member.dto.MemberResponse;
import oneuldo.member.dto.MemberSignUpRequest;
import oneuldo.member.dto.MemberUpdateRequest;
import oneuldo.member.service.MemberService;
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

    @GetMapping("/{id}")
    public MemberResponse findMember(@PathVariable UUID id) {
        return memberService.findMember(id);
    }

    @PatchMapping("/{id}")
    public MemberResponse modifyMember(@PathVariable UUID id,
                                       @Valid @RequestBody MemberUpdateRequest request) {
        return memberService.modifyMember(id, request);
    }

    @DeleteMapping("/{id}")
    public void deleteMember(@PathVariable UUID id) {
        memberService.deleteMember(id);
    }




}
