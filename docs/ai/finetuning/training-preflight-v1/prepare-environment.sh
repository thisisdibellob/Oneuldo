#!/usr/bin/env bash
set -euo pipefail
umask 077
work=/home/duream/.local/share/oneuldo/qlora-smoke-v1
base_python=/home/duream/miniconda3/envs/qwen35_9b/bin/python
mkdir -p "$work"
"$base_python" -m venv --system-site-packages "$work/venv"
printf 'torch==2.10.0\n' > "$work/constraints.txt"
"$work/venv/bin/python" -m pip install --disable-pip-version-check -c "$work/constraints.txt" \
  'transformers==5.17.0' 'peft==0.21.0' 'bitsandbytes==0.50.2' 'huggingface_hub==1.32.0' > "$work/install.log" 2>&1
export HF_HOME="$work/hf-cache" HF_HUB_DISABLE_PROGRESS_BARS=1 TOKENIZERS_PARALLELISM=false
"$work/venv/bin/python" -u - <<'PY'
import os,json,shutil,importlib.metadata as m
from pathlib import Path
from huggingface_hub import snapshot_download
root=Path('/home/duream/.local/share/oneuldo/qlora-smoke-v1')
info={k:m.version(k) for k in ['torch','transformers','peft','bitsandbytes','accelerate','huggingface_hub']}
(root/'packages.json').write_text(json.dumps(info,indent=2)+'\n');print('PACKAGES',json.dumps(info),flush=True)
free=shutil.disk_usage(root).free
if free<75*1024**3:raise RuntimeError('LESS_THAN_75_GIB_FREE_BEFORE_CHECKPOINT_DOWNLOAD')
print('CHECKPOINT_DOWNLOAD_STARTED',flush=True)
path=snapshot_download(repo_id='Qwen/Qwen3.6-27B',revision='6a9e13bd6fc8f0983b9b99948120bc37f49c13e9',
 allow_patterns=['*.safetensors','model.safetensors.index.json','config.json','generation_config.json',
                 'tokenizer.json','tokenizer_config.json','chat_template.jinja','LICENSE'],max_workers=2)
(root/'checkpoint-path.txt').write_text(path+'\n')
print('CHECKPOINT_READY',path,flush=True)
PY
