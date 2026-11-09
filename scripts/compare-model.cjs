// A/B comparison of two source directories, with isolated V8 processes and
// alternating order. Whole states and every batch's report must agree.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { meanMs: values.reduce((a, b) => a + b, 0) / values.length,
    p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)] };
}

function sample(directory, seed) {
  const Match = require(path.join(directory, 'MatchSimulation.js'));
  const config = { ...Match.defaults, seed };
  const targets = batch => [[160 + batch % 37 * 4, 160 + batch % 109 * 4],
    [640 - batch % 37 * 4, 640 - batch % 109 * 4]];
  const warmup = Match.create(config);
  for (let batch = 0; batch < 30; batch++) {
    Match.applyFrame(warmup, { tick: warmup.tick + 3, steps: 3, targets: targets(batch) });
    Match.report(warmup);
  }
  const env = Match.create(config);
  const phases = [];
  for (const name of ['stationary', 'moving', 'contact']) {
    const stepTimes = [], reportTimes = [], reports = [];
    for (let batch = 0; batch < 60; batch++) {
      Match.setTargets(env, name === 'stationary' ? [[224, 400], [576, 400]]
        : name === 'contact' ? [[576, 400], [576, 400]] : targets(batch));
      for (let step = 0; step < 3; step++) {
        const start = performance.now();
        env.updateSubstep();
        stepTimes.push(performance.now() - start);
      }
      const start = performance.now();
      reports.push(Match.report(env));
      reportTimes.push(performance.now() - start);
    }
    phases.push({ name, step: summarize(stepTimes), firstStepMs: stepTimes[0],
      remainingSteps: summarize(stepTimes.slice(1)), report: summarize(reportTimes),
      reports, state: Match.state(env) });
  }
  return { phases };
}

if (process.argv[2] === '--sample') {
  console.log(JSON.stringify(sample(path.resolve(process.argv[3]), Number(process.argv[4]))));
} else {
  const before = path.resolve(process.argv[2]);
  const after = path.resolve(process.argv[3]);
  const label = process.argv[4];
  const seed = Number(process.argv[5] ?? 123);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer');
  if (!/^[a-zA-Z0-9_-]+$/.test(label || '')) throw new Error('Specify before, after and an output label');
  const output = path.resolve('artifacts/performance');
  fs.mkdirSync(output, { recursive: true });
  const runs = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    const pair = {};
    for (const variant of repeat % 2 ? ['after', 'before'] : ['before', 'after']) {
      const child = spawnSync(process.execPath, [__filename, '--sample', variant === 'before' ? before : after, String(seed)],
        { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      if (child.error) throw child.error;
      if (child.status !== 0) throw new Error(child.stderr || `Sample exited with ${child.status}`);
      pair[variant] = JSON.parse(child.stdout);
      console.log(`${label}: repeat ${repeat + 1}, ${variant} done`);
    }
    for (let index = 0; index < pair.before.phases.length; index++) {
      const a = pair.before.phases[index], b = pair.after.phases[index];
      assert.deepEqual(b.reports, a.reports, `${a.name}: different report sequence`);
      assert.deepEqual(b.state, a.state, `${a.name}: different complete state`);
      // Preserve one complete replay, plus all timings and hashes.
      if (repeat > 0) { delete a.state; delete b.state; }
    }
    runs.push(pair);
  }
  const summary = runs[0].before.phases.map((phase, index) => {
    const mean = (variant, kind) => runs.reduce((sum, run) => sum + run[variant].phases[index][kind].meanMs, 0) / runs.length;
    return { phase: phase.name, beforeMs: mean('before', 'step'), afterMs: mean('after', 'step'),
      savingPercent: (1 - mean('after', 'step') / mean('before', 'step')) * 100,
      reportBeforeMs: mean('before', 'report'), reportAfterMs: mean('after', 'report') };
  });
  fs.writeFileSync(path.join(output, label + '.json'), JSON.stringify({ label, seed, before, after, summary, runs }, null, 2));
  console.table(summary);
}
