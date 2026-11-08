// Opt in with ?debug&seed=123. All simulation work still goes through Environment.
function installGameHarness() {
  let seed = Number(new URLSearchParams(window.location.search).get('seed') ?? 1);

  function validateSeed(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new RangeError('seed must be a 32-bit unsigned integer');
    }
  }

  function getState() {
    const occupied = new Set();
    const obstacles = new Map(env.obstacles.map(({ x, y }) => [`${x},${y}`, { x, y }]));
    const diagnostics = { overlaps: 0, onObstacles: 0, outsideField: 0, gridMismatches: 0, offGrid: 0, orphanedCells: 0,
      invalidTeams: 0, invalidHealth: 0 };
    const particles = env.particles.map(({ id, x, y, xspeed, yspeed, team, health }, index) => {
      const position = `${x},${y}`;
      if (occupied.has(position)) diagnostics.overlaps++;
      occupied.add(position);
      const cell = env.map[y]?.[x];
      if (!cell) diagnostics.outsideField++;
      if (x % env.SCALE || y % env.SCALE) diagnostics.offGrid++;
      if (cell?.obstacle) diagnostics.onObstacles++;
      if (cell?.particle !== env.particles[index]) diagnostics.gridMismatches++;
      if (!env.teams[team]) diagnostics.invalidTeams++;
      if (!Number.isInteger(health) || health < 0 || health > env.combat.maxHealth) diagnostics.invalidHealth++;
      return { id, x, y, xspeed, yspeed, team, health };
    });
    const active = new Set(env.particles);
    for (const cell of env.cells) {
      if (cell.particle && (!active.has(cell.particle)
          || cell.particle.x !== cell.x || cell.particle.y !== cell.y)) diagnostics.orphanedCells++;
    }
    const counts = env.teamCounts();
    return {
      seed,
      frame: simulationFrame,
      paused: manualStepping,
      running: env.running,
      scenario: env.scenario,
      combat: { ...env.combat },
      combatStats: { ...env.combatStats },
      teams: env.teams.map(team => ({ id: team.id, stationary: team.stationary, count: counts[team.id],
        target: { x: team.player.x, y: team.player.y },
        inputTarget: { x: team.player.dx, y: team.player.dy },
        navigationGoals: team.navigationGoals.map(goal => ({ ...goal })),
      })),
      width: env.FIELD_X,
      height: env.FIELD_Y,
      cellSize: env.SCALE,
      navigationGoals: env.navigationGoals.map(goal => ({ ...goal })),
      spawnInfo: env.spawnInfo ? { ...env.spawnInfo } : null,
      target: { x: env.player.x, y: env.player.y },
      inputTarget: { x: env.player.dx, y: env.player.dy },
      particles,
      obstacles: [...obstacles.values()],
      diagnostics,
    };
  }

  validateSeed(seed);
  randomSeed(seed);
  window.gameHarness = Object.freeze({
    getState,
    reset({ seed: nextSeed = 1, particleCount = 1000 } = {}) {
      if (multiplayer) throw new Error('Cannot reset an online match locally');
      validateSeed(nextSeed);
      if (!Number.isInteger(particleCount) || particleCount < 0 || particleCount > 10000) {
        throw new RangeError('particleCount must be an integer between 0 and 10000');
      }
      noLoop();
      manualStepping = true;
      seed = nextSeed;
      randomSeed(seed);
      env.background?.remove();
      env.foreground?.remove();
      env = new Environment({ graphics: false });
      env.PARTICLE_COUNT = particleCount;
      env.init();
      simulationFrame = 0;
      paintFrom = null;
      painting = false;
      activePointer = null;
      renderGame();
      return getState();
    },
    setTarget(x, y) {
      if (multiplayer) multiplayer.target(x, y);
      else env.player.setTarget(x, y);
    },
    spawn() {
      if (multiplayer) throw new Error('Cannot spawn units in an online match');
      start();
      return getState();
    },
    captureChallenge() {
      if (multiplayer) throw new Error('Cannot replace an online match');
      startCaptureChallenge();
      return getState();
    },
    step(frames = 1) {
      if (!manualStepping) throw new Error('Pause the simulation before stepping');
      if (!Number.isInteger(frames) || frames < 0 || frames > 1000) {
        throw new RangeError('frames must be an integer between 0 and 1000');
      }
      advanceSimulation(frames);
      renderGame();
      return getState();
    },
    pause() {
      setPaused(true);
      return getState();
    },
    resume() {
      setPaused(false);
    },
  });
}
