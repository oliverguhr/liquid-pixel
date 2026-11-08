const { test, expect } = require('@playwright/test');
const { writeFile } = require('node:fs/promises');
const { moveTarget, paintWall } = require('./controls.cjs');

async function attachSnapshot(page, testInfo, label, state) {
  const statePath = testInfo.outputPath(`${label}.json`);
  const imagePath = testInfo.outputPath(`${label}.png`);
  await writeFile(statePath, JSON.stringify(state, null, 2));
  await page.locator('#game-canvas').screenshot({ path: imagePath });
  await testInfo.attach(`${label}-state`, { path: statePath, contentType: 'application/json' });
  await testInfo.attach(`${label}-game`, { path: imagePath, contentType: 'image/png' });
}

test.beforeEach(async ({ page, baseURL }) => {
  // The installed game must work without contacting a CDN.
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) {
      return route.continue();
    }
    return route.abort();
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (await page.evaluate(() => Boolean(window.gameHarness))) {
    const state = await page.evaluate(() => gameHarness.getState());
    await attachSnapshot(page, testInfo, 'final', state);
  }
});

async function openGame(page) {
  await page.goto('/?debug&seed=123');
  await page.waitForFunction(() => Boolean(window.gameHarness));
}

test('normal game starts and responds to mouse and spawn button', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/playground');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Spawn swarm', exact: true }).click();
  await moveTarget(page, 650, 440);
  // Sample the real, automatically running simulation in the page's JS context.
  await page.waitForFunction(() => env.particles.some(p => p.x > 500));
  expect(await page.evaluate(() => env.particles.length)).toBe(1000);
  expect(await page.evaluate(() => window.gameHarness)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('mouse input, spawning and explicit frames work in the real browser', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openGame(page);
  await page.getByRole('button', { name: 'Spawn swarm', exact: true }).click();
  await moveTarget(page, 650, 440);
  const before = await page.evaluate(() => gameHarness.getState());
  const after = await page.evaluate(() => gameHarness.step(20));
  expect(before.frame).toBe(0);
  expect(after.frame).toBe(20);
  expect(after.particles).toHaveLength(1000);
  expect(after.target).toEqual({ x: 650, y: 440 });
  const meanX = state => state.particles.reduce((sum, p) => sum + p.x, 0) / state.particles.length;
  expect(meanX(after)).toBeGreaterThan(meanX(before) + 50);
  expect(after.diagnostics.outsideField).toBe(0);
  expect(errors).toEqual([]);
});

test('same seed and inputs produce identical states after resetting', async ({ page }) => {
  await openGame(page);
  const replay = () => page.evaluate(() => {
    gameHarness.reset({ seed: 42 });
    gameHarness.setTarget(650, 440);
    gameHarness.spawn();
    gameHarness.step(12);
    gameHarness.setTarget(50, 100);
    return gameHarness.step(8);
  });
  expect(await replay()).toEqual(await replay());
  const changedSeed = await page.evaluate(() => {
    gameHarness.reset({ seed: 43 });
    return gameHarness.spawn().particles;
  });
  const originalSeed = await page.evaluate(() => {
    gameHarness.reset({ seed: 42 });
    return gameHarness.spawn().particles;
  });
  expect(changedSeed).not.toEqual(originalSeed);
});

test('dragging paints obstacles at the pointer even while paused', async ({ page }) => {
  await openGame(page);
  await paintWall(page, 520, 300, 600);
  const state = await page.evaluate(() => gameHarness.getState());
  expect(state.frame).toBe(0);
  expect(state.obstacles.length * state.cellSize ** 2).toBeGreaterThan(5000);
  expect(state.obstacles.some(p => p.x === 520 && p.y === 440)).toBe(true);
  expect(state.obstacles.every(p => Math.abs(p.x - 520) <= 16)).toBe(true);
});

test('a particle finds a route around a finite wall', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => gameHarness.reset({ seed: 123, particleCount: 1 }));
  await paintWall(page, 520, 300, 600);
  await page.getByRole('button', { name: 'Spawn swarm', exact: true }).click();
  await moveTarget(page, 680, 440);
  const state = await page.evaluate(() => gameHarness.step(120));
  expect(state.particles[0].x).toBeGreaterThan(550);
});

test('spawning does not overlap particles in the grid', async ({ page }) => {
  await openGame(page);
  const state = await page.evaluate(() => gameHarness.spawn());
  expect(state.diagnostics.overlaps).toBe(0);
  expect(Object.values(state.diagnostics).every(value => value === 0)).toBe(true);
});

test('cells on every edge and corner are accessible', async ({ page }) => {
  await openGame(page);
  const boundariesAccessible = await page.evaluate(() => {
    const lastX = env.FIELD_X - 1;
    const lastY = env.FIELD_Y - 1;
    return [
      [0, 29], [lastX, 29], [17, 0], [17, lastY],
      [0, 0], [lastX, 0], [0, lastY], [lastX, lastY],
    ].every(([x, y]) => env.getCell(x, y) === env.map[y][x]);
  });
  expect(boundariesAccessible).toBe(true);
});

const boundaryTargets = [
  ['left edge', 0, 400], ['right edge', 799, 400],
  ['top edge', 400, 0], ['bottom edge', 400, 799],
  ['top-left corner', 0, 0], ['top-right corner', 799, 0],
  ['bottom-left corner', 0, 799], ['bottom-right corner', 799, 799],
];

for (const [name, x, y] of boundaryTargets) {
  test(`swarm follows the mouse towards and away from the ${name}`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openGame(page);
    await page.evaluate(() => gameHarness.reset({ seed: 123, particleCount: 100 }));
    await page.getByRole('button', { name: 'Spawn swarm', exact: true }).click();
    await moveTarget(page, x, y);
    const atBoundary = await page.evaluate(() => gameHarness.step(80));
    const meanDistance = (particles, target) => particles.reduce(
      (sum, p) => sum + Math.hypot(p.x - target.x, p.y - target.y), 0,
    ) / particles.length;

    expect(atBoundary.target).toEqual({ x: Math.min(x, 796), y: Math.min(y, 796) });
    expect(atBoundary.diagnostics.outsideField).toBe(0);
    await attachSnapshot(page, testInfo, 'at-boundary', atBoundary);

    await moveTarget(page, 400, 400);
    const returned = await page.evaluate(() => gameHarness.step(80));
    expect(returned.target).toEqual({ x: 400, y: 400 });
    expect(returned.particles).toHaveLength(100);
    expect(meanDistance(returned.particles, returned.target)).toBeLessThan(60);
    expect(returned.particles.every(p =>
      Math.hypot(p.x - atBoundary.target.x, p.y - atBoundary.target.y) > 150,
    )).toBe(true);
    expect(returned.diagnostics.outsideField).toBe(0);
    expect(errors).toEqual([]);

    expect(meanDistance(atBoundary.particles, atBoundary.target)).toBeLessThan(60);
    expect(Object.values(returned.diagnostics).every(value => value === 0)).toBe(true);
  });
}
