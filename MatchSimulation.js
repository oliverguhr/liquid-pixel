const MatchEnvironment = typeof module !== 'undefined' ? require('./Environment') : Environment;
const MatchMath = typeof module !== 'undefined' ? require('./Determinism') : Determinism;
const MatchMap = typeof module !== 'undefined' ? require('./MatchTerrain') : MatchTerrain;

const MatchSimulation = (() => {
  const VERSION = 'liquid-pixel-lockstep-2';
  const defaults = Object.freeze({ version: VERSION, width: 800, height: 800, scale: 4,
    speed: 8, particleCount: 1000, seed: 1 });

  function create(config) {
    if (config.version !== VERSION) throw new Error('Incompatible simulation version');
    const env = new MatchEnvironment({ ...config, graphics: false, random: MatchMath.random(config.seed) });
    env.scenario = 'multiplayer';
    env.running = true;
    env.teams.forEach(team => {
      team.stationary = false;
      const x = Math.floor(env.FIELD_X * (team.id ? 0.72 : 0.28) / env.SCALE) * env.SCALE;
      const y = Math.floor(env.FIELD_Y / 2 / env.SCALE) * env.SCALE;
      team.player.setTarget(x, y);
      team.player.update();
    });
    MatchMap.generate(env, config.seed, config.particleCount);
    env.teams.forEach(team => env.spawnSwarm(team.id, config.particleCount, team.player.x, team.player.y));
    env.spawnInfo = { requested: config.particleCount * 2, spawned: env.particles.length,
      available: env.cells.length - env.obstacles.length };
    return env;
  }

  function setTargets(env, targets) {
    if (!Array.isArray(targets) || targets.length !== 2) throw new Error('Invalid match targets');
    targets.forEach((point, team) => {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isInteger)
          || point[0] < 0 || point[1] < 0 || point[0] >= env.FIELD_X || point[1] >= env.FIELD_Y) {
        throw new Error('Invalid match target');
      }
      env.teams[team].player.setTarget(...point);
    });
  }

  function applyFrame(env, frame) {
    if (frame.tick !== env.tick + frame.steps || !Number.isInteger(frame.steps) || frame.steps < 1 || frame.steps > 12) {
      throw new Error('Out-of-order match frame');
    }
    setTargets(env, frame.targets);
    for (let step = 0; step < frame.steps; step++) env.updateSubstep();
  }

  function state(env) {
    return {
      version: VERSION, tick: env.tick, width: env.FIELD_X, height: env.FIELD_Y,
      scale: env.SCALE, speed: env.SPEED, nextParticleId: env.nextParticleId,
      rules: { ...env.combat },
      teams: env.teams.map(team => [team.id, team.stationary, team.player.x, team.player.y, team.player.dx, team.player.dy]),
      particles: env.particles.map(p => [p.id, p.x, p.y, p.team, p.health, p.credit, p.phase, p.convertedAt]),
      // Occupancy and gradients are derived from these positions, targets and terrain.
      obstacles: env.obstacles.map(o => [o.x, o.y]).sort((a, b) => a[1] - b[1] || a[0] - b[0]),
      stats: { ...env.combatStats },
    };
  }
  function report(env) {
    return { tick: env.tick, hash: MatchMath.checksum(state(env)), counts: env.teamCounts() };
  }
  return Object.freeze({ VERSION, defaults, create, setTargets, applyFrame, state, report });
})();
if (typeof module !== 'undefined') module.exports = MatchSimulation;
