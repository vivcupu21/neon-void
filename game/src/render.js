// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield
// is scaled to fit the window and centred, the margin filled with the backdrop colour.
// Neon glow via shadowBlur (sparingly) and 'lighter' compositing for bullets and particles.
// The starfield and nebulae are seeded once at boot, so a screenshot seed always paints the
// same sky; twinkle and drift run off state.elapsed, never Math.random or wall time.
import { FIELD, FONT, PALETTE, PLAYER } from './config.js';
import { createRandom } from './random.js';
import { KIND_DRONE, KIND_ELITE, KIND_SPINNER, KIND_WEAVER } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;
const PANEL = { width: 640, top: 150, line: 34, bottom: 76 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const bestLabel = cachedLabel('BEST ');
  const waveLabel = cachedLabel('WAVE ');
  const finalLabel = cachedLabel('SCORE ');
  const fonts = new Map();

  // Seeded sky: three parallax layers, each star fixed in the field; drift is a pure
  // function of elapsed time, so the same step count always draws the same sky.
  const rng = createRandom(1337);
  const stars = [];
  for (let layer = 0; layer < 3; layer += 1) {
    const count = [70, 50, 30][layer];
    for (let i = 0; i < count; i += 1) {
      stars.push({
        x: rng() * FIELD.width, y: rng() * FIELD.height,
        layer, size: 0.6 + rng() * (layer + 1) * 0.7, phase: rng() * TAU,
      });
    }
  }
  // Pre-rendered nebulae: three soft radial blobs on an offscreen canvas.
  const nebula = document.createElement('canvas');
  nebula.width = FIELD.width;
  nebula.height = FIELD.height;
  const nctx = nebula.getContext('2d');
  const blobs = [
    { x: 240, y: 170, r: 330, c: 'rgba(64, 32, 120, 0.20)' },
    { x: 1040, y: 560, r: 360, c: 'rgba(16, 90, 110, 0.18)' },
    { x: 980, y: 110, r: 260, c: 'rgba(120, 24, 90, 0.14)' },
  ];
  for (const b of blobs) {
    const g = nctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0, b.c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    nctx.fillStyle = g;
    nctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, glow) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    if (glow) {
      context.shadowColor = color;
      context.shadowBlur = glow;
    } else {
      context.shadowBlur = 0;
    }
    context.fillText(value, x, y);
    context.shadowBlur = 0;
  }

  function poly(points) {
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) context.lineTo(points[i][0], points[i][1]);
    context.closePath();
  }

  function drawBackground(state) {
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.drawImage(nebula, 0, 0);
    const t = state.elapsed;
    for (let i = 0; i < stars.length; i += 1) {
      const s = stars[i];
      const drift = (t * (4 + s.layer * 7)) % FIELD.height;
      const y = (s.y + drift) % FIELD.height;
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.4 + s.phase));
      context.globalAlpha = tw * (0.35 + s.layer * 0.25);
      context.fillStyle = s.layer === 2 ? '#cfe9ff' : '#8fa8c8';
      context.fillRect(s.x, y, s.size, s.size);
    }
    context.globalAlpha = 1;
    // Vignette.
    const vg = context.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.42,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.95,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    context.fillStyle = vg;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawShip(x, y, angle, color, scale, flame) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.scale(scale, scale);
    if (flame > 0) {
      context.fillStyle = '#ff9a3d';
      context.globalAlpha = 0.85;
      poly([[-14, 5], [-14 - flame * 14, 0], [-14, -5]]);
      context.fill();
      context.globalAlpha = 1;
    }
    context.shadowColor = color;
    context.shadowBlur = 16;
    context.fillStyle = color;
    poly([[20, 0], [-12, -12], [-6, 0], [-12, 12]]);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = '#ffffff';
    poly([[10, 0], [-2, -4], [-2, 4]]);
    context.fill();
    context.restore();
  }

  function drawEnemy(e, t) {
    const color = e.kind === KIND_DRONE ? PALETTE.drone
      : e.kind === KIND_WEAVER ? PALETTE.weaver
      : e.kind === KIND_SPINNER ? PALETTE.spinner : PALETTE.elite;
    context.save();
    context.translate(e.x, e.y);
    context.shadowColor = color;
    context.shadowBlur = 14;
    context.fillStyle = color;
    context.strokeStyle = color;
    if (e.kind === KIND_DRONE) {
      const a = Math.atan2(e.vy, e.vx);
      context.rotate(a);
      poly([[e.radius, 0], [-e.radius * 0.8, -e.radius * 0.75], [-e.radius * 0.4, 0], [-e.radius * 0.8, e.radius * 0.75]]);
      context.fill();
    } else if (e.kind === KIND_WEAVER) {
      context.rotate(e.t * 1.5);
      poly([[0, -e.radius], [e.radius, 0], [0, e.radius], [-e.radius, 0]]);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(0, 0, 3.5, 0, TAU);
      context.fill();
    } else if (e.kind === KIND_SPINNER) {
      context.rotate(e.orbit);
      poly(hexPoints(e.radius));
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, e.radius * 0.45, 0, TAU);
      context.stroke();
    } else {
      // Elite cruiser: big hull with a pulsing core.
      context.rotate(Math.sin(e.t * 0.7) * 0.12);
      poly([[e.radius, 0], [e.radius * 0.5, -e.radius * 0.55], [-e.radius * 0.7, -e.radius * 0.4], [-e.radius, 0], [-e.radius * 0.7, e.radius * 0.4], [e.radius * 0.5, e.radius * 0.55]]);
      context.fill();
      context.shadowBlur = 0;
      const pulse = 0.6 + 0.4 * Math.sin(t * 5);
      context.fillStyle = `rgba(255, 255, 255, ${pulse})`;
      context.beginPath();
      context.arc(0, 0, e.radius * 0.22, 0, TAU);
      context.fill();
      // HP bar.
      const w = e.radius * 1.6;
      context.fillStyle = 'rgba(255,255,255,0.25)';
      context.fillRect(-w / 2, -e.radius - 16, w, 5);
      context.fillStyle = PALETTE.elite;
      context.fillRect(-w / 2, -e.radius - 16, w * (e.hp / e.maxHp), 5);
    }
    context.restore();
  }

  function hexPoints(r) {
    const pts = [];
    for (let i = 0; i < 6; i += 1) pts.push([Math.cos((i / 6) * TAU) * r, Math.sin((i / 6) * TAU) * r]);
    return pts;
  }

  function drawField(state) {
    drawBackground(state);
    const p = state.player;
    const t = state.elapsed;

    // Power-ups.
    for (const pu of state.powerups) {
      const color = pu.kind === 'spread' ? PALETTE.powerSpread
        : pu.kind === 'rapid' ? PALETTE.powerRapid
        : pu.kind === 'shield' ? PALETTE.powerShield : PALETTE.powerRepair;
      context.save();
      context.translate(pu.x, pu.y);
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.fillStyle = color;
      context.globalAlpha = 0.85 + 0.15 * Math.sin(pu.t * 6);
      context.beginPath();
      context.arc(0, 0, pu.radius, 0, TAU);
      context.fill();
      context.shadowBlur = 0;
      context.globalAlpha = 1;
      context.fillStyle = '#05070f';
      text(pu.kind === 'spread' ? 'S' : pu.kind === 'rapid' ? 'R' : pu.kind === 'shield' ? 'O' : '+', 0, 6, 18, '#05070f', 'center');
      context.restore();
    }

    // Enemies.
    for (const e of state.enemies) drawEnemy(e, t);

    // Bullets (additive).
    context.globalCompositeOperation = 'lighter';
    for (const b of state.bullets) {
      context.fillStyle = PALETTE.bullet;
      context.shadowColor = PALETTE.bullet;
      context.shadowBlur = 8;
      context.beginPath();
      context.arc(b.x, b.y, b.radius, 0, TAU);
      context.fill();
    }
    for (const b of state.ebullets) {
      context.fillStyle = PALETTE.enemyBullet;
      context.shadowColor = PALETTE.enemyBullet;
      context.shadowBlur = 8;
      context.beginPath();
      context.arc(b.x, b.y, b.radius, 0, TAU);
      context.fill();
    }
    // Particles (additive).
    for (const pt of state.particles) {
      const alpha = Math.max(0, pt.life / pt.maxLife);
      context.globalAlpha = alpha;
      if (pt.ring) {
        context.strokeStyle = pt.color;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(pt.x, pt.y, pt.size, 0, TAU);
        context.stroke();
      } else {
        context.fillStyle = pt.color;
        context.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      }
    }
    context.globalAlpha = 1;
    context.shadowBlur = 0;
    context.globalCompositeOperation = 'source-over';

    // Player ship (blink while invulnerable: hidden every other tenth of a second).
    if (!state.over && (p.invulnerable === 0 || Math.floor(p.invulnerable * 10) % 2 === 1)) {
      const speed = Math.hypot(p.vx, p.vy);
      const flame = p.dashTimer > 0 ? 1.6 : Math.min(1, speed / PLAYER.maxSpeed);
      drawShip(p.x, p.y, p.angle, PALETTE.player, 1, flame);
      if (p.shield) {
        context.strokeStyle = 'rgba(94, 200, 255, 0.8)';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(p.x, p.y, p.radius + 10 + Math.sin(t * 4) * 2, 0, TAU);
        context.stroke();
      }
    }

    // Floating score text.
    for (const f of state.floaters) {
      context.globalAlpha = Math.max(0, f.life / 0.9);
      text(f.text, f.x, f.y, 20, f.color, 'center');
    }
    context.globalAlpha = 1;

    // Damage flash.
    if (state.flash > 0) {
      context.fillStyle = `rgba(255, 59, 78, ${state.flash * 0.45})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function drawHud(state, best) {
    const p = state.player;
    context.textBaseline = 'top';
    text(scoreLabel(state.score), FIELD.width / 2, 26, 34, PALETTE.text, 'center', 12);
    text(bestLabel(Math.max(best, state.score)), FIELD.width - 24, 22, 18, PALETTE.muted, 'right');
    text(waveLabel(Math.max(1, state.wave)), 24, 22, 22, PALETTE.text, 'left');
    // Hull hearts.
    for (let i = 0; i < PLAYER.hull; i += 1) {
      const cx = 30 + i * 30;
      const cy = 66;
      context.fillStyle = i < p.hull ? '#ff4f6d' : 'rgba(255,255,255,0.14)';
      context.shadowColor = '#ff4f6d';
      context.shadowBlur = i < p.hull ? 8 : 0;
      context.beginPath();
      context.moveTo(cx, cy + 7);
      context.bezierCurveTo(cx - 10, cy - 3, cx - 5, cy - 11, cx, cy - 5);
      context.bezierCurveTo(cx + 5, cy - 11, cx + 10, cy - 3, cx, cy + 7);
      context.fill();
    }
    context.shadowBlur = 0;
    // Combo meter under the score.
    if (state.combo >= 2) {
      const mult = (1 + Math.min(state.combo, 20) * 0.1).toFixed(1);
      text(`COMBO x${state.combo}  ·  ${mult}x`, FIELD.width / 2, 66, 20, '#ffd94d', 'center', 8);
      const w = 160;
      context.fillStyle = 'rgba(255,255,255,0.15)';
      context.fillRect(FIELD.width / 2 - w / 2, 92, w, 5);
      context.fillStyle = '#ffd94d';
      context.fillRect(FIELD.width / 2 - w / 2, 92, w * (state.comboTimer / 3), 5);
    }
    // Power-up timers + dash cooldown, bottom left.
    let bx = 24;
    const by = FIELD.height - 34;
    if (p.spreadTimer > 0) { text(`SPREAD ${Math.ceil(p.spreadTimer)}s`, bx, by, 16, PALETTE.powerSpread, 'left'); bx += 130; }
    if (p.rapidTimer > 0) { text(`RAPID ${Math.ceil(p.rapidTimer)}s`, bx, by, 16, PALETTE.powerRapid, 'left'); bx += 120; }
    if (p.shield) { text('SHIELD', bx, by, 16, PALETTE.powerShield, 'left'); bx += 90; }
    const dashReady = p.dashCooldown <= 0;
    text(dashReady ? 'DASH READY' : `DASH ${p.dashCooldown.toFixed(1)}s`, FIELD.width - 24, by, 16, dashReady ? '#4ff2ff' : PALETTE.muted, 'right');
    // Wave banner.
    if (state.bannerTimer > 0) {
      const alpha = Math.min(1, state.bannerTimer / 0.6);
      context.globalAlpha = alpha;
      text(state.banner, FIELD.width / 2, FIELD.height / 2 - 120, 52, '#eaf6ff', 'center', 24);
      context.globalAlpha = 1;
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10, 18, 32, 0.88)';
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = 'rgba(79, 242, 255, 0.35)';
    context.lineWidth = 1.5;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 82, 46, accent || PALETTE.text, 'center', 18);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 22, '#ffd94d', 'center');
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, newBest) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Screen shake: deterministic wobble off elapsed time.
    const sh = state.shake;
    const ox = sh > 0 ? Math.sin(state.elapsed * 97.3) * sh : 0;
    const oy = sh > 0 ? Math.cos(state.elapsed * 89.1) * sh : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + ox * view.scale, view.y + oy * view.scale);
    drawField(state);
    if (screen === SCREEN_TITLE) {
      text('NEON VOID', FIELD.width / 2, 190, 84, PALETTE.player, 'center', 30);
      text('SURVIVE THE SWARM', FIELD.width / 2, 232, 24, PALETTE.muted, 'center');
      text('WASD / arrows — move      Mouse — aim      Hold click / Space — fire', FIELD.width / 2, 300, 19, PALETTE.text, 'center');
      text('Shift / right-click — dash      P — pause      M — mute', FIELD.width / 2, 330, 19, PALETTE.text, 'center');
      text('Drones chase. Weavers shoot. Spinners burst. Elites drop power-ups.', FIELD.width / 2, 360, 19, PALETTE.muted, 'center');
      if (best > 0) text(bestLabel(best), FIELD.width / 2, 410, 22, '#ffd94d', 'center');
      const pulse = 0.6 + 0.4 * Math.sin(state.elapsed * 3);
      context.globalAlpha = pulse;
      text('PRESS ENTER OR CLICK TO START', FIELD.width / 2, 480, 24, PALETTE.player, 'center', 12);
      context.globalAlpha = 1;
      return;
    }
    drawHud(state, best);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The swarm waits for no one. Except now.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      const lines = [finalLabel(state.score), bestLabel(best)];
      if (newBest) lines.push('★ NEW BEST ★');
      drawPanel('GAME OVER', lines, 'Press Enter or click to play again', '#ff3b4e');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Map a client (mouse) position to field coordinates, or null when outside the field. */
    toField(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left - view.x) / view.scale;
      const y = (clientY - rect.top - view.y) / view.scale;
      if (x < 0 || x > FIELD.width || y < 0 || y > FIELD.height) return null;
      return { x, y };
    },
  };
}
