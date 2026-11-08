const { test, expect, firefox, webkit } = require('@playwright/test');
const { writeFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const { moveTarget } = require('./controls.cjs');
const MatchSimulation = require('../MatchSimulation');

const extraPages = [];
test.afterEach(async () => {
  await Promise.all(extraPages.splice(0).map(page => page.close()));
});

async function open(page, baseURL) {
  await page.goto(`${baseURL}/?online&debug`);
  await expect(page.getByRole('button', { name: 'Spielen', exact: true })).toBeEnabled();
}

async function pair(page, browser, baseURL) {
  await open(page, baseURL);
  const other = await browser.newPage();
  extraPages.push(other);
  await open(other, baseURL);
  await page.getByRole('button', { name: 'Spielen', exact: true }).click();
  await other.getByRole('button', { name: 'Spielen', exact: true }).click();
  await expect(page.locator('#game-view')).toBeVisible();
  await expect(other.locator('#game-view')).toBeVisible();
  return other;
}

async function matchingCheckpoint(first, second, minimum = 0) {
  let result;
  await expect.poll(async () => {
    const ticks = await Promise.all([first, second].map(page => page.evaluate(() => multiplayer.verified?.tick ?? -1)));
    const tick = Math.min(...ticks);
    if (tick < minimum) return false;
    const snapshots = await Promise.all([first, second].map(page => page.evaluate(tick => multiplayer.checkpoints.get(tick), tick)));
    if (!snapshots.every(Boolean)) return false;
    result = snapshots;
    return JSON.stringify(snapshots[0]) === JSON.stringify(snapshots[1]);
  }, { timeout: 15000 }).toBe(true);
  return result;
}

test('lobby shows online and waiting players; search can be cancelled on mobile', async ({ page, browser, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, baseURL);
  await expect(page.locator('#online-count')).toHaveText('1');
  const other = await browser.newPage(); extraPages.push(other);
  await open(other, baseURL);
  await expect(page.locator('#online-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Spielen', exact: true }).click();
  await expect(other.locator('#waiting-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Suche abbrechen', exact: true }).click();
  await expect(other.locator('#waiting-count')).toHaveText('0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir(path.resolve('artifacts/multiplayer-preview'), { recursive: true });
  await page.screenshot({ path: path.resolve('artifacts/multiplayer-preview/lobby-mobile.png'), fullPage: true });
  await other.close();
  await expect(page.locator('#online-count')).toHaveText('1');
});

test('two actual players move both teams, stay identical, finish by capture and return to lobby', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(90000);
  const other = await pair(page, browser, baseURL);
  const pages = await page.evaluate(() => multiplayer.team) === 0 ? [page, other] : [other, page];
  const errors = [];
  for (const p of pages) p.on('pageerror', error => errors.push(error.message));
  await expect(pages[0].locator('#your-team')).toHaveText('Du spielst Blau');
  await expect(pages[1].locator('#your-team')).toHaveText('Du spielst Rot');
  const initial = await matchingCheckpoint(...pages);
  expect(initial[0].state.particles).toHaveLength(2000);
  expect(initial[0].state.obstacles.length).toBeGreaterThan(500);
  expect(initial[0].state.obstacles).toEqual(initial[1].state.obstacles);
  await expect(pages[0].locator('#map-label')).toHaveText('Zufallskarte');
  await expect(pages[1].locator('#map-label')).toHaveText('Zufallskarte');
  await pages[0].screenshot({ path: testInfo.outputPath('random-terrain.png'), fullPage: true });
  await moveTarget(pages[0], 224, 300);
  await moveTarget(pages[1], 576, 500);
  // The second pointer may arrive well after the first: measure from applied inputs.
  await expect.poll(() => pages[0].evaluate(() => env.teams.map(team => [team.player.x, team.player.y])))
    .toEqual([[224, 300], [576, 500]]);
  const appliedTick = await pages[0].evaluate(() => env.tick);
  const moved = await matchingCheckpoint(...pages, appliedTick + 45);
  const meanY = (state, team) => {
    const units = state.particles.filter(p => p[3] === team);
    return units.reduce((sum, p) => sum + p[2], 0) / units.length;
  };
  expect(meanY(moved[0].state, 0)).toBeLessThan(380);
  expect(meanY(moved[0].state, 1)).toBeGreaterThan(420);
  await moveTarget(pages[1], 576, 400);
  await moveTarget(pages[0], 576, 400);
  await pages[0].waitForFunction(() => multiplayer.phase !== 'match', null, { timeout: 60000 });
  await pages[1].waitForFunction(() => multiplayer.phase !== 'match', null, { timeout: 10000 });
  const final = await Promise.all(pages.map(p => p.evaluate(() => ({ result: multiplayer.lastResult,
    state: MatchSimulation.state(env), diagnostics: gameHarness.getState().diagnostics }))));
  expect(final[0].result.reason).toBe('victory');
  expect(final[0].result.winner).toBe(final[1].result.winner);
  expect(final[0].state).toEqual(final[1].state);
  expect(final[0].state.particles).toHaveLength(2000);
  expect(final[0].state.stats.conversions).toBeGreaterThanOrEqual(1000);
  expect(Object.values(final[0].diagnostics).every(value => value === 0)).toBe(true);
  await writeFile(testInfo.outputPath('completed-match.json'), JSON.stringify(final, null, 2));
  for (const p of pages) {
    await expect(p.locator('#lobby-view')).toBeVisible({ timeout: 5000 });
    await expect(p.locator('#waiting-count')).toHaveText('0');
    await expect(p.getByRole('button', { name: 'Spielen', exact: true })).toBeEnabled();
  }
  expect(errors).toEqual([]);
});

test('a suspended renderer catches up with identical state; disconnect returns the peer to lobby', async ({ page, browser, baseURL }) => {
  const other = await pair(page, browser, baseURL);
  await page.evaluate(() => noLoop());
  await expect.poll(() => other.evaluate(() => multiplayer.verified?.tick ?? -1)).toBeGreaterThanOrEqual(0);
  const frame = await other.evaluate(() => env.tick);
  await expect.poll(() => page.evaluate(() => multiplayer.frames.length)).toBeGreaterThan(0);
  // Resume after enough queued data to exercise catch-up rather than running extra local steps.
  await page.evaluate(() => loop());
  await matchingCheckpoint(page, other, frame + 15);
  await other.close();
  await expect(page.locator('#lobby-view')).toBeVisible({ timeout: 6000 });
  await expect(page.locator('#online-count')).toHaveText('1');
  expect(await page.evaluate(() => multiplayer.lastResult.reason)).toBe('disconnect');
});

test('tampered client state is detected and both players leave the match without a winner', async ({ page, browser, baseURL }) => {
  const other = await pair(page, browser, baseURL);
  await matchingCheckpoint(page, other, 6);
  await page.evaluate(() => { env.particles[0].health = 1; });
  await page.waitForFunction(() => multiplayer.phase !== 'match');
  const result = await page.evaluate(() => multiplayer.lastResult);
  expect(result.reason).toBe('desync');
  expect(result.winner).toBeNull();
  await expect(other.locator('#lobby-view')).toBeVisible({ timeout: 6000 });
  expect(await other.evaluate(() => multiplayer.lastResult.reason)).toBe('desync');
});

test('reconnecting returns to the lobby without automatically rejoining the queue', async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.getByRole('button', { name: 'Spielen', exact: true }).click();
  await expect(page.locator('#waiting-count')).toHaveText('1');
  await page.evaluate(() => multiplayer.socket.close());
  await expect(page.locator('#connection-label')).toHaveText('Verbindung unterbrochen');
  await expect(page.getByRole('button', { name: 'Spielen', exact: true })).toBeEnabled({ timeout: 7000 });
  await expect(page.locator('#waiting-count')).toHaveText('0');
  await expect(page.locator('#online-count')).toHaveText('1');
  expect(await page.evaluate(() => multiplayer.phase)).toBe('lobby');
});

