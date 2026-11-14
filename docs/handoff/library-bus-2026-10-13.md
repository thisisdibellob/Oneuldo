# 도서관·버스 개발 인수인계

작성 기준: 2026-10-13, `feat/8-시뮬레이션-게임-ui-제작`의 `a02ca8a` 소스. 이 날짜는 현재 상태를 확인한 날짜이며, 아래 기능 전부를 이날 구현했다는 뜻이 아니다. 과거 문서에 남은 초기 설계와 현재 코드를 구분해 기록한다.

## 1. 두 활동이 하나의 게임으로 이어지는 방식

도서관과 버스는 별도 앱이 아니라 기존 마을에서 이어지는 생활 시뮬레이션이다. 바깥 게임 화면인 [GamePrototypeScreen.tsx](../../frontend/src/screens/GamePrototypeScreen.tsx)가 마을·버스·도서관의 진입과 복귀, 공통 조작 설정, 활동 앨범, 하루 일정을 연결한다.

- 일반 마을 진입: 동쪽 정류장 접근 → `버스 목적지 고르기` → `하늘도서관으로 가기` → 들어온 버스의 번호·행선지 확인 → 탑승.
- 도서관행 이동: 버스에서 하차 → 횡단보도로 도서관 쪽 인도 접근 → 도서관 입장·출근 보고 → 도서관 근무 화면.
- 도서관 퇴장: 도서관 건물 앞 지역으로 나온다. 정류장을 직접 선택하기 전에는 귀환 버스 타이머를 돌리지 않아 주변을 둘러볼 수 있다.
- 귀환: 도서관 쪽 정류장에서 마을앞으로 가는 버스 탑승 → 마을앞 하차 → 실제 메인 마을로 복귀.
- `오늘의 일정`은 출근 버스 → 근무 → 귀환 버스 → 우리 집 도착을 묶는다. 단계별 상태와 세션 연결은 [dayJourney.ts](../../frontend/src/game/dayJourney.ts)에 있다.
- 퀘스트 탭의 `혼자 버스 타기`는 [QuestScreen.tsx](../../frontend/src/screens/QuestScreen.tsx) → [AppShell.tsx](../../frontend/src/screens/AppShell.tsx) → 실제 마을 정류장으로 연결된다. 별도 퀴즈 화면만 여는 옛 연습 흐름과 혼동하지 않는다.
- 휴대폰의 특정 마을로 바로 이동하기는 개발·편의 이동이다. 이를 버스 정상 완료로 기록하지 않도록 부모 화면이 기존 버스 타이머와 초안 상태를 정리한다.

버스 완료는 중간 결과 모달로 흐름을 끊지 않고 도서관 입장이나 마을 복귀로 이어진다. 도서관에는 별도의 `근무 완료` 결과 화면이 있다. 버스 결과 데이터와 활동 앨범 기록은 화면 전환과 별도로 생성된다.

## 2. 버스의 현재 플레이 규칙

### 노선과 공간

[busSession.ts](../../frontend/src/game/busSession.ts)의 노선은 게임용 가상 노선이다. 실제 지역의 버스 운행 정보와 연결되어 있지 않다.

| 노선 | outbound 순서 | 반대 방향 |
| --- | --- | --- |
| 201 | 느티광장 → 마을앞 → 중앙공원 → 하늘도서관 → 늘봄주민센터 | 같은 정류장을 역순으로 이동 |
| 305 | 느티광장 → 마을앞 → 중앙공원 → 체육관 | 같은 정류장을 역순으로 이동 |

고유 정류장은 6개다. 6개의 완전히 다른 대형 마을을 구현한 상태는 아니다. 메인 마을은 기존 월드, 하늘도서관은 도서관 외부 지역, 나머지 경유지·종점은 이름과 노선 상태가 달라지는 공통 정류장 공간을 사용한다. `BusWorldScene`은 `village / stop / district / bus` 네 종류이며, 현재 정류장 ID와 인도 방향을 함께 해석한다.

일반 마을의 목적지 선택은 `cardPacked: true`, `routeOpened: true`, `phase: waiting`으로 시작한다. 현재 사용자는 집에서 카드를 먼저 챙기는 긴 준비 단계를 거치지 않는다. 다만 reducer에는 `prepare`, `PACK_CARD`, `RETURN_HOME` 및 카드 누락 복구 경로가 남아 있고 테스트한다. 이 잔존 경로를 현재 기본 진입 시나리오라고 설명하지 않는다.

