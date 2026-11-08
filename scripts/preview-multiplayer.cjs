const { chromium } = require('@playwright/test');
const { once } = require('node:events');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createGameServer } = require('./serve.cjs');
const { moveTarget } = require('../browser-tests/controls.cjs');

async function main() {
  const output = path.resolve(__dirname, '../artifacts/multiplayer-preview');
  await mkdir(output, { recursive: true });
  const server = createGameServer({ newSeed: () => 123 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch();
    const contexts = await Promise.all([0, 1].map(() => browser.newContext({
      viewport: { width: 1440, height: 1040 },
      recordVideo: { dir: output, size: { width: 1440, height: 1040 } },
    })));
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const videos = pages.map(page => page.video());
    const errors = [];
    for (const page of pages) {
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.getByRole('button', { name: 'Spielen', exact: true }).waitFor();
      await page.waitForFunction(() => multiplayer.connection === 'online');
      assert.equal(await page.evaluate(() => window.gameHarness), undefined);
    }
    await pages[0].waitForFunction(() => multiplayer.online === 2);
    await pages[0].screenshot({ path: path.join(output, 'lobby.png'), fullPage: true });
    await pages[0].getByRole('button', { name: 'Spielen', exact: true }).click();
    await pages[0].waitForFunction(() => multiplayer.phase === 'searching');
    await pages[0].screenshot({ path: path.join(output, 'waiting.png'), fullPage: true });
    await pages[1].getByRole('button', { name: 'Spielen', exact: true }).click();
    for (const page of pages) await page.waitForFunction(() => multiplayer.phase === 'match');
    const blue = await pages[0].evaluate(() => multiplayer.team) === 0 ? pages[0] : pages[1];
    const red = blue === pages[0] ? pages[1] : pages[0];
    await moveTarget(blue, 576, 400);
    await blue.waitForFunction(() => env.combatStats.conversions >= 40);
    await blue.screenshot({ path: path.join(output, 'blue-contact.png'), fullPage: true });
    await red.screenshot({ path: path.join(output, 'red-contact.png'), fullPage: true });
    for (const page of pages) await page.waitForFunction(() => multiplayer.lastResult?.reason === 'victory', null, { timeout: 60000 });
    const states = await Promise.all(pages.map(page => page.evaluate(() => ({
      team: multiplayer.team, result: multiplayer.lastResult, verified: multiplayer.verified,
      state: MatchSimulation.state(env), report: MatchSimulation.report(env),
    }))));
    assert.deepEqual(states[0].state, states[1].state);
    assert.equal(states[0].state.particles.length, 2000);
    assert(states[0].report.counts.includes(0));
    assert.equal(states[0].result.winner, states[1].result.winner);
    await blue.screenshot({ path: path.join(output, 'result.png'), fullPage: true });
    await writeFile(path.join(output, 'completed-match.json'), JSON.stringify(states, null, 2));
    for (const page of pages) await page.waitForFunction(() => multiplayer.phase === 'lobby');
    await pages[0].screenshot({ path: path.join(output, 'returned-lobby.png'), fullPage: true });
    assert.deepEqual(errors, []);
    await Promise.all(contexts.map(context => context.close()));
    await Promise.all(videos.map((video, index) => video.saveAs(path.join(output, `player-${index + 1}.webm`))));
    console.log(JSON.stringify(states.map(({ team, result, report }) => ({ team, result, report })), null, 2));
    console.log(`Live multiplayer recording: ${output}`);
  } finally {
    if (browser) await browser.close();
    server.multiplayer.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
