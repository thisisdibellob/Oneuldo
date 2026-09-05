# Qwen3.6-27B tokenizer data

- Publisher: Qwen. Model weights are **not** included or loaded.
- Source: https://huggingface.co/Qwen/Qwen3.6-27B/tree/6a9e13bd6fc8f0983b9b99948120bc37f49c13e9
- File: tokenizer.json (unmodified), SHA-256: `5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42`.
- License: Apache-2.0; original LICENSE is included alongside this file.
- Runtime: DJL HuggingFace tokenizers 0.36.0. Native runtime may be downloaded/cached by DJL on first use. Windows x86_64 was tested.
- Token counting is local. No behavior data is sent to Hugging Face. Failure to load/verify the tokenizer stops analysis; there is no character-count fallback.
- The model-specific tokenizer counts text tokens. The application separately reserves 64 tokens for provider-specific chat framing; this is not exact Groq usage accounting.