### 정상 이동

1. 정류장 안내판이나 휴대폰 노선도에서 번호와 행선지를 확인한다. 정류장 안내판은 해당 방향의 운행 가능 노선만 표시하고 `도착 / 곧도착 / 대기`를 세션 상태에서 계산한다.
2. 버스가 전진해서 완전히 멈춘 뒤 탑승 버튼이 활성화된다. 보내기를 누르면 현재 버스가 떠나고 다음 버스가 들어온다.
3. 앞문에서 승차 단말기에 카드를 찍는다. 실제 결제·요금 차감 API가 아니라 게임의 승인 상태 전환이다.
4. 카드 승인 화면을 닫으면 탑승마다 기사 퀴즈 하나가 열린다. 답하거나 `이번엔 그냥 갈게요`로 넘길 수 있다.
5. 빈 좌석 4곳 또는 손잡이 3곳 중 하나를 고른다. 정차 중에는 다른 자리로 바꿀 수 있다. 자리 이동 애니메이션이 끝나야 `출발하기`를 누를 수 있다.
6. 주행 중에는 자유 보행·자리 변경을 잠근다. 하차벨은 사용할 수 있다. 다음 정류장 안내는 화면과 선택적 음성으로 제공한다.
7. 한 구간은 기본 20초다. 하차벨을 눌렀거나 종점이면 정차하고, 그렇지 않으면 다음 구간으로 이어진다. 벨은 다음 정류장에 대한 요청이며 이후 모든 정류장에 계속 유지되지 않는다.
8. 정차 후 `일어나기` 또는 `손잡이 놓기` → 하차 단말기에 카드 찍기 → 뒷문 하차 순서다. 아직 내릴 곳이 아니면 다시 자리를 확보하고 `계속 타기`를 선택할 수 있다.
9. 하늘도서관 목적지는 도서관 쪽 인도(`inbound`)에서 입장·출근 보고까지 해야 완료된다. 마을 귀환은 목적 정류장 하차 후 완료 처리하고 메인 마을로 돌아간다.

### 실수와 회복

- 출발 전 잘못 탄 버스에서 앞문으로 내릴 수 있다.
- 잘못된 노선을 탔거나 목적지를 지나쳤다면 실제 다른 정류장에서 하차·횡단·환승해서 돌아올 수 있다. `getBusHelpPlan()`은 정류장뿐 아니라 인도 방향과 종점을 고려해 경로를 구한다.
- 모든 종점은 자동 정차한다. 같은 방향으로 종점 너머까지 계속 타는 것은 막는다.
- 기사에게 행선지 묻기는 정차 중에 가능하다. 주행 중에는 운전 중이라는 응답을 준다.
- 휴대폰/민수/지영 도움, 현재 위치 확인, 안내 다시 듣기, 마지막 정류장으로 복구하기가 있다. 복구는 행동 이벤트로 남고 정상 환승과 구분된다.
- 안내 방식은 `guided / independent`. 혼자 해보기에서도 노선도·일반 조작·직접 요청하는 도움은 사용 가능하다.
- `getBusResult()`는 실제 승차·카드 승인·도움·복구·잘못 출발·환승 회복 등의 사실을 요약한다. 질문을 했다는 이유만으로 실패 처리하지 않는다.

### 기사 퀴즈

[busDriverQuiz.ts](../../frontend/src/game/busDriverQuiz.ts)에 고정된 질문 8종이 있다: 탄 버스 번호, 노선 안내판, 하차벨, 손잡이, 도서관 목소리, 책 반납, 공원 간식 포장지, 친구와 약속. 생성형 AI가 실시간으로 질문하는 기능은 아니다.

탑승 이벤트에 `quizId`를 붙이고 동일 `rideId`에서 한 번만 연다. 답변과 건너뛰기를 이벤트로 기록하며 오답도 출발을 막지 않는다. 퀴즈 이벤트가 없는 옛 세션에는 대화를 갑자기 추가하지 않는다. 문항·응답을 변경할 때는 [busDriverQuiz.test.ts](../../frontend/__tests__/busDriverQuiz.test.ts)와 화면의 중복 실행 방지 테스트를 함께 확인한다.

## 3. 버스 화면·주행 구현에서 지킬 기준

