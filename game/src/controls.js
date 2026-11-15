// DUSTFALL II — input. Pointer lock for the mouse, key state for
// movement, and the action edges (fire, reload, throw, plant, buy)
// that main.js polls once per tick. The mouse look sensitivity and the
// pitch clamp live here. Everything is plain DOM events — no library.

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false };
  let wheelDelta = 0;
  let locked = false;

  const keyHandlers = {
    KeyW: 'forward',
    KeyA: 'left',
    KeyS: 'back',
    KeyD: 'right',
    Space: 'jump',
    ShiftLeft: 'crouch',
    ShiftRight: 'crouch',
    KeyR: 'reload',
    KeyE: 'plant',
    KeyG: 'throw',
    KeyB: 'buy',
    KeyQ: 'swap',
    Digit1: 'slot1',
    Digit2: 'slot2',
    Digit3: 'slot3',
    Digit4: 'slot4',
    Digit5: 'slot5',
  };

  const pressed = new Set(); // edge-triggered actions, consumed per tick

  function onKeyDown(e) {
    const action = keyHandlers[e.code];
    if (!action) return;
    if (!e.repeat) pressed.add(action);
    keys.add(action);
    if (action === 'jump' || action === 'crouch') e.preventDefault();
  }

  function onKeyUp(e) {
    const action = keyHandlers[e.code];
    if (action) keys.delete(action);
  }

  function onMouseMove(e) {
    if (!locked) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  }

  function onMouseDown(e) {
    if (!locked) return;
    if (e.button === 0) {
      mouse.left = true;
      mouse.leftPressed = true;
    }
    if (e.button === 2) {
      mouse.right = true;
      mouse.rightPressed = true;
    }
  }

  function onMouseUp(e) {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  }

  function onWheel(e) {
    if (!locked) return;
    wheelDelta += e.deltaY > 0 ? 1 : -1;
  }

  function onLockChange() {
    locked = document.pointerLockElement === canvas;
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('wheel', onWheel, { passive: true });
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    isDown(action) {
      return keys.has(action);
    },
    wasPressed(action) {
      const hit = pressed.has(action);
      if (hit) pressed.delete(action);
      return hit;
    },
    lookDelta(sensitivity = 0.0023) {
      const dx = mouse.dx * sensitivity;
      const dy = mouse.dy * sensitivity;
      mouse.dx = 0;
      mouse.dy = 0;
      return { dx, dy };
    },
    get firing() {
      return mouse.left;
    },
    get firePressed() {
      const hit = mouse.leftPressed;
      mouse.leftPressed = false;
      return hit;
    },
    get scopePressed() {
      const hit = mouse.rightPressed;
      mouse.rightPressed = false;
      return hit;
    },
    wheelSteps() {
      const d = wheelDelta;
      wheelDelta = 0;
      return d;
    },
    get locked() {
      return locked;
    },
    requestLock() {
      canvas.requestPointerLock();
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    wishDir(yaw) {
      let fx = 0;
      let fz = 0;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      if (keys.has('forward')) {
        fx += sin;
        fz += -cos;
      }
      if (keys.has('back')) {
        fx -= sin;
        fz -= -cos;
      }
      if (keys.has('left')) {
        fx += -cos;
        fz += -sin;
      }
      if (keys.has('right')) {
        fx += cos;
        fz += sin;
      }
      const len = Math.hypot(fx, fz);
      if (len < 0.01) return { x: 0, z: 0 };
      return { x: fx / len, z: fz / len };
    },
  };
}
