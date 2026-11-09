let env;
let renderer;
let simulationFrame = 0;
let manualStepping = new URLSearchParams(window.location.search).has('debug');
let paintFrom = null;
let painting = false;
let activePointer = null;
let uiState = '';
let onlineUIState = '';
let multiplayer = null;
let resultTimer;
const gameParams = new URLSearchParams(window.location.search);
const soloMode = location.pathname === '/playground' || gameParams.has('debug') && !gameParams.has('online');

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
  document.querySelector('#challenge-button').addEventListener('click', startCaptureChallenge);
  document.querySelector('#pause-button').addEventListener('click', () => setPaused(!manualStepping));
  document.querySelector('#clear-button').addEventListener('click', () => {
    env.clearObstacles();
    renderGame();
  });
  document.querySelector('#game-view').hidden = !soloMode;
  document.querySelector('#lobby-view').hidden = soloMode;
  document.querySelector('#pause-button').hidden = !soloMode;
  if (!soloMode) {
    manualStepping = false;
    document.querySelector('#playground-title').textContent = 'Dein Schwarm. Dein Spiel.';
    document.querySelector('#game-view .field-heading .eyebrow').textContent = 'DAS MATCH';
    document.querySelector('#how-to-link').href = '/playground#how-to';
    canvas.elt.setAttribute('aria-label', 'Online-Spielfeld: Bewege die Maus, um deinen Schwarm zu lenken');
    multiplayer = new MultiplayerClient({
      getEnvironment: () => env,
      onMatch: config => {
        clearTimeout(resultTimer);
        env = MatchSimulation.create(config);
        simulationFrame = 0;
        painting = false;
        paintFrom = null;
        uiState = '';
        renderGame();
      },
      onChange: syncOnlineUI,
      onEnd: showMatchResult,
    });
    document.querySelector('#play-button').addEventListener('click', () => multiplayer.queue());
    document.querySelector('#cancel-search-button').addEventListener('click', () => multiplayer.cancel());
    document.querySelector('#leave-button').addEventListener('click', () => multiplayer.leave());
    document.querySelector('#return-button').addEventListener('click', () => {
      clearTimeout(resultTimer);
      multiplayer.returnToLobby();
    });
    syncOnlineUI();
  } else document.body.dataset.view = 'solo';
  frameRate(60);
  if (gameParams.has('debug')) {
    installGameHarness();
    if (soloMode) noLoop();
  }
  renderGame();
}

function draw() {
  if (multiplayer && multiplayer.phase !== 'match') return;
  noCursor();
  if (multiplayer) {
    multiplayer.advance(performance.now());
    simulationFrame = env.tick / 2;
  } else if (!manualStepping) {
    env.updateSubstep();
    simulationFrame = env.tick / 2;
  }
  renderGame();
}

function advanceSimulation(frames) {
  if (multiplayer) throw new Error('Online matches advance only through server inputs');
  for (let frame = 0; frame < frames; frame++) env.update();
  simulationFrame = env.tick / 2;
}

function syncUI() {
  const counts = env.teamCounts();
  const capture = env.scenario === 'capture';
  const key = `${counts}:${capture}:${manualStepping}:${env.obstacles.length > 0}:${multiplayer?.team}:${Boolean(multiplayer?.verified)}`;
  if (key === uiState) return;
  uiState = key;
  document.body.dataset.paused = String(manualStepping);
  document.querySelector('#particle-count').textContent = env.particles.length.toLocaleString('en-US');
  document.querySelector('#empty-state').hidden = env.particles.length > 0;
  document.querySelector('#simulation-label').textContent = multiplayer
    ? multiplayer.verified ? 'Synchronisiert' : 'Synchronisiere…' : manualStepping ? 'Paused' : 'Live';
  document.querySelector('#pause-label').textContent = manualStepping ? 'Resume' : 'Pause';
  document.querySelector('#pause-icon').setAttribute('href', manualStepping ? '#icon-play' : '#icon-pause');
  document.querySelector('#pause-button').setAttribute('aria-pressed', String(manualStepping));
  document.querySelector('#map-label').textContent = env.obstacles.length
    ? multiplayer ? 'Zufallskarte' : 'Custom terrain' : 'Open field';
  document.querySelector('#spawn-note').textContent = env.particles.length ? 'Replaces your current swarm.' : 'Start with 1,000 little explorers.';
  document.querySelector('#mode-name').textContent = multiplayer
    ? multiplayer.phase === 'match' ? 'Online-Match' : 'Lobby' : capture ? 'Capture challenge' : 'Free play';
  document.querySelector('#team-stats').hidden = !capture;
  document.querySelector('#blue-count').textContent = counts[0].toLocaleString('en-US');
  document.querySelector('#red-count').textContent = counts[1].toLocaleString('en-US');
  document.querySelector('#capture-status').textContent = !capture ? ''
    : counts[1] === 0 && counts[0] > 0 ? 'All yours. The red cloud joined your swarm.'
      : counts[0] === 0 ? 'No blue units left. Start a new challenge to try again.'
        : 'Guide your blue swarm into the resting red cloud. Hold contact to capture it.';
  document.querySelector('#capture-status').hidden = !capture;
  document.querySelector('#match-blue-count').textContent = counts[0].toLocaleString('de-DE');
  document.querySelector('#match-red-count').textContent = counts[1].toLocaleString('de-DE');
  document.querySelector('#your-team').textContent = multiplayer?.team === 1 ? 'Du spielst Rot' : 'Du spielst Blau';
  document.querySelector('#your-team').dataset.team = String(multiplayer?.team ?? 0);
}

