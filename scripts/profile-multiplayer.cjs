// Two normal clients, real pointer events, no debug snapshot history.
const { chromium } = require('@playwright/test');
const { createGameServer } = require('./serve.cjs');
const { once } = require('node:events');
const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, '../artifacts/performance');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function serverMessage(server) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off('message', received);
      server.off('exit', exited);
      server.off('error', failed);
    };
    const received = message => { cleanup(); resolve(message); };
    const failed = error => { cleanup(); reject(error); };
    const exited = code => failed(new Error(`Measurement server exited (${code}) before responding`));
    server.once('message', received);
    server.once('exit', exited);
    server.once('error', failed);
  });
}

// Separate process so server CPU excludes Playwright and measurement work.
function runServer() {
  const server = createGameServer({
    newSeed: () => 123
  });
  const lag = monitorEventLoopDelay({
    resolution: 10
  });
  let clock, cpu;
  server.listen(0, '127.0.0.1', () => process.send({
    port: server.address().port
  }));
  process.on('message', message => {
    if (message === 'start') {
      lag.enable();
      clock = performance.now();
      cpu = process.cpuUsage();
      process.send({
        started: true
      });
    } else if (message === 'stop') {
      const used = process.cpuUsage(cpu);
      const elapsedMs = performance.now() - clock;
      lag.disable();
      process.send({
        elapsedMs,
        cpuMs: (used.user + used.system) / 1000,
        cpuPercentOneCore: (used.user + used.system) / elapsedMs / 10,
        eventLoopP95Ms: lag.percentile(95) / 1e6
      });
    }
  });
  process.on('disconnect', () => {
    lag.disable();
    server.multiplayer.close();
    server.close();
  });
}
async function main() {
  await fs.mkdir(output, {
    recursive: true
  });
  const label = process.argv[2] || 'multiplayer';
  if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error('Use a simple output label');
  const environmentSource = process.argv[3] ? path.resolve(process.argv[3]) : null;
  const environmentCode = environmentSource ? await fs.readFile(environmentSource, 'utf8') : null;
  const server = fork(__filename, ['--server'], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });
  let browser;
  try {
    const { port } = await serverMessage(server);
    browser = await chromium.launch();
    const browserSession = await browser.newBrowserCDPSession();
    const {
      gpu
    } = await browserSession.send('SystemInfo.getInfo');
    const pages = await Promise.all([0, 1].map(() => browser.newPage({
      viewport: {
        width: 1440,
        height: 1040
      }
    })));
    const sessions = await Promise.all(pages.map(p => p.context().newCDPSession(p)));
    const errors = [];
    for (let i = 0; i < 2; i++) {
      pages[i].on('pageerror', error => errors.push(error.message));
      if (environmentCode) await pages[i].route('**/Environment.js', route => route.fulfill({
        contentType: 'application/javascript', body: environmentCode
      }));
      await pages[i].goto(`http://127.0.0.1:${port}/`);
      await pages[i].waitForFunction(() => multiplayer.connection === 'online');
      await pages[i].evaluate(() => {
        window.measurement = {
          phase: 'warmup',
          phases: {},
          reports: [],
          previousFrame: 0
        };
        const record = (key, value) => {
          const data = measurement.phases[measurement.phase] ??= {};
          (data[key] ??= []).push(value);
        };
        const wrap = (object, key, name) => {
          const original = object[key];
          object[key] = function (...args) {
            const start = performance.now();
            const result = original.apply(this, args);
            record(name, performance.now() - start);
            return result;
          };
        };
        wrap(Environment.prototype, 'updateSubstep', 'step');
        wrap(Environment.prototype, 'updateGradient', 'gradient');
        wrap(Renderer.prototype, 'render', 'render');
        wrap(multiplayer, 'onChange', 'onChange');
        wrap(window, 'syncUI', 'hud');
        wrap(multiplayer, 'report', 'report');
        const oldSend = multiplayer.send;
        multiplayer.send = function (message) {
          if (message.type === 'ack') measurement.reports.push(message);
          return oldSend.call(this, message);
        };
        const originalDraw = window.draw;
        window.draw = function () {
          const start = performance.now();
          if (multiplayer.phase === 'match') {
            if (measurement.previousFrame) record('frameInterval', start - measurement.previousFrame);
            measurement.previousFrame = start;
            const tick = env.tick;
            originalDraw();
            record('draw', performance.now() - start);
            record('stepsPerDraw', env.tick - tick);
          } else originalDraw();
        };
      });
    }
    await pages[0].getByRole('button', {
      name: 'Spielen',
      exact: true
    }).click();
    await pages[1].getByRole('button', {
      name: 'Spielen',
      exact: true
    }).click();
    await Promise.all(pages.map(p => p.waitForFunction(() => multiplayer.phase === 'match')));
    await wait(2000);
    server.send('start');
    await serverMessage(server);
    for (const phase of ['stationary', 'moving', 'contact']) {
      console.log(label + ': ' + phase);
      await Promise.all(pages.map(p => p.evaluate(phase => {
        measurement.phase = phase;
        measurement.previousFrame = 0;
        measurement.phases[phase] = {
          startTick: env.tick,
          startTime: performance.now()
        };
      }, phase)));
      if (phase === 'moving') {
        await Promise.all(sessions.map(async s => {
          await s.send('Profiler.enable');
          await s.send('Profiler.start');
        }));
        // Normal pointer events, sampled at the same 20 Hz as network inputs.
        const bounds = await Promise.all(pages.map(p => p.locator('#game-canvas').boundingBox()));
        const teams = await Promise.all(pages.map(p => p.evaluate(() => multiplayer.team)));
        for (let step = 0; step < 160; step++) {
          const start = performance.now();
          await Promise.all(pages.map((p, i) => {
            const team = teams[i];
            const x = team ? 640 - step % 37 * 4 : 160 + step % 37 * 4;
            const y = team ? 640 - step % 109 * 4 : 160 + step % 109 * 4;
            return p.mouse.move(bounds[i].x + x * bounds[i].width / 800, bounds[i].y + y * bounds[i].height / 800);
          }));
          await wait(Math.max(0, 50 - (performance.now() - start)));
        }
        await Promise.all(sessions.map(async (s, i) => {
          const {
            profile
          } = await s.send('Profiler.stop');
          await fs.writeFile(output + '/' + label + '-client-' + i + '.cpuprofile', JSON.stringify(profile));
        }));
      } else if (phase === 'contact') {
        for (const p of pages) {
          const b = await p.locator('#game-canvas').boundingBox();
          await p.mouse.move(b.x + 576 * b.width / 800, b.y + 400 * b.height / 800);
        }
        await wait(5000);
      } else await wait(5000);
      await Promise.all(pages.map(p => p.evaluate(() => {
        Object.assign(measurement.phases[measurement.phase], {
          endTick: env.tick,
          endTime: performance.now(),
          state: multiplayer.phase
        });
      })));
    }
    server.send('stop');
    const serverMeasurements = await serverMessage(server);
    const clients = await Promise.all(pages.map(p => p.evaluate(() => {
      const stats = values => {
        const ordered = [...values].sort((a, b) => a - b);
        return {
          calls: values.length,
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          p95: ordered[Math.floor((ordered.length - 1) * .95)],
          max: ordered.at(-1),
          sum: values.reduce((a, b) => a + b, 0)
        };
      };
      const phases = {};
      for (const [name, data] of Object.entries(measurement.phases)) {
        if (name === 'warmup') continue;
        phases[name] = {};
        for (const [key, value] of Object.entries(data)) {
          phases[name][key] = Array.isArray(value) ? stats(value) : value;
        }
      }
      return {
        phases,
        reports: measurement.reports,
        verified: multiplayer.verified,
        phase: multiplayer.phase,
        lastResult: multiplayer.lastResult,
        canvas: [drawingContext.canvas.width, drawingContext.canvas.height],
        userAgent: navigator.userAgent
      };
    })));
    const first = new Map(clients[0].reports.map(r => [r.tick, r.hash]));
    const common = clients[1].reports.filter(r => first.has(r.tick));
    assert(common.length > 50);
    assert(common.every(r => first.get(r.tick) === r.hash));
    assert.deepEqual(errors, []);
    clients.forEach(c => delete c.reports);
    assert(clients.every(client => client.phase === 'match' || client.lastResult?.reason === 'victory'));
    const result = {
      label,
      environmentSource,
      browser: browser.version(),
      gpu,
      server: serverMeasurements,
      commonReports: common.length,
      clients,
      errors
    };
    await fs.writeFile(output + '/' + label + '.json', JSON.stringify(result, null, 2));
    console.table(clients.flatMap((client, index) => Object.entries(client.phases).map(([phase, data]) => ({
      client: index,
      phase,
      fps: (1000 / data.frameInterval.mean).toFixed(1),
      'step mean ms': data.step.mean.toFixed(2),
      'step p95 ms': data.step.p95.toFixed(2),
      'render mean ms': data.render.mean.toFixed(2),
      'report mean ms': data.report.mean.toFixed(2)
    }))));
    console.log({
      server: serverMeasurements,
      matchingReports: common.length
    });
    console.log(`Browser measurements: ${output}/${label}.json`);
    await pages[0].screenshot({
      path: output + '/' + label + '.png'
    });
  } finally {
    if (browser) await browser.close();
    if (server.connected) server.disconnect();
    if (server.exitCode === null && server.signalCode === null) await once(server, 'exit');
  }
}
if (process.argv[2] === '--server') runServer();
else main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
