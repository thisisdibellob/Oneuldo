#!/usr/bin/env python3
"""Frozen 25-before / 60-training / 25-after. Never installs or deploys a model."""
import os
GPU='GPU-215716d9-f53e-fc5f-566e-f54fcbc700b1'
os.environ.update(CUDA_VISIBLE_DEVICES=GPU,TOKENIZERS_PARALLELISM='false',
 HF_HUB_DISABLE_PROGRESS_BARS='1',PYTORCH_ALLOC_CONF='expandable_segments:True',
 HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1')
import json,time,hashlib,random,traceback,gc,contextlib,shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT.parent/'qlora-smoke-v1'
OUT=ROOT/'results';OUT.mkdir(exist_ok=False)
protocol=json.loads((ROOT/'protocol.json').read_text())
started=time.monotonic();stage='preflight'
report={'status':'running','deployment':False,'training_steps':[],
        'protocol_sha256':hashlib.sha256((ROOT/'protocol.json').read_bytes()).hexdigest()}
def save(path,value):
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def event(name,**fields):
    item={'event':name,'unix_time':time.time(),**fields}
    with (OUT/'events.jsonl').open('a') as f:f.write(json.dumps(item,ensure_ascii=False)+'\n')
    print(json.dumps(item,ensure_ascii=False),flush=True)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

try:
    import torch
    from transformers import AutoTokenizer,Qwen3_5ForConditionalGeneration,BitsAndBytesConfig
    from peft import LoraConfig,get_peft_model,get_peft_model_state_dict,set_peft_model_state_dict
    from safetensors.torch import load_file
    import efficient_attention
    from frozen_embedding import offload_frozen_embedding
    from chunked_loss import chunked_head_loss
    from decoding import greedy_decode
    from stable_step import backward_and_step
    from verify_recovery import verify
    recovery,previous_run=verify(ROOT)
    report['recovery_policy_sha256']=sha(ROOT/'recovery-policy.json')
    assert torch.cuda.device_count()==1 and torch.cuda.get_device_name()=='NVIDIA TITAN RTX'
    assert torch.cuda.mem_get_info()[0]>22*1024**3,'GPU_1_HAS_LESS_THAN_22_GIB_FREE'
    for name,digest in protocol['sha256'].items():assert sha(ROOT/name)==digest,name
    checkpoint=Path((SOURCE/'checkpoint-path.txt').read_text().strip())
    assert checkpoint.name==protocol['revision']
    meta=json.loads((SOURCE/'model-provenance.json').read_text())
    for f in meta['files']:assert sha(checkpoint/f['file'])==f['sha256'],f['file']
    assert sha(checkpoint/'tokenizer.json')=='5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42'
    tokenizer=AutoTokenizer.from_pretrained(checkpoint,local_files_only=True,trust_remote_code=False)
    from prepare_data import prepare,encode_prompt
    samples,evaluation,data_audit=prepare(ROOT,tokenizer,protocol)
    save(OUT/'data-preflight.json',data_audit)
    def encode(messages):return encode_prompt(tokenizer,messages)
    report['environment']={'torch':torch.__version__,'cuda':torch.version.cuda,'checkpoint':str(checkpoint)}
    torch.manual_seed(protocol['seed']);efficient_attention.register()
    event('loading_model')
    quant=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_use_double_quant=True,bnb_4bit_compute_dtype=torch.float16)
    base=Qwen3_5ForConditionalGeneration.from_pretrained(checkpoint,local_files_only=True,trust_remote_code=False,
        quantization_config=quant,dtype=torch.float16,device_map={'':0},attn_implementation='oneuldo_efficient',use_kernels=False)
    keep_half={id(base.get_input_embeddings().weight),id(base.get_output_embeddings().weight)}
    for name,param in base.named_parameters():
        param.requires_grad_(False)
        if param.dtype in (torch.float16,torch.bfloat16) and param.__class__.__name__!='Params4bit' and id(param) not in keep_half:
            param.data=param.data.to(torch.float32)
    report['embedding_offload']=offload_frozen_embedding(base)
    modules=r'.*language_model\.layers\.\d+\.(?:self_attn\.(?:q_proj|k_proj|v_proj|o_proj)|linear_attn\.(?:in_proj_qkv|in_proj_z|in_proj_b|in_proj_a|out_proj)|mlp\.(?:gate_proj|up_proj|down_proj))'
    model=get_peft_model(base,LoraConfig(r=8,lora_alpha=16,lora_dropout=0,target_modules=modules,bias='none',task_type='CAUSAL_LM'))
    trainable=[p for p in model.parameters() if p.requires_grad]
    assert sum(p.numel() for p in trainable)==58363904
    assert all('lora_' in n for n,p in model.named_parameters() if p.requires_grad)
    eos=model.generation_config.eos_token_id
    eos=set(eos if isinstance(eos,list) else [eos]);eos.add(tokenizer.eos_token_id);eos.discard(None)
    report['eos_token_ids']=sorted(eos)
    event('model_loaded',trainable_parameters=sum(p.numel() for p in trainable))

    def evaluate(phase,disabled):
        model.eval();model.gradient_checkpointing_disable()
        model.config.use_cache=True;model.config.text_config.use_cache=True
        folder=OUT/phase;folder.mkdir(exist_ok=False);summaries=[]
        with model.disable_adapter() if disabled else contextlib.nullcontext():
            warmup=encode([{'role':'user','content':'연결 성공이라고 답해줘.'}])
            greedy_decode(model,torch.tensor([warmup],device='cuda'),4,eos)
            gc.collect();torch.cuda.empty_cache()
            for r in evaluation:
                event('evaluation_started',phase=phase,case=r['id'])
                ids=encode(r['messages']);torch.cuda.reset_peak_memory_stats()
                t=greedy_decode(model,torch.tensor([ids],device='cuda'),
                   protocol['eval']['max_new_tokens'],eos,protocol['eval']['per_case_timeout_seconds'])
                content=tokenizer.decode(t['token_ids'],skip_special_tokens=True)
                record={'id':r['id'],'task':r['task'],'phase':phase,'backend':'local_hf',
                    'messages':r['messages'],'prompt_tokens':len(ids),'content':content,
                    'raw_with_special_tokens':tokenizer.decode(t['token_ids'],skip_special_tokens=False),
                    'peak_allocated_mib':torch.cuda.max_memory_allocated()/1024**2,**t}
                save(folder/(r['id']+'.json'),record)
                brief={k:record[k] for k in ['id','task','phase','seconds','prefill_seconds','output_tokens','stop_reason','peak_allocated_mib']}
                summaries.append(brief);save(folder/'summary.json',summaries)
                event('evaluation_finished',**brief)
                gc.collect();torch.cuda.empty_cache()
        return summaries

    stage='baseline_reuse'
    assert report['environment']==previous_run['environment'],'BASELINE_ENVIRONMENT_CHANGED'
    assert report['eos_token_ids']==previous_run['eos_token_ids'],'BASELINE_EOS_CHANGED'
    model.eval();model.gradient_checkpointing_disable()
    model.config.use_cache=True;model.config.text_config.use_cache=True
    with model.disable_adapter():
        warmup=encode([{'role':'user','content':'연결 성공이라고 답해줘.'}])
        greedy_decode(model,torch.tensor([warmup],device='cuda'),4,eos)
        old_case=json.loads((ROOT/recovery['baseline_folder']/'E01.json').read_text())
        event('baseline_canary_started',case='E01')
        canary=greedy_decode(model,torch.tensor([encode(old_case['messages'])],device='cuda'),
            protocol['eval']['max_new_tokens'],eos,protocol['eval']['per_case_timeout_seconds'])
    save(OUT/'baseline-canary.json',canary)
    assert canary['token_ids']==old_case['token_ids'] and canary['stop_reason']==old_case['stop_reason'],'BASELINE_CANARY_CHANGED'
    shutil.copytree(ROOT/recovery['baseline_folder'],OUT/'before')
    report['before']=previous_run['before']
    report['baseline_reused']={'source':recovery['baseline_folder'],'exact_E01_token_match':True,'canary_seconds':canary['seconds']}
    event('baseline_reused',cases=25,exact_E01_token_match=True)
    gc.collect();torch.cuda.empty_cache();save(OUT/'result.json',report)
    stage='training';torch.manual_seed(protocol['seed']);random.Random(protocol['seed']).shuffle(samples)
    report['training_order']=[r['id'] for r,_,_ in samples]
    model.train();model.config.use_cache=False;model.config.text_config.use_cache=False
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant':False})
    optimizer=torch.optim.AdamW(trainable,lr=1e-5,weight_decay=.01,foreach=False)
    scaler=torch.amp.GradScaler('cuda',init_scale=256)
    probe_weight=next(p for n,p in model.named_parameters() if p.requires_grad and '.lora_B.' in n)
    train_start=time.monotonic()
    for step,(r,ids,boundary) in enumerate(samples,1):
        event('training_started',step=step,case=r['id'],tokens=len(ids))
        torch.cuda.reset_peak_memory_stats();t=time.monotonic();optimizer.zero_grad(set_to_none=True)
        input_ids=torch.tensor([ids],device='cuda');targets=input_ids[:,boundary:]
        old=probe_weight.detach().clone()
        for attempt in range(1,recovery['max_attempts_per_sample']+1):
            with torch.autocast('cuda',dtype=torch.float16):
                output=base.model(input_ids=input_ids,attention_mask=torch.ones_like(input_ids),use_cache=False)
                hidden=output[0][:,boundary-1:len(ids)-1,:]
                loss=chunked_head_loss(hidden,base.get_output_embeddings(),targets,32)
            finite_loss=loss.item()
            update=backward_and_step(loss,[(n,p) for n,p in model.named_parameters() if p.requires_grad],optimizer,scaler)
            del output,hidden,loss
            if update['applied']:break
            assert torch.equal(old,probe_weight.detach()),'OVERFLOW_UPDATED_WEIGHT'
            retry={'step':step,'case':r['id'],'attempt':attempt,'loss':finite_loss,**update}
            report.setdefault('numeric_retries',[]).append(retry)
            save(OUT/'result.json',report);event('numeric_retry',**retry)
            gc.collect();torch.cuda.empty_cache()
        else:raise RuntimeError('NONFINITE_GRADIENT_AFTER_BOUNDED_RETRIES:'+r['id'])
        torch.cuda.synchronize()
        assert not torch.equal(old,probe_weight.detach()),'ADAPTER_DID_NOT_UPDATE'
        row={'step':step,'case':r['id'],'loss':finite_loss,'gradient_norm':update['gradient_norm'],
             'attempts':attempt,'amp_scale':update['scale_after'],
             'seconds':time.monotonic()-t,'tokens':len(ids),'loss_tokens':targets.numel(),
             'peak_allocated_mib':torch.cuda.max_memory_allocated()/1024**2,
             'peak_reserved_mib':torch.cuda.max_memory_reserved()/1024**2}
        report['training_steps'].append(row);save(OUT/'result.json',report);event('training_finished',**row)
        optimizer.zero_grad(set_to_none=True)
        del input_ids,targets,old
        gc.collect();torch.cuda.empty_cache()
        if step in recovery['checkpoint_steps']:
            folder=OUT/f'adapter-step-{step:03d}'
            model.save_pretrained(folder,safe_serialization=True,save_embedding_layers=False)
            save(folder/'experiment-provenance.json',{'protocol_sha256':report['protocol_sha256'],
                 'base_model':protocol['base_model'],'revision':protocol['revision'],'step':step})
            event('adapter_checkpoint_saved',step=step)
    report['training_seconds']=time.monotonic()-train_start
    stage='adapter_reload'
    del optimizer,scaler;gc.collect();torch.cuda.empty_cache()
    disk=load_file(str(OUT/'adapter-step-060'/'adapter_model.safetensors'))
    live=get_peft_model_state_dict(model)
    assert disk.keys()==live.keys() and all(torch.equal(v,live[n].detach().cpu()) for n,v in disk.items())
    # Actually restore the saved adapter before after-evaluation; assert every tensor.
    set_peft_model_state_dict(model,disk)
    live=get_peft_model_state_dict(model)
    assert all(torch.equal(v,live[n].detach().cpu()) for n,v in disk.items())
    report['adapter_reload_verified']=True
    report['adapter_sha256']=sha(OUT/'adapter-step-060'/'adapter_model.safetensors')
    del disk,live;gc.collect();torch.cuda.empty_cache()
    stage='after';report['after']=evaluate('after',False)
    assert len(report['before'])==25 and len(report['after'])==25 and len(report['training_steps'])==60
    report['status']='completed_before_training_after';stage='complete'
except BaseException as e:
    report.update(status='failed',failed_stage=stage,error_type=type(e).__name__,error=str(e))
    (OUT/'traceback.txt').write_text(traceback.format_exc());event('failed',stage=stage,error=str(e))
finally:
    report['elapsed_seconds']=time.monotonic()-started
    save(OUT/'result.json',report);event('finished',status=report['status'],seconds=report['elapsed_seconds'])
if report['status']=='failed':raise SystemExit(1)
