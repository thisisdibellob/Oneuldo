class BrowserMarketRuntime {
  constructor(bridge) {
    this.bridge = bridge;
  }

  start(input = {}) {
    return this.bridge.request(input.browserId, { type: 'start', input: this.withoutBrowserId(input) });
  }

  observe(input = {}) {
    return this.bridge.request(input.browserId, { type: 'observe', input: this.withoutBrowserId(input) });
  }

  move(input = {}) {
    return this.bridge.request(input.browserId, { type: 'action', input: {
      sessionId: input.sessionId,
      actionId: input.actionId,
      expectedRevision: input.expectedRevision,
      decisionSummary: input.decisionSummary,
      action: { type: 'move', dx: input.dx, dy: input.dy, at: input.at },
    } });
  }

  act(input = {}) {
    return this.bridge.request(input.browserId, { type: 'action', input: this.withoutBrowserId(input) });
  }

  exportEpisode(input = {}) {
    return this.bridge.request(input.browserId, { type: 'export', input: this.withoutBrowserId(input) });
  }

  stop(input = {}) {
    return this.bridge.request(input.browserId, { type: 'stop', input: this.withoutBrowserId(input) });
  }

  withoutBrowserId(input) {
    const { browserId: _browserId, ...rest } = input;
    return rest;
  }
}

module.exports = { BrowserMarketRuntime };
