import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const workspace = "/Users/bluem/Documents/GitHub/Oneuldo/.codex-tmp/personalization-ppt";
const starterPath = path.join(workspace, "template-starter.pptx");
const outputPath = "/Users/bluem/Downloads/oneuldo-personalization-system-presentation.pptx";
const renderDir = path.join(workspace, "final-render");
const layoutDir = path.join(workspace, "final-layout");
const sourceDoc = "/Users/bluem/Documents/GitHub/Oneuldo/docs/ai/personalization-system.md";

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function recordsFrom(ndjson) {
  return ndjson.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function main() {
  await fs.mkdir(renderDir, { recursive: true });
  await fs.mkdir(layoutDir, { recursive: true });

  const presentation = await PresentationFile.importPptx(await FileBlob.load(starterPath));
  const snapshot = await presentation.inspect({
    kind: "slide,textbox,shape,notes",
    include: "id,slide,name,text,textPreview,bbox",
    maxChars: 50000,
  });
  const records = recordsFrom(snapshot.ndjson);

  function rewrite(slide, name, nextText) {
    const record = records.find((item) => item.kind === "textbox" && item.slide === slide && item.name === name);
    if (!record) throw new Error(`Missing textbox: slide=${slide} name=${name}`);
    const target = presentation.resolve(record.id);
    target.text = nextText;
  }

  const slides = {
    1: {
      "직사각형 23": "오늘도 · 개인화 시스템",
      "직사각형 1": "행동 근거가 다음 장보기 퀘스트를 바꾼다",
      "직사각형 2": "01",
      "직사각형 4": "장보기 플레이\n세부 행동 수집",
      "직사각형 6": "행동 정규화\n유효성·세션 검증",
      "직사각형 8": "기술별 프로파일\n성공률·신뢰도",
      "직사각형 10": "AI 난이도 추천\n1~3 + 조정값",
      "직사각형 12": "AI 퀘스트 생성\n상품·수량·예산",
      "직사각형 14": "서버 검증\n채택·fallback",
      "직사각형 20": "비식별",
      "직사각형 21": "AI 2단계",
      "직사각형 22": "진단이 아니라 게임 안의 관찰 근거를 다음 과제에 반영한다",
    },
    2: {
      "직사각형 35": "오늘도 · 개인화 시스템",
      "직사각형 1": "개인화는 여섯 단계로 이어진다",
      "직사각형 2": "02",
      "직사각형 8": "01",
      "직사각형 9": "행동 수집",
      "직사각형 11": "sessionId\n행동·결과",
      "직사각형 12": "02",
      "직사각형 13": "정규화",
      "직사각형 15": "유효성\n순번·지원",
      "직사각형 16": "03",
      "직사각형 17": "프로파일",
      "직사각형 19": "기술별 성공률\n신뢰도",
      "직사각형 20": "04",
      "직사각형 21": "AI 난이도",
      "직사각형 23": "1~3단계\n세부 조정",
      "직사각형 24": "05",
      "직사각형 25": "AI 퀘스트",
      "직사각형 27": "상품·수량\n예산·안내",
      "직사각형 28": "06",
      "직사각형 29": "검증·플레이",
      "직사각형 31": "서버 승인 후\n실제 제공",
      "직사각형 32": "실패 처리",
      "직사각형 33": "AI 실패 → 규칙형 추천·미션 → 플레이 기록은 계속 연결",
    },
    3: {
      "직사각형 13": "오늘도 · 개인화 시스템",
      "직사각형 1": "한 번의 장보기는 세션 단위 행동 로그로 남는다",
      "직사각형 2": "03",
      "직사각형 4": "수집 원칙",
      "직사각형 5": "화면을 눌렀다는 사실보다 판정 가능한 행동을 기록합니다.\n평가와 훈련을 분리하고, 개인정보·영상은 수집하지 않습니다.",
      "직사각형 6": "세션 연결 정보",
      "직사각형 7": "• sessionId · eventSequence\n• questInstanceId · contentSource\n• difficulty · evidenceContext\n• occurredAt · clientEventId\n• 완료 결과 · 수행 시간",
      "직사각형 8": "원본 로그 예시",
      "직사각형 10": "eventCode  SHOP.QUANTITY_CHANGED\nstepOutcome  FAILURE\nitemId  apple\nrequiredQuantity  2\nselectedQuantity  1\ndifficulty  2\ncontentSource  GENERATED",
      "직사각형 11": "이 값이 의미하는 것",
      "직사각형 12": "관찰된 수량 불일치일 뿐, 아직 ‘수 개념 부족’ 판정이 아님\n→ 서버 정규화와 반복 근거 집계가 먼저",
    },
    4: {
      "직사각형 22": "오늘도 · 개인화 시스템",
      "직사각형 1": "원본 실패는 검증을 통과해야 기술 근거가 된다",
      "직사각형 2": "04",
      "직사각형 3": "정규화 결과 예시",
      "직사각형 5": "event  SHOP.QUANTITY_CHANGED\n\noutcome  FAILURE\n\nerror  QUANTITY_ERROR\n\nskill  NUMERACY · NEGATIVE",
      "직사각형 6": "서버 정규화",
      "직사각형 8": "등록",
      "직사각형 9": "이벤트 코드 · payload 필수값",
      "직사각형 11": "유효성",
      "직사각형 12": "기술 오류 · 조력자 개입 제외",
      "직사각형 14": "무결성",
      "직사각형 15": "COMPLETE 세션 · 순번 확인",
      "직사각형 17": "근거",
      "직사각형 18": "평가/훈련 분리 · 긍정/부정",
      "직사각형 20": "격리·제외",
      "직사각형 21": "미등록·필수값 누락은 격리 / 기술·접근성 오류는 점수에서 제외",
    },
    5: {
      "직사각형 25": "오늘도 · 개인화 시스템",
      "직사각형 1": "프로파일은 수행률과 근거의 신뢰도를 함께 저장한다",
      "직사각형 2": "05",
      "직사각형 4": "언어 이해",
      "직사각형 5": "·",
      "직사각형 7": "수 개념",
      "직사각형 8": "·",
      "직사각형 10": "돈 관리",
      "직사각형 11": "·",
      "직사각형 13": "계획과 순서",
      "직사각형 14": "·",
      "직사각형 16": "데이터 품질",
      "직사각형 17": "기술별 계산",
      "직사각형 18": "독립 성공률\n지원 성공률\n평가 근거 수\n반복 세션 수\n신뢰도",
      "직사각형 19": "반복 행동 패턴",
      "직사각형 20": "2회 이상 반복된\n강점·어려움\n오류 유형\n지원 수준",
      "직사각형 21": "근거 부족 표시",
      "직사각형 22": "근거 5건 미만\n단일 과제·세션\n상충 결과\n높은 제외율",
    },
    6: {
      "직사각형 13": "오늘도 · 개인화 시스템",
      "직사각형 1": "AI에는 비식별 프로파일만 전달한다",
      "직사각형 2": "06",
      "직사각형 4": "SYSTEM",
      "직사각형 5": "제공된 게임 행동 프로파일만 사용합니다.\nIQ·장애 정도·실생활 전체 능력을 추정하지 않고\n근거가 부족하면 난이도 2를 우선 고려합니다.",
      "직사각형 6": "PROMPT 입력 핵심",
      "직사각형 7": "• 개인화 모드 · 사용자 선호\n• 기술별 성공률 · 신뢰도\n• 반복 강점 · 어려움\n• 지원 · 안전 · 데이터 품질\n• 허용 상품 · 수치 제한",
      "직사각형 8": "비식별 입력 예시",
      "직사각형 10": "mode  BEHAVIOR_INFORMED\nNUMERACY success  60%\nconfidence  MEDIUM\nquantity error  2회 반복\nEXECUTIVE confidence  INSUFFICIENT\nexcluded event rate  4.2%\npreferred support  GUIDED",
      "직사각형 11": "1단계 · AI 추천 난이도",
      "직사각형 12": "difficulty 2 · itemCount 3 · quantity MEDIUM\nbudget MEDIUM · text STANDARD",
    },
    7: {
      "직사각형 22": "오늘도 · 개인화 시스템",
      "직사각형 1": "AI 추천 난이도로 퀘스트를 만들고 서버가 최종 승인한다",
      "직사각형 2": "07",
      "직사각형 3": "2단계 · AI 생성 결과 예시",
      "직사각형 5": "난이도 2 · 품목 3개\n\n흰 우유 1개\n사과 2개\n오렌지 주스 1개\n\n예산 10,000원\n“상품 이름과 필요한 개수를 확인해요.”",
      "직사각형 6": "서버 검증",
      "직사각형 8": "난이도",
      "직사각형 9": "AI 추천값과 정확히 일치",
      "직사각형 11": "상품",
      "직사각형 12": "허용 ID · 중복 금지 · 2~4개",
      "직사각형 14": "수치",
      "직사각형 15": "수량 1~3 · 예산 총액+4천원 이내",
      "직사각형 17": "문장",
      "직사각형 18": "개수 · 80자 · 출력 형식",
      "직사각형 20": "실패 처리",
      "직사각형 21": "1회 수정 생성 → 재실패하면 규칙형 미션 → contentSource로 출처 표시",
    },
    8: {
      "직사각형 23": "오늘도 · 개인화 시스템",
      "직사각형 1": "개인화는 관찰과 생성을 반복한다",
      "직사각형 2": "08",
      "직사각형 4": "행동 로그\n무엇을 했는가",
      "직사각형 6": "정규화\n쓸 수 있는 근거인가",
      "직사각형 8": "프로파일\n어떤 지원이 필요한가",
      "직사각형 10": "AI 추천\n난이도 1~3",
      "직사각형 12": "AI 생성\n다음 장보기 미션",
      "직사각형 14": "다음 플레이\n새 근거 수집",
      "직사각형 20": "완료 세션",
      "직사각형 21": "제한된 생성",
      "직사각형 22": "핵심: 관찰된 게임 행동을 다음 과제 조정에 사용한다",
    },
  };

  for (const [slideNumber, replacements] of Object.entries(slides)) {
    for (const [name, text] of Object.entries(replacements)) {
      rewrite(Number(slideNumber), name, text);
    }
    const slide = presentation.slides.getItem(Number(slideNumber) - 1);
    slide.speakerNotes.textFrame.setText(
      `[Sources]\n${sourceDoc}\n/Users/bluem/Downloads/oneuldo-ai-system-presentation-v2-slide12-black (1).pptx`,
    );
    slide.speakerNotes.setVisible(true);
  }

  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(path.join(renderDir, `${stem}.png`), await presentation.export({ slide, format: "png", scale: 2 }));
    const layout = await slide.export({ format: "layout" });
    await fs.writeFile(path.join(layoutDir, `${stem}.layout.json`), await layout.text());
  }

  const montage = await presentation.export({ format: "webp", montage: true, scale: 1 });
  await writeBlob(path.join(workspace, "final-montage.webp"), montage);

  const finalInspect = await presentation.inspect({
    kind: "slide,textbox,shape,image,table,chart,notes",
    include: "id,slide,name,text,textPreview,bbox,isPlaceholder",
    maxChars: 50000,
  });
  await fs.writeFile(path.join(workspace, "final-inspect.ndjson"), finalInspect.ndjson);

  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(outputPath);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
