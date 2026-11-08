const { chromium } = require('@playwright/test');
const { mkdir, writeFile } = require('node:fs/promises');
const { once } = require('node:events');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createGameServer } = require('./serve.cjs');
const { moveTarget, paintWall } = require('../browser-tests/controls.cjs');

async function main() {
  const output = path.resolve(__dirname, '../artifacts/agent-play');
  await mkdir(output, { recursive: true });
  const server = createGameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  let context;
  let tracing = false;
  try {
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    tracing = true;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?debug&seed=123`);
    await page.waitForFunction(() => Boolean(window.gameHarness));
    const timeline = [];

    async function capture(label) {
      const state = await page.evaluate(() => gameHarness.getState());
      assert.equal(state.particles.length, 1000);
      assert(Object.values(state.diagnostics).every(value => value === 0), 'Invalid particle occupancy');
      await page.locator('#game-canvas').screenshot({ path: path.join(output, `${label}.png`) });
      await writeFile(path.join(output, `${label}.json`), JSON.stringify(state, null, 2));
      const summary = {
        label, frame: state.frame, particles: state.particles.length,
        meanX: state.particles.reduce((sum, p) => sum + p.x, 0) / state.particles.length,
        beyondWall: state.particles.filter(p => p.x > 550).length,
        diagnostics: state.diagnostics,
      };
      timeline.push(summary);
      console.log(JSON.stringify(summary));
    }

    // Use actual pointer events and the actual spawn button.
    await paintWall(page, 520, 300, 600);
    await page.getByRole('button', { name: 'Spawn swarm', exact: true }).click();
    await moveTarget(page, 680, 440);
    await capture('00-spawn');
    let previousFrame = 0;
    for (const frame of [40, 80, 160, 240, 400]) {
      await page.evaluate(frames => gameHarness.step(frames), frame - previousFrame);
      await capture(`${frame}-frames`);
      previousFrame = frame;
    }
    const final = await page.evaluate(() => gameHarness.getState());
    assert(final.particles.every(particle => particle.x > 550), 'Swarm did not get around the wall');
    await writeFile(path.join(output, 'summary.json'), JSON.stringify({ timeline, errors }, null, 2));
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`Screenshots, states and trace: ${output}`);
  } finally {
    try {
      if (tracing) await context.tracing.stop({ path: path.join(output, 'trace.zip') });
    } finally {
      if (browser) await browser.close();
      await new Promise(resolve => server.close(resolve));
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
