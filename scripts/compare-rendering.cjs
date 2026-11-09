// Compare a saved Renderer.js with the current renderer on the same world.
const { chromium } = require('@playwright/test');
const { createGameServer } = require('./serve.cjs');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const baseline = path.resolve(process.argv[2] || 'artifacts/performance/versions/baseline/Renderer.js');
  const output = path.resolve('artifacts/performance');
  await fs.mkdir(output, { recursive: true });
  const source = await fs.readFile(baseline, 'utf8');
  const server = createGameServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch();
    const session = await browser.newBrowserCDPSession();
    const { gpu } = await session.send('SystemInfo.getInfo');
    const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
    await page.waitForFunction(() => window.gameHarness);
    await page.addScriptTag({ content: source.replace('class Renderer', 'class BaselineRenderer') });
    const result = await page.evaluate(async () => {
      env = MatchSimulation.create({ ...MatchSimulation.defaults, seed: 123 });
      env.updateSubstep();
      const initial = MatchSimulation.state(env);
      const samples = [];
      for (const density of [2, 3]) {
        pixelDensity(density);
        const renderers = { before: new BaselineRenderer(density), after: new Renderer(density) };
        for (let repeat = 0; repeat < 3; repeat++) {
          for (const variant of repeat % 2 ? ['after', 'before'] : ['before', 'after']) {
            const times = [];
            for (let frame = 0; frame < 60; frame++) {
              await new Promise(requestAnimationFrame);
              const start = performance.now();
              renderers[variant].render(env, drawingContext, false);
              if (frame >= 15) times.push(performance.now() - start);
            }
            times.sort((a, b) => a - b);
            samples.push({ density, repeat, variant,
              meanMs: times.reduce((a, b) => a + b, 0) / times.length,
              p95Ms: times[Math.floor((times.length - 1) * 0.95)] });
          }
        }
      }
      return { samples, initial, final: MatchSimulation.state(env) };
    });
    assert.deepEqual(result.initial, result.final);
    delete result.initial;
    delete result.final;
    await page.evaluate(() => { pixelDensity(2); renderer = new BaselineRenderer(2); renderGame(); });
    await page.locator('#game-canvas').screenshot({ path: path.join(output, 'glow-before.png') });
    await page.evaluate(() => { renderer = new Renderer(2); renderGame(); });
    await page.locator('#game-canvas').screenshot({ path: path.join(output, 'glow-after.png') });
    await fs.writeFile(path.join(output, 'glow-comparison.json'), JSON.stringify({ ...result, gpu }, null, 2));
    console.table(result.samples);
  } finally {
    if (browser) await browser.close();
    server.multiplayer.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
