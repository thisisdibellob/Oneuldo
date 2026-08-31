import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const workspace = "/Users/bluem/Documents/GitHub/Oneuldo/.codex-tmp/personalization-ppt-detailed";
const starterPath = path.join(workspace, "template-starter.pptx");
const outputPath = "/Users/bluem/Downloads/oneuldo-personalization-system-presentation-detailed.pptx";
const renderDir = path.join(workspace, "final-render");
const layoutDir = path.join(workspace, "final-layout");
const sources = [
  "/Users/bluem/Documents/GitHub/Oneuldo/docs/ai/personalization-system.md",
  "/Users/bluem/Documents/GitHub/Oneuldo/docs/ai-data-rule/1.행동_로그_수집표.md",
  "/Users/bluem/Documents/GitHub/Oneuldo/docs/ai-data-rule/2.행동_로그_데이터_정규화.md",
  "/Users/bluem/Documents/GitHub/Oneuldo/docs/ai-data-rule/3.행동로그_근거자료_프로파일_설계.md",
  "/Users/bluem/Documents/GitHub/Oneuldo/docs/ai-data-rule/4.프로파일_LLM_입력_설계.md",
  "/Users/bluem/Downloads/oneuldo-ai-system-presentation-v2-slide12-black (1).pptx",
];

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
    maxChars: 90000,
  });
  const records = recordsFrom(snapshot.ndjson);

  function rewrite(slideNumber, name, nextText) {
    const record = records.find(
      (item) => item.kind === "textbox" && item.slide === slideNumber && item.name === name,
    );
    if (!record) throw new Error(`Missing textbox: slide=${slideNumber} name=${name}`);
    presentation.resolve(record.id).text = nextText;
  }

  const slides = {
    1: {
      "직사각형 23": "오늘도 · 개인화 시스템",
      "직사각형 1": "데이터로 난이도와 퀘스트를 개인화한다",
      "직사각형 2": "01",
      "직사각형 4": "장보기 플레이\n세부 행동 수집",
      "직사각형 6": "서버 정규화\n유효성·무결성",
      "직사각형 8": "기술 프로파일\n수행률·신뢰도",
      "직사각형 10": "AI 난이도 추천\n1~3 + 세부 조정",
      "직사각형 12": "AI 퀘스트 생성\n상품·수량·예산",
      "직사각형 14": "서버 검증·저장\n채택·fallback",
      "직사각형 20": "결정적 계산",
      "직사각형 21": "제한된 생성",
      "직사각형 22": "개인화의 핵심은 사용자를 진단하는 것이 아니라 다음 과제를 조정하는 것이다",
    },
    2: {
      "직사각형 35": "오늘도 · 개인화 시스템",
      "직사각형 1": "플레이 기록이 다음 플레이를 바꾸는 여섯 단계",
      "직사각형 2": "02",
      "직사각형 8": "01",
      "직사각형 9": "행동 로그",
      "직사각형 11": "선택·수량\n예산·지원",
      "직사각형 12": "02",
      "직사각형 13": "정규화",
      "직사각형 15": "결과·오류\n독립 수준",
      "직사각형 16": "03",
      "직사각형 17": "프로파일",
      "직사각형 19": "기술별 수행률\n근거·신뢰도",
      "직사각형 20": "04",
      "직사각형 21": "AI 난이도",
      "직사각형 23": "1~3단계\n지원·복잡도",
      "직사각형 24": "05",
      "직사각형 25": "AI 퀘스트",
      "직사각형 27": "품목·수량\n예산·안내",
      "직사각형 28": "06",
      "직사각형 29": "검증·플레이",
      "직사각형 31": "서버 승인 후\n실제 제공",
      "직사각형 32": "반복 구조",
      "직사각형 33": "새 행동이 다시 로그가 되고 프로파일과 다음 퀘스트를 갱신한다",
    },
    3: {
      "직사각형 25": "오늘도 · 개인화 시스템",
      "직사각형 1": "장보기에서는 네 가지 생활 기술을 따로 관찰한다",
      "직사각형 2": "03",
      "직사각형 4": "언어 이해",
      "직사각형 5": "·",
      "직사각형 7": "수 개념",
      "직사각형 8": "·",
      "직사각형 10": "돈 관리",
      "직사각형 11": "·",
      "직사각형 13": "계획과 순서",
      "직사각형 14": "·",
      "직사각형 16": "데이터 품질",
      "직사각형 17": "상품을 이해하고 고르기",
      "직사각형 18": "필요 상품 선택\n상품 누락\n목록 밖 상품\n안내 이해",
      "직사각형 19": "수량·예산·순서",
      "직사각형 20": "요구 수량 일치\n예산 안에서 완료\n목록 확인\n과제 완료 순서",
      "직사각형 21": "해석 원칙",
      "직사각형 22": "한 행동으로 단정하지 않음\n반복 평가 근거 사용\n진단·IQ 추정 금지\n근거 부족을 별도 표시",
    },
    4: {
      "직사각형 13": "오늘도 · 개인화 시스템",
      "직사각형 1": "행동 로그는 한 번의 플레이를 재현할 수 있게 남긴다",
      "직사각형 2": "04",
      "직사각형 4": "수집 단위",
      "직사각형 5": "마트 입장부터 계산 또는 중단까지를 하나의 sessionId로 묶습니다.\n첫 수행은 ASSESSMENT_TASK, 같은 과제 재수행은 TRAINING_TASK로 분리합니다.",
      "직사각형 6": "연결 정보",
      "직사각형 7": "• sessionId · eventSequence\n• questInstanceId · contentSource\n• taskId · taskVersion · difficulty\n• occurredAt · clientEventId\n• supportContext · sessionEnd",
      "직사각형 8": "행동 로그 예시",
      "직사각형 10": "eventCode  SHOP.QUANTITY_CHANGED\nstepOutcome  FAILURE\nproductId  apple\nrequiredQuantity  2\nselectedQuantity  1\npromptLevel  0\ncontentSource  GENERATED",
      "직사각형 11": "아직 능력 판정은 아님",
      "직사각형 12": "이 로그는 ‘사과 수량이 달랐다’는 관찰 사실\n→ 서버 검증과 반복 근거 집계 후에만 프로파일에 반영",
    },
    5: {
      "직사각형 22": "오늘도 · 개인화 시스템",
      "직사각형 1": "정규화가 게임 행동을 비교 가능한 기술 근거로 바꾼다",
      "직사각형 2": "05",
      "직사각형 3": "정규화 결과 예시",
      "직사각형 5": "event  SHOP.QUANTITY_CHANGED\n\noutcome  FAILURE\n\nerror  QUANTITY_ERROR\n\nindependence  INDEPENDENT\nskill  NUMERACY · NEGATIVE",
      "직사각형 6": "서버 정규화 검사",
      "직사각형 8": "형식",
      "직사각형 9": "eventCode · payload 필수값",
      "직사각형 11": "유효성",
      "직사각형 12": "기술 오류 · 접근성 · 직접 개입",
      "직사각형 14": "무결성",
      "직사각형 15": "COMPLETE · 순번 누락 없음",
      "직사각형 17": "용도",
      "직사각형 18": "평가 · 훈련 · 중립 · 제외 분리",
      "직사각형 20": "점수 반영 원칙",
      "직사각형 21": "SUCCESS는 긍정, FAILURE는 부정 / 중립·미완료·조력자 개입은 성공률에서 제외",
    },
    6: {
      "직사각형 13": "오늘도 · 개인화 시스템",
      "직사각형 1": "같은 성공도 도움 여부에 따라 따로 계산한다",
      "직사각형 2": "06",
      "직사각형 4": "두 성공률의 의미",
      "직사각형 5": "독립 성공률은 promptLevel 0에서 스스로 수행한 비율입니다.\n지원 성공률은 promptLevel 1~3의 힌트·안내를 받은 상태에서 성공한 비율입니다.",
      "직사각형 6": "계산식",
      "직사각형 7": "• 독립 = 독립 긍정 ÷ (독립 긍정+부정)\n• 지원 = 지원 긍정 ÷ (지원 긍정+부정)\n• NEUTRAL · INCOMPLETE 제외\n• ASSISTED 직접 개입 제외",
      "직사각형 8": "수 개념 예시",
      "직사각형 10": "독립 수행\n긍정 3건 · 부정 2건\n→ independentSuccessRate  60%\n\n지원 수행\n긍정 3건 · 부정 1건\n→ supportedSuccessRate  75%",
      "직사각형 11": "왜 분리하는가",
      "직사각형 12": "독립 30%·지원 90%라면 안내가 있을 때 수행 가능\n단, 지원 성공률만으로 특정 지원의 효과를 확정하지 않음",
    },
    7: {
      "직사각형 22": "오늘도 · 개인화 시스템",
      "직사각형 1": "프로파일은 성공률보다 근거의 신뢰도를 먼저 본다",
      "직사각형 2": "07",
      "직사각형 3": "기술 프로파일 예시",
      "직사각형 5": "NUMERACY\n\n독립 성공률  60%\n지원 성공률  75%\n독립 근거  5건\n서로 다른 과제  2개\n서로 다른 세션  2회\n신뢰도  MEDIUM",
      "직사각형 6": "신뢰도와 근거 부족",
      "직사각형 8": "근거 수",
      "직사각형 9": "평가 가능한 근거 5건 이상",
      "직사각형 11": "과제 다양성",
      "직사각형 12": "서로 다른 taskId·version 2개 이상",
      "직사각형 14": "반복 관찰",
      "직사각형 15": "서로 다른 완료 세션 2회 이상",
      "직사각형 17": "데이터 품질",
      "직사각형 18": "제외율 · 순번 누락 · 상충 결과",
      "직사각형 20": "판단 보류",
      "직사각형 21": "근거가 부족하면 INSUFFICIENT_EVIDENCE로 표시하고 중간 난이도에서 추가 관찰",
    },
    8: {
      "직사각형 13": "오늘도 · 개인화 시스템",
      "직사각형 1": "AI에는 사용자를 식별할 수 없는 수행 요약만 보낸다",
      "직사각형 2": "08",
      "직사각형 4": "보내지 않는 정보",
      "직사각형 5": "이름·이메일·생년월일·회원 ID를 보내지 않습니다.\nIQ·장애 정보·진단 정보와 원본 행동 로그 전체도 전달하지 않습니다.",
      "직사각형 6": "전달하는 정보",
      "직사각형 7": "• 기술별 독립·지원 성공률\n• 평가 근거 수 · 신뢰도\n• 반복 강점 · 어려움 · 오류\n• 평균 지원 수준 · 안전 요약\n• 제외율 · 추가 관찰 기술",
      "직사각형 8": "비식별 프로파일 예시",
      "직사각형 10": "skillCode  NUMERACY\nindependentRate  60%\nsupportedRate  75%\nconfidence  MEDIUM\nevidenceCount  9\nrepeatedError  QUANTITY_ERROR\npreferredSupport  GUIDED",
      "직사각형 11": "비식별의 의미",
      "직사각형 12": "완전한 익명화가 아니라 외부 AI 입력에서 직접 식별자를 제거한 가명·집계 데이터",
    },
    9: {
      "직사각형 13": "오늘도 · 개인화 시스템",
      "직사각형 1": "프롬프트는 AI의 역할과 생성 범위를 동시에 제한한다",
      "직사각형 2": "09",
      "직사각형 4": "SYSTEM 지시",
      "직사각형 5": "게임 행동 프로파일만 사용합니다.\n사용자의 IQ·장애 정도·실생활 전체 능력을 추정하지 않습니다.\n근거 부족 상태와 서버 제한을 우선합니다.",
      "직사각형 6": "프롬프트 입력",
      "직사각형 7": "• personalizationMode · 선호\n• selectedSkills · successRate · confidence\n• strengths · difficulties · support\n• safety · dataQuality\n• 허용 상품 · 수량 · 예산 범위",
      "직사각형 8": "AI가 해야 하는 일",
      "직사각형 10": "1단계: 추천 난이도 1~3\nitemCount · quantityComplexity\nbudgetPressure · textSupport\n\n2단계: 해당 난이도의 퀘스트\n제목 · 목표 상품 · 수량 · 예산 · 안내",
      "직사각형 11": "AI가 하지 않는 일",
      "직사각형 12": "원본 로그 재해석 · 능력 진단 · 서버 허용 범위 밖 상품·수량·예산 생성",
    },
    10: {
      "직사각형 35": "오늘도 · 개인화 시스템",
      "직사각형 1": "AI는 난이도를 먼저 추천하고 그 범위 안에서 퀘스트를 만든다",
      "직사각형 2": "10",
      "직사각형 8": "01",
      "직사각형 9": "프로파일 입력",
      "직사각형 11": "기술 수행률\n신뢰도·선호",
      "직사각형 12": "02",
      "직사각형 13": "난이도 AI",
      "직사각형 15": "난이도 1~3\n세부 조정",
      "직사각형 16": "03",
      "직사각형 17": "범위 검증",
      "직사각형 19": "enum·수치\n사유 코드",
      "직사각형 20": "04",
      "직사각형 21": "퀘스트 AI",
      "직사각형 23": "품목·수량\n예산·문장",
      "직사각형 24": "05",
      "직사각형 25": "콘텐츠 검증",
      "직사각형 27": "중복·가격\n문장 길이",
      "직사각형 28": "06",
      "직사각형 29": "제공·저장",
      "직사각형 31": "generationId로\n플레이 연결",
      "직사각형 32": "실패 처리",
      "직사각형 33": "AI 실패 → 규칙형 난이도·미션 / 생성 출처와 실패 이유는 DB에 저장",
    },
    11: {
      "직사각형 22": "오늘도 · 개인화 시스템",
      "직사각형 1": "AI 생성물은 서버 검증과 감사 기록을 통과해야 플레이된다",
      "직사각형 2": "11",
      "직사각형 3": "검증된 퀘스트 예시",
      "직사각형 5": "난이도 2\n\n흰 우유 1개\n사과 2개\n오렌지 주스 1개\n\n예산 10,000원\ncontentSource  GENERATED",
      "직사각형 6": "서버 검증·저장",
      "직사각형 8": "구조",
      "직사각형 9": "난이도 · 상품 ID · 중복 · 수량",
      "직사각형 11": "가격",
      "직사각형 12": "목표 총액 ≤ 예산 ≤ 총액+4천원",
      "직사각형 14": "문장",
      "직사각형 15": "문장 수 · 80자 · 출력 형식",
      "직사각형 17": "추적",
      "직사각형 18": "원본 출력 · 재시도 · 최종본 · 지연시간",
      "직사각형 20": "DB 연결과 fallback",
      "직사각형 21": "market_ai_quest_generations.id → behavior_logs.quest_instance_id / 재실패하면 RULE_FALLBACK",
    },
    12: {
      "직사각형 23": "오늘도 · 개인화 시스템",
      "직사각형 1": "개인화는 관찰과 제한된 생성을 반복한다",
      "직사각형 2": "12",
      "직사각형 4": "행동 로그\n무엇을 했는가",
      "직사각형 6": "정규화\n쓸 수 있는 근거인가",
      "직사각형 8": "기술 프로파일\n어떤 지원이 필요한가",
      "직사각형 10": "AI 추천\n난이도·조정값",
      "직사각형 12": "AI 생성\n다음 장보기 미션",
      "직사각형 14": "다음 플레이\n새 근거 수집",
      "직사각형 20": "서버 계산",
      "직사각형 21": "AI 생성+검증",
      "직사각형 22": "핵심: 데이터는 판단 근거를 만들고, AI는 허용 범위 안에서 다음 과제를 구성한다",
    },
  };

  for (const [slideNumberText, replacements] of Object.entries(slides)) {
    const slideNumber = Number(slideNumberText);
    for (const [name, text] of Object.entries(replacements)) rewrite(slideNumber, name, text);
    const slide = presentation.slides.getItem(slideNumber - 1);
    slide.speakerNotes.textFrame.setText(`[Sources]\n${sources.join("\n")}`);
    slide.speakerNotes.setVisible(true);
  }

  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(
      path.join(renderDir, `${stem}.png`),
      await presentation.export({ slide, format: "png", scale: 2 }),
    );
    await fs.writeFile(
      path.join(layoutDir, `${stem}.layout.json`),
      await (await slide.export({ format: "layout" })).text(),
    );
  }

  await writeBlob(
    path.join(workspace, "final-montage.webp"),
    await presentation.export({ format: "webp", montage: true, scale: 1 }),
  );

  const finalInspect = await presentation.inspect({
    kind: "slide,textbox,shape,image,table,chart,notes",
    include: "id,slide,name,text,textPreview,bbox,isPlaceholder",
    maxChars: 120000,
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
