const Cell = require('../Cell');
const Player = require('../Player');
const Particle = require('../Particle');
const Obstacle = require('../Obstacle');
const Environment = require('../Environment');

global.Cell = Cell;
global.Player = Player;
global.Particle = Particle;
global.Obstacle = Obstacle;

beforeEach(() => {
  global.createGraphics = () => ({
    background: jest.fn(),
    noStroke: jest.fn(),
    clear: jest.fn(),
    fill: jest.fn(),
    circle: jest.fn(),
  });
  global.random = jest.fn((min, max) => {
    if (typeof max === 'undefined') {
      return min * 0.5;
    }
    return min; // deterministic
  });
  global.constrain = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  global.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  global.mouseIsPressed = false;
  global.mouseX = 0;
  global.mouseY = 0;
});

test('Environment.getCell returns correct cell', () => {
  const env = new Environment();
  expect(env.getCell(1, 1)).toBe(env.map[1][1]);
  expect(env.getCell(-1, 0)).toBeUndefined();
});

test('Particle initializes position and updates map', () => {
  const env = new Environment();
  global.env = env; // Particle relies on global env
  const p = new Particle(5, 5);
  expect(p.x).toBe(5);
  expect(p.y).toBe(5);
  expect(env.map[p.x][p.y].particle).toBe(p);
});

