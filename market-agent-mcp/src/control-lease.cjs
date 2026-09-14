class ControlLease {
  constructor(options = {}) {
    this.timeoutMs = Number(options.timeoutMs ?? process.env.ONEULDO_MARKET_LEASE_TIMEOUT_MS ?? 30 * 60 * 1000);
    this.ownerId = null;
    this.sessionId = null;
    this.browserId = null;
    this.timer = null;
  }

  acquire(ownerId) {
    if (!ownerId) throw this.error('MCP_SESSION_REQUIRED', 'MCP 연결 세션을 확인할 수 없습니다.');
    if (this.ownerId && this.ownerId !== ownerId) {
      throw this.error('BROWSER_BUSY', '현재 장보기 브라우저는 다른 Codex 작업이 제어 중입니다.');
    }
    if (this.ownerId === ownerId && this.sessionId) {
      throw this.error('SESSION_ALREADY_ACTIVE', '이 Codex 작업에 이미 실행 중인 장보기 세션이 있습니다.', { sessionId: this.sessionId });
    }
    this.ownerId = ownerId;
    this.sessionId = null;
    this.touch(ownerId);
  }

  bind(ownerId, sessionId, browserId) {
    this.assertOwner(ownerId);
    if (!sessionId) throw this.error('INVALID_BROWSER_RESPONSE', '브라우저가 세션 ID를 반환하지 않았습니다.');
    if (!browserId) throw this.error('INVALID_BROWSER_RESPONSE', '제어할 브라우저 ID가 없습니다.');
    this.sessionId = sessionId;
    this.browserId = browserId;
    this.touch(ownerId);
  }

  assertSession(ownerId, sessionId) {
    this.assertOwner(ownerId);
    if (!this.sessionId || this.sessionId !== sessionId) {
      throw this.error('SESSION_NOT_FOUND', '이 Codex 작업이 제어하는 장보기 세션을 찾을 수 없습니다.');
    }
    this.touch(ownerId);
    return this.browserId;
  }

  assertOwner(ownerId) {
    if (!this.ownerId) throw this.error('SESSION_NOT_FOUND', '활성 장보기 제어 세션이 없습니다.');
    if (this.ownerId !== ownerId) throw this.error('BROWSER_BUSY', '현재 장보기 브라우저는 다른 Codex 작업이 제어 중입니다.');
  }

  touch(ownerId) {
    if (this.ownerId !== ownerId) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.releaseOwner(ownerId), this.timeoutMs);
    this.timer.unref?.();
  }

  releaseOwner(ownerId) {
    if (ownerId && this.ownerId !== ownerId) return false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ownerId = null;
    this.sessionId = null;
    this.browserId = null;
    return true;
  }

  releaseAll() {
    return this.releaseOwner(null);
  }

  releaseBrowser(browserId) {
    if (!browserId || this.browserId !== browserId) return false;
    return this.releaseOwner(this.ownerId);
  }

  describe(requesterId) {
    return {
      controlled: this.ownerId !== null,
      controlledByCurrentClient: this.ownerId !== null && this.ownerId === requesterId,
      sessionId: this.ownerId === requesterId ? this.sessionId : null,
      browserId: this.ownerId === requesterId ? this.browserId : null,
      leaseTimeoutMs: this.timeoutMs,
    };
  }

  error(code, message, details) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    return error;
  }
}

module.exports = { ControlLease };
