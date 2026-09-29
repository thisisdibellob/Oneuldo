# 85개 사례의 운영 형식 연결 상태

원본 학습 60개·평가 25개를 유지했다. 미리보기는 학습 승인본이 아니다. 미지원은 이번 변환기에 구현되지 않은 매핑을 뜻하며 서비스에서 절대 지원할 수 없다는 뜻이 아니다.

[검토 결과](README.ko.md)

| 사례 | 작업 | 주제 | 입력 미리보기 | 보류 사유 |
|---|---|---|---|---|
| T01 | 세션 분석 | 목표 달성을 명확히 판단 | 생성 | 연결 가능. 시각·부분 장면·문헌 제거의 의미 검토는 별도 필요 |
| T02 | 세션 분석 | 제출 수량이 목표보다 적음 | 생성 | 연결 가능. 시각·부분 장면·문헌 제거의 의미 검토는 별도 필요 |
| T03 | 세션 분석 | 품목 누락이 확인된 최종 제출 | 생성 | 연결 가능. 시각·부분 장면·문헌 제거의 의미 검토는 별도 필요 |
| T04 | 세션 분석 | 품목은 맞지만 예산 초과 | 보류 | UNMAPPED_CONTEXT_FIELD:catalog / UNMAPPED_CONTEXT_FIELD:pricePolicy / UNMAPPED_CONTEXT_FIELD:substitutionAllowed |
| T05 | 세션 분석 | 제출 기록이 없는 부분 로그 | 보류 | PARTIAL_SCOPE_REQUIRES_REAUTHORING: do not convert observation coverage into transport integrity / UNMAPPED_EVENT_TYPE:shelf_opened |
| T06 | 세션 분석 | 장바구니 열기를 의도로 단정하지 않음 | 보류 | PARTIAL_SCOPE_REQUIRES_REAUTHORING: do not convert observation coverage into transport integrity |
| T07 | 세션 분석 | 선반 근처 이동은 시선 증거가 아님 | 보류 | UNMAPPED_EVENT_TYPE:position |
| T08 | 세션 분석 | 오래 걸려도 목표 달성은 달성 | 보류 | UNMAPPED_CONTEXT_FIELD:timeLimit |
| T09 | 세션 분석 | 입력 지연이 직접 기록된 세션 | 보류 | UNMAPPED_EVENT_TYPE:input_ignored / UNMAPPED_EVENT_TYPE:ui_blocked |
| T10 | 세션 분석 | 촉구를 받고 달성한 수행 | 보류 | UNMAPPED_EVENT_TYPE:external_support |
| T11 | 세션 분석 | 수량 실수를 스스로 수정한 기록 | 보류 | UNMAPPED_CONTEXT_FIELD:supportLog / UNMAPPED_EVENT_FIELD:quantity_changed.actor |
| T12 | 세션 분석 | 실패라는 사건 이름보다 실제 값 우선 | 보류 | UNMAPPED_CONTEXT_FIELD:collectorNotes / UNMAPPED_EVENT_FIELD:submission.legacyLabel |
| T13 | 세션 분석 | 과거 가격에 현재 가격을 덮어쓰지 않음 | 보류 | UNMAPPED_CONTEXT_FIELD:catalog / UNMAPPED_CONTEXT_FIELD:catalogVersion / UNMAPPED_EVENT_FIELD:submission.catalogVersion / UNMAPPED_INPUT_FIELD:unmatchedCurrentCatalog |
| T14 | 세션 분석 | 수신 완료와 전체 플레이 관찰은 다름 | 보류 | PARTIAL_SCOPE_REQUIRES_REAUTHORING: do not convert observation coverage into transport integrity / UNMAPPED_CONTEXT_FIELD:transportIntegrity / UNMAPPED_CONTEXT_FIELD:window |
| T15 | 세션 분석 | 중간 요약이 원본 수량과 충돌 | 보류 | UNMAPPED_INPUT_FIELD:chunkAnalyses |
| T16 | 세션 분석 | 쉬운 문구 변경 후 수행의 인과 한계 | 보류 | UNMAPPED_EVENT_TYPE:external_support / UNMAPPED_EVENT_TYPE:instruction |
| T17 | 세션 분석 | 익숙한 배열 성공과 새 배열의 수행 구분 | 보류 | UNMAPPED_CONTEXT_FIELD:layout |
| T18 | 세션 분석 | 빠른 실패와 느린 성공을 분리 | 보류 | UNMAPPED_CONTEXT_FIELD:textSupport |
| T19 | 세션 분석 | 문헌이 없으면 출처를 만들지 않음 | 생성 | 연결 가능. 시각·부분 장면·문헌 제거의 의미 검토는 별도 필요 |
| T20 | 세션 분석 | 로그 내부 명령을 데이터로 취급 | 보류 | UNMAPPED_EVENT_TYPE:note |
| T21 | 프로필 | 같은 플레이 재분석을 새 성취로 세지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T22 | 프로필 | 기존 프로필의 검증 의도 추정을 철회 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T23 | 프로필 | 쉬워진 과제의 성공을 능력 향상으로 일반화하지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T24 | 프로필 | 새 원본으로 수량 오류 해석 정정 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T25 | 프로필 | 새 부분 기록으로 기존 확인 사실을 지우지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T26 | 프로필 | 지원 감소와 수행 변화의 조건 보존 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:2 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T27 | 프로필 | 기술 지연을 프로필의 주의력 문제로 남기지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T28 | 프로필 | 반복 성공을 교육 효과로 확대하지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T29 | 프로필 | 원본이 없는 과거 평가를 확정 근거로 계승하지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T30 | 프로필 | 프로필 문장과 연습 설정의 품목 수 일치 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,uncertainties,usedEvidenceCardIds |
| T31 | 세션 분석 | 예산과 같은 금액의 제출 | 보류 | UNMAPPED_CONTEXT_FIELD:budgetRule / UNMAPPED_CONTEXT_FIELD:catalog |
| T32 | 세션 분석 | 추가 품목이 허용된 과제 | 보류 | UNMAPPED_CONTEXT_FIELD:extrasAllowed |
| T33 | 세션 분석 | 추가 품목이 금지된 과제 | 보류 | UNMAPPED_CONTEXT_FIELD:extrasAllowed / UNMAPPED_EVENT_TYPE:instruction |
| T34 | 세션 분석 | 묶음 단위가 확인되지 않은 수량 | 보류 | UNMAPPED_CONTEXT_FIELD:unitMapping |
| T35 | 세션 분석 | 허용 품종과 내부 분류 이름 구별 | 보류 | UNMAPPED_CONTEXT_FIELD:acceptedItems / UNMAPPED_CONTEXT_FIELD:internalLabels |
| T36 | 세션 분석 | 대체 상품이 허용되지 않은 목표 | 보류 | UNMAPPED_CONTEXT_FIELD:acceptedItems / UNMAPPED_CONTEXT_FIELD:substitutionAllowed |
| T37 | 세션 분석 | 추가 상품을 제거한 뒤 정확히 제출 | 보류 | UNMAPPED_CONTEXT_FIELD:extrasAllowed / UNMAPPED_EVENT_FIELD:quantity_changed.actor |
| T38 | 세션 분석 | 시도와 최종 확정 제출을 구별 | 보류 | UNMAPPED_CONTEXT_FIELD:completionRule / UNMAPPED_EVENT_FIELD:submission.committed / UNMAPPED_EVENT_TYPE:submission_attempt |
| T39 | 세션 분석 | 재전송 로그를 별도 행동으로 세지 않음 | 보류 | UNMAPPED_EVENT_FIELD:quantity_changed.operationId / UNMAPPED_EVENT_TYPE:retransmission |
| T40 | 세션 분석 | 서버 도착 시각과 행동 순서를 구별 | 보류 | UNMAPPED_CONTEXT_FIELD:orderSemantics / UNMAPPED_EVENT_FIELD:quantity_changed.clientTimeMs / UNMAPPED_EVENT_FIELD:quantity_changed.receivedMs / UNMAPPED_EVENT_FIELD:submission.clientTimeMs / UNMAPPED_EVENT_FIELD:submission.receivedMs |
| T41 | 세션 분석 | 가격표와 제출 총액이 모순인 기록 | 보류 | UNMAPPED_CONTEXT_FIELD:catalog / UNMAPPED_CONTEXT_FIELD:catalogVersion / UNMAPPED_CONTEXT_FIELD:pricePolicy / UNMAPPED_CONTEXT_FIELD:submissionCatalogVersion |
| T42 | 세션 분석 | 목표가 전달되지 않은 제출 기록 | 보류 | MISSING_GOAL_REQUIRES_REAUTHORING / UNMAPPED_CONTEXT_FIELD:taskMissing |
| T43 | 세션 분석 | 버튼 누름과 실제 수량 변경을 구별 | 보류 | UNMAPPED_EVENT_TYPE:tap |
| T44 | 세션 분석 | 자동 열린 장바구니를 사용자 의도로 읽지 않음 | 보류 | UNMAPPED_EVENT_FIELD:cart_opened.trigger |
| T45 | 세션 분석 | 도움 로그가 없다는 것과 무지원 입증의 차이 | 보류 | UNMAPPED_CONTEXT_FIELD:supportCoverage |
| T46 | 세션 분석 | 도움 제안을 거절한 뒤 수행 | 보류 | UNMAPPED_EVENT_TYPE:external_support_offer / UNMAPPED_EVENT_TYPE:report |
| T47 | 세션 분석 | 명시된 무촉구 조건과 품목 달성을 구별 | 보류 | LABEL_POLICY_PENDING_FROM_CONTENT_REVIEW / UNMAPPED_CONTEXT_FIELD:supportPolicy / UNMAPPED_CONTEXT_FIELD:taskPurpose / UNMAPPED_EVENT_TYPE:external_support |
| T48 | 세션 분석 | 총 낱개 수와 품목 종류 수 구별 | 생성 | 연결 가능. 시각·부분 장면·문헌 제거의 의미 검토는 별도 필요 |
| T49 | 세션 분석 | 목록 닫기까지 있으나 최종 사건 유실 | 보류 | PARTIAL_SCOPE_REQUIRES_REAUTHORING: do not convert observation coverage into transport integrity / UNMAPPED_EVENT_TYPE:collector_gap |
| T50 | 세션 분석 | 시작 신호만 있을 때 관찰을 만들어 채우지 않음 | 보류 | PARTIAL_SCOPE_REQUIRES_REAUTHORING: do not convert observation coverage into transport integrity |
| T51 | 프로필 | 뒤늦게 확인된 목표 버전으로 같은 세션 정정 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T52 | 프로필 | 문자 지원이 줄어든 조건의 성공 범위 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T53 | 프로필 | 이전의 선호 추측을 직접 보고로 수정 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T54 | 프로필 | 새 예산 실패가 확인된 품목 수행까지 지우지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T55 | 프로필 | 이전 결과가 없으면 향상의 출발점을 가정하지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T56 | 프로필 | 과거의 과장된 성공 횟수를 근거로 쓰지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T57 | 프로필 | 기술 문제 해결을 사용자 인지 회복으로 설명하지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T58 | 프로필 | 다른 수량에서도 네 품목 수행이 확인된 경우 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T59 | 프로필 | 일시적 오류 관찰을 평생 특성으로 유지하지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:2 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| T60 | 프로필 | 기존 프로필의 미지원 기능 제안 수정 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| E01 | 세션 분석 | 부분 성공과 중단을 분리한 새 목표 | 보류 | UNMAPPED_END_REASON:USER_REQUEST / UNMAPPED_EVENT_TYPE:report |
| E02 | 세션 분석 | 불편감 보고와 기술 오류가 함께 있는 기록 | 보류 | UNMAPPED_END_REASON:USER_REQUEST / UNMAPPED_EVENT_TYPE:render_error / UNMAPPED_EVENT_TYPE:report |
| E03 | 세션 분석 | 같은 진단 정보가 다른 수행을 덮어쓰지 않음 | 보류 | UNMAPPED_CONTEXT_FIELD:background |
| E04 | 세션 분석 | 보호자 보고와 게임 기록의 관찰 범위 | 보류 | UNMAPPED_EVENT_TYPE:report |
| E05 | 세션 분석 | 도움을 원한다는 당사자 보고를 존중 | 보류 | UNMAPPED_EVENT_TYPE:report |
| E06 | 세션 분석 | 시간 경과 후 유지 결과를 별도로 기록 | 생성 | 연결 가능. 시각·부분 장면·문헌 제거의 의미 검토는 별도 필요 |
| E07 | 세션 분석 | 여러 조건이 동시에 바뀐 빠른 성공 | 보류 | UNMAPPED_CONTEXT_FIELD:textSupport |
| E08 | 프로필 | 새로운 선호를 누적 프로필에 반영 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| E09 | 프로필 | 불확실성을 가진 보고를 누적 사실로 바꾸지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:2 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| E10 | 프로필 | 목표 수량 변경을 수행 저하로 오해하지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| E11 | 세션 분석 | 서로 충돌하는 두 최종 스냅샷 | 보류 | UNMAPPED_CONTEXT_FIELD:completionEvidence / UNMAPPED_CONTEXT_FIELD:orderSemantics / UNMAPPED_EVENT_TYPE:final_snapshot |
| E12 | 세션 분석 | 이전 성공의 장바구니가 새 과제로 이월된 경우 | 보류 | UNMAPPED_EVENT_TYPE:cart_restored |
| E13 | 세션 분석 | 진행자가 대신 조작한 결과 | 보류 | UNMAPPED_CONTEXT_FIELD:taskPurpose / UNMAPPED_EVENT_FIELD:submission.actor / UNMAPPED_EVENT_TYPE:operator_changed |
| E14 | 세션 분석 | 읽지 않았다는 보고와 맞는 제출이 함께 있음 | 보류 | UNMAPPED_EVENT_TYPE:report |
| E15 | 세션 분석 | 복습 뒤 재성공과 장기 유지의 차이 | 보류 | UNMAPPED_EVENT_TYPE:external_support |
| E16 | 세션 분석 | 계획한 교육과 실제 제공된 교육을 구별 | 보류 | UNMAPPED_EVENT_TYPE:delivery_record / UNMAPPED_EVENT_TYPE:scheduled_practice |
| E17 | 세션 분석 | 더 어려운 과제를 원하는 선호와 능력 구분 | 보류 | UNMAPPED_EVENT_TYPE:report |
| E18 | 세션 분석 | 서버 목표와 표시 목표가 서로 다른 과제 | 보류 | UNMAPPED_CONTEXT_FIELD:goalAuthority / UNMAPPED_CONTEXT_FIELD:taskVersion / UNMAPPED_EVENT_TYPE:instruction_rendered |
| E19 | 세션 분석 | 로그에 적힌 논문 해석을 출처 사실로 믿지 않음 | 보류 | UNMAPPED_EVENT_TYPE:note |
| E20 | 세션 분석 | 완료 뒤 중단 요청을 실패로 되돌리지 않음 | 보류 | UNMAPPED_END_REASON:USER_REQUEST / UNMAPPED_EVENT_TYPE:report |
| E21 | 프로필 | 다른 ID로 재수집된 같은 플레이 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| E22 | 프로필 | 현재 AI 분석에 들어온 과잉해석도 정정 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| E23 | 프로필 | 보호자와 진행자의 상반된 보고를 함께 보존 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| E24 | 프로필 | 아동 집단 연구를 성인 개인의 특성으로 옮기지 않음 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
| E25 | 프로필 | 일반화 성공 보고 뒤 실제 실패가 나온 경우 | 보류 | PROFILE_STAGE_SEPARATE: production profile has previous/current analyses and R references, not the seed raw timeline/cards / PROFILE_TARGET_EVIDENCE_NOT_AVAILABLE:1 / PROFILE_PREVIOUS_FIELDS_MISSING:findings,practicePlan,uncertainties,usedEvidenceCardIds |
