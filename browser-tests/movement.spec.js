const { test, expect } = require('@playwright/test');
const { writeFile } = require('node:fs/promises');
const { moveTarget, paintWall, paintPath } = require('./controls.cjs');

const pageErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?debug&seed=123');
  await page.waitForFunction(() => Boolean(window.gameHarness));
});

async function snapshot(page, testInfo, name, state) {
  await writeFile(testInfo.outputPath(`${name}.json`), JSON.stringify(state, null, 2));
  await page.locator('#game-canvas').screenshot({ path: testInfo.outputPath(`${name}.png`) });
}

function healthy(state, count) {
  expect(state.particles).toHaveLength(count);
  expect(Object.values(state.diagnostics).every(value => value === 0)).toBe(true);
}

function meanDistance(state, x, y) {
  return state.particles.reduce((sum, particle) => sum + Math.hypot(particle.x - x, particle.y - y), 0) / state.particles.length;
}

test.afterEach(async ({ page }, testInfo) => {
  const state = await page.evaluate(() => gameHarness.getState());
  await snapshot(page, testInfo, 'final', state);
  expect(pageErrors.get(page)).toEqual([]);
});

async function spawn(page, x, y) {
  await page.getByRole('button', { name: 'Spawn swarm', exact: true }).click();
  await moveTarget(page, x, y);
}

test('the full swarm routes around a painted wall and conserves its pixels', async ({ page }, testInfo) => {
  await paintWall(page, 520, 300, 600);
  await spawn(page, 680, 440);
  const initial = await page.evaluate(() => gameHarness.getState());
  healthy(initial, 1000);
  await snapshot(page, testInfo, 'spawn', initial);
  for (let checkpoint = 0; checkpoint < 5; checkpoint++) {
    const state = await page.evaluate(() => gameHarness.step(80));
    healthy(state, 1000);
    await snapshot(page, testInfo, `wall-${state.frame}`, state);
  }
  const final = await page.evaluate(() => gameHarness.getState());
  expect(final.particles.every(p => p.x > 550)).toBe(true);
  expect(meanDistance(final, 680, 440)).toBeLessThan(90);
});

test('the full swarm escapes a U instead of sticking to its closed side', async ({ page }, testInfo) => {
  await paintPath(page, [[300, 300], [300, 600], [500, 600], [500, 300]]);
  await spawn(page, 400, 700);
  const initial = await page.evaluate(() => gameHarness.getState());
  expect(initial.particles.every(p => p.x > 316 && p.x < 480 && p.y > 316 && p.y < 584)).toBe(true);
  await snapshot(page, testInfo, 'inside-U', initial);
  for (let checkpoint = 0; checkpoint < 6; checkpoint++) {
    const state = await page.evaluate(() => gameHarness.step(80));
    healthy(state, 1000);
    await snapshot(page, testInfo, `U-${state.frame}`, state);
  }
  const final = await page.evaluate(() => gameHarness.getState());
  const bottomOfWall = Math.max(...initial.obstacles.map(obstacle => obstacle.y)) + initial.cellSize;
  expect(final.particles.every(p => p.y >= bottomOfWall)).toBe(true);
  expect(meanDistance(final, 400, 700)).toBeLessThan(90);
});

test('a swarm passes through a passage exactly one particle wide', async ({ page }, testInfo) => {
  await page.evaluate(() => gameHarness.reset({ seed: 123, particleCount: 100 }));
  await paintWall(page, 520, 0, 380);
  await paintWall(page, 520, 420, 799);
  expect(await page.evaluate(() => !env.getCell(520, 400).obstacle
    && env.getCell(520, 396).obstacle && env.getCell(520, 404).obstacle)).toBe(true);
  await spawn(page, 680, 400);
  for (let checkpoint = 0; checkpoint < 4; checkpoint++) {
    const state = await page.evaluate(() => gameHarness.step(100));
    healthy(state, 100);
    await snapshot(page, testInfo, `passage-${state.frame}`, state);
  }
  const final = await page.evaluate(() => gameHarness.getState());
  expect(final.particles.every(p => p.x > 550)).toBe(true);
  expect(meanDistance(final, 680, 400)).toBeLessThan(60);
});

test('a sealed wall cannot be crossed and steering back still works', async ({ page }) => {
  await paintWall(page, 520, 0, 799);
  await spawn(page, 680, 400);
  const blocked = await page.evaluate(() => gameHarness.step(200));
  healthy(blocked, 1000);
  expect(blocked.navigationGoals).toHaveLength(2);
  expect(blocked.particles.every(p => p.x < 504)).toBe(true);
  await moveTarget(page, 120, 400);
  const returned = await page.evaluate(() => gameHarness.step(180));
  healthy(returned, 1000);
  expect(returned.particles.every(p => p.x < 240)).toBe(true);
  expect(meanDistance(returned, 120, 400)).toBeLessThan(90);
});

test('steering onto an obstacle and away preserves the full swarm', async ({ page }) => {
  await paintWall(page, 520, 300, 600);
  await spawn(page, 520, 440);
  const blockedTarget = await page.evaluate(() => gameHarness.step(160));
  healthy(blockedTarget, 1000);
  expect(blockedTarget.navigationGoals.every(goal => goal.x !== 520 || goal.y !== 440)).toBe(true);
  await moveTarget(page, 680, 440);
  const final = await page.evaluate(() => gameHarness.step(400));
  healthy(final, 1000);
  expect(final.particles.every(p => p.x > 550)).toBe(true);
});

