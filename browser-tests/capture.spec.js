const { test, expect } = require('@playwright/test');
const { writeFile } = require('node:fs/promises');
const { moveTarget, paintWall } = require('./controls.cjs');

const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?debug&seed=123');
  await page.waitForFunction(() => Boolean(window.gameHarness));
});

test.afterEach(async ({ page }, testInfo) => {
  const state = await page.evaluate(() => gameHarness.getState());
  await snapshot(page, testInfo, 'final', state);
  expect(pageErrors.get(page)).toEqual([]);
});

async function snapshot(page, testInfo, label, state) {
  await writeFile(testInfo.outputPath(`${label}.json`), JSON.stringify(state, null, 2));
  await page.locator('#game-canvas').screenshot({ path: testInfo.outputPath(`${label}.png`) });
}

function healthy(state, ids) {
  expect(state.particles.map(p => p.id)).toEqual(ids);
  expect(Object.values(state.diagnostics).every(value => value === 0)).toBe(true);
  expect(state.teams.reduce((sum, team) => sum + team.count, 0)).toBe(ids.length);
}

async function startChallenge(page) {
  await page.getByRole('button', { name: 'Capture challenge', exact: true }).click();
  return page.evaluate(() => gameHarness.getState());
}

async function coreColor(page, particle) {
  return page.locator('#game-canvas').evaluate((canvas, p) => {
    const density = canvas.width / Number(canvas.dataset.worldWidth);
    return [...canvas.getContext('2d').getImageData((p.x + 2) * density, (p.y + 2) * density, 1, 1).data];
  }, particle);
}

test('challenge spawns two distinct teams; the red cloud remains stationary', async ({ page }) => {
  const initial = await startChallenge(page);
  expect(initial.scenario).toBe('capture');
  expect(initial.teams.map(team => team.count)).toEqual([1000, 400]);
  expect(initial.particles.every(p => p.health === initial.combat.maxHealth)).toBe(true);
  const blueColor = await coreColor(page, initial.particles.find(p => p.team === 0));
  const redColor = await coreColor(page, initial.particles.find(p => p.team === 1));
  expect(blueColor[2]).toBeGreaterThan(blueColor[0] + 20);
  expect(redColor[0]).toBeGreaterThan(redColor[2] + 20);
  const later = await page.evaluate(() => gameHarness.step(30));
  expect(later.particles.filter(p => p.team === 1)).toEqual(initial.particles.filter(p => p.team === 1));
  healthy(later, initial.particles.map(p => p.id));
  await expect(page.locator('#blue-count')).toHaveText('1,000');
  await expect(page.locator('#red-count')).toHaveText('400');
  await expect(page.locator('#particle-count')).toHaveText('1,400');
  await expect(page.locator('#mode-name')).toHaveText('Capture challenge');
  const beforeRender = await page.evaluate(() => gameHarness.getState());
  await page.evaluate(() => { renderGame(); renderGame(); });
  expect(await page.evaluate(() => gameHarness.getState())).toEqual(beforeRender);
});

