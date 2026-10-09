const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { createMcpExpressApp } = require('@modelcontextprotocol/sdk/server/express.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');

const { BrowserBridgeServer } = require('./browser-bridge-server.cjs');
const { BrowserMarketRuntime } = require('./browser-runtime.cjs');
const { ControlLease } = require('./control-lease.cjs');
const { createOneuldoMcpServer } = require('./mcp-server.cjs');

class OneuldoMarketHttpService {
  constructor(options = {}) {
    this.host = options.host ?? process.env.ONEULDO_MARKET_HOST ?? '127.0.0.1';
    this.port = Number(options.port ?? process.env.ONEULDO_MARKET_PORT ?? 8765);
    this.app = createMcpExpressApp({ host: this.host });
    this.httpServer = http.createServer(this.app);
    this.transports = new Map();
    this.lease = new ControlLease({ timeoutMs: options.leaseTimeoutMs });
    this.bridge = new BrowserBridgeServer({
      host: this.host,
      port: this.port,
      httpServer: this.httpServer,
      path: '/browser',
      allowedOrigin: options.allowedOrigin,
      timeoutMs: options.browserTimeoutMs,
      onBrowserDisconnected: (browserId) => this.lease.releaseBrowser(browserId),
    });
    this.runtime = new BrowserMarketRuntime(this.bridge);
    this.configureRoutes();
    this.bridge.start();
  }

  configureRoutes() {
    this.app.get('/health', (_req, res) => res.json({
      ok: true,
      service: 'oneuldo-market-agent',
      version: '0.3.0',
      browser: this.bridge.status(),
      activeMcpSessions: this.transports.size,
      controlled: this.lease.ownerId !== null,
    }));

    this.app.post('/mcp', async (req, res) => {
      try {
        const requestedSession = req.headers['mcp-session-id'];
        let entry = typeof requestedSession === 'string' ? this.transports.get(requestedSession) : null;
        if (!entry) {
          if (requestedSession || !isInitializeRequest(req.body)) {
            this.jsonRpcError(res, 400, -32000, '유효한 MCP 세션 ID가 없거나 만료되었습니다.');
            return;
          }
          entry = await this.createTransport();
        }
        await entry.transport.handleRequest(req, res, req.body);
      } catch (error) {
        process.stderr.write(`[oneuldoMarket] MCP request failed: ${error.message}\n`);
        if (!res.headersSent) this.jsonRpcError(res, 500, -32603, 'MCP 요청 처리에 실패했습니다.');
      }
    });

    this.app.get('/mcp', async (req, res) => this.handleExistingTransport(req, res));
    this.app.delete('/mcp', async (req, res) => this.handleExistingTransport(req, res));
  }

  async createTransport() {
    let entry;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.transports.set(sessionId, entry);
        process.stderr.write(`[oneuldoMarket] MCP session connected: ${sessionId}\n`);
      },
    });
    const server = createOneuldoMcpServer(this.runtime, this.lease, this.bridge);
    entry = { server, transport };
    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (!sessionId) return;
      this.transports.delete(sessionId);
      this.lease.releaseOwner(sessionId);
      process.stderr.write(`[oneuldoMarket] MCP session disconnected: ${sessionId}\n`);
    };
    await server.connect(transport);
    return entry;
  }

  async handleExistingTransport(req, res) {
    const sessionId = req.headers['mcp-session-id'];
    const entry = typeof sessionId === 'string' ? this.transports.get(sessionId) : null;
    if (!entry) {
      this.jsonRpcError(res, 400, -32000, '유효한 MCP 세션 ID가 없습니다.');
      return;
    }
    try {
      await entry.transport.handleRequest(req, res);
    } catch (error) {
      process.stderr.write(`[oneuldoMarket] MCP session request failed: ${error.message}\n`);
      if (!res.headersSent) this.jsonRpcError(res, 500, -32603, 'MCP 세션 요청 처리에 실패했습니다.');
    }
  }

  jsonRpcError(res, status, code, message) {
    res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
  }

  start() {
    if (this.httpServer.listening) return Promise.resolve(this.address());
    return new Promise((resolve, reject) => {
      const onError = (error) => {
        this.httpServer.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        this.httpServer.off('error', onError);
        const address = this.address();
        this.bridge.port = address.port;
        resolve(address);
      };
      this.httpServer.once('error', onError);
      this.httpServer.once('listening', onListening);
      this.httpServer.listen(this.port, this.host);
    });
  }

  address() {
    const address = this.httpServer.address();
    const port = typeof address === 'object' && address ? address.port : this.port;
    return { host: this.host, port, mcpUrl: `http://${this.host}:${port}/mcp`, browserUrl: `ws://${this.host}:${port}/browser` };
  }

  async close() {
    this.lease.releaseAll();
    for (const entry of this.transports.values()) {
      try { await entry.server.close(); } catch { /* already closed */ }
    }
    this.transports.clear();
    this.bridge.close();
    if (!this.httpServer.listening) return;
    await new Promise((resolve) => this.httpServer.close(resolve));
  }
}

module.exports = { OneuldoMarketHttpService };
