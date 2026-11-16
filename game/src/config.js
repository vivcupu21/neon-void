// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 16,
  accel: 2600,
  maxSpeed: 420,
  damping: 0.86, // velocity kept per step (applied as pow(damping, dt*60))
  fireInterval: 0.14,
  rapidInterval: 0.07,
  bulletSpeed: 720,
  bulletRadius: 4,
  hull: 3,
  invulnerable: 1.5,
  dashSpeed: 950,
  dashTime: 0.18,
  dashCooldown: 2.5,
  powerDuration: 8,
};

export const ENEMY = {
  drone: { hp: 1, speed: 150, speedPerWave: 12, radius: 15, points: 10 },
  weaver: { hp: 2, speed: 130, speedPerWave: 10, radius: 16, points: 25, fireInterval: 2.1, bulletSpeed: 260 },
  spinner: { hp: 3, speed: 60, speedPerWave: 5, radius: 19, points: 40, burstInterval: 2.5, bulletSpeed: 200 },
  elite: { hp: 20, speed: 55, radius: 44, points: 250, fireInterval: 1.8, bulletSpeed: 300 },
};

export const WAVE = {
  breather: 3, // seconds between waves
  spawnInterval: 0.55,
  droneBase: 4,
  dronePerWave: 2,
  weaverFrom: 2,
  spinnerFrom: 3,
  eliteEvery: 5,
};

export const COMBO = {
  window: 3, // seconds without a kill before the combo resets
  cap: 20, // multiplier = 1 + min(combo, cap) * 0.1
};

export const POWERUP = {
  dropChance: 0.12, // per kill (elite always drops one)
  fallSpeed: 90,
  radius: 16,
  kinds: ['spread', 'rapid', 'shield', 'repair'],
};

export const PALETTE = {
  backdrop: '#05070f',
  player: '#4ff2ff',
  drone: '#ff4fd8',
  weaver: '#3fd2ff',
  spinner: '#ff9a3d',
  elite: '#ff3b4e',
  bullet: '#fff3a0',
  enemyBullet: '#ff5d7a',
  powerSpread: '#7dff5e',
  powerRapid: '#ffd94d',
  powerShield: '#5ec8ff',
  powerRepair: '#ff7dd8',
  text: '#eaf6ff',
  muted: '#8fa3b8',
  panel: '#0a1220',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'neon-void.best';