test('mouse-guided swarm captures the full resting enemy and leads the same units away', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const initial = await startChallenge(page);
  const ids = initial.particles.map(p => p.id);
  const originalRed = new Map(initial.particles.filter(p => p.team === 1).map(p => [p.id, p]));
  await snapshot(page, testInfo, 'two-clouds', initial);
  await moveTarget(page, 576, 400);
  let final;
  let witnessedPartialCapture = false;
  for (let checkpoint = 0; checkpoint < 20; checkpoint++) {
    const state = await page.evaluate(() => gameHarness.step(40));
    healthy(state, ids);
    for (const p of state.particles.filter(p => p.team === 1 && originalRed.has(p.id))) {
      expect({ x: p.x, y: p.y }).toEqual({ x: originalRed.get(p.id).x, y: originalRed.get(p.id).y });
    }
    if (state.teams[1].count > 0 && state.particles.some(p => p.team === 0 && originalRed.has(p.id))) {
      witnessedPartialCapture = true;
      await snapshot(page, testInfo, `contact-${state.frame}`, state);
    }
    if (state.teams[1].count === 0) { final = state; break; }
  }
  expect(witnessedPartialCapture).toBe(true);
  expect(final).toBeDefined();
  expect(final.teams.map(team => team.count)).toEqual([1400, 0]);
  expect(final.combatStats.conversions).toBeGreaterThanOrEqual(400);
  await expect(page.locator('#capture-status')).toHaveText('All yours. The red cloud joined your swarm.');
  await expect(page.locator('#blue-count')).toHaveText('1,400');
  await expect(page.locator('#red-count')).toHaveText('0');
  const captured = final.particles.find(p => originalRed.has(p.id));
  const color = await coreColor(page, captured);
  expect(color[2]).toBeGreaterThan(color[0] + 20);
  await snapshot(page, testInfo, 'captured', final);

  await moveTarget(page, 120, 200);
  const moved = await page.evaluate(() => gameHarness.step(180));
  healthy(moved, ids);
  expect(moved.particles.every(p => Math.hypot(p.x - 120, p.y - 200) < 120)).toBe(true);
  expect(moved.particles.filter(p => originalRed.has(p.id)).every(p => p.x < 240)).toBe(true);
});

test('capture and health replay exactly; returned states are independent copies', async ({ page }) => {
  const replay = () => page.evaluate(() => {
    gameHarness.reset({ seed: 42, particleCount: 100 });
    gameHarness.captureChallenge();
    gameHarness.setTarget(576, 400);
    gameHarness.step(220);
    return gameHarness.getState();
  });
  const first = await replay();
  expect(first.combatStats.conversions).toBeGreaterThan(0);
  expect(await replay()).toEqual(first);
  const copiesAreIndependent = await page.evaluate(() => {
    const before = gameHarness.getState();
    const copy = gameHarness.getState();
    copy.particles[0].team = 99;
    copy.particles[0].health = -1;
    copy.teams[0].target.x = -1;
    copy.combatStats.conversions = -1;
    return JSON.stringify(gameHarness.getState()) === JSON.stringify(before);
  });
  expect(copiesAreIndependent).toBe(true);
});

test('a sealed painted wall prevents enemy damage; clearing it permits capture', async ({ page }) => {
  await page.evaluate(() => gameHarness.reset({ seed: 123, particleCount: 100 }));
  await paintWall(page, 400, 0, 799);
  const initial = await startChallenge(page);
  await moveTarget(page, 576, 400);
  const blocked = await page.evaluate(() => gameHarness.step(180));
  healthy(blocked, initial.particles.map(p => p.id));
  expect(blocked.teams.map(team => team.count)).toEqual([100, 40]);
  expect(blocked.particles.every(p => p.health === 100)).toBe(true);
  expect(blocked.combatStats.attacks).toBe(0);
  await page.getByRole('button', { name: 'Clear terrain', exact: true }).click();
  const captured = await page.evaluate(() => gameHarness.step(300));
  expect(captured.teams.map(team => team.count)).toEqual([140, 0]);
  healthy(captured, initial.particles.map(p => p.id));
});

test('mobile challenge controls, pause and returning to free play work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const initial = await startChallenge(page);
  expect(initial.paused).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await moveTarget(page, 576, 400);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(() => gameHarness.getState().frame > 5);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await page.evaluate(() => gameHarness.getState());
  expect(paused.paused).toBe(true);
  await page.getByRole('button', { name: 'Spawn swarm', exact: true }).click();
  const reset = await page.evaluate(() => gameHarness.getState());
  expect(reset.teams.map(team => team.count)).toEqual([1000, 0]);
  expect(reset.scenario).toBe('free-play');
  expect(reset.combatStats).toEqual({ attacks: 0, heals: 0, conversions: 0 });
  await expect(page.locator('#team-stats')).toBeHidden();
  await expect(page.locator('#capture-status')).toBeHidden();
});
