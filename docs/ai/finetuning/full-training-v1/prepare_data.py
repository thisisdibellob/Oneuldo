"""CPU-only production-tokenizer preflight, reusable by the actual experiment."""
import hashlib,json
from pathlib import Path

def encode_prompt(tokenizer,messages):
    text=tokenizer.apply_chat_template(messages,tokenize=False,
        add_generation_prompt=True,enable_thinking=False)
    return tokenizer.encode(text,add_special_tokens=False)

def prepare(root,tokenizer,protocol):
    for name,digest in protocol['sha256'].items():
        assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
    train=[json.loads(x) for x in (root/'train.candidate.jsonl').read_text().splitlines()]
    evaluation=[json.loads(x) for x in (root/'eval.prompts.jsonl').read_text().splitlines()]
    assert len(train)==60 and len(evaluation)==25
    assert {r['id'] for r in train}=={f'T{i:02d}' for i in range(1,61)}
    assert {r['id'] for r in evaluation}=={f'E{i:02d}' for i in range(1,26)}
    samples=[];audit=[]
    for r in train:
        assert r['split']=='train' and [m['role'] for m in r['messages']]==['system','user','assistant'],r['id']
        prefix=encode_prompt(tokenizer,r['messages'][:2])
        full=tokenizer.apply_chat_template(r['messages'],tokenize=False,
            add_generation_prompt=False,enable_thinking=False)
        ids=tokenizer.encode(full,add_special_tokens=False)
        assert all(isinstance(i,int) for i in ids+prefix),r['id']+' noninteger token'
        assert ids[:len(prefix)]==prefix,r['id']+' prompt/answer boundary mismatch'
        assert 0<len(prefix)<len(ids)<=4096,r['id']+' invalid sequence length'
        assert tokenizer.eos_token_id in ids[len(prefix):],r['id']+' missing answer EOS'
        samples.append((r,ids,len(prefix)))
        audit.append({'id':r['id'],'prompt_tokens':len(prefix),'total_tokens':len(ids),'answer_tokens':len(ids)-len(prefix)})
    for r in evaluation:
        assert set(r)=={'id','task','messages'},r['id']
        assert [m['role'] for m in r['messages']]==['system','user'],r['id']
        prefix=encode_prompt(tokenizer,r['messages'])
        assert all(isinstance(i,int) for i in prefix),r['id']
        assert len(prefix)+protocol['eval']['max_new_tokens']<=8192,r['id']
        audit.append({'id':r['id'],'prompt_tokens':len(prefix),'answer_included':False})
    return samples,evaluation,audit

if __name__=='__main__':
    from transformers import AutoTokenizer
    root=Path(__file__).resolve().parent
    checkpoint=(root.parent/'qlora-smoke-v1/checkpoint-path.txt').read_text().strip()
    tokenizer=AutoTokenizer.from_pretrained(checkpoint,local_files_only=True,trust_remote_code=False)
    samples,evaluation,audit=prepare(root,tokenizer,json.loads((root/'protocol.json').read_text()))
    result={'passed':True,'train_cases':len(samples),'eval_cases':len(evaluation),
            'max_train_tokens':max(len(ids) for _,ids,_ in samples),'cases':audit}
    (root/'data-preflight.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='cases'}))
