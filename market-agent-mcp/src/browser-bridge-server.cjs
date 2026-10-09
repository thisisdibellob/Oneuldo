const { randomUUID } = require('node:crypto');
const { WebSocketServer } = require('ws');

class BrowserBridgeServer {
  constructor(options = {}) {
    this.host = options.host ?? process.env.ONEULDO_MARKET_BRIDGE_HOST ?? '127.0.0.1';
    this.port = Number(options.port ?? process.env.ONEULDO_MARKET_BRIDGE_PORT ?? 8765);
    this.allowedOrigin = options.allowedOrigin ?? process.env.ONEULDO_MARKET_BROWSER_ORIGIN ?? 'http://localhost:8082';
    this.timeoutMs = Number(options.timeoutMs ?? process.env.ONEULDO_MARKET_BROWSER_TIMEOUT_MS ?? 10000);
    this.httpServer = options.httpServer ?? null;
    this.path = options.path ?? '/browser';
    this.onBrowserDisconnected = options.onBrowserDisconnected ?? (() => undefined);
    this.browsers = new Map();
    this.pending = new Map();
    this.server = null;
  }

  start() {
    if (this.server) return;
    const options = this.httpServer
      ? { server: this.httpServer, path: this.path, verifyClient: ({ origin }) => this.originAllowed(origin) }
      : { host: this.host, port: this.port, verifyClient: ({ origin }) => this.originAllowed(origin) };
    this.server = new WebSocketServer(options);
    this.server.on('connection', (socket) => this.accept(socket));
    this.server.on('error', (error) => {
      process.stderr.write(`[oneuldoMarket] browser bridge error: ${error.message}\n`);
    });
  }

  close() {
    this.rejectAll('BRIDGE_CLOSED', '브라우저 브리지가 종료되었습니다.');
    for (const entry of this.browsers.values()) entry.socket.close();
    this.browsers.clear();
    this.server?.close();
    this.server = null;
  }

  originAllowed(origin) {
    if (!origin) return false;
    if (origin === this.allowedOrigin) return true;
    try {
      const url = new URL(origin);
      return ['localhost', '127.0.0.1'].includes(url.hostname);
    } catch {
      return false;
    }
  }

  accept(socket) {
    let browserId = null;
    socket.on('message', (bytes) => {
      const id = this.receive(socket, bytes);
      if (id) browserId = id;
    });
    socket.on('close', () => {
      if (!browserId || this.browsers.get(browserId)?.socket !== socket) return;
      this.browsers.delete(browserId);
      this.rejectBrowser(browserId, 'BROWSER_DISCONNECTED', '장보기 화면과의 연결이 끊겼습니다.');
      this.onBrowserDisconnected(browserId);
    });
    socket.on('error', () => undefined);
  }

  receive(socket, bytes) {
    let message;
    try { message = JSON.parse(bytes.toString()); }
    catch { return; }
    if (message?.type === 'browserReady') {
      if (message.protocolVersion !== 2) {
        socket.close(1002, 'unsupported protocol version');
        return null;
      }
      const browserId = typeof message.browserId === 'string' ? message.browserId.trim() : '';
      if (!browserId) {
        socket.close(1008, 'browserId is required');
        return null;
      }
      const previous = this.browsers.get(browserId);
      this.browsers.set(browserId, {
        socket,
        browserId,
        connectedAt: new Date().toISOString(),
        url: typeof message.url === 'string' ? message.url : null,
        title: typeof message.title === 'string' ? message.title : null,
        visibility: typeof message.visibility === 'string' ? message.visibility : null,
        authenticated: message.authenticated === true,
        view: ['login', 'app', 'game'].includes(message.view) ? message.view : null,
      });
      if (previous?.socket !== socket) previous?.socket.close(1012, 'browser reconnected');
      return browserId;
    }
    const pending = this.pending.get(message?.requestId);
    if (!pending || pending.socket !== socket) return null;
    clearTimeout(pending.timer);
    this.pending.delete(message.requestId);
    if (message.type === 'error') pending.reject(this.error(message.error?.code ?? 'BROWSER_ERROR', message.error?.message ?? '브라우저 명령 실행에 실패했습니다.', message.error));
    else pending.resolve(message.payload);
    return null;
  }

  request(browserId, command) {
    const browser = this.browsers.get(browserId);
    if (!browser || browser.socket.readyState !== 1) {
      return Promise.reject(this.error('BROWSER_NOT_CONNECTED', `browserId=${browserId}인 로그인된 오늘도 화면을 열어 주세요.`, { browserId }));
    }
    const requestId = command.requestId ?? randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(this.error('BROWSER_TIMEOUT', '브라우저가 제한 시간 안에 응답하지 않았습니다.'));
      }, this.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer, browserId, socket: browser.socket });
      browser.socket.send(JSON.stringify({ ...command, requestId }));
    });
  }

  status(browserId) {
    const target = browserId ? this.browsers.get(browserId) : null;
    return {
      connected: browserId ? !!target && target.socket.readyState === 1 : this.browsers.size > 0,
      ready: browserId ? !!target && target.socket.readyState === 1 : this.browsers.size > 0,
      protocolVersion: this.browsers.size > 0 ? 2 : null,
      endpoint: `ws://${this.host}:${this.port}${this.path}`,
      requestedBrowserId: browserId ?? null,
      target: target ? this.publicBrowser(target) : null,
      browsers: [...this.browsers.values()].map(entry => this.publicBrowser(entry)),
    };
  }

  publicBrowser(entry) {
    return {
      browserId: entry.browserId,
      connectedAt: entry.connectedAt,
      url: entry.url,
      title: entry.title,
      visibility: entry.visibility,
      authenticated: entry.authenticated,
      view: entry.view,
    };
  }

  rejectBrowser(browserId, code, message) {
    for (const [requestId, pending] of this.pending) {
      if (pending.browserId !== browserId) continue;
      clearTimeout(pending.timer);
      pending.reject(this.error(code, message, { browserId }));
      this.pending.delete(requestId);
    }
  }

  rejectAll(code, message) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.error(code, message));
    }
    this.pending.clear();
  }

  error(code, message, details) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    return error;
  }
}

module.exports = { BrowserBridgeServer };
