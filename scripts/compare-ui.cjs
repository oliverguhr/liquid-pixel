// Isolate repeated status updates; use real DOM and include changing states.
const { chromium } = require('@playwright/test');
const { createGameServer } = require('./serve.cjs');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const before = await fs.readFile(process.argv[2], 'utf8');
  const start = before.indexOf('function syncOnlineUI()');
  const end = before.indexOf('function showMatchResult', start);
  assert(start >= 0 && end > start);
  const source = before.slice(start, end).replace('function syncOnlineUI()', 'function baselineSyncOnlineUI()');
  const server = createGameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => multiplayer.connection === 'online');
    await page.addScriptTag({ content: source });
    const result = await page.evaluate(() => {
      const samples = [], states = [];
      const updates = { before: baselineSyncOnlineUI, after: syncOnlineUI };
      const snapshot = () => [document.body.dataset.view,
        ...['lobby-view', 'game-view', 'result-view', 'leave-button', 'play-button', 'cancel-search-button']
          .map(id => { const el = document.getElementById(id); return [el.hidden, el.disabled]; }),
        ...['online-count', 'waiting-count', 'connection-label', 'lobby-message', 'session-kind', 'mode-name']
          .map(id => document.getElementById(id).textContent)];
      for (let repeat = 0; repeat < 5; repeat++) {
        for (const variant of repeat % 2 ? ['after', 'before'] : ['before', 'after']) {
          const update = updates[variant];
          const begin = performance.now();
          for (let index = 0; index < 3000; index++) {
            // Most network packets leave these UI properties unchanged.
            const group = Math.floor(index / 100);
            multiplayer.phase = ['lobby', 'searching', 'match', 'result'][group % 4];
            multiplayer.connection = group % 7 === 0 ? 'offline' : 'online';
            multiplayer.online = 2 + Math.floor(group / 4);
            multiplayer.waiting = group % 2;
            multiplayer.notice = group % 3 === 0 ? 'Test status' : '';
            update();
            if (index % 100 === 99 && repeat === 0) states.push({ variant, snapshot: snapshot() });
          }
          samples.push({ repeat, variant, perCallMs: (performance.now() - begin) / 3000 });
        }
      }
      return { samples, states };
    });
    assert.deepEqual(result.states.filter(s => s.variant === 'after').map(s => s.snapshot),
      result.states.filter(s => s.variant === 'before').map(s => s.snapshot));
    await fs.mkdir('artifacts/performance', { recursive: true });
    await fs.writeFile(path.resolve('artifacts/performance/step-8-ui.json'), JSON.stringify(result, null, 2));
    console.table(result.samples);
  } finally {
    if (browser) await browser.close();
    server.multiplayer.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
