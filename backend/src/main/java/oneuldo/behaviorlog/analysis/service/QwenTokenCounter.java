package oneuldo.behaviorlog.analysis.service;

import ai.djl.huggingface.tokenizers.HuggingFaceTokenizer;
import ai.djl.huggingface.tokenizers.jni.TokenizersLibrary;
import java.util.HexFormat;
import java.util.Map;
import java.security.MessageDigest;

/** Local BPE count, not a character estimate. Does not send observations to a tokenizer service. */
public final class QwenTokenCounter {
    private QwenTokenCounter() {}
    // Store only a digest and a token count, never the source text; bounded across callers.
    private static final java.util.Map<String,Integer> COUNTS = java.util.Collections.synchronizedMap(
        new java.util.LinkedHashMap<String,Integer>(256,0.75f,true) {
            protected boolean removeEldestEntry(java.util.Map.Entry<String,Integer> e) { return size()>512; }
        });
    private static final java.util.concurrent.atomic.LongAdder CACHE_HITS=new java.util.concurrent.atomic.LongAdder();
    public static long cacheHits() { return CACHE_HITS.sum(); }
    public static int cachedEntries() { return COUNTS.size(); }
    public static String textHash(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch(java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private static class Holder {
        static final HuggingFaceTokenizer TOKENIZER = load();
        private static HuggingFaceTokenizer load() {
            try (var stream = QwenTokenCounter.class.getResourceAsStream("/ai/tokenizers/qwen3.6-27b/tokenizer.json")) {
                if (stream == null) throw new IllegalStateException("QWEN_TOKENIZER_MISSING");
                byte[] bytes = stream.readAllBytes();
                String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
                if (!hash.equals("5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42"))
                    throw new IllegalStateException("QWEN_TOKENIZER_HASH_MISMATCH");
                return HuggingFaceTokenizer.newInstance(new java.io.ByteArrayInputStream(bytes),
                        Map.of("addSpecialTokens", "false", "truncation", "false", "padding", "false"));
            } catch (Exception failure) { throw new IllegalStateException("QWEN_TOKENIZER_UNAVAILABLE", failure); }
        }
    }
    public static int count(String text) {
        java.util.Objects.requireNonNull(text, "text");
        if (Thread.currentThread().isInterrupted()) throw new java.util.concurrent.CancellationException("Token counting interrupted");
        String key=textHash(text);var cached=COUNTS.get(key);
        if(cached!=null) { CACHE_HITS.increment();return cached; }
        // This pinned, hash-checked tokenizer has no Java-side prefix/lowercase/accent
        // preprocessing. Use the same native encoding, but fetch only IDs: encode()
        // additionally materializes token strings, masks and character spans we never use.
        // Keep the native encoding alive until the IDs are copied, then always release it.
        try {
            var library = TokenizersLibrary.LIB;
            long encoding = library.encode(Holder.TOKENIZER.getHandle(), text, false);
            try { int count=library.getTokenIds(encoding).length;COUNTS.put(key,count);return count; }
            finally { library.deleteEncoding(encoding); }
        }
        catch (LinkageError failure) { throw new IllegalStateException("QWEN_TOKENIZER_UNAVAILABLE", failure); }
    }
    // Actual text tokens + conservative allowance for the provider's private message framing.
    // This is not an assertion of bit-for-bit equality with Groq usage.prompt_tokens.
    public static int inputTokens(String system, String user) { return count(system) + count(user) + 64; }
}
