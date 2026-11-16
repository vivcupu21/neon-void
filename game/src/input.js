// Keyboard and pointer input. Held keys give a steering direction; one-shot presses (start or
// restart, pause, mute, dash) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. Mouse position aims the ship;
// holding the left button (or Space) fires.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_DASH = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const DASH = new Set(['ShiftLeft', 'ShiftRight']);
const FIRE = new Set(['Space']);

export function createInput(target, toField) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let firing = false;
  let actions = 0;
  let aimX = null;
  let aimY = null;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (FIRE.has(event.code)) firing = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (DASH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DASH;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (FIRE.has(event.code)) firing = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false; down = false; left = false; right = false; firing = false;
  });
  target.addEventListener('pointerdown', (event) => {
    if (event.button === 2) {
      actions |= ACTION_DASH;
      return;
    }
    firing = true;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointerup', (event) => {
    if (event.button === 0) firing = false;
  });
  target.addEventListener('pointermove', (event) => {
    const p = toField(event.clientX, event.clientY);
    if (p) { aimX = p.x; aimY = p.y; }
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    up() { return up; },
    down() { return down; },
    left() { return left; },
    right() { return right; },
    firing() { return firing; },
    aimX() { return aimX; },
    aimY() { return aimY; },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
