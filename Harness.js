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
    const diagnostics = { overlaps: 0, onObstacles: 0, outsideField: 0, gridMismatches: 0, offGrid: 0, orphanedCells: 0 };
    const particles = env.particles.map(({ id, x, y, xspeed, yspeed }, index) => {
      const position = `${x},${y}`;
      if (occupied.has(position)) diagnostics.overlaps++;
      occupied.add(position);
      const cell = env.map[y]?.[x];
      if (!cell) diagnostics.outsideField++;
      if (x % env.SCALE || y % env.SCALE) diagnostics.offGrid++;
      if (cell?.obstacle) diagnostics.onObstacles++;
      if (cell?.particle !== env.particles[index]) diagnostics.gridMismatches++;
      return { id, x, y, xspeed, yspeed };
    });
    const active = new Set(env.particles);
    for (const cell of env.cells) {
      if (cell.particle && (!active.has(cell.particle)
          || cell.particle.x !== cell.x || cell.particle.y !== cell.y)) diagnostics.orphanedCells++;
    }
    return {
      seed,
      frame: simulationFrame,
      paused: manualStepping,
      running: env.running,
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
      env.player.setTarget(x, y);
    },
    spawn() {
      start();
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
