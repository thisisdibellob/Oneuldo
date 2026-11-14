#!/usr/bin/env python3
"""Render the measured comparison and human-readable source review, without new inference."""
import html
import json
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
data = json.loads((root / 'comparison/summary.json').read_text())
cases = json.loads((root / 'comparison/cases.json').read_text())
checks = json.loads((root / 'comparison/integrity.json').read_text())
notes_path = root / 'quality-review-notes.json'
notes = json.loads(notes_path.read_text())['entries'] if notes_path.exists() else []
manifest = json.loads((root / 'manifest.json').read_text())
freeze = json.loads((root / 'candidate-freeze-manifest.json').read_text())
e = html.escape


def clock(value):
    if value is None:
        return '—'
    value = round(value)
    return f'{value // 60}분 {value % 60:02d}초'


def duration(metrics):
    if metrics['analysisStatus'] == 'READY':
        return clock(metrics['analysisSeconds'])
    if metrics['status'] == 'FAILED':
        return f"분석 오류 ({clock(metrics['failedAttemptSeconds'])})"
    return '진행 중'


def text_list(values):
    return '<ul>' + ''.join('<li>' + e(v) + '</li>' for v in values) + '</ul>'


def raw_output(case, arm):
    folder = root / 'results' / arm / case['key']
    chunks = []
    for name, label in [('analysis', '행동 분석 원문'), ('profile', '개인 프로필 원문')]:
        path = folder / f'{name}.json'
        if not path.exists():
            continue
        value = json.loads(path.read_text())
        if name == 'profile':
            value = value.get('profile')
        chunks.append(f'<h4>{label}</h4><pre>{e(json.dumps(value, ensure_ascii=False, indent=2))}</pre>')
    return ''.join(chunks) or '<p>완료된 원문 없음. 실패·중간 응답은 model-calls.json에 보존.</p>'


finished = all(data[arm]['completed'] == 9 for arm in ['baseline', 'candidate'])
parts = ['''<!doctype html><html lang="ko"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>동일 기록 9개 · 캐시 없는 분석 비교</title>
<style>
body{max-width:1160px;margin:36px auto;padding:0 24px;color:#172536;background:#f6f8fb;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif}
h1{font-size:29px}h2{margin-top:34px;font-size:22px}h3{font-size:18px}h4{font-size:16px;margin-bottom:8px}
section,details{background:white;border:1px solid #dce3eb;border-radius:10px;padding:18px 22px;margin:16px 0}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:11px 9px;border-bottom:1px solid #dde4eb;text-align:left;vertical-align:top}
th{background:#eaf0f6}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.6;background:#f4f6f8;padding:15px;border-radius:7px}
summary{cursor:pointer;font-weight:650}.muted{color:#536577}.warning{border-left:4px solid #bd7433;padding-left:14px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:780px){.columns{display:block}body{padding:0 12px}table{font-size:12px}td,th{padding:8px 4px}}
</style>''']
parts += ['<h1>동일 기록 9개 · 캐시 없는 분석 비교</h1>',
          f'<p class="muted">2026-10-16~19 · 민재·서연·민수 각 3개 · 기존 v73 / 개선 {e(freeze["analysisVersion"])}</p>']
if not finished:
    parts.append('<p class="warning"><b>진행 중인 보고서예용. 최종 비교 결과가 아니에용.</b></p>')
    queue = json.loads((root / 'candidate-queue.json').read_text())
    if queue.get('status') == 'BLOCKED':
        a = data['candidate']['analysisStatuses'].get('READY', 0)
        p = data['candidate']['profileStatuses'].get('READY', 0)
        pending_a = queue.get('pendingCandidateAnalyses', 9-a)
        pending_p = queue.get('pendingCandidateProfiles', 9-p)
        parts.append(f'<p class="warning">학교 SSH 연결 단절로 측정이 중단된 상태예용. 기존 버전 9건의 처리는 끝났고, 개선 버전은 행동 분석 {a}건·프로필 {p}건이 정상 완료됐어용. 완료한 결과는 보존했고 행동 분석 {pending_a}건·프로필 {pending_p}건은 연결 복구 후 이어서 측정해야 해용.</p>')
