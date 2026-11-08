const TerrainObstacle = typeof module !== 'undefined' ? require('./Obstacle') : Obstacle;
const TerrainMath = typeof module !== 'undefined' ? require('./Determinism') : Determinism;

const MatchTerrain = (() => {
  function connected(env) {
    const start = env.cells.find(cell => !cell.obstacle);
    if (!start) return false;
    const seen = new Uint8Array(env.cells.length);
    const queue = [start];
    seen[start.index] = 1;
    for (let head = 0; head < queue.length; head++) {
      for (const neighbour of queue[head].neighbours) {
        if (neighbour.dx && neighbour.dy) continue;
        const cell = neighbour.cell;
        if (!cell.obstacle && !seen[cell.index]) {
          seen[cell.index] = 1;
          queue.push(cell);
        }
      }
    }
    return queue.length === env.cells.reduce((count, cell) => count + !cell.obstacle, 0);
  }

  function generate(env, seed, particleCount) {
    if (!Number.isInteger(particleCount) || particleCount < 0) throw new RangeError('Invalid particle count');
    // A separate random stream keeps terrain independent of spawn shuffling.
    const random = TerrainMath.random((seed ^ 0xa341316c) >>> 0);
    const starts = env.teams.map(team => ({ x: team.player.x / env.SCALE, y: team.player.y / env.SCALE }));
    const mirror = starts[0].x + starts[1].x;
    let spawnRadius = 1;
    while (spawnRadius * spawnRadius < Math.min(particleCount, env.cells.length)) spawnRadius++;
    spawnRadius += 2;
    const margin = Math.max(1, Math.floor(Math.min(env.columns, env.rows) / 50));
    const pairs = Math.min(6, Math.max(1, Math.floor(Math.min(env.columns, env.rows) / 25)));
    let placed = 0;
    for (let attempt = 0; attempt < pairs * 50 && placed < pairs; attempt++) {
      const rx = 2 + Math.floor(random() * Math.max(1, Math.floor(env.columns / 20) - 1));
      const ry = 2 + Math.floor(random() * Math.max(1, Math.floor(env.rows / 13) - 1));
      const leftSpace = Math.floor(mirror / 2) - margin - rx * 2;
      const heightSpace = env.rows - margin * 2 - ry * 2;
      if (leftSpace < 1 || heightSpace < 1) continue;
      const cx = margin + rx + Math.floor(random() * leftSpace);
      const cy = margin + ry + Math.floor(random() * heightSpace);
      const ellipse = random() < 0.5;
      const cells = new Set();
      for (let dy = -ry; dy <= ry; dy++) {
        for (let dx = -rx; dx <= rx; dx++) {
          const inside = ellipse ? dx * dx * ry * ry + dy * dy * rx * rx <= rx * rx * ry * ry
            : Math.abs(dx) + Math.abs(dy) <= rx + ry - Math.ceil(Math.min(rx, ry) / 3);
          if (!inside) continue;
          for (const column of [cx + dx, mirror - cx - dx]) {
            const row = cy + dy;
            cells.add(env.getCell(column * env.SCALE, row * env.SCALE));
          }
        }
      }
      const valid = [...cells].every(cell => {
        if (!cell || cell.isBlocked()) return false;
        const x = cell.x / env.SCALE;
        const y = cell.y / env.SCALE;
        if (x < margin || x >= env.columns - margin || y < margin || y >= env.rows - margin) return false;
        if (starts.some(start => (x - start.x) ** 2 + (y - start.y) ** 2 <= spawnRadius ** 2)) return false;
        // Keep room between rocks for individual particles to flow through.
        for (let oy = -2; oy <= 2; oy++) {
          for (let ox = -2; ox <= 2; ox++) {
            if (env.getCell(cell.x + ox * env.SCALE, cell.y + oy * env.SCALE)?.obstacle) return false;
          }
        }
        return true;
      });
      if (!valid || !cells.size) continue;
      // Reject the whole mirrored pair if it isolates any free part of the map.
      for (const cell of cells) cell.obstacle = true;
      const reachable = connected(env);
      for (const cell of cells) cell.obstacle = false;
      if (!reachable) continue;
      for (const cell of cells) new TerrainObstacle(env, cell.x, cell.y);
      placed++;
    }
  }
  return Object.freeze({ generate });
})();
if (typeof module !== 'undefined') module.exports = MatchTerrain;
