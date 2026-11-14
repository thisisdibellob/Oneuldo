# 도서관 확장 가구 v2

2026-09-29. 넓어진 도서관의 서가 변화와 PC 열람석을 위해 생성한 이미지다. 기존 v1 이미지는 그대로 유지한다.

## 가구 구성

| `libraryArt` 필드 | 파일 | 크기 | 런타임 용량 | 용도 |
| --- | --- | --- | --- | --- |
| `shelfTall` | `shelf-tall.png` | 255 × 512 | 148KB | 좁고 높은 4단 서가 |
| `shelfLow` | `shelf-low.png` | 608 × 282 | 198KB | 낮고 넓은 2단 서가 |
| `shelfVariant` | `shelf-variant.png` | 448 × 362 | 195KB | 기존 3단 형태에서 책 배열만 달라진 서가 |
| `computerDesk` | `computer-desk.png` | 416 × 480 | 186KB | 모니터·키보드·마우스·의자가 있는 1인 PC 열람석 |

서가 형태는 기존 일반 3단, 높은 4단, 낮은 2단의 **총 3종**이다. `shelfVariant`는 일반 3단의 책 배치 변형으로 사용한다. PC 열람석은 단일 이미지이므로 3개 좌석 배치는 월드 코드에서 같은 이미지를 세 번 배치한다.

## 제작 및 검증

- 내장 `image_gen.imagegen` 도구로 가구별 1회씩 생성했다. 기존 `../shelf.png`를 오크·세이지 색, 갈색 외곽선, 정면 평행 시점의 참고로 사용했다.
- 원본은 `source/`에, 실제 프롬프트는 `prompts.json`에 보관했다.
- `frontend/scripts/prepare-library-art-v2.cjs`는 원본에서 투명 여백을 잘라낸 뒤 런타임 크기로 축소한다. 생성된 알파를 유지하며 그림의 색·외곽선·내용은 수정하지 않는다.
- 모든 최종 파일은 RGBA PNG이고 모서리 알파가 0임을 확인했다.
- 크림색 바닥에 합성한 `source/qa-contact-sheet.png`로 외곽, PC 책상과 의자 다리 사이의 투명 영역, 가구 시점을 확인했다.
- 크기·추출 좌표·파일 용량은 `asset-manifest.json`에 기록한다. 앱에서는 `contain`으로 비율을 유지하고 발밑을 월드 바닥에 맞춘다.
- UI 글자와 서가 분류 표시는 이미지에 굽지 않고 게임 코드에서 표시한다.

재추출은 Sharp를 제공하는 Node 환경에서 `node frontend/scripts/prepare-library-art-v2.cjs`로 실행한다. 앱 실행 시 Sharp 의존성은 필요하지 않다.
