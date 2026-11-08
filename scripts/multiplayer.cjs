const { WebSocketServer, WebSocket } = require('ws');
const { randomInt, randomUUID } = require('node:crypto');
const { VERSION, defaults } = require('../MatchSimulation');

// The server sequences inputs and compares client reports. It never steps a world.
class MultiplayerServer {
  constructor(server, options = {}) {
    this.sessions = new Set();
    this.matches = new Map();
    this.config = { ...defaults, ...options.config, version: VERSION };
    this.batchSteps = 3;
    this.maxAhead = 12;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.now = options.now ?? Date.now;
    this.choose = options.choose ?? randomInt;
    this.newSeed = options.newSeed ?? (() => randomInt(0x100000000));
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
    server.on('upgrade', (request, socket, head) => {
      let allowed = false;
      try {
        allowed = new URL(request.url, 'http://localhost').pathname === '/socket'
          && (!request.headers.origin || new URL(request.headers.origin).host === request.headers.host);
      } catch { /* Malformed origins and paths are rejected below. */ }
      if (!allowed) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
      this.wss.handleUpgrade(request, socket, head, ws => this.wss.emit('connection', ws));
    });
    this.wss.on('connection', ws => this.connect(ws));
    this.timer = setInterval(() => this.pump(), 50);
    this.timer.unref();
    this.heartbeat = setInterval(() => {
      for (const session of this.sessions) {
        if (!session.alive) session.ws.terminate();
        else { session.alive = false; session.ws.ping(); }
      }
    }, 15000);
    this.heartbeat.unref();
    server.on('close', () => this.close());
  }

  send(session, message) {
    if (session.ws.readyState !== WebSocket.OPEN) return;
    if (session.ws.bufferedAmount > 65536) { session.ws.terminate(); return; }
    session.ws.send(JSON.stringify(message));
  }

  connect(ws) {
    const session = { ws, queued: false, match: null, team: null, seq: -1,
      alive: true, rateStart: this.now(), messages: 0 };
    this.sessions.add(session);
    ws.on('pong', () => { session.alive = true; });
    ws.on('message', (data, binary) => {
      const now = this.now();
      if (now - session.rateStart >= 1000) { session.rateStart = now; session.messages = 0; }
      if (++session.messages > 150) { ws.close(1008, 'Too many messages'); return; }
      try {
        if (binary) throw new Error('Text messages required');
        this.receive(session, JSON.parse(data.toString()));
      } catch {
        this.send(session, { type: 'error', message: 'Ungültige Nachricht.' });
      }
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      this.sessions.delete(session);
      if (session.match) this.finish(session.match, 'disconnect');
      this.lobby();
    });
    this.send(session, { type: 'hello', version: VERSION });
    this.lobby();
  }

  lobby() {
    const online = this.sessions.size;
    const waiting = [...this.sessions].filter(s => s.queued).length;
    for (const session of this.sessions) this.send(session, { type: 'lobby', online, waiting, queued: session.queued });
  }

  receive(session, message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid object');
    if (message.type === 'queue') {
      if (session.match) return;
      session.queued = true;
      this.lobby();
      return;
    }
    if (message.type === 'cancel') { session.queued = false; this.lobby(); return; }
    if (message.type === 'leave') {
      if (session.match && message.match === session.match.id) this.finish(session.match, 'left');
      return;
    }
    const match = session.match;
    if (!match || message.match !== match.id) return; // Old matches cannot affect a new one.
    if (message.type === 'input') {
      const { x, y, seq } = message;
      if (Object.keys(message).some(key => !['type', 'match', 'x', 'y', 'seq'].includes(key))
          || !Number.isSafeInteger(seq) || seq <= session.seq
          || !Number.isInteger(x) || !Number.isInteger(y)
          || x < 0 || y < 0 || x >= this.config.width || y >= this.config.height) throw new Error('Invalid input');
      session.seq = seq;
      match.targets[session.team] = [x, y];
      return;
    }
    if (message.type === 'ack') {
      if (!Number.isInteger(message.tick) || message.tick !== session.ackTick + this.batchSteps
          || message.tick > match.tick || typeof message.hash !== 'string' || !/^[0-9a-f]{16}$/.test(message.hash)
          || !Array.isArray(message.counts) || message.counts.length !== 2
          || !message.counts.every(n => Number.isInteger(n) && n >= 0)
          || message.counts[0] + message.counts[1] !== this.config.particleCount * 2) throw new Error('Invalid report');
      session.ackTick = message.tick;
      match.reports[session.team].set(message.tick, { hash: message.hash, counts: message.counts });
      const other = match.reports[1 - session.team].get(message.tick);
      if (!other) return;
      if (other.hash !== message.hash || other.counts.some((count, index) => count !== message.counts[index])) {
        this.finish(match, 'desync');
        return;
      }
      match.reports.forEach(reports => reports.delete(message.tick));
      match.confirmed = message.tick;
      match.progressAt = this.now();
      if (!message.counts[0] || !message.counts[1]) {
        this.finish(match, 'victory', message.counts[0] ? 0 : 1);
      } else {
        for (const player of match.players) this.send(player, { type: 'verified', match: match.id,
          tick: message.tick, hash: message.hash, counts: message.counts });
      }
      return;
    }
    throw new Error('Unknown message');
  }

  start(first, second) {
    const players = this.choose(2) ? [first, second] : [second, first];
    const config = { ...this.config, seed: this.newSeed() };
    const targets = [0.28, 0.72].map(factor => [Math.floor(config.width * factor / config.scale) * config.scale,
      Math.floor(config.height / 2 / config.scale) * config.scale]);
    const match = { id: randomUUID(), players, config, tick: 0, confirmed: -1,
      targets, reports: [new Map(), new Map()], progressAt: this.now() };
    this.matches.set(match.id, match);
    players.forEach((session, team) => {
      session.queued = false;
      session.match = match;
      session.team = team;
      session.seq = -1;
      session.ackTick = -this.batchSteps;
      this.send(session, { type: 'match', match: match.id, team, config, batchSteps: this.batchSteps });
    });
  }

  pump() {
    const waiting = [...this.sessions].filter(session => session.queued && !session.match);
    while (waiting.length >= 2) {
      const first = waiting.splice(this.choose(waiting.length), 1)[0];
      const second = waiting.splice(this.choose(waiting.length), 1)[0];
      this.start(first, second);
      this.lobby();
    }
    for (const match of this.matches.values()) {
      if (this.now() - match.progressAt > this.timeoutMs) { this.finish(match, 'timeout'); continue; }
      if (match.confirmed < 0 || match.tick - match.confirmed >= this.maxAhead) continue;
      match.tick += this.batchSteps;
      const frame = { type: 'frame', match: match.id, tick: match.tick, steps: this.batchSteps,
        targets: match.targets.map(point => [...point]) };
      for (const session of match.players) this.send(session, frame);
    }
  }

  finish(match, reason, winner = null) {
    if (!this.matches.delete(match.id)) return;
    for (const session of match.players) {
      session.match = null;
      session.team = null;
      session.queued = false;
      this.send(session, { type: 'ended', match: match.id, reason, winner, tick: match.confirmed });
    }
    this.lobby();
  }

  close() {
    clearInterval(this.timer);
    clearInterval(this.heartbeat);
    for (const session of this.sessions) session.ws.terminate();
    this.wss.close();
  }
}
module.exports = { MultiplayerServer };
