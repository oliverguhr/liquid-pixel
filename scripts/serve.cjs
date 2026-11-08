const http = require('node:http');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { MultiplayerServer } = require('./multiplayer.cjs');

const root = path.resolve(__dirname, '..');
const files = new Set([
  '/index.html', '/style.css', '/Game.js', '/Renderer.js', '/Harness.js', '/Environment.js',
  '/Cell.js', '/Player.js', '/Particle.js', '/Obstacle.js',
  '/Determinism.js', '/MatchTerrain.js', '/MatchSimulation.js', '/Multiplayer.js',
  '/node_modules/p5/lib/p5.min.js',
]);
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

function createGameServer(options = {}) {
  const server = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    let pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/' || pathname === '/playground') pathname = '/index.html';
    if (pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    if (!files.has(pathname)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const stream = createReadStream(path.join(root, pathname));
    stream.on('error', () => {
      if (!response.headersSent) response.writeHead(404);
      response.end('Not found');
    });
    stream.on('open', () => {
      response.writeHead(200, {
        'Content-Type': `${mime[path.extname(pathname)]}; charset=utf-8`,
        'Cache-Control': 'no-store',
      });
      if (request.method === 'HEAD') {
        stream.destroy();
        response.end();
      } else {
        stream.pipe(response);
      }
    });
  });
  server.multiplayer = new MultiplayerServer(server, options);
  return server;
}

module.exports = { createGameServer };

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '127.0.0.1';
  createGameServer().listen(port, host, () => {
    console.log(`Liquid Pixel: http://${host}:${port}`);
  });
}
