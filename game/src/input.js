// AETHERHOLD — keyboard and mouse input. The game reads clicks as queued
// events (so one click never fires twice) and tracks the mouse in the
// canvas's logical 1280x720 space, whatever the window size is. Dragging
// pans the camera a little; the wheel zooms.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressedKeys = []; // single-press queue, consumed by the game
    this.clicks = []; // queued {x, y} clicks in logical pixels
    this.mouseX = 640;
    this.mouseY = 360;
    this.mouseDown = false;
    this.wheelDelta = 0;
    this.dragX = 0; // pixels dragged since last read
    this.dragY = 0;
    this._canvas = canvas;
    this._lastX = 0;
    this._lastY = 0;
    this._onKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!e.repeat) this.pressedKeys.push(key);
      this.keys.add(key);
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    };
    this._toLogical = (e) => {
      const r = canvas.getBoundingClientRect();
      const sx = canvas.width / r.width;
      const sy = canvas.height / r.height;
      return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
    };
    this._onMouseMove = (e) => {
      const p = this._toLogical(e);
      if (this.mouseDown) {
        this.dragX += p.x - this._lastX;
        this.dragY += p.y - this._lastY;
      }
      this._lastX = p.x;
      this._lastY = p.y;
      this.mouseX = p.x;
      this.mouseY = p.y;
    };
    this._onMouseDown = (e) => {
      const p = this._toLogical(e);
      this._lastX = p.x;
      this._lastY = p.y;
      this.mouseX = p.x;
      this.mouseY = p.y;
      this.mouseDown = true;
    };
    this._onMouseUp = (e) => {
      const p = this._toLogical(e);
      this.mouseDown = false;
      // A click is a press and release in nearly the same spot.
      if (Math.hypot(p.x - this._lastX, p.y - this._lastY) < 6) {
        this.clicks.push({ x: p.x, y: p.y });
      }
    };
    this._onWheel = (e) => {
      e.preventDefault();
      this.wheelDelta += e.deltaY;
    };
    this._onBlur = () => {
      this.keys.clear();
      this.mouseDown = false;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('blur', this._onBlur);
  }

  held(code) {
    return this.keys.has(code);
  }

  consumePresses() {
    const out = this.pressedKeys;
    this.pressedKeys = [];
    return out;
  }

  consumeClicks() {
    const out = this.clicks;
    this.clicks = [];
    return out;
  }

  consumeWheel() {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return d;
  }

  consumeDrag() {
    const d = { x: this.dragX, y: this.dragY };
    this.dragX = 0;
    this.dragY = 0;
    return d;
  }
}