parts.append('<p>기존 플레이 원본을 다시 분석한 실험이에용. 새로운 플레이나 학습 효과로 세지 않아용. 분석 처리 완료와 게임 목표 달성은 서로 다른 값이에용.</p>')
if finished:
    speed = data['analysis']
    reduction = speed['reductionPercent']
    if reduction is not None:
        verb = '감소' if reduction >= 0 else '증가'
        parts.append(f"<section><h2>확인된 결과</h2><p>양쪽에서 분석이 정상 완료된 {speed['pairedSuccessfulCases']}건의 평균은 {clock(speed['baselineMeanSeconds'])}에서 {clock(speed['candidateMeanSeconds'])}로 {abs(reduction):.1f}% {verb}했어용.</p>")
        if reduction < 50:
            parts.append('<p>이번 측정에서는 분석 시간을 절반으로 줄이지 못했어용.</p>')
        q = data['qualityReview']['candidate']
        if q['analysisCasesWithHighIssues'] or q['profileCasesWithHighIssues']:
            parts.append(f"<p class='warning'>원문 대조에서 중요한 사실 오류가 남은 분석 {len(q['analysisCasesWithHighIssues'])}건, 프로필 {len(q['profileCasesWithHighIssues'])}건을 확인했어용. 처리 완료율 향상을 내용 품질 유지로 해석하면 안 돼용.</p>")
        parts.append('</section>')
parts.append('<section><h2>처리 완료와 내용 검토</h2><table><tr><th>버전</th><th>처리 종료</th><th>분석 정상 완료</th><th>프로필 정상 완료</th><th>중요한 사실 오류가 발견된 분석</th><th>중요한 사실 오류가 발견된 프로필</th></tr>')
for arm, label in [('baseline', '기존'), ('candidate', '개선')]:
    x = data[arm]
    q = data['qualityReview'][arm]
    reviewed = len(q['reviewedCases'])
    issues = ', '.join(str(i) for i in q['analysisCasesWithHighIssues']) or '현재 검토에서 없음'
    profile_issues = ', '.join(str(i) for i in q['profileCasesWithHighIssues']) or '현재 검토에서 없음'
    parts.append(f"<tr><td>{label}</td><td>{x['completed']} / 9</td><td>{x['analysisStatuses'].get('READY',0)} / 9</td><td>{x['profileStatuses'].get('READY',0)} / 9</td><td>{issues}<br><small>원문 검토 {reviewed} / 9</small></td><td>{profile_issues}</td></tr>")
parts.append('</table><p class="muted">검사 통과와 내용 정확성은 별도로 검토했어용. 중요한 사실 오류는 존재하지 않는 제출, 시간 순서 반전, 실행 주체 혼동 등을 뜻해용. 세부 관찰 누락·표현 문제는 아래 기록별 검토에 따로 남겼어용.</p></section>')
parts.append('<section><h2>시간 비교</h2><table><tr><th>항목</th><th>비교 가능한 정상 완료 쌍</th><th>기존 평균</th><th>개선 평균</th><th>감소율</th></tr>')
for key, label in [('analysis', '행동 분석'), ('modelAnalysis', '행동 분석의 모델 호출만'), ('profile', '개인 프로필'), ('complete', '분석 + 프로필'), ('inclusive', '분석 + 프로필 + 시험용 캐시 제어')]:
    x = data[key]
    reduction = '—' if x['reductionPercent'] is None else f"{x['reductionPercent']:.1f}%"
    parts.append(f"<tr><td>{label}</td><td>{x['pairedSuccessfulCases']}개</td><td>{clock(x['baselineMeanSeconds'])}</td><td>{clock(x['candidateMeanSeconds'])}</td><td>{reduction}</td></tr>")
