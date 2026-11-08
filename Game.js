let env;
let renderer;
let simulationFrame = 0;
let manualStepping = new URLSearchParams(window.location.search).has('debug');
let paintFrom = null;
let painting = false;
let activePointer = null;
let uiState = '';

function renderingDensity() {
  return Math.max(2, Math.min(3, window.devicePixelRatio || 1));
}

function setup() {
  pixelDensity(renderingDensity());
  env = new Environment({ graphics: false });
  const canvas = createCanvas(env.FIELD_X, env.FIELD_Y);
  canvas.id('game-canvas');
  canvas.parent('canvas-host');
  canvas.elt.dataset.worldWidth = String(env.FIELD_X);
  canvas.elt.dataset.worldHeight = String(env.FIELD_Y);
  canvas.elt.setAttribute('aria-label', 'Swarm playfield: move to guide, drag to draw terrain');
  renderer = new Renderer(pixelDensity());
  installCanvasInput(canvas.elt);
  document.querySelector('#spawn-button').addEventListener('click', start);
  document.querySelector('#pause-button').addEventListener('click', () => setPaused(!manualStepping));
  document.querySelector('#clear-button').addEventListener('click', () => {
    env.clearObstacles();
    renderGame();
  });
  frameRate(60);
  if (manualStepping) {
    installGameHarness();
    noLoop();
  }
  renderGame();
}

function draw() {
  noCursor();
  if (!manualStepping) {
    env.updateSubstep();
    simulationFrame = env.tick / 2;
  }
  renderGame();
}

function advanceSimulation(frames) {
  for (let frame = 0; frame < frames; frame++) env.update();
  simulationFrame = env.tick / 2;
}

function syncUI() {
  const key = `${env.particles.length}:${manualStepping}:${env.obstacles.length > 0}`;
  if (key === uiState) return;
  uiState = key;
  document.body.dataset.paused = String(manualStepping);
  document.querySelector('#particle-count').textContent = env.particles.length.toLocaleString('en-US');
  document.querySelector('#empty-state').hidden = env.particles.length > 0;
  document.querySelector('#simulation-label').textContent = manualStepping ? 'Paused' : 'Live';
  document.querySelector('#pause-label').textContent = manualStepping ? 'Resume' : 'Pause';
  document.querySelector('#pause-icon').setAttribute('href', manualStepping ? '#icon-play' : '#icon-pause');
  document.querySelector('#pause-button').setAttribute('aria-pressed', String(manualStepping));
  document.querySelector('#map-label').textContent = env.obstacles.length ? 'Custom terrain' : 'Open field';
  document.querySelector('#spawn-note').textContent = env.particles.length ? 'Replaces your current swarm.' : 'Start with 1,000 little explorers.';
}

function renderGame() {
  renderer.render(env, drawingContext, painting);
  syncUI();
}

function setPaused(paused) {
  manualStepping = paused;
  if (paused) noLoop();
  else loop();
  renderGame();
}

function start() {
  env.running = true;
  env.createParticles();
  renderGame();
}

function installCanvasInput(canvas) {
  const pointFor = event => {
    const bounds = canvas.getBoundingClientRect();
    const snap = value => Math.abs(value - Math.round(value)) < 0.001 ? Math.round(value) : value;
    return {
      x: snap((event.clientX - bounds.left) * env.FIELD_X / bounds.width),
      y: snap((event.clientY - bounds.top) * env.FIELD_Y / bounds.height),
    };
  };
  const applyTarget = point => {
    env.player.setTarget(point.x, point.y);
    env.player.update();
  };
  const finish = event => {
    if (event.pointerId !== activePointer) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    activePointer = null;
    paintFrom = null;
    painting = false;
    renderGame();
  };
  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const point = pointFor(event);
    applyTarget(point);
    painting = true;
    activePointer = event.pointerId;
    paintFrom = point;
    canvas.setPointerCapture(event.pointerId);
    env.paintObstacles(point.x, point.y);
    renderGame();
  });
  canvas.addEventListener('pointermove', event => {
    if (!event.isPrimary) return;
    if (painting && event.buttons === 0) finish(event);
    const point = pointFor(event);
    applyTarget(point);
    if (painting && event.pointerId === activePointer) {
      const inside = point.x >= 0 && point.y >= 0 && point.x < env.FIELD_X && point.y < env.FIELD_Y;
      if (inside) {
        env.paintObstacles(point.x, point.y, paintFrom ?? point);
        paintFrom = point;
      } else {
        if (paintFrom) env.paintObstacles(env.player.x, env.player.y, paintFrom);
        paintFrom = null;
      }
    }
    if (manualStepping || painting) renderGame();
  });
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('lostpointercapture', finish);
}

function keyPressed() {
  const directions = {
    [UP_ARROW]: [0, -1], [DOWN_ARROW]: [0, 1],
    [RIGHT_ARROW]: [1, 0], [LEFT_ARROW]: [-1, 0],
  };
  const direction = directions[keyCode];
  if (!direction) return;
  env.player.dir(...direction);
  if (manualStepping) renderGame();
  return false;
}

function windowResized() {
  const density = renderingDensity();
  if (density !== pixelDensity()) pixelDensity(density);
  if (renderer) {
    renderer.setDensity(density);
    renderGame();
  }
}
