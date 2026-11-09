const { test, expect } = require('@playwright/test');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { moveTarget, paintWall } = require('./controls.cjs');

const output = path.resolve(__dirname, '../artifacts/ui-preview');

test.beforeEach(async ({ page }) => {
  await page.goto('/?debug&seed=123');
  await page.waitForFunction(() => Boolean(window.gameHarness));
  await mkdir(output, { recursive: true });
});

async function resolution(page) {
  return page.locator('#game-canvas').evaluate(canvas => ({
    width: canvas.width, height: canvas.height,
    worldWidth: Number(canvas.dataset.worldWidth),
    displayWidth: canvas.getBoundingClientRect().width,
  }));
}

async function healthy(page) {
  const state = await page.evaluate(() => gameHarness.getState());
  expect(state.particles).toHaveLength(1000);
  expect(Object.values(state.diagnostics).every(value => value === 0)).toBe(true);
}

test('desktop view has a high-resolution renderer and working session controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const buffer = await resolution(page);
  expect(buffer.width).toBeGreaterThanOrEqual(1600);
  expect(buffer.height).toBeGreaterThanOrEqual(1600);
  expect(buffer.displayWidth).toBeGreaterThan(700);
  await paintWall(page, 520, 250, 570);
  await page.getByRole('button', { name: 'Spawn swarm', exact: true }).click();
  await moveTarget(page, 680, 400);
  await page.evaluate(() => gameHarness.step(70));
  await expect(page.locator('#particle-count')).toHaveText('1,000');
  await expect(page.locator('#map-label')).toHaveText('Custom terrain');
  await expect(page.locator('#empty-state')).toBeHidden();
  const beforeRender = await page.evaluate(() => gameHarness.getState());
  await page.evaluate(() => { renderGame(); renderGame(); });
  expect(await page.evaluate(() => gameHarness.getState())).toEqual(beforeRender);

  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(frame => simulationFrame > frame, beforeRender.frame);
  await expect(page.locator('#simulation-label')).toHaveText('Live');
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#simulation-label')).toHaveText('Paused');
  expect(await page.evaluate(() => gameHarness.getState().paused)).toBe(true);

  await page.getByRole('button', { name: 'Clear terrain', exact: true }).click();
  expect(await page.evaluate(() => gameHarness.getState().obstacles.length)).toBe(0);
  await expect(page.locator('#map-label')).toHaveText('Open field');
  await page.evaluate(() => gameHarness.step(1));
  await healthy(page);
  expect(errors).toEqual([]);
});

test('narrow view stays usable and pointer coordinates follow the scaled field', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Spawn swarm', exact: true }).click();
  await moveTarget(page, 650, 440);
  const state = await page.evaluate(() => gameHarness.step(50));
  expect(state.target).toEqual({ x: 650, y: 440 });
  const buffer = await resolution(page);
  expect(buffer.width).toBeGreaterThanOrEqual(1600);
  expect(buffer.displayWidth).toBeLessThan(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await healthy(page);
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
});

test('both teams retain soft light outside their sharp cores and clearing removes the light', async ({ page }) => {
  const result = await page.evaluate(() => {
    const sample = (x, y) => Array.from(drawingContext.getImageData(
      x * pixelDensity(), y * pixelDensity(), 1, 1).data);
    env.clearParticles();
    renderGame();
    const dark = [sample(205, 202), sample(505, 502)];
    env.particles.push(new Particle(200, 200, env, 0), new Particle(500, 500, env, 1));
    const before = MatchSimulation.state(env);
    renderGame();
    const lit = [sample(205, 202), sample(505, 502)];
    const after = MatchSimulation.state(env);
    env.clearParticles();
    renderGame();
    return { dark, lit, cleared: [sample(205, 202), sample(505, 502)], before, after };
  });
  expect(result.after).toEqual(result.before);
  expect(result.lit[0][2]).toBeGreaterThan(result.dark[0][2] + 2);
  expect(result.lit[1][0]).toBeGreaterThan(result.dark[1][0] + 2);
  expect(result.cleared).toEqual(result.dark);
});

test.describe('retina display', () => {
  test.use({ deviceScaleFactor: 3, viewport: { width: 1100, height: 900 } });
  test('uses native HiDPI backing pixels without changing world coordinates', async ({ page }) => {
    expect((await resolution(page)).width).toBe(2400);
    expect((await resolution(page)).worldWidth).toBe(800);
    await page.getByRole('button', { name: 'Spawn swarm', exact: true }).click();
    await moveTarget(page, 650, 440);
    const state = await page.evaluate(() => gameHarness.step(1));
    expect(state.target).toEqual({ x: 650, y: 440 });
    await healthy(page);
  });
});
