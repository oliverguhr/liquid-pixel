// Only ordered server input packets can advance the online simulation.
class MultiplayerClient {
  constructor({ onMatch, getEnvironment, onChange, onEnd }) {
    this.onMatch = onMatch;
    this.getEnvironment = getEnvironment;
    this.onChange = onChange;
    this.onEnd = onEnd;
    this.phase = 'lobby';
    this.connection = 'connecting';
    this.online = 0;
    this.waiting = 0;
    this.match = null;
    this.team = null;
    this.frames = [];
    this.current = null;
    this.seq = 0;
    this.lastInput = '';
    this.pendingTarget = null;
    this.cursor = { x: 0, y: 0, team: 0 };
    this.verified = null;
    this.checkpoints = new Map();
    this.debug = new URLSearchParams(location.search).has('debug');
    this.connect();
    this.inputTimer = setInterval(() => this.flushInput(), 50);
    window.addEventListener('pagehide', () => this.close());
  }

  connect() {
    this.connection = 'connecting';
    const url = new URL('/socket', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', event => {
      try { this.receive(JSON.parse(event.data)); }
      catch { this.fail('Das Spiel konnte nicht synchronisiert werden.'); }
    });
    this.socket.addEventListener('error', () => {});
    this.socket.addEventListener('close', () => {
      this.connection = 'offline';
      this.online = 0;
      this.waiting = 0;
      if (this.phase === 'match') this.end({ reason: 'connection' });
      else if (this.phase !== 'result') this.phase = 'lobby';
      this.onChange();
      if (!this.closed) this.reconnectTimer = setTimeout(() => this.connect(), 2000);
    });
  }

  send(message) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  receive(message) {
    if (message.type === 'hello') {
      if (message.version !== MatchSimulation.VERSION) {
        this.notice = 'Neue Spielversion verfügbar. Bitte lade die Seite neu.';
        this.close();
      } else this.connection = 'online';
    } else if (message.type === 'lobby') {
      this.online = message.online;
      this.waiting = message.waiting;
      if (this.phase === 'lobby' || this.phase === 'searching') this.phase = message.queued ? 'searching' : 'lobby';
    } else if (message.type === 'match') {
      this.match = message.match;
      this.team = message.team;
      this.phase = 'match';
      this.frames = [];
      this.current = null;
      this.checkpoints.clear();
      this.verified = null;
      this.seq = 0;
      this.lastInput = '';
      this.pendingTarget = null;
      this.resultPending = false;
      this.clock = performance.now();
      this.accumulator = 0;
      this.onMatch(message.config);
      const player = this.getEnvironment().teams[this.team].player;
      this.cursor = { x: player.x, y: player.y, team: this.team };
      this.report();
    } else if (message.match === this.match && this.phase === 'match') {
      if (message.type === 'frame') {
        if (this.frames.length > 8 || message.steps !== 3) throw new Error('Invalid frame window');
        this.frames.push(message);
      } else if (message.type === 'verified') this.verified = message;
      else if (message.type === 'ended') this.end(message);
      else if (message.type === 'error') this.notice = message.message;
    }
    this.onChange();
  }

  queue() {
    if (this.connection !== 'online' || this.phase !== 'lobby') return;
    this.phase = 'searching';
    this.notice = '';
    this.send({ type: 'queue' });
    this.onChange();
  }

  cancel() { this.send({ type: 'cancel' }); }
  leave() { this.send({ type: 'leave', match: this.match }); }

  target(x, y) {
    if (this.phase !== 'match') return;
    const env = this.getEnvironment();
    const point = { x: Math.max(0, Math.min(env.FIELD_X - env.SCALE, Math.floor(x))),
      y: Math.max(0, Math.min(env.FIELD_Y - env.SCALE, Math.floor(y))) };
    this.cursor = { ...point, team: this.team };
    this.pendingTarget = point;
  }

  flushInput() {
    if (!this.pendingTarget || this.phase !== 'match' || this.resultPending) return;
    const key = `${this.pendingTarget.x},${this.pendingTarget.y}`;
    if (key === this.lastInput) return;
    this.lastInput = key;
    this.send({ type: 'input', match: this.match, seq: this.seq++, ...this.pendingTarget });
  }

  report() {
    const env = this.getEnvironment();
    const report = MatchSimulation.report(env);
    if (this.debug) {
      this.checkpoints.set(env.tick, { report, state: MatchSimulation.state(env) });
      if (this.checkpoints.size > 20) this.checkpoints.delete(this.checkpoints.keys().next().value);
    }
    this.send({ type: 'ack', match: this.match, ...report });
    this.resultPending = report.counts.some(count => count === 0);
  }

  advance(now) {
    if (this.phase !== 'match' || this.resultPending) return;
    this.accumulator = Math.min(100, this.accumulator + Math.max(0, now - this.clock));
    this.clock = now;
    const env = this.getEnvironment();
    let processed = 0;
    // Catch up after delayed rendering without tying simulation speed to FPS.
    while (this.accumulator >= 1000 / 60 && processed < 6) {
      if (!this.current) {
        const frame = this.frames.shift();
        if (!frame) { this.accumulator = Math.min(this.accumulator, 1000 / 60); break; }
        if (frame.tick !== env.tick + frame.steps) { this.fail('Die Eingabereihenfolge stimmt nicht überein.'); return; }
        MatchSimulation.setTargets(env, frame.targets);
        this.current = frame;
      }
      env.updateSubstep();
      this.accumulator -= 1000 / 60;
      processed++;
      if (env.tick === this.current.tick) {
        this.current = null;
        this.report();
        if (this.resultPending) break;
      }
    }
  }

  fail(notice) {
    this.notice = notice;
    this.leave();
    this.end({ reason: 'desync' });
  }

  end(message) {
    if (this.phase !== 'match') return;
    this.phase = 'result';
    this.frames = [];
    this.current = null;
    this.lastResult = { ...message, team: this.team };
    this.onEnd(this.lastResult);
  }

  returnToLobby() {
    this.phase = 'lobby';
    this.match = null;
    this.team = null;
    this.onChange();
  }

  close() {
    this.closed = true;
    clearInterval(this.inputTimer);
    clearTimeout(this.reconnectTimer);
    this.socket.close();
  }
}
