// Rendering ablation in an isolated, paused world. Never changes the game files.
const { chromium } = require('@playwright/test');
const { createGameServer } = require('./serve.cjs');
const { once } = require('node:events');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const output = path.resolve(__dirname, '../artifacts/performance');
  await mkdir(output, { recursive: true });
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
    const result = await page.evaluate(async () => {
      env = MatchSimulation.create({ ...MatchSimulation.defaults, seed: 123 });
      env.updateSubstep();
      const initial = MatchSimulation.report(env);
      const samples = [];
      for (const density of [2, 1, 3]) {
        for (const glow of [true, false]) {
          pixelDensity(density);
          renderer.setDensity(density);
          const context = drawingContext;
          renderer.render(env, context, false); // Build the optional light surface before wrapping it.
          const contexts = [context, renderer.glowLayer?.context].filter(Boolean);
          const originals = contexts.map(surface => surface.drawImage);
          // Skip both light accumulation and compositing. Keep equal wrapper cost.
          contexts.forEach((surface, index) => {
            surface.drawImage = function (...args) {
              if (glow || this.globalCompositeOperation !== 'lighter') return originals[index].apply(this, args);
            };
          });
          const timings = [];
          try {
            for (let frame = 0; frame < 80; frame++) {
              await new Promise(requestAnimationFrame);
              const start = performance.now();
              renderer.render(env, context, false);
              if (frame >= 20) timings.push(performance.now() - start);
            }
          } finally {
            contexts.forEach((surface, index) => { surface.drawImage = originals[index]; });
          }
          timings.sort((a, b) => a - b);
          samples.push({ density, glow, meanMs: timings.reduce((a, b) => a + b, 0) / timings.length,
            p95Ms: timings[Math.floor((timings.length - 1) * 0.95)],
            canvas: [context.canvas.width, context.canvas.height] });
        }
      }
      return { samples, initial, final: MatchSimulation.report(env) };
    });
    assert.deepEqual(result.initial, result.final);
    await writeFile(path.join(output, 'rendering.json'), JSON.stringify({ ...result, gpu }, null, 2));
    console.table(result.samples);
    console.log(`Rendering measurements: ${output}/rendering.json`);
  } finally {
    if (browser) await browser.close();
    server.multiplayer.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
