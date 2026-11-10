# liquid-pixel

A Liquid War inspired swarm game, based on the original
[algorithm description](https://ufoot.org/liquidwar/v5/techinfo/algorithm/en/).

## Run locally

Requires Node.js 22 or newer and npm.

```bash
npm ci
npm start
```

Open http://127.0.0.1:4173. The lobby shows connected players and players waiting
for an opponent. Its decorative swarms gently follow the mouse, then settle
back when it leaves; reduced-motion preferences keep them still.
Click `Spielen` in two tabs or browsers to start a random
two-player match. Search can be cancelled. Move the mouse or use the arrow
keys to guide your assigned blue or red swarm. Both teams start with 1,000
units. Capture the entire other team to win; both players return to the lobby
after the result. Leaving or losing the connection also ends the match.

Restart an already running server after this update: it now serves WebSocket
connections as well as the game files. To make it reachable on your local
network, run `HOST=0.0.0.0 npm start` and open the host's LAN address on port
4173. `PORT` changes the port. HTTPS hosting should forward `/socket` WebSocket
upgrades to the same Node server; the browser automatically uses `wss:` there.

The server manages matchmaking, numbered input batches and state-report
comparison. Both clients simulate the complete match; the server does not
calculate particle movement or stream particle positions. See the
[multiplayer design and protocol](docs/multiplayer-design.md).

The existing singleplayer playground remains at
http://127.0.0.1:4173/playground. Click `Spawn swarm`, move the mouse to steer,
and drag to paint obstacles. Terrain editing and local Pause/Resume belong to
the playground. Each online match generates a new obstacle map from its shared
seed. Both clients get exactly the same terrain. Mirrored obstacles give both
teams the same layout; start areas stay clear and all free cells remain connected.
Restart the server and reload both clients after updating to these map rules.
p5.js is installed locally, so the game needs no CDN after installation.

The responsive interface has a live unit count, Pause/Resume and Clear terrain
controls. The canvas renders at a minimum of 1600×1600 backing pixels, rising
to 2400×2400 on displays with a pixel density of 3. The logical world remains
800×800, so changing display size or density does not change the simulation.
`Renderer.js` provides shaded round motes with clear gaps like the lobby artwork,
cached glow, a quiet background grid, outlined terrain and the cursor.
Soft light is accumulated on a separate
400×400 surface and scaled up; particle cores and terrain keep their HiDPI
resolution. It uses no random numbers or movement
updates. Pointer coordinates are mapped from the displayed canvas into the
world using precise Pointer Events, including fractional screen coordinates.

`Capture challenge` starts 1,000 blue units and a stationary red cloud of 400.
Move the mouse into the red cloud and hold contact to capture its units. Both
teams use directional attacks and neighbour healing; weakened units dim.
Captured units change colour and follow their new team's target. Team counts
and a completion message show progress. `Spawn swarm` returns to free play;
both buttons preserve terrain. See the [capture rules and checks](docs/capture-validation.md).

Each particle occupies one 4×4 square; its crisp round visual core fits inside
that square, with a translucent decorative halo. Obstacles use the same
collision grid. Painting preserves existing particles; occupied cells are left
free rather than burying or deleting their occupants. Spawning replaces the
old swarm and uses available free cells, up to the requested count.

The swarm follows an obstacle-aware distance field. It takes individual,
collision-checked neighbour steps, including alternatives around occupied
cells. Diagonal steps cannot cut through blocked corners. If the target is
inside a wall or outside a reachable region, each region uses its closest
free target cell. A fully sealed wall cannot be crossed.

Each team reuses its eight deterministic direction orders per visited cell;
terrain and target changes invalidate these choices.
Current particle occupancy is checked on every movement and contact action.

Free-space attraction uses a Euclidean correction and limits sideways drift
away from the target so the resting swarm forms a circle. Individual movement
phases and local update priorities avoid moving the whole cloud as a rigid
shape. Subtle, stable pixel shades make individual
units visible. These phases are deterministic; movement uses no fresh random
numbers. Randomness only determines the seeded spawn order.

## Docker and test-server deployment

On the test server, install Git and Docker Engine with the Docker Compose
plugin. Clone this repository and let [compose.yaml](compose.yaml) build and
start the game directly on that server:

```bash
git clone https://github.com/oliverguhr/liquid-pixel.git
cd liquid-pixel
docker compose up -d --build --wait
docker compose logs -f
```

No GitHub Actions build, container registry or registry login is involved.
Node.js and npm run inside Docker, so they do not need to be installed on
the server. The initial build downloads the Node base image and the locked
production dependencies; subsequent builds reuse Docker's cache.

Open `http://<test-server>:4173`; `/playground` opens the singleplayer.
HTTP and `/socket` WebSocket connections share this port. The published port
also accepts LAN connections. If a reverse proxy provides HTTPS, forward
WebSocket upgrades on `/socket` to this same container.

To change the host port, create a `.env` file beside `compose.yaml`, for example:

```dotenv
LIQUID_PIXEL_PORT=8080
```

The default is port 4173. To update, run these commands in the repository:

```bash
git pull --ff-only
docker compose up -d --build --wait
```

Stop with `docker compose down`. Restarting or updating ends ongoing matches;
lobby and match state live only in memory, so no volume is required.

The image installs only locked production dependencies, runs the Node server
as the unprivileged `node` user and listens on `0.0.0.0:4173` inside the
container. Development tools, local dependencies and generated artifacts
are excluded from the build context.

## Tests and visual verification

```bash
npx playwright install chromium firefox webkit
npm test -- --runInBand
npm run test:browser
npm run test:all
npm run play:agent
npm run play:preview
npm run play:capture
npm run play:multiplayer
```

On Linux, install missing browser system libraries if needed with
`npx playwright install-deps chromium firefox webkit`.

The tests use the same simulation as the game. Node tests can construct an
`Environment` with `graphics: false`; they need no mocked p5 implementation.
Browser tests use real mouse and button events. Multiplayer checks also run
Firefox and WebKit, comparing full simulation states against Chromium and
Node and playing actual mixed-engine matches.
They start their own server on port **4174**, allowing the game on 4173 to
remain open. Set `LIQUID_PIXEL_TEST_PORT` to use a different test port.

Coverage includes spawning and respawning, pixel ownership, borders and
corners, finite walls, U-shaped obstacles, a passage one particle wide,
sealed regions, targets on walls, painting during play, keyboard input,
repeatable replay, and long runs with 1,000 particles. Twelve seeded mazes
check every microstep for wall and diagonal-corner violations. Additional
tests require single pixels to arrive at 1,800 independently reachable maze
targets, guarding against safe but cycling paths. Additional
browser tests measure a filled circular shape and varied individual motion.
All movement regressions currently run as normal assertions; there are no
expected failures or skipped movement tests.

Browser tests save screenshots and JSON states under `test-results/`.
Presentation tests verify the 1600/2400-pixel backing buffers, scaled input,
state-preserving rendering, Pause/Resume, clearing terrain, and narrow layouts.
They save full interface screenshots to `artifacts/ui-preview/desktop.png`
and `artifacts/ui-preview/mobile.png`.
`play:agent` records a complete wall scenario at frames 0, 40, 80, 160, 240
and 400, checks occupancy throughout, and verifies that all 1,000 particles
reach the other side. Its output is in `artifacts/agent-play/`, including a
Playwright trace:

```bash
npx playwright show-trace artifacts/agent-play/trace.zip
```

`play:preview` records the live animation with several mouse target changes
in `artifacts/swarm-preview/swarm-motion.webm`. This is useful for judging
movement and individual behaviour, which screenshots alone cannot establish.
The scripts use their own temporary server ports. Use
`npm run test:browser -- --headed` to watch the browser tests.

`play:multiplayer` opens two independent browser sessions at the normal lobby,
clicks through matchmaking, plays a live match to completion and checks that
both complete states match. Videos, interface screenshots and the final
states are saved in `artifacts/multiplayer-preview/`. It uses a fixed server
seed for reproducibility and does not advance the match through debug steps.

## Controlling the simulation

Open http://127.0.0.1:4173/?debug&seed=123 to start paused and expose
`window.gameHarness` to DevTools or Playwright's `page.evaluate`:

```js
gameHarness.reset({ seed: 123, particleCount: 1000 });
gameHarness.spawn();
gameHarness.setTarget(680, 440);
const state = gameHarness.step(30);
gameHarness.resume();
gameHarness.pause();
```

`step(n)` requires a paused simulation. It advances `n` logical updates,
then renders. Each update contains two half-steps; normal playback renders
those half-steps separately at a requested 60 Hz. One logical frame retains
the original 30 Hz time unit. A pause during live playback can therefore
report a half-integer frame. Fixed seeds and input timing reproduce the
same states. Screenshot bytes can vary with browser rendering.

`gameHarness.captureChallenge()` starts the same capture scenario as the UI
button. State includes each particle's `team` and `health`, per-team targets
and counts, combat parameters and attack/heal/conversion counters. The live
`play:capture` recording and checkpoint states are saved under
`artifacts/capture-preview/`.

`getState()` returns copies of particle IDs and positions, obstacle positions,
input and applied targets, per-region navigation goals, cell size, spawn
counts and occupancy diagnostics. Diagnostics cover duplicate positions,
particles on obstacles, particles outside the field, incorrect ownership,
positions off the grid and orphaned cell owners. Healthy runs keep all zero.
`reset` clears graphics, particles, obstacles, clocks and input state.

`?online&debug` instead opens the real lobby with diagnostics enabled. Online
matches advance only from server input; local reset, spawn, pause and step
commands are rejected. The client's `multiplayer.checkpoints` map retains
the last 20 reports and canonical states in debug mode. Normal online play
keeps no such snapshot history and exposes no `gameHarness`.

## Development

- [Navigation performance results](docs/navigation-performance-results.md):
  retained direction caching and a discarded adaptive mesh experiment.
- [Performance results](docs/performance-results.md): eight measured experiments,
  seven retained improvements, one discarded cache, and reproducible comparisons.
- [Performance analysis](docs/performance-analysis.md): the original client and
  server profile, rendering comparison and proposed improvements. Run
  `npm run profile:model`, `npm run profile:multiplayer -- baseline-isolated`
  and `npm run profile:rendering` sequentially to reproduce the measurements.
  Browser measurements need Playwright-Chromium; output goes to the ignored
  `artifacts/performance/` directory. These commands do not alter game rules.
- [TODO.md](TODO.md): priorities, bug status and acceptance criteria.
- [AGENTS.md](AGENTS.md): repository instructions for coding agents.
- [Original algorithm references](docs/liquid-war-reference.md): source files
  and distinctions between the original and this implementation.
- [Movement verification](docs/movement-validation.md): scenarios and evidence.
- [Presentation verification](docs/presentation-validation.md): resolution,
  responsive input and interface checks.
- [Capture verification](docs/capture-validation.md): local opponent capture,
  health, healing, tests and a live browser recording.
- [Multiplayer design](docs/multiplayer-design.md): implemented lobby, client-side
  simulation, input protocol, checks and initial validation boundaries.
