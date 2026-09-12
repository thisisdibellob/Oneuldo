package oneuldo.gateway;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class ApiKeyFilter extends OncePerRequestFilter {
    public static final String IDENTITY = "teamKeyId";
    private final GatewaySettings settings;
    public ApiKeyFilter(GatewaySettings settings) { this.settings = settings; }
    public static byte[] hash(String key) {
        try { return MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws IOException, ServletException {
        response.setHeader("Cache-Control", "no-store");
        if ("GET".equals(request.getMethod()) && "/healthz".equals(request.getRequestURI())) {
            chain.doFilter(request, response); return;
        }
        String header = request.getHeader("Authorization");
        String identity = null;
        if (header != null && header.startsWith("Bearer ") && header.length() >= 39 && header.length() <= 263) {
            byte[] provided = hash(header.substring(7));
            for (var entry : settings.apiKeyHashes().entrySet()) {
                if (MessageDigest.isEqual(provided, HexFormat.of().parseHex(entry.getValue()))) identity = entry.getKey();
            }
        }
        if (identity == null) {
            response.setStatus(401); response.setHeader("WWW-Authenticate", "Bearer");
            response.setContentType("application/json"); response.getWriter().write("{\"error\":\"UNAUTHORIZED\"}"); return;
        }
        request.setAttribute(IDENTITY, identity);
        chain.doFilter(request, response);
    }
}
