// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward from
// a fresh world for a fixed number of steps, steered by a simple autopilot, so the frame is what
// a short game really looks like and the same seed always gives the same frame.
// - start: the title backdrop, enemies drifting in for 5 s.
// - play: the autopilot fights wave 1-2 for 26 s: it flees the nearest threat, aims at the
//   nearest enemy and fires, dashes when a bullet or enemy gets close. It survives.
// - end: the same pilot with a 0.25 s horizon, no dash and no fire — the swarm catches it.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER, KIND_DRONE } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 600;
const HORIZON_PLAY = 0.7;
const HORIZON_END = 0.25;
const SAMPLE = 1 / 30;

/** The autopilot's view of danger: nearest enemy or enemy bullet, in field coords. */
function nearestThreat(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < bestD) { bestD = d; best = { x: e.x, y: e.y, vx: e.vx || 0, vy: e.vy || 0, r: e.radius }; }
  }
  for (const b of state.ebullets) {
    const d = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
    if (d < bestD) { bestD = d; best = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: 6 }; }
  }
  return { threat: best, dist: Math.sqrt(bestD) };
}

function nearestEnemy(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/**
 * Steer away from the threat while keeping inside the field, and aim at the nearest enemy.
 * Returns the input object world.step expects.
 */
function autopilot(state, horizon, reckless) {
  const p = state.player;
  const { threat, dist } = nearestThreat(state);
  const target = nearestEnemy(state);
  let up = false; let down = false; let left = false; let right = false;
  let firing = false;
  let dash = false;
  let aimX = null; let aimY = null;

  if (reckless) {
    // Drift toward the nearest drone and never shoot: the swarm catches it.
    if (target) {
      aimX = target.x; aimY = target.y;
      left = target.x < p.x - 8;
      right = target.x > p.x + 8;
      up = target.y < p.y - 8;
      down = target.y > p.y + 8;
    }
    return { up, down, left, right, aimX, aimY, firing, dash };
  }

  if (target) {
    aimX = target.x;
    aimY = target.y;
    firing = true;
  }
  // Flee when something is close: move away from it, biased toward the field centre.
  if (threat && dist < 240) {
    const awayX = p.x - threat.x;
    const awayY = p.y - threat.y;
    const len = Math.hypot(awayX, awayY) || 1;
    const cx = FIELD.width / 2 - p.x;
    const cy = FIELD.height * 0.6 - p.y;
    const mx = awayX / len * 0.8 + cx / FIELD.width;
    const my = awayY / len * 0.8 + cy / FIELD.height;
    left = mx < -0.15;
    right = mx > 0.15;
    up = my < -0.15;
    down = my > 0.15;
    if (dist < 90 && p.dashCooldown <= 0) dash = true;
  } else if (target) {
    // No close threat: close the distance a little, stay in the lower half.
    if (p.y < FIELD.height * 0.55) down = true;
    if (Math.abs(target.x - p.x) > 60) {
      left = target.x < p.x;
      right = target.x > p.x;
    }
  }
  void horizon;
  return { up, down, left, right, aimX, aimY, firing, dash };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { up: false, down: false, left: false, right: false, aimX: null, aimY: null, firing: false, dash: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  const reckless = name === 'end';
  for (let index = 0; index < limit / STEP; index += 1) {
    const input = autopilot(world.state, reckless ? HORIZON_END : HORIZON_PLAY, reckless);
    if (world.step(STEP, input, false) & EVENT_OVER) break;
  }
  const over = world.state.over;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