| 항목 | 현재 구현·수정 지점 |
| --- | --- |
| 실내 크기 | 월드 440×1080, 차체 350×963. 원본 비율을 유지하며 인물은 `BUS_PLAYER_SCALE = 0.55` |
| 바깥 지역 | 1280×1150의 정류장/도서관 외부 공간. 차도는 지정 횡단보도 외 접근을 막음 |
| 가구와 터치 | [busWorld.ts](../../frontend/src/game/busWorld.ts)의 `BUS_PASSENGER_PLACES`가 좌석/손잡이 실제 위치, 접근 위치, hitbox, 등받이 가림을 함께 정의 |
| 착석 | 뒤 정면 idle을 사용하고 아래를 잘라 좌석 등받이와 겹침. 일어나면 통로의 접근점으로 복귀 |
| 기사 | 별도 서 있는 전신 기사 이미지를 객실 위에 얹지 않음. 기사 상호작용은 계속 존재 |
| 노선 팝업 | [BusJourneyPanels.tsx](../../frontend/src/components/game/BusJourneyPanels.tsx)의 `BusRoutePanel`은 고정 높이 700을 공통 패널에 전달하고 작은 화면에서는 패널 내부를 스크롤 |
| 전광판 | 같은 파일의 `BusTimetable`. 정류소 코드·노선·방면·도착 정보를 실제 텍스트로 렌더링 |
| 승차 연출 | [BusArrivalPreview.tsx](../../frontend/src/components/game/BusArrivalPreview.tsx). 도착 완료 전에 탑승/기사 버튼을 활성화하지 않음 |
| 공통 조작 | `GameHud`와 `GameControls` 재사용. 투명 조이스틱 영역의 짧은 탭은 버스 좌석/손잡이 hit-test로 전달하는 별도 연결 있음 |

일반 오브젝트 탭이 조이스틱 모드에서 먼 곳으로 자동 이동하지 않는 규칙은 유지한다. 다만 버스의 명시적 좌석/손잡이 선택은 예외로, 그 자리를 실제 통로를 따라 찾아가게 구현했다. 화면 밖 목표 안내도 조이스틱에서는 방향을 알려 주고, 터치 이동 모드에서만 경로 이동을 실행한다.

### 최근 도로 개선과 반복 정지 수정

[BusRoadBackdrop.tsx](../../frontend/src/components/game/BusRoadBackdrop.tsx)는 차체·카메라와 독립적으로 viewport 전체를 채운다. 회색 도로 그라데이션, 경계선, 반복 차선, 보도블록, 배수구, 가로수·꽃·벤치·가로등을 사용한다. 신규 도로 이미지를 생성한 작업이 아니라 기존 마을 장식 이미지를 재사용한 코드 구성이다.

- `BUS_ROAD_REPEAT = 960`, 한 반복 5,100ms, 선형 이동. 화면 높이에 따라 필요한 타일 수에 2개를 더해 루프의 처음·중간·끝에 빈 배경이 나타나지 않도록 한다.
- `Animated.loop` 안의 `Animated.timing`은 `useNativeDriver: Platform.OS !== 'web'`, `isInteraction: false`를 사용한다. 웹에서 무조건 `true`를 주면 RN Web이 native 반복 분기를 선택했다가 실제 JS fallback은 한 바퀴만 실행해 도로가 멈추는 문제가 있었다. 이 분기를 다시 합치지 않는다.
- 도로 재생 조건은 `travelling && !locked`. 정차·메뉴·앱 background 시 멈추며, 모션 감소 설정에서는 도로를 스크롤하지 않는다.
- 정류장 이동 타이머는 [useBusRuntime.ts](../../frontend/src/game/useBusRuntime.ts)의 `useBusClock`. 동일 타이머가 구간 진행 표시도 움직인다. 패널·휴대폰·일정·앱 비활성화에는 남은 시간을 보존하고 재개 시 최소 5초의 여유를 준다.
- 음성 안내의 완료를 이동 조건으로 기다리지 않는다. `speech.speaking`을 20초 구간 타이머의 pause 조건에 다시 넣으면 안내 콜백 유실 때 지연이 발생한다. 음성 실패와 무관하게 텍스트 안내와 주행은 동작해야 한다.
- 도로 루프는 주행 재개 시 위상을 0으로 재시작한다. 실제 차량 속도·제동 물리나 지도상의 이동 거리를 계산하는 기능은 아니다.

## 4. 도서관의 현재 플레이 규칙