test('delayed WebSocket delivery keeps two real clients on identical simulation states', async ({ page, browser, baseURL }) => {
  const timers = new Set();
  let delayedFrames = 0;
  let lastDelivery = 0;
  let closed = false;
  await page.routeWebSocket('**/socket', route => {
    const server = route.connectToServer();
    server.onMessage(message => {
      const packet = JSON.parse(message.toString());
      // Keep transport order while adding variable one-way delay to real packets.
      const delay = packet.type === 'frame' ? (++delayedFrames % 3 === 0 ? 120 : 30) : 0;
      const delivery = Math.max(Date.now() + delay, lastDelivery + 1);
      lastDelivery = delivery;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!closed) route.send(message);
      }, Math.max(0, delivery - Date.now()));
      timers.add(timer);
    });
  });
  try {
    const other = await pair(page, browser, baseURL);
    await moveTarget(page, 400, 300);
    const snapshots = await matchingCheckpoint(page, other, 90);
    expect(delayedFrames).toBeGreaterThan(10);
    expect(snapshots[0].state).toEqual(snapshots[1].state);
    expect(await page.evaluate(() => multiplayer.phase)).toBe('match');
  } finally {
    closed = true;
    for (const timer of timers) clearTimeout(timer);
  }
});

test('Firefox and WebKit play against Chromium with different rendering frequencies', async ({ page, baseURL }) => {
  test.setTimeout(60000);
  for (const engine of [firefox, webkit]) {
    const browser = await engine.launch();
    try {
      const other = await pair(page, browser, baseURL);
      await page.evaluate(() => frameRate(15));
      await other.evaluate(() => frameRate(30));
      await moveTarget(page, 400, 320);
      await moveTarget(other, 400, 480);
      const snapshots = await matchingCheckpoint(page, other, 90);
      expect(snapshots[0].state).toEqual(snapshots[1].state);
      await page.getByRole('button', { name: 'Spiel verlassen', exact: true }).click();
      await expect(other.locator('#lobby-view')).toBeVisible({ timeout: 6000 });
      expect(await other.evaluate(() => multiplayer.lastResult.reason)).toBe('left');
    } finally {
      await browser.close();
    }
  }
});

