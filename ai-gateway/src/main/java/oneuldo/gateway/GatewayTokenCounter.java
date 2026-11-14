package oneuldo.gateway;

import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.TimeUnit;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/** Exact pinned tokenizer; a host-configured Python bridge supports older Linux ABIs. */
@Component
public final class GatewayTokenCounter {
    private static final String HASH="5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42";
    private static final String SCRIPT="import sys,json;from tokenizers import Tokenizer;t=Tokenizer.from_file(sys.argv[1]);print(json.dumps([len(t.encode(s,add_special_tokens=False).ids) for s in json.load(sys.stdin)]))";
    private final ObjectMapper mapper;private final String python;private final Path tokenizer;
    public GatewayTokenCounter(ObjectMapper mapper,GatewaySettings settings) {
        this.mapper=mapper;python=settings.tokenizerPython();
        if(python==null){tokenizer=null;return;}
        try(var in=GatewayTokenCounter.class.getResourceAsStream("/ai/tokenizers/qwen3.6-27b/tokenizer.json")) {
            if(in==null)throw new IllegalStateException("QWEN_TOKENIZER_MISSING");byte[] bytes=in.readAllBytes();
            if(!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)).equals(HASH))throw new IllegalStateException("QWEN_TOKENIZER_HASH_MISMATCH");
            tokenizer=Files.createTempFile("oneuldo-qwen-tokenizer-",".json");
            try{Files.setPosixFilePermissions(tokenizer,java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));}catch(UnsupportedOperationException ignored){}
            Files.write(tokenizer,bytes);tokenizer.toFile().deleteOnExit();
        }catch(Exception e){throw new IllegalStateException("QWEN_TOKENIZER_UNAVAILABLE",e);}
    }
    public List<Integer> count(List<String> texts) {
        if(python==null)return texts.stream().map(QwenTokenCounter::count).toList();
        Process p=null;
        try {
            p=new ProcessBuilder(python,"-c",SCRIPT,tokenizer.toString()).start();
            try(var input=p.getOutputStream()){input.write(mapper.writeValueAsString(texts).getBytes(StandardCharsets.UTF_8));}
            if(!p.waitFor(30,TimeUnit.SECONDS))throw new IllegalStateException("TOKENIZER_TIMEOUT");
            if(p.exitValue()!=0)throw new IllegalStateException("TOKENIZER_FAILED");
            var counts=mapper.readTree(p.getInputStream().readAllBytes());
            if(!counts.isArray()||counts.size()!=texts.size())throw new IllegalStateException("INVALID_TOKENIZER_COUNTS");
            var result=new ArrayList<Integer>();for(var n:counts){if(!n.isIntegralNumber()||n.asLong()<0||n.asLong()>Integer.MAX_VALUE)throw new IllegalStateException("INVALID_TOKENIZER_COUNTS");result.add(n.asInt());}return result;
        }catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("TOKENIZER_INTERRUPTED",e);}
        catch(java.io.IOException e){throw new IllegalStateException("TOKENIZER_UNAVAILABLE",e);}
        finally{if(p!=null&&p.isAlive())p.destroyForcibly();}
    }
}