parts.append('</table><p class="muted">처리 시간에는 응답 수정·재시도가 포함돼용. 마지막 행에만 매 호출 전 캐시를 지우고 모델을 다시 올리는 시험용 제어 시간이 포함돼용. 작업 프로세스 재시작 대기와 밤사이 중단은 모두 제외했어용. 둘 다 정상 완료한 동일 기록끼리 평균을 비교하며, 오류로 끝난 시도는 아래에 별도로 표시해용.</p></section>')
parts.append('<section><h2>분석 단계별 모델 호출 시간</h2><table><tr><th>단계</th><th>기존 평균</th><th>개선 평균</th><th>호출 수 합계 · 기존 / 개선</th></tr>')
paired_count = data['analysis']['pairedSuccessfulCases']
for stage, label in [('observation','원본 구간 관찰'),('final_analysis','최종 분석 작성'),('repair','응답 수정'),('independent_review','독립 검증')]:
    b = data['pairedAnalysisStages']['baseline'][stage]
    a = data['pairedAnalysisStages']['candidate'][stage]
    parts.append(f"<tr><td>{label}</td><td>{clock(b['wallSeconds']/paired_count if paired_count else None)}</td><td>{clock(a['wallSeconds']/paired_count if paired_count else None)}</td><td>{b['calls']} / {a['calls']}</td></tr>")
parts.append('</table><p class="muted">양쪽에서 분석이 정상 완료된 같은 기록만 포함해용. 모델 호출만의 시간이며, 로컬 원본 준비·검사와 시험용 캐시 제거 시간은 포함하지 않아용.</p>')
if paired_count:
    b_obs = data['pairedAnalysisStages']['baseline']['observation']['wallSeconds'] / paired_count
    a_obs = data['pairedAnalysisStages']['candidate']['observation']['wallSeconds'] / paired_count
    a_model = data['modelAnalysis']['candidateMeanSeconds']
    share = a_obs / a_model * 100 if a_model else 0
    parts.append(f"<p>개선 후에도 원본 구간 관찰에 평균 {clock(a_obs)}가 들고, 분석 모델 호출 시간의 {share:.1f}%를 차지해용. 기존 관찰 평균 {clock(b_obs)}와 비교하면, 최종 출력·형식 수정 비용을 줄여도 가장 큰 단계는 크게 줄지 않은 점을 확인할 수 있어용.</p>")
parts.append(f"<p>오류로 끝난 시도까지 포함한 분석 처리 시간 합계: 기존 {clock(data['baseline']['analysisAttemptBurdenSeconds'])}, 개선 {clock(data['candidate']['analysisAttemptBurdenSeconds'])}. 완료율이 다르면 같은 결과를 얻는 속도와는 구별해서 읽어야 해용.</p></section>")
parts.append('<section><h2>9개 기록별 결과</h2><table><tr><th>기록</th><th>사건 수</th><th>기존 분석</th><th>개선 분석</th><th>기존 / 개선 호출 수<br>분석 + 프로필</th><th>기존 / 개선 과제 판정</th></tr>')
stages = {'baseline-pre': '1차 기초 전', 'recommendation-2': '2차 추천 2', 'baseline-post': '3차 기초 후'}
for c in cases:
    b, a = c['baseline'], c['candidate']
    judgments = lambda x: ', '.join({'FAILURE':'목표 미달','SUCCESS':'목표 달성','UNDETERMINED':'판단 유보'}.get(v,v) for v in x['judgments']) or '완료 원문 없음'
    parts.append(f"<tr><td>{e(c['persona'])}<br>{stages[c['stage']]}</td><td>{c['events']:,}</td><td>{duration(b)}</td><td>{duration(a)}</td><td>{b['analysisCalls']}+{b['profileCalls']} / {a['analysisCalls']}+{a['profileCalls']}</td><td>{judgments(b)} / {judgments(a)}</td></tr>")
