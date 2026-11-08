const { chromium } = require('@playwright/test');
const { once } = require('node:events');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createGameServer } = require('./serve.cjs');
const { moveTarget } = require('../browser-tests/controls.cjs');

async function main() {
  const output = path.resolve(__dirname, '../artifacts/capture-preview');
  await mkdir(output, { recursive: true });
  const server = createGameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1040 },
      recordVideo: { dir: output, size: { width: 1440, height: 1040 } },
    });
    const page = await context.newPage();
    const video = page.video();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?debug&seed=123`);
    await page.waitForFunction(() => Boolean(window.gameHarness));
    await page.getByRole('button', { name: 'Capture challenge', exact: true }).click();
    const summaries = [];
    async function record(label) {
      const state = await page.evaluate(() => gameHarness.getState());
      assert.equal(state.particles.length, 1400);
      assert(Object.values(state.diagnostics).every(value => value === 0));
      await page.screenshot({ path: path.join(output, `${label}.png`), fullPage: true });
      await writeFile(path.join(output, `${label}.json`), JSON.stringify(state, null, 2));
      summaries.push({ label, frame: state.frame, counts: state.teams.map(team => team.count),
        combatStats: state.combatStats, diagnostics: state.diagnostics });
      return state;
    }
    const initial = await record('two-clouds');
    await moveTarget(page, 576, 400);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.waitForFunction(() => env.combatStats.conversions >= 40, null, { timeout: 45000 });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const contact = await record('contact');
    assert(contact.teams[1].count > 0 && contact.teams[1].count < 400);

    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.waitForFunction(() => env.teamCounts()[1] === 0, null, { timeout: 45000 });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const captured = await record('captured');
    assert.deepEqual(captured.teams.map(team => team.count), [1400, 0]);
    assert.deepEqual(captured.particles.map(p => p.id), initial.particles.map(p => p.id));
    assert(captured.combatStats.heals > 0);

    await moveTarget(page, 180, 240);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.waitForFunction(() => env.particles.every(p => Math.hypot(p.x - 180, p.y - 240) < 120), null, { timeout: 45000 });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await record('following');
    assert.deepEqual(errors, []);
    await writeFile(path.join(output, 'summary.json'), JSON.stringify(summaries, null, 2));
    await context.close();
    await video.saveAs(path.join(output, 'capture-motion.webm'));
    console.log(JSON.stringify(summaries, null, 2));
    console.log(`Capture animation and states: ${output}`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
