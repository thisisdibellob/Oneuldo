#!/usr/bin/env python3
"""Freeze synthetic evaluation inputs and record sequential, unrepaired responses.

Never sends reference answers/rubrics or writes API keys. No training, deployment,
ability scoring, redirects, or retries of possibly submitted inference requests.
"""
import argparse
import hashlib
import http.client
import json
import ssl
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
HOST = 'oneuldo.duckdns.org'
MODEL = 'qwen3.6:27b-q4_K_M'
OPTIONS = {'num_ctx': 18432, 'num_predict': 1800, 'temperature': 0}


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')


def request_for(row):
    messages = row['messages'][:2]
    assert [m['role'] for m in messages] == ['system', 'user']
    assert all(set(m) == {'role', 'content'} for m in messages)
    return {'model': MODEL, 'messages': messages, 'think': False,
            'stream': False, 'options': OPTIONS.copy()}


def prepare(dest):
    dest.mkdir(parents=True, exist_ok=True)
    source = HERE / 'seed-v1/eval.draft.jsonl'
    data = source.read_bytes()
    target = dest / 'eval.frozen.jsonl'
    if target.exists() and target.read_bytes() != data:
        raise SystemExit('Frozen evaluation differs; use a new baseline directory.')
    rows = [json.loads(x) for x in data.decode().splitlines()]
    assert [r['id'] for r in rows] == [f'E{i:02}' for i in range(1, 26)]
    assert all(r['split'] == 'eval' for r in rows)
    if not target.exists():
        target.write_bytes(data)
    config = {
        'version': 1, 'eval_sha256': sha(data), 'case_count': 25,
        'endpoint': 'https://' + HOST + '/api/chat', 'model_tag': MODEL,
        'model_digest_verified': False,
        'options': OPTIONS, 'think': False, 'stream': False,
        'format': None, 'gateway_top_p_from_local_source': 0.8,
        'gateway_keep_alive_from_local_source': '10m',
        'seed': None, 'repetitions': 1, 'concurrency': 1,
        'connect_timeout_seconds': 8, 'response_timeout_seconds': 1500,
        'max_pre_send_connection_attempts': 3,
        'repair_or_post_submission_retry': False,
        'input_scope': 'Normalized synthetic draft, not the production application pipeline.',
        'grading': 'Structural checks plus explicit Codex semantic review; not clinical validation.',
        'request_sha256': {r['id']: sha(json.dumps(request_for(r), ensure_ascii=False).encode()) for r in rows},
    }
    path = dest / 'protocol.json'
    if path.exists() and json.loads(path.read_text()) != config:
        raise SystemExit('Existing protocol changed; use a new baseline directory.')
    if not path.exists():
        write(path, config)
    return rows, config


def connect(attempts):
    for number in range(1, 4):
        started = time.monotonic()
        conn = http.client.HTTPSConnection(HOST, timeout=8, context=ssl.create_default_context())
        try:
            conn.connect()
            attempts.append({'at': now(), 'attempt': number, 'connected': True,
                             'seconds': round(time.monotonic()-started, 3)})
            conn.sock.settimeout(1500)
            return conn
        except (OSError, http.client.HTTPException) as error:
            conn.close()
            attempts.append({'at': now(), 'attempt': number, 'connected': False,
                             'error_type': type(error).__name__, 'seconds': round(time.monotonic()-started, 3)})
    return None


def run(dest, rows, key_path):
    key = key_path.read_text().strip()
    if len(key) != 64 or any(c not in '0123456789abcdefABCDEF' for c in key):
        raise SystemExit('Invalid key file; no key content printed.')
    responses = dest / 'responses'
    responses.mkdir(exist_ok=True)
    conn = None
    try:
        for row in rows:
            path = responses / (row['id'] + '.json')
            if path.exists():
                prior = json.loads(path.read_text())
                if prior['status'] != 'response_received':
                    raise SystemExit('Existing failed/ambiguous attempt: ' + row['id'] + '; inspect before starting another run.')
                continue
            result = {'id': row['id'], 'task': row['task'], 'started_at': now(),
                      'connection_attempts': [], 'request': request_for(row)}
            started = time.monotonic()
            if conn is None:
                conn = connect(result['connection_attempts'])
            if conn is None:
                result['status'] = 'connect_failed_before_submission'
            else:
                body = json.dumps(result['request'], ensure_ascii=False).encode()
                try:
                    # Authentication remains memory-only and is never part of the saved request.
                    conn.request('POST', '/api/chat', body=body,
                                 headers={'Authorization': 'Bearer ' + key,
                                          'Content-Type': 'application/json', 'Connection': 'keep-alive'})
                    response = conn.getresponse()
                    result['http_status'] = response.status
                    raw = response.read().decode('utf-8')
                    result['response_body'] = raw
                    result['status'] = 'response_received' if response.status == 200 else 'http_error'
                    if response.will_close:
                        conn.close()
                        conn = None
                except (OSError, http.client.HTTPException, UnicodeError) as error:
                    result['status'] = 'submission_state_uncertain'
                    result['error_type'] = type(error).__name__
                    conn.close()
                    conn = None
            result['ended_at'] = now()
            result['wall_seconds'] = round(time.monotonic()-started, 3)
            write(path, result)
            print(row['id'], result['status'], result.get('http_status'), result['wall_seconds'], flush=True)
            if result['status'] != 'response_received':
                print('Stopped; no potentially duplicate inference was retried.', flush=True)
                break
    finally:
        if conn:
            conn.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=HERE/'baseline-v1')
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--key-file', type=Path,
                        default=Path.home()/'.local/share/oneuldo/school-gateway-client.key')
    args = parser.parse_args()
    rows, _ = prepare(args.out)
    print('Frozen evaluation verified:', len(rows), flush=True)
    if args.run:
        run(args.out, rows, args.key_file)


if __name__ == '__main__':
    main()