parts.append('</table></section>')
parts.append('<section><h2>이번에 바꾼 부분</h2>' + text_list([
    '근거가 없는 대안 설명을 억지로 한 개씩 쓰게 하던 모순된 관찰 지시를 없앴고, 서로 다른 행동·반례·한계는 남기면서 중복 문장을 줄이도록 했어용.',
    '이미 값이 정해진 매대 식별 표는 서버가 원본에서 그대로 복사하게 했어용. AI가 같은 표를 다시 출력하는 비용을 줄이고, 기존 근거·내용 검사는 유지했어용.',
    '최종 응답을 목표 확인 → 성패 판단 → 관찰·불확실성 → 다음 연습 순서로 생성하도록 바꿨어용.',
    '개인 프로필의 필수 필드와 사용 가능한 근거 번호를 출력 스키마로 제한해, 필드 누락과 잘못된 근거 번호로 인한 재시도를 줄이도록 했어용.',
    '테스트용 AI 서버의 입력 처리 묶음을 512에서 1,024로 설정했어용. 모델·양자화·컨텍스트·출력 상한은 동일해용.',
    '압축 표의 행 번호를 사건 번호로 혼동하지 않도록 원본 사건 번호·시각·실행 주체 대조표를 추가했고, 독립 검토에서도 시간 순서와 실행 주체를 확인하게 했어용. 전체 원본은 그대로 제공해용.',
    '본문의 근거 번호 괄호만 기존 허용 형식과 정확히 동일하게 제거하는 처리는 추가 AI 호출 없이 수행해용. 나머지 문장·수량·판정·근거 배열은 유지하고, 기존 원본 대조와 독립 의미 검증을 다시 거쳐용.'
]) + '</section>')
test_rows = []
for name, label in [('backend', '백엔드 전체'), ('ai-gateway', 'AI 게이트웨이'), ('v76ServiceRegression', '핵심 서비스 회귀 검사')]:
    t = freeze['tests'][name]
    test_rows.append(f"{label}: {t['passed']}개 통과, {t['skipped']}개 건너뜀, {t['failures'] + t['errors']}개 실패")
