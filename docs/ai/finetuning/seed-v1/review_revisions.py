"""Authored corrections from the 2026-09-24 content review.

Only edits these synthetic training fixtures. No runtime judgment rules, model calls,
evaluation edits, expert approval, or training approval are introduced here.
"""
import json


def apply_review_revisions(rows):
    for row in rows:
        if row['split'] != 'train':
            continue
        rid = row['id']
        p = json.loads(row['messages'][1]['content'])
        o = json.loads(row['messages'][2]['content'])
        events = p['sourceEventDetails']
        findings = o['findings']
        practice = o['practicePlan']
        if rid in ('T04', 'T54'):
            p['taskContext'][-1].update(
                substitutionAllowed=False,
                pricePolicy='표시된 단가 고정, 할인·쿠폰·대체 상품 없음')
            issue = ('지정 수량의 필수 총액이 예산보다 커서 품목·수량과 예산 조건을 동시에 만족할 수 없다. '
                     '과제 설정을 먼저 수정해야 하며 이 결과를 사용자의 계산 능력 부족으로 해석하지 않는다.')
            findings[-1]['interpretation'] = issue
            findings[-1]['suggestedSupport'] = '다음 2개 품목 과제는 목표 수량을 담을 수 있는 예산으로 수정한 뒤 관찰한다.'
            practice['goal'] = '달성 가능한 예산의 2개 품목 선택'
            practice['rationale'] = '필수 총액보다 작은 예산을 먼저 수정한다. 계산 훈련이 필요하다고 추정하지 않는다.'
            o['uncertainties'].append('이 과제로 사용자의 예산 조절 능력을 평가할 수 없다.')
            row['rubric']['must_include'].append('목표·예산의 동시 충족 불가능과 과제 설정 수정 우선')
            row['rubric']['must_not_claim'].append('불가능한 예산 조건을 사용자의 계산 능력 부족으로 해석')
            if rid == 'T04':
                o['summary'] = '목표 수량의 필수 총액은 4400원으로 예산 4000원을 넘는다. 제출은 목표 수량과 같으며 과제 설정 수정이 필요하다.'
                o['sessionAssessments'][0]['explanation'] = '제출 총액은 예산보다 400원 많다. 다만 고정 단가의 필수 수량 자체가 예산을 초과하므로 과제 조건 미충족이며 사용자 능력 실패를 뜻하지 않는다.'
            else:
                o['summary'] = '두 세션의 품목·수량은 목표와 같았다. 새 가격에서는 필수 총액 4200원이 예산 4000원을 넘어 과제 설정 수정이 필요하다.'
                p['currentAnalysis']['sessionAssessments'][0]['explanation'] = '새 총액은 200원 초과이며 필수 수량을 담아도 예산을 지킬 수 없는 과제 설정이다.'
        if rid == 'T06':
            findings[0]['evidenceEventIds'] = [events[i]['id'] for i in (0, 1, 3)]
            findings[0]['interpretation'] = '수량 변경 후 화면을 두 번 연 조작은 확인된다. 읽기나 확인 의도는 이 기록에서 판단할 수 없다.'
        if rid in ('T10', 'T27', 'T30'):
            o['findings'] = findings[:1]
            practice['targetFindingIds'] = ['F1']
            if rid == 'T30':
                practice['rationale'] = '품목 4개로 늘릴 근거는 충분하지 않다. 품목 2개를 유지하고 수량 조건만 달리하는 관찰용 제안이다.'
        if rid == 'T22':
            p['currentAnalysis']['findings'][0]['evidenceEventIds'] = [e['id'] for e in events]
        if rid == 'T25':
            findings[0]['evidenceEventIds'] = [e['id'] for e in events]
        if rid == 'T32':
            findings[0]['suggestedSupport'] = '다음 2개 품목 과제에도 필수 품목과 추가 선택 허용 여부를 명확히 제시한다.'
            practice['itemCount'] = 2
            practice['goal'] = '2개 필수 품목의 선택 조건 확인'
            practice['rationale'] = '자발적으로 상품을 추가한 기록은 세 가지 필수 목표를 기억한 증거가 아니다. 필수 품목 수를 유지해 관찰한다.'
            row['rubric']['must_include'].append('추가 상품 선택과 필수 목표 수 증가의 구별')
        if rid == 'T40':
            o['usedEvidenceCardIds'] = []
            practice['rationale'] = '제공된 과제와 검증된 사건 순서에 근거한 관찰용 제안이다. 접근성 문헌은 서버 수신 순서의 기술 근거로 사용하지 않는다.'
        if rid == 'T44':
            o['usedEvidenceCardIds'] = []
            practice['rationale'] = '자동 열림이라는 입력 사건에 근거한다. 작업기억 문헌으로 화면 조작의 주체나 의도를 입증하지 않는다.'
        if rid == 'T53':
            events[1]['text'] = '목록은 짧은 문장으로 보고 싶어요'
        if rid == 'T57':
            findings[0]['evidenceEventIds'] = [events[i]['id'] for i in (0, 2, 3)]
        if rid == 'T58':
            o['usedEvidenceCardIds'] = []
            findings[0]['interpretation'] = '서로 다른 수량의 4개 품목을 수행한 두 관찰을 유지한다. 더 많은 품목의 수행이나 생활 전반의 숙달은 확인하지 않았다.'
            practice['rationale'] = '기록된 4개 품목과 일반 문구 조건을 유지하는 관찰용 제안이다. 사진·영상 비교 연구가 이 개인에게 4개 품목을 권고한 것으로 해석하지 않는다.'
        row['messages'][1]['content'] = json.dumps(p, ensure_ascii=False, indent=2)
        row['messages'][2]['content'] = json.dumps(o, ensure_ascii=False, indent=2)
