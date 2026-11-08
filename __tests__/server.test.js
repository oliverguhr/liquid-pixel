const { once } = require('node:events');
const { WebSocket } = require('ws');
const { createGameServer } = require('../scripts/serve.cjs');
const MatchSimulation = require('../MatchSimulation');

let server;
let clients;
let url;

async function connect() {
  const ws = new WebSocket(url);
  const inbox = [];
  ws.on('message', data => inbox.push(JSON.parse(data)));
  await once(ws, 'open');
  const client = {
    ws, inbox,
    send: message => ws.send(JSON.stringify(message)),
    take(predicate) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { clearInterval(timer); reject(new Error(`Message timeout; inbox: ${JSON.stringify(inbox)}`)); }, 3000);
        const timer = setInterval(() => {
          const index = inbox.findIndex(typeof predicate === 'string' ? message => message.type === predicate : predicate);
          if (index < 0) return;
          clearTimeout(timeout); clearInterval(timer); resolve(inbox.splice(index, 1)[0]);
        }, 5);
      });
    },
  };
  clients.push(client);
  return client;
}

async function pair() {
  const first = await connect();
  const second = await connect();
  first.send({ type: 'queue' });
  second.send({ type: 'queue' });
  const starts = await Promise.all([first.take('match'), second.take('match')]);
  return { first, second, starts };
}

function ack(client, start, tick, hash = '1234567812345678', counts = [20, 20]) {
  client.send({ type: 'ack', match: start.match, tick, hash, counts });
}

