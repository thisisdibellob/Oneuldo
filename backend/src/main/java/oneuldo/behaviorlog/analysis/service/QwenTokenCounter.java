package oneuldo.behaviorlog.analysis.service;

import ai.djl.huggingface.tokenizers.HuggingFaceTokenizer;
import ai.djl.huggingface.tokenizers.jni.TokenizersLibrary;
import java.util.HexFormat;
import java.util.Map;
import java.security.MessageDigest;

/** Local BPE count, not a character estimate. Does not send observations to a tokenizer service. */
public final class QwenTokenCounter {
    private QwenTokenCounter() {}
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
        // This pinned, hash-checked tokenizer has no Java-side prefix/lowercase/accent
        // preprocessing. Use the same native encoding, but fetch only IDs: encode()
        // additionally materializes token strings, masks and character spans we never use.
        // Keep the native encoding alive until the IDs are copied, then always release it.
        try {
            var library = TokenizersLibrary.LIB;
            long encoding = library.encode(Holder.TOKENIZER.getHandle(), text, false);
            try { return library.getTokenIds(encoding).length; }
            finally { library.deleteEncoding(encoding); }
        }
        catch (LinkageError failure) { throw new IllegalStateException("QWEN_TOKENIZER_UNAVAILABLE", failure); }
    }
    // Actual text tokens + conservative allowance for the provider's private message framing.
    // This is not an assertion of bit-for-bit equality with Groq usage.prompt_tokens.
    public static int inputTokens(String system, String user) { return count(system) + count(user) + 64; }
}