### 실제 분류와 가상 도서

KDC 대분류는 000 총류, 100 철학, 200 종교, 300 사회과학, 400 자연과학, 500 기술과학, 600 예술, 700 언어, 800 문학, 900 역사다. [libraryClassification.ts](../../frontend/src/game/libraryClassification.ts)가 분류표, [librarySession.ts](../../frontend/src/game/librarySession.ts)가 가상 도서 52권과 근무 상태를 정의한다.

책 제목·도서기호·표지는 게임용 창작물이다. 실제 공공도서관 소장 목록을 가져온 것이 아니다. 조사 출처는 [작은 공공도서관 분류 조사](../library-classification-research.md)에 기록되어 있으며, 인천 작은도서관 운영 매뉴얼, 국립중앙도서관 청구기호 설명, 교육청의 자료 배열 안내 등을 참고했다. 여기서는 해당 문헌을 새로 재조사하거나 최신판 여부를 재검증하지 않았다.

### 업무 시작 전 설정

사서의 `근무 설정 바꾸기` 또는 업무 전 수첩에서 [LibrarySetupPanel.tsx](../../frontend/src/components/game/LibrarySetupPanel.tsx)를 연다.

| 변수 | 선택 가능 | 기본 |
| --- | --- | --- |
| 손님 수 | 0·1·2명 | 1명 |
| 손님 부탁 | 섞어서·위치 안내·책 꽂기 | 섞어서 |
| 반납 도서 | 6·12·18권 | 12권 |
| 라벨 훼손 | 0·1·2권 | 1권 |
| 안내 | 안내와 함께·혼자 해보기 | 안내와 함께 |

설정은 근무 전만 바꾸며 재근무에서도 유지한다. 재근무 시 seed와 세션 식별자는 새로 만들어 책을 다시 배정한다. 같은 seed·행동 순서는 재현 가능하다. 기본 12권에는 10개 분류가 모두 들어가며 추가 두 권이 배정된다. 일반 반납 책은 한 번에 최대 6권 운반한다.

### 반납·배가·예외·보고

1. 사서에게 업무를 받는다. 반납 전산처리가 끝난 책을 분류·배가하는 역할이며, 대출/반납 전산 시스템 자체는 구현하지 않았다.
2. 반납 카트에서 책을 가져오고 책등 청구기호를 확인한다.
3. 분류에 맞는 실제 서가로 가서 책을 선택한다. 현재 화면에는 양옆 기준 책 2권과 3개 삽입 위치가 있어 **청구기호 첫 줄 숫자를 비교해서 자리를 선택**한다. 소수점도 숫자로 비교하고 동일 숫자는 인접한 적합 위치를 인정한다.
4. 올바른 분류에서 삽입 위치만 틀리면 책은 손에 남아 다시 선택할 수 있다. 다른 분류 서가에 꽂으면 그 책은 실제로 잘못된 서가에 남으며 꺼내서 수정해야 한다. 잘못 둔 책이 남으면 최종 완료하지 않는다.
5. 라벨 훼손 책은 확인 → 사서에게 문의 → 확인함 전달 순서다. 문의 전 전달, 일반 책의 확인함 전달, 훼손 책의 일반 배가를 막는다.
6. 손님 부탁까지 해결하고 사서에게 서가 권수와 확인함 권수를 보고한다. 보고 숫자가 실제 상태와 일치하고 미처리·오배가·미완료 손님이 없어야 `finished`가 된다.
7. 결과 화면에 실제 배가/전달/손님 응대/수정 사실을 표시한다. 만족도 1~5점은 주관적 별점이며 수행 능력 점수와 같지 않다. 다시 근무하거나 밖으로 나갈 수 있다.

분류번호 비교는 구현되어 있지만 도서기호·권차·복본까지 포함한 완전한 청구기호 정렬은 아직 범위 밖이다. `placeBook.slot`은 옛 호출과의 호환 때문에 reducer에서 선택 속성이다. 새 UI를 만들 때는 기존 [LibrarySimulationScreen.tsx](../../frontend/src/screens/LibrarySimulationScreen.tsx)처럼 위치를 고르게 하고 전달해야 한다. 위치 선택 없이 reducer를 호출할 수 있다는 이유로 현재 화면의 숫자 비교 과제를 없애면 안 된다.

### 손님 0~2명

