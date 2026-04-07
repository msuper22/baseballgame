const COLORS_BY_LEVEL = {
  1: ['#4caf50', '#81c784', '#ffffff'],
  2: ['#1e88e5', '#42a5f5', '#ffffff', '#ffd700'],
  3: ['#fb8c00', '#ffa726', '#ffffff', '#ffd700', '#e53935'],
  4: ['#ff9f1c', '#e53935', '#ffd700', '#ffffff', '#43a047', '#1e88e5', '#8e24aa'],
};

/**
 * Launch confetti scaled by runs scored.
 * 1 run = small burst, 4 runs (grand slam) = massive explosion
 */
export function launchConfetti(runs = 1) {
  const level = Math.min(runs, 4);
  const particleCount = 40 + level * 40; // 80, 120, 160, 200
  const spread = 100 + level * 50;       // wider spread for more runs
  const velocity = 8 + level * 3;        // faster particles
  const duration = 2000 + level * 500;   // longer for bigger celebrations
  const colors = COLORS_BY_LEVEL[level] || COLORS_BY_LEVEL[1];

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:9998';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];

  // For grand slam, burst from multiple points
  const burstPoints = level >= 4 ? 3 : 1;
  for (let b = 0; b < burstPoints; b++) {
    const cx = burstPoints === 1
      ? canvas.width * 0.5
      : canvas.width * (0.25 + b * 0.25);
    const count = Math.floor(particleCount / burstPoints);

    for (let i = 0; i < count; i++) {
      particles.push({
        x: cx + (Math.random() - 0.5) * spread,
        y: canvas.height * (level >= 3 ? 0.35 : 0.4),
        vx: (Math.random() - 0.5) * velocity * 2,
        vy: -Math.random() * velocity - 4,
        w: Math.random() * (6 + level * 2) + 3,
        h: Math.random() * (4 + level) + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        life: 1,
        decay: 0.004 + Math.random() * 0.008,
      });
    }
  }

  const start = performance.now();

  function frame(time) {
    if (time - start > duration) {
      canvas.remove();
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let alive = false;
    for (const p of particles) {
      if (p.life <= 0) continue;
      alive = true;

      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.3;
      p.vx *= 0.99;
      p.rotation += p.rotSpeed;
      p.life -= p.decay;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (alive) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(frame);
}
