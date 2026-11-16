// EMBERFALL — keyboard and mouse input. The lantern steers toward the mouse and
// answers the arrow keys / WASD too; Space or a mouse click fires a flare dash.
// Every key the game uses is tracked here, and nothing else is.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseX = 640;
    this.mouseY = 360;
    this.mouseDown = false;
    this.mouseMoved = false;
    this.dashQueued = false;
    this.anyKeyQueued = false;
    this._canvas = canvas;
    this._onKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      if (!e.repeat) {
        this.anyKeyQueued = true;
        if (e.key === ' ') this.dashQueued = true;
      }
      this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    };
    this._onMouseMove = (e) => {
      const r = canvas.getBoundingClientRect();
      const sx = canvas.width / r.width;
      const sy = canvas.height / r.height;
      this.mouseX = (e.clientX - r.left) * sx;
      this.mouseY = (e.clientY - r.top) * sy;
      this.mouseMoved = true;
    };
    this._onMouseDown = (e) => {
      this._onMouseMove(e);
      this.mouseDown = true;
      this.dashQueued = true;
      this.anyKeyQueued = true;
    };
    this._onMouseUp = () => {
      this.mouseDown = false;
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
    window.addEventListener('blur', this._onBlur);
  }

  // Steering: keys give a direction, otherwise the lantern chases the mouse.
  steerVector() {
    let x = 0;
    let y = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('a')) x -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('d')) x += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('w')) y -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('s')) y += 1;
    return { x, y, keySteer: x !== 0 || y !== 0 };
  }

  pressed(code) {
    return this.keys.has(code);
  }

  consumeDash() {
    const d = this.dashQueued;
    this.dashQueued = false;
    return d;
  }

  consumeAnyKey() {
    const k = this.anyKeyQueued;
    this.anyKeyQueued = false;
    return k;
  }
}