parts.append('<section><h2>코드 검증 범위</h2>' + text_list(test_rows) + '<p class="muted">고정한 개선 버전의 검사 결과예용. 핵심 서비스 검사는 전체 검사와 겹치므로 합산하지 않아용. 코드 검사 통과와 실제 AI 응답의 사실 정확성도 별개예용. 운영 서비스 배포 여부를 뜻하지 않아용.</p></section>')
parts.append('<section><h2>원본·캐시 검사와 비교 범위</h2>' + text_list([
    f"원본 사건 {sum(c['eventCount'] for c in manifest['cases']):,}개. 9개 입력의 SHA-256은 양쪽에서 같은 원본을 가리켜용.",
    '결과·체크포인트를 읽어 재사용하지 않았고, 매 모델 호출 전에 모델을 내렸다가 빈 입력으로 다시 올렸어용. 호출별 cachedPromptTokens 원문은 model-calls.json에 남겼어용.',
    '이번 9개는 모두 종료 시 장바구니가 빈 기록이에용. 목표 달성 사례의 성공 판정까지 검증한 실험은 아니에용.',
    '각 기록·버전에서 한 번씩 생성한 비교예용. 고정 시드를 요청했지만 게이트웨이가 전달하지 않아, 모델 응답의 확률적 변동은 통제하지 못했어용.',
    '초기 v74 시험 1건에서 시간 순서를 잘못 해석한 문장을 발견했고 v75에서 수정했어용. v75의 단순 인용 형식 수정 호출도 없앤 최종 v76으로 개선안 9건을 통일했어용. 앞선 시험 응답은 버전별로 별도 보존했어용. 빠른 응답이어도 내용 오류가 있으면 품질 유지로 인정하지 않아용.',
    '기존 서연 첫 기록의 분석 완료 후 테스트 도구가 과거 자료를 읽다 메모리 부족으로 종료됐어용. 완료된 원문은 보존했고, 자료를 내용 변경 없이 파일별로 나눠 필요한 것만 읽고 프로필 단계를 이어갔어용. 중단·복구 시간은 기록의 stageRestartGapSeconds와 wallClockSpanSeconds에 남겼어용.',
    '이후 분석은 512 MiB, 프로필은 4 GiB의 별도 테스트 프로세스에서 실행했어용. AI 서버와 추론 설정은 유지했어용. 모델 호출 시간도 별도로 제공하므로 로컬 도구의 준비 시간을 구분할 수 있어용.',
    '10월 16일 SSH 연결 중단으로 다음 날 이어서 측정했어용. 서버 프로세스·모델·고정 소스 해시를 다시 확인했고, 연결 실패 원문은 infrastructure-recovery-2-ssh에 보존했어용. 완료된 분석은 보존한 채 추론 응답이 없던 프로필 단계부터 재개했으며, 밤사이 대기를 AI 처리 시간으로 계산하지 않아용.',
    '재개 시 테스트 서버가 다른 카드의 Vulkan 실행기를 선택한 것을 발견했어용. 해당 프로필 시도는 결과를 보기 전에 비교 제외를 결정하고 별도 보존했어용. 이후 테스트 서버에만 Vulkan을 비활성화하고 GPU 고유 번호를 지정해 기존 CUDA 카드로 복구했어용. 진단·복구 시도는 공식 9건의 시간에 섞지 않았어용.',
    '10월 18일 13:48 덮개 잠자기(Clamshell Sleep)와 14:05 깨우기가 macOS 기록으로 확인됐어용. 당시 진행 중이던 서연 두 번째 분석은 SSH 응답이 끊겼고, 완료된 분석은 없었어용. 중간 관찰 응답 2개와 약 17분의 중단 증거를 infrastructure-recovery-6-clamshell에 보존했으며 공식 비교에서 제외했어용. 재개 후 중간 관찰 캐시를 사용하지 않고 해당 기록 전체를 다시 분석했어용.',
    '10월 18일 14:55에도 덮개 잠자기가 기록됐고 민수 두 번째 기록은 원본 관찰 7구간 이후 최종 응답 연결이 끊겼어용. 승인된 분석은 없었으며 중간 기록은 infrastructure-recovery-7-clamshell에 보존했어용. 10월 19일 동일 원본·코드·모델·GPU를 확인하고 남은 두 기록을 캐시 없이 다시 실행했어용. 중단 시간을 분석 속도 비교에 섞지 않았어용.',
    '검사 통과만으로 내용의 정확성을 확정하지 않아용. 아래 검토는 실제 사건과 최종 문장을 대조한 결과예용.'
]) + '</section>')
parts.append('<h2>기록별 내용 검토와 분석 원문</h2>')
for c in cases:
    parts.append(f"<details><summary>{c['case']}. {e(c['persona'])} · {stages[c['stage']]}</summary>")
    for arm, label in [('baseline','기존'),('candidate','개선')]:
        found = [n for n in notes if n['case'] == c['case'] and n['arm'] == arm]
        parts.append(f'<h3>{label} 내용 검토</h3>')
        if not found:
            parts.append('<p class="muted">원문 대조 검토 대기.</p>')
        for n in found:
            if n.get('strengths'):
                parts.append(text_list(n['strengths']))
            for issue in n.get('issues', []):
                parts.append(f"<p class='warning'><b>{e(issue.get('severity',''))} · {e(issue.get('scope',''))}</b> {e(issue['text'])}</p>")
            if n.get('failure'):
                parts.append('<p>' + e(n['failure']) + '</p>')
            if n.get('profileFailure'):
                parts.append('<p>프로필 처리 실패: ' + e(n['profileFailure']) + '</p>')
        parts.append(f'<details><summary>{label} 원문 펼치기</summary>{raw_output(c,arm)}</details>')
    parts.append('</details>')
parts.append('<p class="muted">기계 집계: comparison/summary.json · 사례별 수치: comparison/timings.csv · 원본 인용 검사: comparison/integrity.json · 검토 기록: quality-review-notes.json</p></html>')
(root / 'comparison/report.html').write_text('\n'.join(parts))
print(root / 'comparison/report.html')
