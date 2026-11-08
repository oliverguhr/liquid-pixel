// Coordinates here are game coordinates, independent of the canvas's page offset.
async function moveTarget(page, x, y) {
  await page.locator('#game-canvas').scrollIntoViewIfNeeded();
  const canvas = await page.locator('#game-canvas').boundingBox();
  const dimensions = await page.locator('#game-canvas').evaluate(element => ({
    width: Number(element.dataset.worldWidth), height: Number(element.dataset.worldHeight),
  }));
  await page.mouse.move(canvas.x + x * canvas.width / dimensions.width,
    canvas.y + y * canvas.height / dimensions.height);
}

async function paintWall(page, x, top, bottom) {
  await paintPath(page, [[x, top], [x, bottom]]);
}

async function paintPath(page, points) {
  await moveTarget(page, ...points[0]);
  await page.mouse.down();
  for (const point of points.slice(1)) await moveTarget(page, ...point);
  await page.mouse.up();
}

module.exports = { moveTarget, paintWall, paintPath };
