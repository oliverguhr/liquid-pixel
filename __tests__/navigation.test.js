const Environment = require('../Environment');
const Obstacle = require('../Obstacle');
const { random } = require('../Determinism');

// Independent grid relaxation: no mesh, priority heap or cached neighbour links.
function referenceDistances(env, goals) {
  const distances = new Float64Array(env.cells.length).fill(Infinity);
  const queued = new Uint8Array(env.cells.length);
  const queue = [];
  for (const goal of goals) {
    const index = goal.y / env.SCALE * env.columns + goal.x / env.SCALE;
    distances[index] = 0;
    queued[index] = 1;
    queue.push(index);
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    queued[index] = 0;
    const x = index % env.columns, y = Math.floor(index / env.columns);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= env.columns || y + dy < 0 || y + dy >= env.rows) continue;
        const next = index + dy * env.columns + dx;
        if (env.cells[next].obstacle) continue;
        if (dx && dy && (env.cells[index + dx].obstacle || env.cells[index + dy * env.columns].obstacle)) continue;
        const candidate = distances[index] + (dx && dy ? 14 : 10);
        if (candidate >= distances[next]) continue;
        distances[next] = candidate;
        if (!queued[next]) { queue.push(next); queued[next] = 1; }
      }
    }
  }
  return distances;
}

test.each([
  [96, 80, 0], [32, 32, 0], [41, 29, 0.22], [35, 21, 0.45], [1, 37, 0], [37, 1, 0],
])('all path costs match an independent grid solver on %i×%i cells (obstacles %f)', (columns, rows, density) => {
  const rng = random(456);
  const env = new Environment({ width: columns * 4, height: rows * 4, graphics: false });
  for (const cell of env.cells) if (rng() < density) new Obstacle(env, cell.x, cell.y);
  const targets = [[0, 0], [columns - 1, rows - 1], [Math.floor(columns / 2), Math.floor(rows / 2)],
    [Math.min(31, columns - 1), Math.min(17, rows - 1)]];
  for (let i = 0; i < 4; i++) targets.push([Math.floor(rng() * columns), Math.floor(rng() * rows)]);
  for (const [x, y] of targets) {
    for (const team of env.teams) {
      team.player.setTarget((team.id ? columns - 1 - x : x) * 4, (team.id ? rows - 1 - y : y) * 4);
      team.player.update();
      env.updateGradient(team.id);
      expect(team.distance).toEqual(referenceDistances(env, team.navigationGoals));
    }
  }
});
