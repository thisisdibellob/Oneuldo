#!/usr/bin/env python3
"""Freeze existing real-play sources and v73; never write the historical run."""
import datetime, hashlib, json, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HIST = ROOT / 'output/persona45-speed-20261014'
RUN = ROOT / 'output/analysis-nine-cold-20261016'
BASE = Path('/Users/bluem/.codex/worktrees/persona45-plan-reference-repair/Oneuldo')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def main():
    if (RUN / 'manifest.json').exists():
        raise SystemExit('Existing freeze preserved; do not rerun preparation')
    snapshots = json.loads((HIST / 'auditor/input-snapshots.json').read_text())
    analyses = json.loads((HIST / 'auditor/analyses.json').read_text())
    profiles = json.loads((HIST / 'auditor/profiles.json').read_text())
    cases = []
    for prefix, persona in [('adult-minjae-unit-support-research-v2','민재'),('careful-checker','서연'),('quick-decider','민수')]:
        for n, stage in [(1,'baseline-pre'),(2,'recommendation-2'),(3,'baseline-post')]:
            folder = HIST / f'{prefix}-{n}' / stage
            sid = json.loads((folder / 'db-receipt.json').read_text())['sessionId']
            matches = [s for s in snapshots if any(t['sessionId'] == sid for t in s['input_data']['sessions'])]
            assert len(matches) == 1
            source = matches[0]
            ready = sorted([a for a in analyses if a['dataset_id'] == source['id'] and a['status'] == 'READY'], key=lambda a:a['created_at'])[-1]
            profile = sorted([p for p in profiles if p['source_analysis_id'] == ready['id'] and p['status'] == 'READY'],key=lambda p:p['created_at'])[-1]
            key = f'{prefix}-{n}-{stage}'
            file = RUN / 'cases' / key / 'input.json'
            save(file, source['input_data'])
            # All historical profiles/snapshots remain separate test inputs, never reused as fresh AI results.
            save(file.parent / 'historical-analysis.json', ready['result'])
            save(file.parent / 'profile-context.json', {'memberId':source['member_id'],'previousProfileId':profile['previous_profile_id'],'historicalAnalysisId':ready['id']})
            cases.append({'key':key,'persona':persona,'cohort':f'{prefix}-{n}','stage':stage,'sessionId':sid,'datasetId':source['id'],'eventCount':source['event_count'],'sourcePath':str(file),'sourceSha256':digest(file),'historicalAnalysisVersion':ready['prompt_version']})
    save(RUN / 'sources/profiles.json', profiles)
    save(RUN / 'sources/snapshots.json', snapshots)
    # Copy source/build inputs only; no .git, binaries, runtime secrets, DB or shared caches.
    for component in ['backend','shared']:
        shutil.copytree(BASE / component, RUN / 'baseline' / component,
            ignore=shutil.ignore_patterns('build','.gradle','node_modules','.DS_Store'), symlinks=True)
    shutil.copytree(RUN / 'baseline', RUN / 'candidate', symlinks=True)
    files = [{'path':str(p.relative_to(RUN / 'baseline')),'sha256':digest(p)}
             for p in sorted((RUN/'baseline').rglob('*')) if p.is_file() and not p.is_symlink()]
    save(RUN / 'baseline-source-manifest.json', files)
    save(RUN / 'manifest.json', {'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'baselineVersion':'behavior-analysis-v73-summary-backed-plan','baselineSource':str(BASE),
        'selectionRule':'For each persona: cohort1 baseline-pre, cohort2 recommendation-2, cohort3 baseline-post; fixed before any new inference.',
        'cases':cases,'newGameplay':False,'model':'qwen3.6:27b-q4_K_M','contextLength':32768,'requestTokenBudget':32000,
        'outputBudget':3200,'observationBudget':1800,'concurrency':1,'qualityAndIndependentSourceReview':True,
        'historicalInputFile':str(HIST/'auditor/input-snapshots.json'),'historicalInputSha256':digest(HIST/'auditor/input-snapshots.json'),
        'cachePolicy':'No result/checkpoint/artifact reads. Fresh model runner before each call, warmed without a prompt. Assert cachedPromptTokens=0. Cache-control overhead reported separately and included in end-to-end totals.',
        'profileComparison':'Same frozen previous profile chain and raw historical snapshots in both arms; current analysis is newly generated.'})
    print(json.dumps({'run':str(RUN),'cases':len(cases),'events':sum(c['eventCount'] for c in cases),'sourceFiles':len(files)}))

if __name__ == '__main__': main()