test('painting through a running swarm does not bury or remove particles', async ({ page }) => {
  await spawn(page, 400, 400);
  await paintPath(page, [[300, 400], [500, 400]]);
  healthy(await page.evaluate(() => gameHarness.getState()), 1000);
  await moveTarget(page, 650, 700);
  const final = await page.evaluate(() => gameHarness.step(300));
  healthy(final, 1000);
  expect(meanDistance(final, 650, 700)).toBeLessThan(90);
});

test('respawning after movement clears old raster owners', async ({ page }) => {
  await spawn(page, 700, 100);
  healthy(await page.evaluate(() => gameHarness.step(120)), 1000);
  await page.getByRole('button', { name: 'Spawn swarm', exact: true }).click();
  healthy(await page.evaluate(() => gameHarness.getState()), 1000);
  await moveTarget(page, 100, 700);
  healthy(await page.evaluate(() => gameHarness.step(160)), 1000);
});

test('the full swarm follows successive corners and edges over a long run', async ({ page }, testInfo) => {
  await spawn(page, 0, 0);
  const targets = [[0, 0], [799, 799], [799, 0], [0, 799], [0, 400], [799, 400], [400, 0], [400, 799], [400, 400]];
  for (const [x, y] of targets) {
    await moveTarget(page, x, y);
    const state = await page.evaluate(() => gameHarness.step(240));
    healthy(state, 1000);
    expect(meanDistance(state, state.target.x, state.target.y)).toBeLessThan(120);
    expect(state.particles.every(p => Math.hypot(p.x - state.target.x, p.y - state.target.y) < 200)).toBe(true);
    await snapshot(page, testInfo, `target-${x}-${y}`, state);
  }
});

test('arrow keys work alongside mouse steering without a runtime error', async ({ page }) => {
  await spawn(page, 400, 400);
  await page.evaluate(() => gameHarness.step(1));
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  const state = await page.evaluate(() => gameHarness.step(1));
  expect(state.target).toEqual({ x: 392, y: 408 });
  healthy(state, 1000);
});

test('a fast drag beyond the canvas paints continuously up to the boundary', async ({ page }) => {
  await paintPath(page, [[520, 400], [520, 820]]);
  expect(await page.evaluate(() => [440, 600, 780, 799].every(y => env.getCell(520, y).obstacle))).toBe(true);
  const state = await page.evaluate(() => gameHarness.getState());
  expect(state.obstacles.every(obstacle => obstacle.x >= 0 && obstacle.y >= 0
    && obstacle.x + state.cellSize <= state.width && obstacle.y + state.cellSize <= state.height)).toBe(true);
});

test('using the spawn control at a narrower viewport does not paint terrain', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await page.getByRole('button', { name: 'Spawn swarm', exact: true }).click();
  const state = await page.evaluate(() => gameHarness.getState());
  healthy(state, 1000);
  expect(state.obstacles).toHaveLength(0);
});

test('a resting swarm forms a filled circle rather than a diamond or octagon', async ({ page }, testInfo) => {
  await spawn(page, 400, 400);
  const state = await page.evaluate(() => gameHarness.step(200));
  healthy(state, 1000);
  const radii = Array.from({ length: 32 }, () => 0);
  const occupied = new Set();
  for (const particle of state.particles) {
    const dx = particle.x - 400;
    const dy = particle.y - 400;
    const sector = Math.floor((Math.atan2(dy, dx) + Math.PI) * radii.length / (2 * Math.PI)) % radii.length;
    radii[sector] = Math.max(radii[sector], Math.hypot(dx, dy));
    occupied.add(`${particle.x},${particle.y}`);
  }
  expect(Math.max(...radii) / Math.min(...radii)).toBeLessThan(1.06);
  expect(Math.max(...radii)).toBeLessThan(82);
  let interior = 0;
  let filled = 0;
  for (let y = -44; y <= 44; y += state.cellSize) {
    for (let x = -44; x <= 44; x += state.cellSize) {
      if (Math.hypot(x, y) > 44) continue;
      interior++;
      if (occupied.has(`${400 + x},${400 + y}`)) filled++;
    }
  }
  expect(filled / interior).toBeGreaterThan(0.95);
  await snapshot(page, testInfo, 'round-swarm', state);
});

test('moving units take individual steps instead of translating as one rigid slab', async ({ page }, testInfo) => {
  await spawn(page, 400, 400);
  await page.evaluate(() => gameHarness.step(100));
  await moveTarget(page, 796, 400);
  await page.evaluate(() => gameHarness.step(15));
  const before = await page.evaluate(() => gameHarness.getState());
  await snapshot(page, testInfo, 'individual-before', before);
  const after = await page.evaluate(() => gameHarness.step(1));
  const displacements = new Map();
  for (let index = 0; index < before.particles.length; index++) {
    const a = before.particles[index];
    const b = after.particles[index];
    expect(b.id).toBe(a.id);
    const key = `${b.x - a.x},${b.y - a.y}`;
    displacements.set(key, (displacements.get(key) || 0) + 1);
  }
  healthy(after, 1000);
  expect(displacements.size).toBeGreaterThan(8);
  expect(Math.max(...displacements.values()) / 1000).toBeLessThan(0.75);
  await snapshot(page, testInfo, 'individual-after', after);
});
