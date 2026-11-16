// The game's rules and state, with no drawing and no browser in it: the player ship, waves of
// the Swarm, bullets, collisions, combo scoring, power-ups, particles and screen shake.
// step(dt, input) advances one fixed step and returns what happened as bit flags, so the caller
// can react (sounds, announcements) without the world knowing about screens or sound.
// `harmless` steps the backdrop (title screen): enemies drift and fire nothing, nothing scores.
import { COMBO, ENEMY, FIELD, PLAYER, POWERUP, STEP, WAVE } from './config.js';

export const KIND_DRONE = 0;
export const KIND_WEAVER = 1;
export const KIND_SPINNER = 2;
export const KIND_ELITE = 3;

export const EVENT_HIT = 1;
export const EVENT_KILL = 2;
export const EVENT_OVER = 4;
export const EVENT_POWERUP = 8;
export const EVENT_WAVE = 16;
export const EVENT_SHOT = 32;
export const EVENT_ENEMY_SHOT = 64;

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height * 0.72, vx: 0, vy: 0, angle: -Math.PI / 2,
    radius: PLAYER.radius, hull: PLAYER.hull, invulnerable: 0, fireTimer: 0, dashTimer: 0, dashCooldown: 0,
    dashX: 0, dashY: 0, spreadTimer: 0, rapidTimer: 0, shield: false,
  };
  const enemies = [];
  const bullets = []; // player bullets
  const ebullets = []; // enemy bullets
  const particles = [];
  const powerups = [];
  const floaters = []; // floating score text
  const state = {
    player, enemies, bullets, ebullets, particles, powerups, floaters,
    score: 0, wave: 0, combo: 0, comboTimer: 0, elapsed: 0,
    breather: 0, spawnQueue: [], spawnTimer: 0, banner: '', bannerTimer: 0,
    shake: 0, flash: 0, over: false, kills: 0,
  };

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height * 0.72;
    player.vx = 0; player.vy = 0; player.angle = -Math.PI / 2;
    player.hull = PLAYER.hull; player.invulnerable = 0; player.fireTimer = 0;
    player.dashTimer = 0; player.dashCooldown = 0; player.dashX = 0; player.dashY = 0;
    player.spreadTimer = 0; player.rapidTimer = 0; player.shield = false;
    enemies.length = 0; bullets.length = 0; ebullets.length = 0;
    particles.length = 0; powerups.length = 0; floaters.length = 0;
    state.score = 0; state.wave = 0; state.combo = 0; state.comboTimer = 0; state.elapsed = 0;
    state.breather = 1.2; state.spawnQueue = []; state.spawnTimer = 0;
    state.banner = ''; state.bannerTimer = 0; state.shake = 0; state.flash = 0;
    state.over = false; state.kills = 0;
  }

  function spawnParticle(x, y, vx, vy, life, size, color, ring = false) {
    if (particles.length > 420) return;
    particles.push({ x, y, vx, vy, life, maxLife: life, size, color, ring });
  }

  function explode(x, y, color, big = false) {
    const count = big ? 34 : 16;
    for (let i = 0; i < count; i += 1) {
      const a = random() * TAU;
      const sp = (big ? 320 : 220) * (0.3 + random() * 0.7);
      spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + random() * 0.5, 2 + random() * 3, color);
    }
    spawnParticle(x, y, 0, 0, 0.45, big ? 90 : 46, color, true);
  }

  function addFloater(x, y, text, color) {
    if (floaters.length > 24) return;
    floaters.push({ x, y, text, color, life: 0.9 });
  }

  function waveComposition(n) {
    const queue = [];
    const drones = WAVE.droneBase + WAVE.dronePerWave * n;
    for (let i = 0; i < drones; i += 1) queue.push(KIND_DRONE);
    if (n >= WAVE.weaverFrom) for (let i = 0; i < n; i += 1) queue.push(KIND_WEAVER);
    if (n >= WAVE.spinnerFrom) for (let i = 0; i < Math.floor(n / 2); i += 1) queue.push(KIND_SPINNER);
    if (n % WAVE.eliteEvery === 0) queue.push(KIND_ELITE);
    // Shuffle the queue (Fisher-Yates on the seeded RNG), elite last so it arrives late.
    const elite = queue.pop();
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = queue[i]; queue[i] = queue[j]; queue[j] = tmp;
    }
    if (elite !== undefined) queue.push(elite);
    return queue;
  }

  function startWave(n) {
    state.wave = n;
    state.spawnQueue = waveComposition(n);
    state.spawnTimer = 0.4;
    state.banner = `WAVE ${n}`;
    state.bannerTimer = 2.2;
  }

  function spawnEnemy(kind) {
    const cfg = kind === KIND_DRONE ? ENEMY.drone
      : kind === KIND_WEAVER ? ENEMY.weaver
      : kind === KIND_SPINNER ? ENEMY.spinner : ENEMY.elite;
    const margin = 40;
    let x = margin + random() * (FIELD.width - margin * 2);
    let y = -cfg.radius - 10;
    if (kind === KIND_ELITE) { x = FIELD.width / 2; y = -cfg.radius - 20; }
    const speed = cfg.speed + (cfg.speedPerWave || 0) * (state.wave - 1);
    enemies.push({
      kind, x, y, vx: 0, vy: 0, hp: cfg.hp, maxHp: cfg.hp, radius: cfg.radius,
      speed, fireTimer: 1 + random() * 1.5, phase: random() * TAU,
      anchorX: x, anchorY: 80 + random() * 160, orbit: 0, t: 0, points: cfg.points,
    });
  }

  function fireBullet(x, y, angle, speed, friendly) {
    const list = friendly ? bullets : ebullets;
    if (list.length > 240) return;
    list.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: friendly ? PLAYER.bulletRadius : 5 });
  }

  function playerFire() {
    const spread = player.spreadTimer > 0;
    const base = player.angle;
    const nx = player.x + Math.cos(base) * 22;
    const ny = player.y + Math.sin(base) * 22;
    if (spread) {
      fireBullet(nx, ny, base - 0.22, PLAYER.bulletSpeed, true);
      fireBullet(nx, ny, base, PLAYER.bulletSpeed, true);
      fireBullet(nx, ny, base + 0.22, PLAYER.bulletSpeed, true);
    } else {
      fireBullet(nx, ny, base, PLAYER.bulletSpeed, true);
    }
    spawnParticle(nx, ny, Math.cos(base) * 60, Math.sin(base) * 60, 0.08, 5, '#fff3a0');
  }

  function dropPowerup(x, y, force) {
    if (!force && random() >= POWERUP.dropChance) return;
    const kinds = POWERUP.kinds;
    const kind = kinds[Math.floor(random() * kinds.length)];
    powerups.push({ x, y, vy: POWERUP.fallSpeed, kind, radius: POWERUP.radius, t: 0 });
  }

  function killEnemy(index, events) {
    const e = enemies[index];
    enemies.splice(index, 1);
    const mult = 1 + Math.min(state.combo, COMBO.cap) * 0.1;
    const pts = Math.round(e.points * mult);
    state.score += pts;
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.kills += 1;
    const color = e.kind === KIND_DRONE ? '#ff4fd8' : e.kind === KIND_WEAVER ? '#3fd2ff' : e.kind === KIND_SPINNER ? '#ff9a3d' : '#ff3b4e';
    explode(e.x, e.y, color, e.kind === KIND_ELITE);
    addFloater(e.x, e.y, `+${pts}`, color);
    if (e.kind === KIND_ELITE) {
      state.shake = Math.max(state.shake, 14);
      dropPowerup(e.x, e.y, true);
    } else {
      dropPowerup(e.x, e.y, false);
    }
    return events | EVENT_KILL;
  }

  function damagePlayer(events) {
    if (player.invulnerable > 0 || player.dashTimer > 0) return events;
    if (player.shield) {
      player.shield = false;
      player.invulnerable = 1;
      explode(player.x, player.y, '#5ec8ff');
      return events | EVENT_HIT;
    }
    player.hull -= 1;
    player.invulnerable = PLAYER.invulnerable;
    state.combo = 0;
    state.comboTimer = 0;
    state.shake = Math.max(state.shake, 10);
    state.flash = 0.35;
    explode(player.x, player.y, '#4ff2ff');
    events |= EVENT_HIT;
    if (player.hull <= 0) {
      state.over = true;
      explode(player.x, player.y, '#4ff2ff', true);
      events |= EVENT_OVER;
    }
    return events;
  }

  function stepPlayer(dt, input) {
    // Aim: mouse position in field coords, or facing of travel when no mouse yet.
    if (input.aimX !== null && input.aimY !== null) {
      player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    }
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }

    if (input.dash && player.dashCooldown <= 0 && player.dashTimer <= 0) {
      player.dashTimer = PLAYER.dashTime;
      player.dashCooldown = PLAYER.dashCooldown;
      const dx = len > 0 ? mx : Math.cos(player.angle);
      const dy = len > 0 ? my : Math.sin(player.angle);
      player.dashX = dx; player.dashY = dy;
      for (let i = 0; i < 10; i += 1) {
        spawnParticle(player.x - dx * i * 4, player.y - dy * i * 4, -dx * 120, -dy * 120, 0.25, 3, '#4ff2ff');
      }
    }

    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.vx = player.dashX * PLAYER.dashSpeed;
      player.vy = player.dashY * PLAYER.dashSpeed;
    } else {
      player.vx += mx * PLAYER.accel * dt;
      player.vy += my * PLAYER.accel * dt;
      const damp = Math.pow(PLAYER.damping, dt * 60);
      player.vx *= damp;
      player.vy *= damp;
      const sp = Math.hypot(player.vx, player.vy);
      if (sp > PLAYER.maxSpeed) { player.vx *= PLAYER.maxSpeed / sp; player.vy *= PLAYER.maxSpeed / sp; }
    }
    player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y + player.vy * dt));

    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.dashCooldown > 0) player.dashCooldown -= dt;
    if (player.spreadTimer > 0) player.spreadTimer -= dt;
    if (player.rapidTimer > 0) player.rapidTimer -= dt;

    // Engine trail.
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > 60 && random() < 0.6) {
      const back = player.angle + Math.PI;
      spawnParticle(
        player.x + Math.cos(back) * 14 + (random() - 0.5) * 6,
        player.y + Math.sin(back) * 14 + (random() - 0.5) * 6,
        Math.cos(back) * 40, Math.sin(back) * 40, 0.3, 2.5, '#2fa8c9',
      );
    }

    player.fireTimer -= dt;
    let events = 0;
    if (input.firing && player.fireTimer <= 0) {
      playerFire();
      player.fireTimer = player.rapidTimer > 0 ? PLAYER.rapidInterval : PLAYER.fireInterval;
      events |= EVENT_SHOT;
    }
    return events;
  }

  function stepEnemy(e, dt) {
    e.t += dt;
    const cfg = e.kind === KIND_DRONE ? ENEMY.drone
      : e.kind === KIND_WEAVER ? ENEMY.weaver
      : e.kind === KIND_SPINNER ? ENEMY.spinner : ENEMY.elite;
    if (e.kind === KIND_DRONE) {
      const a = Math.atan2(player.y - e.y, player.x - e.x);
      e.vx += Math.cos(a) * 420 * dt;
      e.vy += Math.sin(a) * 420 * dt;
      const sp = Math.hypot(e.vx, e.vy);
      if (sp > e.speed) { e.vx *= e.speed / sp; e.vy *= e.speed / sp; }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    } else if (e.kind === KIND_WEAVER) {
      e.y += e.speed * 0.55 * dt;
      e.x = e.anchorX + Math.sin(e.t * 2.2 + e.phase) * 170;
      if (e.y > FIELD.height * 0.75) e.y = FIELD.height * 0.75;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && e.y > 0) {
        e.fireTimer = cfg.fireInterval * (0.85 + random() * 0.3);
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        fireBullet(e.x, e.y, a, cfg.bulletSpeed, false);
        return EVENT_ENEMY_SHOT;
      }
    } else if (e.kind === KIND_SPINNER) {
      e.orbit += dt * 0.9;
      e.anchorY += 26 * dt;
      if (e.anchorY > FIELD.height * 0.6) e.anchorY = FIELD.height * 0.6;
      e.x = e.anchorX + Math.cos(e.orbit + e.phase) * 110;
      e.y = e.anchorY + Math.sin(e.orbit + e.phase) * 60;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && e.y > 0) {
        e.fireTimer = cfg.burstInterval;
        for (let i = 0; i < 6; i += 1) fireBullet(e.x, e.y, (i / 6) * TAU + e.phase, cfg.bulletSpeed, false);
        return EVENT_ENEMY_SHOT;
      }
    } else {
      // Elite: slow advance toward the player, aimed 3-shot spread.
      const a = Math.atan2(player.y - e.y, player.x - e.x);
      e.x += Math.cos(a) * e.speed * dt;
      e.y += Math.sin(a) * e.speed * 0.5 * dt;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && e.y > 0) {
        e.fireTimer = cfg.fireInterval;
        fireBullet(e.x, e.y, a - 0.18, cfg.bulletSpeed, false);
        fireBullet(e.x, e.y, a, cfg.bulletSpeed, false);
        fireBullet(e.x, e.y, a + 0.18, cfg.bulletSpeed, false);
        return EVENT_ENEMY_SHOT;
      }
    }
    return 0;
  }

  function stepBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) bullets.splice(i, 1);
    }
    for (let i = ebullets.length - 1; i >= 0; i -= 1) {
      const b = ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) ebullets.splice(i, 1);
    }
  }

  function stepParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
      if (p.ring) p.size += 260 * dt;
    }
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      const f = floaters[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  function stepPowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i -= 1) {
      const p = powerups[i];
      p.t += dt;
      p.y += p.vy * dt;
      p.x += Math.sin(p.t * 3) * 20 * dt;
      if (p.y > FIELD.height + 20) powerups.splice(i, 1);
    }
  }

  function collide(events) {
    // Player bullets vs enemies.
    for (let bi = bullets.length - 1; bi >= 0; bi -= 1) {
      const b = bullets[bi];
      let consumed = false;
      for (let ei = enemies.length - 1; ei >= 0; ei -= 1) {
        const e = enemies[ei];
        const r = b.radius + e.radius;
        if (dist2(b.x, b.y, e.x, e.y) < r * r) {
          bullets.splice(bi, 1);
          consumed = true;
          e.hp -= 1;
          spawnParticle(b.x, b.y, 0, 0, 0.15, 4, '#fff3a0');
          if (e.hp <= 0) events = killEnemy(ei, events);
          break;
        }
      }
      if (consumed) continue;
    }
    if (state.over) return events;
    // Enemy bullets vs player.
    for (let i = ebullets.length - 1; i >= 0; i -= 1) {
      const b = ebullets[i];
      const r = b.radius + player.radius - 4;
      if (dist2(b.x, b.y, player.x, player.y) < r * r) {
        ebullets.splice(i, 1);
        events = damagePlayer(events);
        if (state.over) return events;
      }
    }
    // Enemies vs player (ramming).
    for (let ei = enemies.length - 1; ei >= 0; ei -= 1) {
      const e = enemies[ei];
      const r = e.radius + player.radius - 4;
      if (dist2(e.x, e.y, player.x, player.y) < r * r) {
        events = killEnemy(ei, events);
        events = damagePlayer(events);
        if (state.over) return events;
      }
    }
    // Power-ups vs player.
    for (let i = powerups.length - 1; i >= 0; i -= 1) {
      const p = powerups[i];
      const r = p.radius + player.radius;
      if (dist2(p.x, p.y, player.x, player.y) < r * r) {
        powerups.splice(i, 1);
        if (p.kind === 'spread') player.spreadTimer = PLAYER.powerDuration;
        else if (p.kind === 'rapid') player.rapidTimer = PLAYER.powerDuration;
        else if (p.kind === 'shield') player.shield = true;
        else if (p.kind === 'repair') player.hull = Math.min(PLAYER.hull, player.hull + 1);
        addFloater(player.x, player.y - 30, p.kind.toUpperCase(), '#7dff5e');
        events |= EVENT_POWERUP;
      }
    }
    return events;
  }

  /**
   * One fixed step. `input` = { up, down, left, right, aimX, aimY, firing, dash }.
   * With `harmless` set (the title screen's backdrop) enemies drift in but nothing can
   * touch the player and nothing scores.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - 40 * dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);

    if (harmless) {
      // Title backdrop: a slow trickle of drones drifts across; the player idles.
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && enemies.length < 8) {
        state.spawnTimer = 0.9;
        spawnEnemy(KIND_DRONE);
      }
      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        const e = enemies[i];
        e.t += dt;
        e.y += 60 * dt;
        e.x += Math.sin(e.t + e.phase) * 30 * dt;
        if (e.y > FIELD.height + 40) enemies.splice(i, 1);
      }
      stepParticles(dt);
      return 0;
    }

    if (state.over) {
      stepParticles(dt);
      return 0;
    }

    // Combo decay.
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    // Wave flow: breather -> spawn queue -> cleared -> bonus -> breather.
    if (state.breather > 0) {
      state.breather -= dt;
      if (state.breather <= 0) {
        startWave(state.wave + 1);
        events |= EVENT_WAVE;
      }
    } else if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy(state.spawnQueue.shift());
        state.spawnTimer = Math.max(0.22, WAVE.spawnInterval - state.wave * 0.02);
      }
    } else if (enemies.length === 0) {
      const bonus = 100 * state.wave;
      state.score += bonus;
      addFloater(FIELD.width / 2, FIELD.height / 2 - 40, `WAVE ${state.wave} CLEAR +${bonus}`, '#ffd94d');
      state.breather = WAVE.breather;
      state.banner = state.wave % WAVE.eliteEvery === 0 ? `WAVE ${state.wave} CLEAR` : `WAVE ${state.wave + 1} INCOMING`;
      state.bannerTimer = 2;
    }

    events |= stepPlayer(dt, input);
    for (let i = enemies.length - 1; i >= 0; i -= 1) events |= stepEnemy(enemies[i], dt);
    stepBullets(dt);
    stepPowerups(dt);
    events = collide(events);
    stepParticles(dt);
    return events;
  }

  reset();
  return { state, reset, step, startWave };
}
