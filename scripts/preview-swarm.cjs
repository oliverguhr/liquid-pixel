const { chromium } = require('@playwright/test');
const { once } = require('node:events');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createGameServer } = require('./serve.cjs');
const { moveTarget } = require('../browser-tests/controls.cjs');

async function main() {
  const output = path.resolve(__dirname, '../artifacts/swarm-preview');
  await mkdir(output, { recursive: true });
  const server = createGameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1000, height: 900 },
      recordVideo: { dir: output, size: { width: 1000, height: 900 } },
    });
    const page = await context.newPage();
    const video = page.video();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?debug&seed=123`);
    await page.waitForFunction(() => Boolean(window.gameHarness));
    await page.getByRole('button', { name: 'Spawn swarm', exact: true }).click();
    await moveTarget(page, 400, 400);
    await page.evaluate(() => gameHarness.step(160));
    await page.locator('#game-canvas').screenshot({ path: path.join(output, 'resting-circle.png') });
    const summaries = [];
    for (const [index, [x, y]] of [[680, 400], [120, 400], [400, 180], [400, 650]].entries()) {
      await moveTarget(page, x, y);
      const targetTick = await page.evaluate(() => {
        gameHarness.resume();
        return env.tick + 150;
      });
      await page.waitForFunction(tick => env.tick >= tick, targetTick);
      const state = await page.evaluate(() => gameHarness.pause());
      assert.equal(state.particles.length, 1000);
      assert(Object.values(state.diagnostics).every(value => value === 0));
      await page.locator('#game-canvas').screenshot({ path: path.join(output, `moving-${index}.png`) });
      await writeFile(path.join(output, `moving-${index}.json`), JSON.stringify(state, null, 2));
      summaries.push({ x, y, frame: state.frame, diagnostics: state.diagnostics });
    }
    assert.deepEqual(errors, []);
    await writeFile(path.join(output, 'summary.json'), JSON.stringify(summaries, null, 2));
    await context.close();
    await video.saveAs(path.join(output, 'swarm-motion.webm'));
    console.log(`Animation and states: ${output}`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
