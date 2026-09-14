# 원본 기록 대조표

187개 사건, 세션 91dc3652-976d-42ea-b0cf-5ecd30bd76e9. 이전 시험과 다른 실제 플레이이며 과제는 같다.

| 근거 | 시작 후 시간 | 사건 | 값 |
|---|---|---|---|
| E71 | 15.328초 | SHOP.QUANTITY_CHANGED | milk: 0→1 |
| E131 | 29.227초 | SHOP.QUANTITY_CHANGED | water: 0→1 |
| E157 | 34.111초 | SHOP.QUANTITY_CHANGED | banana: 0→1 |
| E185 | 38.278초 | SHOP.CHECKOUT_SUBMITTED | 6600원 / 잔액 400원 |
| E187 | 39.328초 | SHOP.SESSION_ENDED | 6600원 / 잔액 400원 |

종료 사유는 USER_ABORTED다. 목표 품목 선택 및 결제 제출 기록은 확인되지만 종료 사유만으로 수행 성공/실패를 확정하지 않는다. 과제 대사에는 6000원이라는 문구가 있으나 실제 상품 가격 합계 및 결제 제출 값은 6600원이다.