손님은 업무 시작 전부터 각자 위치에 서 있고 약 150px 안으로 접근하면 작은 `이 책은...` 표시를 띄운다. 말 걸기는 업무 시작 후에 가능하다. 완료된 부탁에 보상을 중복 지급하거나 같은 대화를 반복 완료하지 않도록 reducer가 검증한다.

| 부탁/선택 | 진행 및 완료 조건 |
| --- | --- |
| 이 책 어디 있나요? | 책 위치 확인 → 표지·제목·청구기호로 10개 서가 중 선택 → 손님 동행 → 실제 목적 서가에서 마지막 안내 |
| 이 책 대신 꽂아주실 수 있나요? | 책 확인·수령 → 실제 서가에 배가 → 손님에게 돌아가 `책을 제자리에 꽂았어요` 보고 |
| 사서 선생님께 안내해 드릴게요 | 사서 연결로 정상 완료. 모른다고 요청을 방치하는 대신 도움을 구하는 경로 |
| 잠시 기다려 달라는 응대 | 완료하지 않고 다른 업무 후 돌아올 수 있게 유지 |

`섞어서`는 손님 한 명일 때 seed에 따라 두 부탁 중 하나, 두 명일 때 각각 한 종류씩이다. 한 명에게 두 부탁을 동시에 부과하는 뜻이 아니다. 손님 책은 반납 카트 책·다른 손님 책과 겹치지 않는다. 책 정리 부탁으로 받은 책은 일반 6권 운반 한도와 별도로 들 수 있으며 실제 업무 총권수에 추가된다.

위치 안내 카드·수첩은 정답 선택 전에 분류명을 노출하지 않는다. 올바르게 고른 후에만 목적 서가 안내가 보인다. 동시에 두 사람을 끌고 다니지 않으며, 한 명의 동행을 마친 후 다른 요청을 진행한다. 손님은 플레이어의 이동 경로를 따라가고 메뉴·대화가 열리면 함께 멈춘다.

### 보조 도구와 공간

- 안내 데스크 사용자 자리에서 52권을 제목·분류번호·KDC 범주로 검색하고 현재 카트/소지/서가/확인함 위치를 볼 수 있다. 업무 전에도 사용 가능하다.
- 수첩의 가이드북은 업무 받기, 청구기호, 배가, 훼손 자료, 손님 안내, 보고를 다룬다. 분류표를 열었다 돌아오면 보던 장을 유지한다. 구현은 [LibraryReferencePanels.tsx](../../frontend/src/components/game/LibraryReferencePanels.tsx)와 [libraryCatalog.ts](../../frontend/src/game/libraryCatalog.ts)에 있다.
- 방 크기는 현재 1860×1520. 뒤벽은 창문 → 3칸 연결 서가 → 창문 → 3칸 연결 서가 → 창문이다. 창문 180×162, 창턱은 바닥보다 50px 위, 벽 서가 밑동은 벽·바닥 접점보다 20px 앞으로 나온다.
- 000~500은 두 벽 서가에, 600~900은 두 중앙 양면 서가에 나누어 배치한다. 중앙 서가 사이 통로는 200px이다. PC 3석, 사용자 검색 자리가 포함된 356px 안내 데스크, 6인 라운지, 전시대·화분을 둔다.
- 인물 크기 `LIBRARY_PLAYER_SCALE = 0.55`, 플레이어 충돌 반경 17을 기준으로 가구 비율을 맞춘다. 방 전체를 화면에 맞추기 위해 인물을 다시 축소하지 않는다.
- 가구의 그림 전체가 아니라 밑동/바닥 면을 충돌 영역으로 쓴다. 캐릭터 발 높이와 정수 깊이값을 비교해 PC·책장·책상 앞뒤 표시를 정한다. 과거 PC 앞에서 캐릭터가 뒤로 가려진 문제의 재발 방지점이다.
- [libraryWorld.ts](../../frontend/src/game/libraryWorld.ts)의 좌표·충돌·접근점과 [LibraryRoom.tsx](../../frontend/src/components/game/LibraryRoom.tsx)의 표시를 함께 수정한다. 그림만 키우고 충돌 박스를 두면 안 된다.

## 5. 상태·기록과 저장 범위