beforeEach(async () => {
  clients = [];
  server = createGameServer({ config: { width: 80, height: 60, particleCount: 20 }, choose: () => 0 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `ws://127.0.0.1:${server.address().port}/socket`;
});

afterEach(async () => {
  for (const client of clients) client.ws.terminate();
  server.multiplayer.close();
  await new Promise(resolve => server.close(resolve));
});

test('lobby counts connections and cancellable waiting players', async () => {
  const first = await connect();
  const second = await connect();
  expect((await first.take(m => m.type === 'lobby' && m.online === 2)).waiting).toBe(0);
  first.send({ type: 'queue' });
  expect((await second.take(m => m.type === 'lobby' && m.waiting === 1)).online).toBe(2);
  first.send({ type: 'cancel' });
  await first.take(m => m.type === 'lobby' && !m.queued && m.waiting === 0);
  second.ws.close();
  await first.take(m => m.type === 'lobby' && m.online === 1 && m.waiting === 0);
  expect(server.multiplayer.matches.size).toBe(0);
});

test('two queued players get the same configuration, distinct teams and no duplicate match', async () => {
  const { first, starts } = await pair();
  expect(starts[0].config).toEqual(starts[1].config);
  expect(starts[0].match).toBe(starts[1].match);
  expect(starts[0].team).not.toBe(starts[1].team);
  first.send({ type: 'queue' });
  expect(server.multiplayer.matches.size).toBe(1);
  const outsider = await connect();
  outsider.send({ type: 'queue' });
  await outsider.take(m => m.type === 'lobby' && m.queued);
  expect(server.multiplayer.matches.size).toBe(1);
});

test('real clients simulate identical server packets and only their own targets are accepted', async () => {
  const { first, second, starts } = await pair();
  const worlds = starts.map(start => MatchSimulation.create(start.config));
  [first, second].forEach((client, i) => client.send({ type: 'ack', match: starts[i].match, ...MatchSimulation.report(worlds[i]) }));
  await first.take(m => m.type === 'verified' && m.tick === 0);
  first.send({ type: 'input', match: starts[0].match, seq: 0, x: 12, y: 36 });
  for (let index = 0; index < 8; index++) {
    const frames = await Promise.all([first.take('frame'), second.take('frame')]);
    expect(frames[0]).toEqual(frames[1]);
    worlds.forEach((env, i) => MatchSimulation.applyFrame(env, frames[i]));
    expect(MatchSimulation.state(worlds[0])).toEqual(MatchSimulation.state(worlds[1]));
    [first, second].forEach((client, i) => client.send({ type: 'ack', match: starts[i].match, ...MatchSimulation.report(worlds[i]) }));
    await first.take(m => m.type === 'verified' && m.tick === frames[0].tick);
  }
  expect(worlds[0].teams[starts[0].team].player.x).toBe(12);
  first.send({ type: 'input', match: starts[0].match, seq: 1, x: 30, y: 20, team: starts[1].team, health: 1000 });
  await first.take('error');
  const match = server.multiplayer.matches.get(starts[0].match);
  expect(match.targets[starts[0].team]).toEqual([12, 36]);
});

test('backpressure bounds unacknowledged steps; conflicting hashes end both sides without a winner', async () => {
  const { first, second, starts } = await pair();
  ack(first, starts[0], 0); ack(second, starts[1], 0);
  await first.take(m => m.type === 'verified' && m.tick === 0);
  clearInterval(server.multiplayer.timer);
  for (let index = 0; index < 20; index++) server.multiplayer.pump();
  const match = server.multiplayer.matches.get(starts[0].match);
  expect(match.tick).toBe(12);
  ack(first, starts[0], 3, 'aaaaaaaaaaaaaaaa');
  ack(second, starts[1], 3, 'bbbbbbbbbbbbbbbb');
  const ended = await Promise.all([first.take('ended'), second.take('ended')]);
  expect(ended.map(m => m.reason)).toEqual(['desync', 'desync']);
  expect(ended.every(m => m.winner === null)).toBe(true);
  expect(server.multiplayer.matches.size).toBe(0);
  await first.take(m => m.type === 'lobby' && m.waiting === 0);
});

test('a unilateral win report cannot finish a match; agreeing reports return both to lobby', async () => {
  const { first, second, starts } = await pair();
  ack(first, starts[0], 0); ack(second, starts[1], 0);
  await first.take(m => m.type === 'verified' && m.tick === 0);
  await first.take('frame');
  ack(first, starts[0], 3, 'aaaaaaaaaaaaaaaa', [40, 0]);
  // The first report must have reached the server before checking the pending result.
  first.send({ type: 'input', match: starts[0].match, seq: 0, x: -1, y: 0 });
  await first.take('error');
  expect(server.multiplayer.matches.size).toBe(1);
  ack(second, starts[1], 3, 'aaaaaaaaaaaaaaaa', [40, 0]);
  const ended = await Promise.all([first.take('ended'), second.take('ended')]);
  expect(ended.every(m => m.reason === 'victory' && m.winner === 0)).toBe(true);
  expect([...server.multiplayer.sessions].every(s => !s.queued && !s.match)).toBe(true);
});

test('disconnect removes waiting players and ends a running match for the survivor', async () => {
  const { first, second } = await pair();
  second.ws.close();
  expect((await first.take('ended')).reason).toBe('disconnect');
  await first.take(m => m.type === 'lobby' && m.online === 1 && m.waiting === 0);
});

test('nonresponsive clients time out and stale match messages cannot affect the next match', async () => {
  const { first, second, starts } = await pair();
  server.multiplayer.matches.get(starts[0].match).progressAt -= 11000;
  server.multiplayer.pump();
  expect((await first.take('ended')).reason).toBe('timeout');
  await second.take('ended');
  first.send({ type: 'queue' }); second.send({ type: 'queue' });
  const next = await first.take('match');
  first.send({ type: 'leave', match: starts[0].match });
  first.send({ type: 'input', match: next.match, seq: 0, x: NaN, y: 0 });
  await first.take('error');
  expect(server.multiplayer.matches.has(next.match)).toBe(true);
});

test('cross-origin upgrades are rejected and oversized messages close the connection', async () => {
  const status = await new Promise(resolve => {
    const ws = new WebSocket(url, { origin: 'https://unrelated.example' });
    ws.on('error', () => {});
    ws.on('unexpected-response', (_request, response) => {
      resolve(response.statusCode);
      response.destroy();
      ws.terminate();
    });
  });
  expect(status).toBe(403);
  const client = await connect();
  const closed = once(client.ws, 'close');
  client.ws.send('x'.repeat(4096));
  expect((await closed)[0]).toBe(1009);
});
