// EMBERFALL — every sound is synthesized with WebAudio: no audio files, no
// network, just oscillators and filtered noise. The context only starts after a
// player gesture (a click or a key), as browsers require, and M mutes it all.
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

  // A shard pickup: a bright blip that climbs with the combo, so a streak
  // literally sounds higher.
  pickup(combo) {
    const step = Math.min(combo, 12);
    this._tone(520 + step * 42, 0.14, 'sine', 0.22, 780 + step * 42);
    this._tone(1040 + step * 84, 0.1, 'triangle', 0.08);
  }

  hit() {
    this._noise(0.22, 0.5, 900);
    this._tone(140, 0.28, 'sawtooth', 0.3, 55);
  }

  dash() {
    this._noise(0.18, 0.22, 3200);
    this._tone(300, 0.16, 'sine', 0.12, 640);
  }

  powerup() {
    [523, 659, 784].forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.16, 'triangle', 0.18), i * 70);
    });
  }

  surge() {
    this._tone(98, 0.7, 'sawtooth', 0.2, 196);
    this._noise(0.5, 0.12, 500);
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

  // A soft low drone under everything, so the cave never feels silent.
  _startDrone() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0.045;
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
