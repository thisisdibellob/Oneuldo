#!/usr/bin/env python3
"""Read-only comparison of the frozen, paired cold analysis experiment."""
import argparse
import csv
import hashlib
import json
import statistics
from collections import Counter
from datetime import datetime
from pathlib import Path


def read(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def refs(value, field):
    if isinstance(value, dict):
        for key, child in value.items():
            if key == field and isinstance(child, list):
                yield from child
            else:
                yield from refs(child, field)
    elif isinstance(value, list):
        for child in value:
            yield from refs(child, field)


def mean(values):
    return statistics.mean(values) if values else None


def seconds(value):
    return '-' if value is None else f'{value / 60:.2f}분'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('run', type=Path)
    args = parser.parse_args()
    root = args.run.resolve()
    manifest = read(root / 'manifest.json')
    rows, integrity, full_text = [], [], []
    for index, case in enumerate(manifest['cases'], 1):
        source = Path(case['sourcePath'])
        raw = read(source)
        valid_ids = {e['behaviorLogId'] for s in raw['sessions'] for e in s['events']}
        ordered_ids = [e['behaviorLogId'] for s in raw['sessions'] for e in s['events']]
        valid_sessions = {s['sessionId'] for s in raw['sessions']}
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        item = {'case': index, 'key': case['key'], 'persona': case['persona'],
                'events': case['eventCount'], 'stage': case['stage']}
        check = {'case': index, 'sourceHashMatches': digest == case['sourceSha256'],
                 'eventCountMatches': len(valid_ids) == case['eventCount']}
        full_text.append(f"\n=== {index}. {case['persona']} / {case['stage']} ===\n")
        for arm in ('baseline', 'candidate'):
            folder = root / 'results' / arm / case['key']
            result = read(folder / 'result.json', {})
            calls = read(folder / 'model-calls.json', [])
            attempts = read(folder / 'attempts.json', [])
            profile_attempts = read(folder / 'profile-attempts.json', [])
            analysis = read(folder / 'analysis.json')
            profile = read(folder / 'profile.json')
            timing = [c.get('timing') or {} for c in calls]
            stages = {}
            audit_sources = {a['number']: a.get('source', '') for a in attempts}
            for call in calls:
                schema = call.get('schema') or {}
                properties = schema.get('properties') or {}
                audit_source = audit_sources.get(call.get('number'), '')
                try:
                    request_stage = json.JSONDecoder().raw_decode(call.get('inputPrompt', '').lstrip())[0].get('stage', '')
                except (ValueError, AttributeError):
                    request_stage = ''
                stage = ('profile' if call['phase'] == 'profile' else
                         'reduction' if 'observations' in properties and request_stage.startswith('REDUCE:') else
                         'observation' if 'observations' in properties else
                         'final_analysis' if 'reviewFormat' in properties else
                         'repair' if 'PATCH' in audit_source or 'patches' in properties else 'independent_review')
                group = stages.setdefault(stage, {'calls': 0, 'inputTokens': 0, 'outputTokens': 0,
                                                  'wallSeconds': 0, 'prefillSeconds': 0, 'decodeSeconds': 0})
                group['calls'] += 1
                for key in ['inputTokens', 'outputTokens', 'wallSeconds']:
                    group[key] += call.get(key) or 0
                t = call.get('timing') or {}
                group['prefillSeconds'] += (t.get('promptNs') or 0) / 1e9
                group['decodeSeconds'] += (t.get('outputNs') or 0) / 1e9
            metrics = {
                'status': result.get('status', 'PENDING'),
                'analysisVersion': result.get('analysisVersion'),
                'profileVersion': result.get('profileVersion'),
                'analysisStatus': result.get('analysisStatus', 'FAILED' if result.get('status') == 'FAILED' else 'PENDING'),
                'profileStatus': result.get('profileStatus', 'NOT_RUN' if result.get('status') == 'FAILED' else 'PENDING'),
                'analysisSeconds': result.get('analysisSecondsExcludingCacheControl'),
                'profileSeconds': result.get('profileSecondsExcludingCacheControl'),
                'failedAttemptSeconds': result.get('secondsExcludingCacheControl') if result.get('status') == 'FAILED' else None,
                'error': result.get('error'),
                'totalSeconds': result.get('secondsExcludingCacheControl'),
                'inclusiveSeconds': result.get('endToEndSeconds'),
                'wallClockSpanSeconds': result.get('activeWallClockSpanSeconds', ((datetime.fromisoformat(result['finishedAt'].replace('Z', '+00:00')) -
                                          datetime.fromisoformat(result['startedAt'].replace('Z', '+00:00'))).total_seconds()
                                         if result.get('finishedAt') else None)),
                'pausedBeforeRecoverySeconds': result.get('pausedBeforeRecoverySeconds',0),
                'stageRestartGapSeconds': result.get('stageRestartGapSeconds', 0),
                'cacheControlSeconds': result.get('cacheControlSeconds'),
                'calls': len(calls),
                'analysisCalls': sum(c['phase'] == 'analysis' for c in calls),
                'profileCalls': sum(c['phase'] == 'profile' for c in calls),
                'modelAnalysisSeconds': sum(c.get('wallSeconds', 0) for c in calls if c['phase'] == 'analysis'),
                'modelProfileSeconds': sum(c.get('wallSeconds', 0) for c in calls if c['phase'] == 'profile'),
                'inputTokens': sum(c.get('inputTokens') or 0 for c in calls),
                'outputTokens': sum(c.get('outputTokens') or 0 for c in calls),
                'prefillSeconds': sum(t.get('promptNs') or 0 for t in timing) / 1e9,
                'decodeSeconds': sum(t.get('outputNs') or 0 for t in timing) / 1e9,
                'queueSeconds': sum(t.get('queueMs') or 0 for t in timing) / 1000,
                'validationRejections': sum(bool(a.get('errorCode')) for a in attempts + profile_attempts),
                'validationCodes': dict(Counter((a.get('validationFailure') or {}).get('code') or a.get('errorCode')
                                               for a in attempts + profile_attempts if a.get('errorCode'))),
                'finishReasons': dict(Counter(c.get('finishReason', 'NO_RESPONSE') for c in calls)),
                'judgments': [a['judgment'] for a in (analysis or {}).get('sessionAssessments', [])],
                'findings': len((analysis or {}).get('findings', [])),
                'stages': stages,
            }
            item[arm] = metrics
            cited = set(refs(analysis or {}, 'evidenceEventIds'))
            cited_sessions = {s['sessionId'] for s in (analysis or {}).get('sessionAssessments', [])}
            observations = read(folder / 'source-observation-artifact.json')
            observed_ids = ([eid for part in observations['originalParts'] for eid in part['eventIds']]
                            if observations else None)
            check[arm] = {
                'completed': bool(result),
                'fullOrderedOriginalCoverage': result.get('fullOrderedOriginalCoverage'),
                'independentObservationCoverage': observed_ids == ordered_ids if observed_ids is not None else None,
                'resultCacheHits': result.get('aiResultCacheHits'),
                'allResponsesProveZeroCachedTokens': bool(calls) and all(t.get('cachedPromptTokens') == 0 for t in timing),
                'responseCount': len(calls),
                'missingCacheMeasurements': sum('cachedPromptTokens' not in t for t in timing),
                'allResponsesFreshRunner': bool(calls) and all(c.get('freshRunner') is True for c in calls),
                'finalResponseFormats': sorted({(c.get('schema') or {}).get('properties', {}).get('reviewFormat', {}).get('const')
                                                for c in calls
                                                if (c.get('schema') or {}).get('properties', {}).get('reviewFormat', {}).get('const')}),
                'profileCallsUseStructuredSchema': (all(c.get('schema') is not None for c in calls if c['phase'] == 'profile')
                                                   if any(c['phase'] == 'profile' for c in calls) else None),
                'foreignAnalysisEventIds': sorted(cited - valid_ids),
                'foreignAnalysisSessionIds': sorted(cited_sessions - valid_sessions),
                'citedAnalysisEventCount': len(cited),
            }
            if profile and profile.get('profile'):
                context = read(root / 'cases' / case['key'] / 'profile-context.json')
                history = read(root / 'sources' / 'members' / f"{context['memberId']}.json")
                historical_ids = {e['behaviorLogId'] for s in history['snapshots']
                                  for se in s['input_data']['sessions'] for e in se['events']}
                check[arm]['foreignProfileEventIds'] = sorted(set(refs(profile['profile'], 'evidenceEventIds')) - historical_ids)
            full_text.append(f"{arm}: {metrics['status']} / 분석 {seconds(metrics['analysisSeconds'])} / 프로필 {seconds(metrics['profileSeconds'])}\n")
            if analysis:
                full_text.append('분석 원문\n' + json.dumps(analysis, ensure_ascii=False, indent=2) + '\n')
            if profile:
                full_text.append('프로필 원문\n' + json.dumps(profile.get('profile'), ensure_ascii=False, indent=2) + '\n')
        b, c = item['baseline'], item['candidate']
        item['analysisSecondsSaved'] = (b['analysisSeconds'] - c['analysisSeconds']
                                       if b['analysisStatus'] == c['analysisStatus'] == 'READY' else None)
        rows.append(item)
        integrity.append(check)

    def compare(field, status_field, subset=None):
        eligible = [r for r in (rows if subset is None else subset)
                    if r['baseline'][status_field] == r['candidate'][status_field] == 'READY']
        before = [r['baseline'][field] for r in eligible]
        after = [r['candidate'][field] for r in eligible]
        return {'pairedSuccessfulCases': len(eligible), 'baselineMeanSeconds': mean(before),
                'candidateMeanSeconds': mean(after),
                'baselineMedianSeconds': statistics.median(before) if before else None,
                'candidateMedianSeconds': statistics.median(after) if after else None,
                'reductionPercent': (1 - sum(after) / sum(before)) * 100 if before and sum(before) else None}

    summary = {'selectionRule': manifest['selectionRule'], 'newGameplay': False,
               'analysis': compare('analysisSeconds', 'analysisStatus'),
               'modelAnalysis': compare('modelAnalysisSeconds', 'analysisStatus'),
               'profile': compare('profileSeconds', 'profileStatus'),
               'modelProfile': compare('modelProfileSeconds', 'profileStatus'),
               'complete': compare('totalSeconds', 'status'),
               'inclusive': compare('inclusiveSeconds', 'status'),
               'wallClock': compare('wallClockSpanSeconds', 'status')}
    summary['byPersona'] = {
        name: compare('analysisSeconds', 'analysisStatus', [r for r in rows if r['persona'] == name])
        for name in dict.fromkeys(r['persona'] for r in rows)
    }
    matched_analysis = [r for r in rows if r['baseline']['analysisStatus'] == r['candidate']['analysisStatus'] == 'READY']
    summary['pairedAnalysisStages'] = {
        arm: {
            stage: {
                key: sum(r[arm]['stages'].get(stage, {}).get(key, 0) for r in matched_analysis)
                for key in ['calls', 'inputTokens', 'outputTokens', 'wallSeconds', 'prefillSeconds', 'decodeSeconds']
            }
            for stage in ['observation', 'reduction', 'final_analysis', 'repair', 'independent_review']
        } for arm in ('baseline', 'candidate')
    }
    reviews = read(root / 'quality-review-notes.json', {}).get('entries', [])
    summary['qualityReview'] = {
        arm: {
            'reviewedCases': sorted({r['case'] for r in reviews if r['arm'] == arm}),
            'taskOutcomeCorrectCases': sum(r.get('taskOutcomeCorrect') is True for r in reviews if r['arm'] == arm),
            'taskOutcomeIncorrectCases': sum(r.get('taskOutcomeCorrect') is False for r in reviews if r['arm'] == arm),
            'analysisCasesWithHighIssues': sorted({r['case'] for r in reviews if r['arm'] == arm
                and any(i.get('scope') == 'analysis' and i.get('severity') == 'high' for i in r.get('issues', []))}),
            'profileCasesWithHighIssues': sorted({r['case'] for r in reviews if r['arm'] == arm
                and any(i.get('scope') == 'profile' and i.get('severity') == 'high' for i in r.get('issues', []))}),
        } for arm in ('baseline', 'candidate')
    }
    for arm in ('baseline', 'candidate'):
        known = [r[arm] for r in rows]
        complete = [r[arm] for r in rows if r[arm]['status'] in ['READY', 'PROFILE_FAILED', 'FAILED']]
        summary[arm] = {
            'completed': len(complete),
            'analysisVersions': sorted({r['analysisVersion'] for r in known if r['analysisVersion']}),
            'profileVersions': sorted({r['profileVersion'] for r in known if r['profileVersion']}),
            'statuses': dict(Counter(r['status'] for r in complete)),
            'analysisStatuses': dict(Counter(r['analysisStatus'] for r in known)),
            'profileStatuses': dict(Counter(r['profileStatus'] for r in known)),
            'attemptBurdenSeconds': sum(r['totalSeconds'] or 0 for r in complete),
            'analysisAttemptBurdenSeconds': sum((r['analysisSeconds'] if r['analysisStatus'] == 'READY'
                                                else r['failedAttemptSeconds']) or 0 for r in known),
            'inclusiveAttemptBurdenSeconds': sum(r['inclusiveSeconds'] or 0 for r in complete),
            'wallClockSpanSeconds': sum(r['wallClockSpanSeconds'] or 0 for r in complete),
            **{k: sum(r[k] for r in complete) for k in ['calls', 'analysisCalls', 'profileCalls', 'inputTokens',
                                                      'outputTokens', 'prefillSeconds', 'decodeSeconds',
                                                      'queueSeconds', 'validationRejections']},
        }
    out = root / 'comparison'
    out.mkdir(exist_ok=True)
    for name, value in [('summary', summary), ('cases', rows), ('integrity', integrity)]:
        (out / f'{name}.json').write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    (out / 'paired-original-outputs.txt').write_text('동일 기록 재분석 원문 비교. 이전 분석과 새로운 플레이를 혼동하지 않는다.\n' + '\n'.join(full_text))
    with (out / 'timings.csv').open('w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(['case', 'persona', 'stage', 'events', 'arm', 'status', 'analysis_seconds',
                         'profile_seconds', 'total_seconds', 'work_including_cache_clear_seconds', 'calls', 'input_tokens',
                         'output_tokens', 'prefill_seconds', 'decode_seconds', 'validation_rejections'])
        for r in rows:
            for arm in ('baseline', 'candidate'):
                x = r[arm]
                writer.writerow([r['case'], r['persona'], r['stage'], r['events'], arm, x['status'],
                                 *[x[k] for k in ['analysisSeconds', 'profileSeconds', 'totalSeconds',
                                                  'inclusiveSeconds', 'calls', 'inputTokens', 'outputTokens',
                                                  'prefillSeconds', 'decodeSeconds', 'validationRejections']]])
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