test('Chromium, Firefox, WebKit and Node agree on full states across 1080 half-steps', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(120000);
  const config = { ...MatchSimulation.defaults, width: 160, height: 120, particleCount: 80, seed: 42 };
  const frames = Array.from({ length: 360 }, (_, index) => ({ tick: (index + 1) * 3, steps: 3,
    targets: index < 80 ? [[116, 60], [116, 60]] : index < 180 ? [[44, 20], [116, 100]]
      : index < 260 ? [[44, 60], [44, 60]] : [[116, 60], [116, 60]] }));
  const run = (simulation, config, frames) => {
    const world = simulation.create(config);
    const states = [];
    frames.forEach((frame, index) => {
      simulation.applyFrame(world, frame);
      if (index % 30 === 29) states.push({ report: simulation.report(world), state: simulation.state(world) });
    });
    return states;
  };
  const expected = run(MatchSimulation, config, frames);
  expect(expected.at(-1).state.stats.conversions).toBeGreaterThan(0);
  const actual = {};
  const browsers = [];
  try {
    const firefoxBrowser = await firefox.launch(); browsers.push(firefoxBrowser);
    const webkitBrowser = await webkit.launch(); browsers.push(webkitBrowser);
    const enginePages = [page, await firefoxBrowser.newPage(), await webkitBrowser.newPage()];
    for (let index = 0; index < enginePages.length; index++) {
      const enginePage = enginePages[index];
      await enginePage.goto(`${baseURL}/?debug`);
      await enginePage.waitForFunction(() => Boolean(window.gameHarness));
      const states = await enginePage.evaluate(({ config, frames }) => {
        const world = MatchSimulation.create(config);
        const states = [];
        frames.forEach((frame, index) => {
          MatchSimulation.applyFrame(world, frame);
          if (index % 30 === 29) states.push({ report: MatchSimulation.report(world), state: MatchSimulation.state(world) });
        });
        return states;
      }, { config, frames });
      actual[['chromium', 'firefox', 'webkit'][index]] = states;
      expect(states).toEqual(expected);
    }
    await writeFile(testInfo.outputPath('cross-engine-states.json'), JSON.stringify(actual));
  } finally {
    await Promise.all(browsers.map(browser => browser.close()));
  }
});