버스 reducer는 `prepare → waiting → boarding → riding → stopped → alighting → arrived → completed`를 관리한다. 실제 행동은 [busSession.ts](../../frontend/src/game/busSession.ts)에서 검증하며, 화면은 시간·이동·열린 패널을 담당한다. 도서관은 `briefing → working → finished`, 책별 위치·훼손·확인·시도·수정, 손님별 부탁·완료 방법·동행을 [librarySession.ts](../../frontend/src/game/librarySession.ts)에서 관리한다.

| 저장 대상 | 위치/규칙 |
| --- | --- |
| 버스 완료 기록 | [busEpisodeStore.ts](../../frontend/src/game/busEpisodeStore.ts), `oneuldo.bus.episodes.v1` |
| 도서관 완료 기록 | [libraryEpisodeStore.ts](../../frontend/src/game/libraryEpisodeStore.ts), `oneuldo.library.episodes.v1` |
| 보관 한도 | 각각 최근 20건, JSON 문자열 크기를 약 2MiB 기준으로 제한 |
| 웹 | 사용 가능한 `localStorage`에 기록. 읽을 때 구조·완료 조건을 검증하고 결과를 다시 계산 |
| 네이티브/저장 차단 | 모듈 메모리에만 유지. 앱 재실행 이후 보존을 보장하지 않음 |
| 중복 방지 | 세션 ID로 같은 완료 저장을 구분. 잘못된/미완료 세션 저장 차단 |
| 만족도 | 완료 기록의 `userRating`. 수행 결과와 별도 필드 |
| 하루 일정 초안 | `dayJourney.ts`의 `libraryDraft`, `busDraft`; 같은 앱 실행 중 화면 이동·재입장을 위한 메모리 상태 |
| 앨범 연결 | [activityAlbum.ts](../../frontend/src/game/activityAlbum.ts)의 완료 활동 기록 함수를 부모 화면에서 호출 |

진행 중 근무·버스의 영구 중간 저장/서버 계정 동기화는 구현되지 않았다. 하루 일정에서는 나갔다 돌아와 이어할 수 있지만 앱 종료 후 복구되는 저장으로 설명하면 안 된다. 독립 도서관 입장은 같은 재입장 보존을 보장하지 않는다. 이 두 활동의 완료 기록은 장보기 AI 분석 업로드와 별개의 로컬 저장이다.

행동 이벤트는 `sequence/type/payload`로 순서를 남긴다. 모든 행동에 실제 발생 시각을 저장하는 형식은 아니므로, 이 기록만으로 질문별 반응 시간이나 행동별 초 단위 지연을 계산했다고 주장하면 안 된다. 버스는 세션 시작·완료 시각, 도서관은 세션 시작 시각을 별도로 가지고 있다.

기존 v1 기록 호환: 버스는 `destination`이 없는 옛 기록을 도서관행으로 읽는다. 도서관은 단일 `visitor`와 6/12권으로 저장한 옛 완료 상태를 현재 `visitors/config/source` 구조로 정규화한다. 데이터 구조를 바꿀 때 기존 기록을 삭제해서 해결하지 말고 읽기 경계의 마이그레이션과 테스트를 함께 수정한다.

## 6. 파일 지도와 아트 원본

| 변경 목적 | 파일 |
| --- | --- |
| 버스 화면·패널·타이머·진입/완료 | [BusSimulationScreen.tsx](../../frontend/src/screens/BusSimulationScreen.tsx) |
| 버스 월드·카메라·움직임·착석 | [BusWorld.tsx](../../frontend/src/components/game/BusWorld.tsx), [busWorld.ts](../../frontend/src/game/busWorld.ts) |
| 노선·실수 복구·상태 검증 | [busSession.ts](../../frontend/src/game/busSession.ts) |
| 도로 연출 | [BusRoadBackdrop.tsx](../../frontend/src/components/game/BusRoadBackdrop.tsx) |
| 시간·앱 background·음성 | [useBusRuntime.ts](../../frontend/src/game/useBusRuntime.ts) |
| 노선도·정류장 안내판·카드 단말기 | [BusRouteMap.tsx](../../frontend/src/components/game/BusRouteMap.tsx), [BusJourneyPanels.tsx](../../frontend/src/components/game/BusJourneyPanels.tsx) |
| 기사 질문 | [busDriverQuiz.ts](../../frontend/src/game/busDriverQuiz.ts), [BusDriverQuizPanel.tsx](../../frontend/src/components/game/BusDriverQuizPanel.tsx) |
| 도서관 대화·작업·손님·결과 | [LibrarySimulationScreen.tsx](../../frontend/src/screens/LibrarySimulationScreen.tsx) |
| 도서관 카메라·이동·가구 | [LibraryRoom.tsx](../../frontend/src/components/game/LibraryRoom.tsx), [libraryWorld.ts](../../frontend/src/game/libraryWorld.ts) |
| 책 라벨·선택/드래그·숫자 순서 | [LibraryWorkPanel.tsx](../../frontend/src/components/game/LibraryWorkPanel.tsx) |
| 도서·설정·업무 판정 | [librarySession.ts](../../frontend/src/game/librarySession.ts), [LibrarySetupPanel.tsx](../../frontend/src/components/game/LibrarySetupPanel.tsx) |

