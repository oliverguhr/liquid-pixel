# liquid-pixel

A Liquid War inspired swarm game, based on the original
[algorithm description](https://ufoot.org/liquidwar/v5/techinfo/algorithm/en/).

## Run locally

Requires Node.js 22 or newer and npm.

```bash
npm ci
npm start
```

Open http://127.0.0.1:4173. Click `Spawn swarm`, move the mouse to steer, and drag
on the canvas to paint obstacles. Arrow keys also move the target. p5.js is
installed locally, so the game needs no CDN after installation.
Restart an already running local server after this update so it serves the
new `Renderer.js` file.

The responsive interface has a live unit count, Pause/Resume and Clear terrain
controls. The canvas renders at a minimum of 1600×1600 backing pixels, rising
to 2400×2400 on displays with a pixel density of 3. The logical world remains
800×800, so changing display size or density does not change the simulation.
`Renderer.js` provides shaded round cyan motes, cached glow, a quiet background
grid, outlined terrain and the cursor. It uses no random numbers or movement
updates. Pointer coordinates are mapped from the displayed canvas into the
world using precise Pointer Events, including fractional screen coordinates.

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

Free-space attraction uses a Euclidean correction so the resting swarm forms
a circle. Individual movement phases and local update priorities avoid moving
the whole cloud as a rigid shape. Subtle, stable pixel shades make individual
units visible. These phases are deterministic; movement uses no fresh random
numbers. Randomness only determines the seeded spawn order.

## Tests and visual verification

```bash
npx playwright install chromium
npm test -- --runInBand
npm run test:browser
npm run test:all
npm run play:agent
npm run play:preview
```

On Linux, install missing browser system libraries if needed with
`npx playwright install-deps chromium`.

The tests use the same simulation as the game. Node tests can construct an
`Environment` with `graphics: false`; they need no mocked p5 implementation.
Browser tests run real Chromium and use real mouse and button events.
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

`getState()` returns copies of particle IDs and positions, obstacle positions,
input and applied targets, per-region navigation goals, cell size, spawn
counts and occupancy diagnostics. Diagnostics cover duplicate positions,
particles on obstacles, particles outside the field, incorrect ownership,
positions off the grid and orphaned cell owners. Healthy runs keep all zero.
`reset` clears graphics, particles, obstacles, clocks and input state.

## Development

- [TODO.md](TODO.md): priorities, bug status and acceptance criteria.
- [AGENTS.md](AGENTS.md): repository instructions for coding agents.
- [Original algorithm references](docs/liquid-war-reference.md): source files
  and distinctions between the original and this implementation.
- [Movement verification](docs/movement-validation.md): scenarios and evidence.
- [Presentation verification](docs/presentation-validation.md): resolution,
  responsive input and interface checks.
