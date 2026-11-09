// Fixed inputs and seed; timings are observations, never pass/fail thresholds.
const { performance } = require('node:perf_hooks');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Match = require('../MatchSimulation');

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const totalMs = values.reduce((sum, value) => sum + value, 0);
  return { calls: values.length, totalMs, meanMs: totalMs / values.length,
    p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)], maxMs: sorted.at(-1) };
}

const output = path.resolve(__dirname, '../artifacts/performance');
mkdirSync(output, { recursive: true });
const config = { ...Match.defaults, seed: 123 };
const env = Match.create(config);
const phases = [];
for (const name of ['stationary', 'moving-targets', 'contact']) {
  const timings = { step: [], gradient: [], reporting: [] };
  const original = env.updateGradient;
  env.updateGradient = function (...args) {
    const start = performance.now();
    const result = original.apply(this, args);
    timings.gradient.push(performance.now() - start);
    return result;
  };
  // 240 batches of three half-steps represent 12 seconds of simulation.
  for (let batch = 0; batch < 240; batch++) {
    const targets = name === 'stationary' ? [[224, 400], [576, 400]]
      : name === 'contact' ? [[576, 400], [576, 400]]
        : [[160 + batch % 37 * 4, 160 + batch % 109 * 4],
          [640 - batch % 37 * 4, 640 - batch % 109 * 4]];
    Match.setTargets(env, targets);
    for (let step = 0; step < 3; step++) {
      const start = performance.now();
      env.updateSubstep();
      timings.step.push(performance.now() - start);
    }
    const start = performance.now();
    Match.report(env);
    timings.reporting.push(performance.now() - start);
  }
  env.updateGradient = original;
  phases.push({ name, timings: Object.fromEntries(Object.entries(timings)
    .map(([key, values]) => [key, summarize(values)])), report: Match.report(env) });
}
const result = { node: process.version, cpu: os.cpus()[0].model, config, phases };
writeFileSync(path.join(output, 'model.json'), JSON.stringify(result, null, 2));
console.table(phases.map(({ name, timings, report }) => ({ phase: name,
  'step mean ms': timings.step.meanMs.toFixed(2), 'step p95 ms': timings.step.p95Ms.toFixed(2),
  'gradient total ms': timings.gradient.totalMs.toFixed(0),
  'report mean ms': timings.reporting.meanMs.toFixed(2), hash: report.hash })));
console.log(`Model measurements: ${output}/model.json`);
