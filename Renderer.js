// Canvas presentation only. World positions and collision cells stay in Environment.
class Renderer {
  constructor(density) {
    this.density = density;
    this.environment = null;
    this.backdrop = null;
    this.sprites = new Map();
    this.glows = new Map();
  }

  setDensity(density) {
    if (density === this.density) return;
    this.density = density;
    this.environment = null;
    this.sprites.clear();
    this.glows.clear();
  }

  surface(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * this.density);
    canvas.height = Math.round(height * this.density);
    const context = canvas.getContext('2d');
    context.scale(this.density, this.density);
    return { canvas, context };
  }

  buildBackdrop(environment) {
    const { canvas, context } = this.surface(environment.FIELD_X, environment.FIELD_Y);
    const width = environment.FIELD_X;
    const height = environment.FIELD_Y;
    const gradient = context.createRadialGradient(width * 0.48, height * 0.42, 0, width * 0.5, height * 0.5, width * 0.75);
    gradient.addColorStop(0, '#101f2b');
    gradient.addColorStop(0.7, '#0c1822');
    gradient.addColorStop(1, '#09131c');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#91c1cc14';
    for (let y = 24; y < height; y += 32) {
      for (let x = 24; x < width; x += 32) {
        context.beginPath();
        context.arc(x, y, 0.65, 0, Math.PI * 2);
        context.fill();
      }
    }
    if (environment.obstacles.length) {
      const size = environment.SCALE;
      context.beginPath();
      for (const obstacle of environment.obstacles) context.rect(obstacle.x, obstacle.y, size, size);
      context.fillStyle = '#283740';
      context.shadowColor = '#d9ad7645';
      context.shadowBlur = 9 * this.density;
      context.fill();
      context.shadowBlur = 0;
      context.beginPath();
      for (const { x, y } of environment.obstacles) {
        if (!environment.getCell(x, y - size)?.obstacle) { context.moveTo(x, y); context.lineTo(x + size, y); }
        if (!environment.getCell(x + size, y)?.obstacle) { context.moveTo(x + size, y); context.lineTo(x + size, y + size); }
        if (!environment.getCell(x, y + size)?.obstacle) { context.moveTo(x, y + size); context.lineTo(x + size, y + size); }
        if (!environment.getCell(x - size, y)?.obstacle) { context.moveTo(x, y); context.lineTo(x, y + size); }
      }
      context.lineWidth = 0.8;
      context.lineJoin = 'round';
      context.strokeStyle = '#d1ad7eaa';
      context.stroke();
    }
    this.backdrop = canvas;
    this.environment = environment;
    environment.backgroundDirty = false;
  }

  particleSprite(size, shade, team) {
    const key = `${size}:${shade}:${team}`;
    if (this.sprites.has(key)) return this.sprites.get(key);
    const { canvas, context } = this.surface(size, size);
    const center = size / 2;
    const radius = size * 0.37;
    const brightness = (shade - 210) / 45;
    const gradient = context.createRadialGradient(center - radius * 0.25, center - radius * 0.3, 0, center, center, radius);
    const colors = team === 1
      ? ['255,222,228', `255,${112 + Math.round(brightness * 40)},142`, '221,65,103']
      : ['210,243,255', `${108 + Math.round(brightness * 45)},215,255`, '60,164,230'];
    gradient.addColorStop(0, `rgba(${colors[0]},${0.8 + brightness * 0.2})`);
    gradient.addColorStop(0.42, `rgba(${colors[1]},0.95)`);
    gradient.addColorStop(1, `rgba(${colors[2]},${0.7 + brightness * 0.2})`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.fill();
    this.sprites.set(key, canvas);
    return canvas;
  }

  glowSprite(size, team) {
    const key = `${size}:${team}`;
    if (this.glows.has(key)) return this.glows.get(key);
    const extent = size * 6;
    const { canvas, context } = this.surface(extent, extent);
    const radius = extent / 2;
    const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
    const color = team === 1 ? '255,100,126' : '80,190,255';
    gradient.addColorStop(0, `rgba(${color},0.09)`);
    gradient.addColorStop(0.35, `rgba(${color},0.025)`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, extent, extent);
    this.glows.set(key, canvas);
    return canvas;
  }

  render(environment, context, isPainting) {
    if (this.environment !== environment || environment.backgroundDirty) this.buildBackdrop(environment);
    const width = environment.FIELD_X;
    const height = environment.FIELD_Y;
    const size = environment.SCALE;
    context.save();
    context.setTransform(this.density, 0, 0, this.density, 0, 0);
    context.clearRect(0, 0, width, height);
    context.drawImage(this.backdrop, 0, 0, width, height);
    context.imageSmoothingEnabled = true;

    // Cached small sprites avoid filtering the full HiDPI surface every frame.
    context.globalCompositeOperation = 'lighter';
    for (const particle of environment.particles) {
      context.drawImage(this.glowSprite(size, particle.team), particle.x - size * 2.5, particle.y - size * 2.5, size * 6, size * 6);
    }
    context.globalCompositeOperation = 'source-over';
    for (const particle of environment.particles) {
      context.globalAlpha = 0.5 + 0.5 * particle.health / environment.combat.maxHealth;
      context.drawImage(this.particleSprite(size, particle.shade, particle.team), particle.x, particle.y, size, size);
    }
    context.globalAlpha = 1;

    const x = environment.player.x;
    const y = environment.player.y;
    const radius = isPainting ? environment.player.playerScale : 10;
    context.strokeStyle = isPainting ? '#e1ba89ba' : '#b7ffe3ba';
    context.fillStyle = isPainting ? '#dab3770b' : '#a2fbe407';
    context.lineWidth = 0.8;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (!isPainting) {
      context.strokeStyle = '#8df6dc24';
      context.beginPath();
      context.arc(x, y, 19, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#d1fff0bb';
      context.beginPath();
      context.arc(x, y, 1.2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
}