버스 현재 외관은 `assets/images/game/bus/v4`, 실내는 `v5/interior.png`다. [busArt.ts](../../frontend/src/game/busArt.ts)에 매핑한다. 예전 `driver`, `playerSeated` 원본이 매핑에 남아 있다는 사실만으로 현재 화면에서 사용한다고 판단하지 않는다.

도서관 아트는 [libraryArt.ts](../../frontend/src/game/libraryArt.ts)의 ID 매핑이 기준이다. 책 표지는 초기 12권, `books-v3`, `v4`에 분산되어 있고 책 ID에 명시적으로 연결한다. 서가는 `v6`, 창문·장식은 `v5`, 확장 데스크·라운지는 `v4`, PC는 `v2`를 사용한다. 이전 버전 파일을 통째로 삭제하면 현재 참조가 깨질 수 있다. 생성 원본·프롬프트·검수 자료는 [도서관 에셋 폴더](../../frontend/assets/images/game/library)와 [버스 에셋 폴더](../../frontend/assets/images/game/bus)에 있다.

## 7. 검증과 재현

이 인수인계 작성 직전 대화에서 확인한 기준은 전체 **88개 스위트·982개 테스트 통과**다. 문서 작성 중 모든 검증을 새로 실행했다는 뜻은 아니다. 최신 버스 도로 변경은 이전 작업에서 관련 80개 테스트·타입 검사·웹 빌드와 PC/모바일 크기 브라우저 확인을 보고했다. 실제 Expo Go 기기에서 해당 도로 변경을 직접 확인했다는 기록은 없다.

주요 회귀 테스트:

- [BusRoadBackdrop.test.tsx](../../frontend/__tests__/BusRoadBackdrop.test.tsx): 웹/네이티브 애니메이션 driver, 반복 수명·정지.
- [BusRuntime.test.tsx](../../frontend/__tests__/BusRuntime.test.tsx), [BusSimulationScreen.test.tsx](../../frontend/__tests__/BusSimulationScreen.test.tsx): pause/resume, background, 음성 완료 콜백 누락, 퀴즈, 승하차·환승·도서관 진입·귀환.
- [BusWorld.test.tsx](../../frontend/__tests__/BusWorld.test.tsx), [busWorld.test.ts](../../frontend/__tests__/busWorld.test.ts): 좌석·손잡이 선택, 통로 이동, 착석 깊이, 조이스틱 탭 전달, 도로 전체 화면 범위.
- [busSession.test.ts](../../frontend/__tests__/busSession.test.ts), [busDriverQuiz.test.ts](../../frontend/__tests__/busDriverQuiz.test.ts): 상태와 잘못된 행동 검증·경로·질문 반복 방지.
- [librarySession.test.ts](../../frontend/__tests__/librarySession.test.ts): 모든 설정 조합·숫자 위치·오배가 수정·손님 부탁·보고·동일 seed 재현.
- [LibrarySimulationScreen.test.tsx](../../frontend/__tests__/LibrarySimulationScreen.test.tsx): 작업 패널을 통한 근무 완료, 손님 0/2명, 훼손 2권, 검색·가이드북·결과.
- [LibraryRoom.test.tsx](../../frontend/__tests__/LibraryRoom.test.tsx), [libraryWorld.test.ts](../../frontend/__tests__/libraryWorld.test.ts): 시작 전 손님, 동행, 카메라·탭 좌표·경로·PC 앞뒤 깊이.
- [LibraryWorkPanel.test.tsx](../../frontend/__tests__/LibraryWorkPanel.test.tsx): 길게 누르기/스크롤 구별, 책 드래그·탭 대체 조작.
- [busEpisodeStore.test.ts](../../frontend/__tests__/busEpisodeStore.test.ts), [libraryEpisodeStore.test.ts](../../frontend/__tests__/libraryEpisodeStore.test.ts): 완료 검증·구 기록·중복·저장 제한·메모리 fallback.
- [BusEntry.test.tsx](../../frontend/__tests__/BusEntry.test.tsx), [LibraryEntry.test.tsx](../../frontend/__tests__/LibraryEntry.test.tsx): 마을 연결과 개발 미리보기.

