// AETHERHOLD — every sound is synthesized with WebAudio: no audio files, no
// network, just oscillators and filtered noise. The context only starts after
// a player gesture (a click or a key), as browsers require, and M mutes it.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._drone = null;
  }

  // Call from any user gesture; safe to call repeatedly.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._startDrone();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  _tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  // Tower placed: a low stone thud plus a bright chime on top.
  place() {
    this._tone(180, 0.16, 'triangle', 0.25, 90);
    this._tone(660, 0.22, 'sine', 0.14, 990);
  }

  // Tower upgraded: two rising notes.
  upgrade() {
    this._tone(523, 0.14, 'triangle', 0.2);
    setTimeout(() => this._tone(784, 0.2, 'triangle', 0.2), 90);
  }

  shoot() {
    this._tone(880, 0.07, 'square', 0.05, 420);
  }

  cannon() {
    this._noise(0.28, 0.32, 700);
    this._tone(90, 0.25, 'sine', 0.3, 45);
  }

  frost() {
    this._tone(1240, 0.22, 'sine', 0.1, 1860);
    this._tone(1560, 0.18, 'sine', 0.06, 2100);
  }

  sniper() {
    this._noise(0.12, 0.28, 4200);
    this._tone(220, 0.1, 'sawtooth', 0.12, 70);
  }

  zap() {
    this._noise(0.09, 0.2, 5200);
    this._tone(1400, 0.08, 'square', 0.06, 300);
  }

  // A kill pays a little coin tick.
  coin() {
    this._tone(1320, 0.06, 'sine', 0.07, 1760);
  }

  // An enemy slips past the bastion: a dull horn of warning.
  leak() {
    this._tone(196, 0.4, 'sawtooth', 0.22, 98);
    this._noise(0.3, 0.18, 500);
  }

  // A wave begins: a war horn, two notes.
  horn() {
    this._tone(147, 0.5, 'sawtooth', 0.16, 220);
    setTimeout(() => this._tone(220, 0.45, 'sawtooth', 0.14, 294), 160);
  }

  // A boss wave: a low, longer horn.
  bossHorn() {
    [98, 123, 98].forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.55, 'sawtooth', 0.2, f * 0.8), i * 220);
    });
  }

  // Not enough gold: a flat buzz.
  error() {
    this._tone(160, 0.14, 'square', 0.1, 120);
  }

  gameOver() {
    [392, 311, 233, 175].forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.34, 'triangle', 0.2), i * 160);
    });
  }

  win() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.4, 'sine', 0.2), i * 110);
    });
  }

  // A soft low drone under everything, so the valley never feels silent.
  _startDrone() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0.04;
    gain.connect(this.master);
    const o1 = this.ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = 55;
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 55.7;
    o1.connect(gain);
    o2.connect(gain);
    o1.start();
    o2.start();
    this._drone = { o1, o2, gain };
  }
}