function syncOnlineUI() {
  if (!multiplayer) return;
  const { phase, connection, online, waiting } = multiplayer;
  const key = JSON.stringify([phase, connection, online, waiting, multiplayer.notice || '']);
  if (key === onlineUIState) return;
  onlineUIState = key;
  document.body.dataset.view = phase;
  document.querySelector('#lobby-view').hidden = phase !== 'lobby' && phase !== 'searching';
  document.querySelector('#game-view').hidden = phase !== 'match';
  document.querySelector('#result-view').hidden = phase !== 'result';
  document.querySelector('#leave-button').hidden = phase !== 'match';
  document.querySelector('#online-count').textContent = String(online);
  document.querySelector('#waiting-count').textContent = String(waiting);
  document.querySelector('#play-button').hidden = phase === 'searching';
  document.querySelector('#play-button').disabled = connection !== 'online';
  document.querySelector('#cancel-search-button').hidden = phase !== 'searching';
  document.querySelector('#connection-label').textContent = connection === 'online' ? 'Verbunden'
    : connection === 'offline' ? 'Verbindung unterbrochen' : 'Verbinde…';
  document.querySelector('#lobby-message').textContent = multiplayer.notice || (phase === 'searching'
    ? 'Wir suchen einen freien Mitspieler für dich.' : connection === 'offline'
      ? 'Die Verbindung wird wiederhergestellt. Du wirst nicht automatisch eingereiht.'
      : 'Ein Klick. Zwei Schwärme. Finde deinen Mitspieler.');
  document.querySelector('#session-kind').textContent = 'Mehrspieler';
  document.querySelector('#mode-name').textContent = phase === 'match' ? 'Online-Match' : phase === 'searching' ? 'Spielersuche' : 'Lobby';
}

function showMatchResult(result) {
  const victory = result.reason === 'victory';
  document.querySelector('#result-title').textContent = victory ? result.winner === result.team ? 'Gewonnen!' : 'Gut gespielt!'
    : result.reason === 'desync' ? 'Synchronisation unterbrochen' : 'Spiel beendet';
  document.querySelector('#result-message').textContent = victory
    ? result.winner === result.team ? 'Alle Einheiten gehören jetzt zu deinem Schwarm.' : 'Dein Mitspieler hat alle Einheiten übernommen.'
    : result.reason === 'desync' ? 'Die Spielzustände stimmen nicht überein. Dieses Spiel wird nicht gewertet.'
      : result.reason === 'timeout' ? 'Ein Mitspieler antwortet nicht mehr. Ihr kehrt in die Lobby zurück.'
        : 'Die Verbindung wurde getrennt oder ein Spieler hat das Match verlassen.';
  syncOnlineUI();
  clearTimeout(resultTimer);
  resultTimer = setTimeout(() => multiplayer.returnToLobby(), 2500);
}

function renderGame() {
  renderer.render(env, drawingContext, painting, multiplayer?.cursor);
  syncUI();
}

function setPaused(paused) {
  if (multiplayer) throw new Error('An online match cannot be paused locally');
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

function startCaptureChallenge() {
  env.createCaptureScenario();
  // Apply targets immediately even when the debug harness has paused playback.
  for (const team of env.teams) team.player.update();
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
    if (multiplayer) { multiplayer.target(point.x, point.y); return; }
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
    if (multiplayer) return;
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
  if (multiplayer) multiplayer.target(multiplayer.cursor.x + direction[0] * env.SPEED,
    multiplayer.cursor.y + direction[1] * env.SPEED);
  else env.player.dir(...direction);
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