실행 위치는 `frontend/`. 필요한 변경 영역의 테스트를 먼저 돌리고 최종 검증은 루트 인수인계의 프로젝트 명령을 따른다. 예:

```powershell
pnpm typecheck
pnpm exec jest --runInBand __tests__/BusRoadBackdrop.test.tsx __tests__/BusSimulationScreen.test.tsx __tests__/BusWorld.test.tsx __tests__/BusRuntime.test.tsx
pnpm exec jest --runInBand __tests__/librarySession.test.ts __tests__/LibrarySimulationScreen.test.tsx __tests__/LibraryRoom.test.tsx __tests__/LibraryWorkPanel.test.tsx
pnpm build:web
```

개발 웹의 `?busPreview=1`은 메인 마을 정류장, `?libraryPreview=1`은 도서관 빠른 진입이다. `__DEV__`와 웹 조건이 붙어 있으며 일반 배포 진입을 대신하지 않는다. 음성 없이 화면 확인할 때 `&muteAudio=1`을 붙일 수 있다. 터널 URL은 실행할 때 확인해야 하므로 여기에 고정 주소를 남기지 않는다.

수동 회귀 시에는 375px 세로 화면과 PC 큰 화면을 함께 본다. 버스에서 5.1초 반복을 세 번 이상 지켜보고 정류장 도착 전 계속 흐르는지, 벨 후 20초 구간 끝에 멈추는지 확인한다. 메뉴를 열었다 닫은 경우와 음성 엔진이 없는 경우도 확인한다. 도서관은 정상 배가·잘못된 삽입 위치 수정·다른 분류 오배가 회수·훼손 인계·두 종류 손님 부탁·보고까지 실제 화면으로 이어서 확인한다.

## 8. 과거 기록을 일지로 사용할 때

| 자료 | 활용 방식·현재와 다른 지점 |
| --- | --- |
| [도서관 첫 근무 게임 v1](../library-game-v1.md) | 날짜별 변화와 당시 검증 기록. 6권·단일 손님·초기 방 크기 등의 옛 항목을 현재 값으로 인용하지 않음 |
| [공공도서관 분류 조사](../library-classification-research.md) | 조사 목적과 원문 출처. 현재 추가된 숫자 비교 과제는 소스와 함께 설명 |
| [버스→도서관 초기 시나리오](../bus-to-library-scenario-v1.md) | 기획 의도와 복구 경로의 배경. 준비 단계·결과 화면 등 현재 흐름과 대조 필요 |
| [한국·일본 버스 레퍼런스 조사](../bus-reference-research.md) | 차량 방향·출입문·좌석 배치의 근거. 과거 기사 그림 교체 제안은 현재 구현과 구분 |
| [버스 9월 29일 검증](../bus-revision-validation-2026-09-29.md), [10월 1일 검증](../bus-revision-validation-2026-10-01.md) | 해당 날짜에 문서가 기록한 검증 범위. 현재 전체 테스트 수와 합산하지 않음 |

주차별 일지는 `요청/문제 → 구현한 조치 → 검증 → 남은 제약` 순서로 쓴다. 코드에서 현재 구현은 확인할 수 있지만 최초 작업 날짜까지 확정할 수는 없다. 문서에 날짜가 있어도 작성 당시 기록으로 표시하고, 커밋에 여러 날의 작업이 묶였으면 모두 커밋 당일 활동이라고 적지 않는다.

예를 들어 최근 버스 도로 작업은 “웹에서 반복 배경이 첫 회전 뒤 멈추는 문제를 확인하고 플랫폼별 애니메이션 driver를 분리했다. 음성 완료 콜백과 정류장 이동 타이머의 의존도 제거해 도착까지 계속 주행하도록 수정했다. 기존 마을 장식을 활용해 도로 주변을 보강하고 브라우저·관련 테스트로 확인했다. Expo Go 실기기 검증은 남았다”라고 기록할 수 있다. 과거 날짜를 추정해서 붙이지 않는다.
