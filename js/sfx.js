// Soundeffekte: alle Klänge werden beim Abspielen per WebAudio erzeugt (keine Dateien nötig).
// Aufruf: Sfx.play('hurt'). Lautstärke: Save.data.sfxVol (Einstellungen). Neue Klänge = neuer Eintrag in SFX unten.
// Bausteine: tone() = Ton mit gleitender Tonhöhe, noise() = Rauschen mit gleitendem Filter.

const Sfx = {
  ctx: null, master: null, noiseBuf: null,
  last: {},                         // Zeit des letzten Abspielens je Klang (gegen Dauerfeuer)
  voices: 0,                        // gleichzeitig klingende Klänge (Deckel gegen Matsch)

  // Der AudioContext darf erst nach einer Eingabe starten (Browser-Regel): beim ersten Tastendruck anlegen
  init() {
    if (this.ctx) return this.ctx.state !== 'closed';
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      const n = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, n, n), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.setVolume(Save.data.sfxVol);
      return true;
    } catch (e) { this.ctx = null; return false; }
  },
  setVolume(v) {
    Save.data.sfxVol = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = Save.data.sfxVol;
  },

  // Ton: Wellenform, Tonhöhe f0 -> f1 über dur Sekunden, Lautstärke vol, optional Start nach delay
  tone(type, f0, f1, dur, vol = 0.3, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.008, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
    this.voices++; o.onended = () => this.voices--;
  },
  // Rauschen durch einen Filter (lowpass / highpass / bandpass), dessen Frequenz f0 -> f1 gleitet
  noise(filter, f0, f1, dur, vol = 0.3, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    f.type = filter;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
    this.voices++; s.onended = () => this.voices--;
  },

  // name: Eintrag aus SFX. arg: optionaler Zusatzwert (z. B. Fallzeit des Meteors)
  play(name, arg) {
    const def = SFX[name];
    if (!def || Save.data.sfxVol <= 0 || !this.init()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const now = performance.now();
    if (now - (this.last[name] || 0) < (def.gap === undefined ? 40 : def.gap)) return;
    if (this.voices > 24 && !def.big) return;
    this.last[name] = now;
    try { def.fn(this, arg); } catch (e) { /* ein kaputter Klang darf das Spiel nicht stoppen */ }
  },
};

// gap = Mindestabstand in ms zwischen zwei gleichen Klängen, big = darf auch bei vollem Deckel spielen
const SFX = {
  // ---- Menü ----
  tick:   { gap: 30, fn: (s) => s.tone('square', 660, 660, 0.04, 0.08) },
  select: { fn: (s) => { s.tone('square', 520, 520, 0.06, 0.1); s.tone('square', 780, 780, 0.09, 0.1, 0.06); } },
  back:   { fn: (s) => s.tone('square', 440, 260, 0.1, 0.09) },
  buy:    { big: true, fn: (s) => { s.tone('triangle', 660, 660, 0.07, 0.2); s.tone('triangle', 880, 880, 0.07, 0.2, 0.07); s.tone('triangle', 1320, 1320, 0.14, 0.2, 0.14); } },
  deny:   { fn: (s) => { s.tone('square', 150, 120, 0.12, 0.12); } },

  // ---- Angriffe ----
  swing:  { gap: 60, fn: (s) => s.noise('bandpass', 600, 2600, 0.12, 0.16) },
  stab:   { gap: 60, fn: (s) => { s.noise('highpass', 1200, 4000, 0.07, 0.14); s.tone('triangle', 300, 180, 0.07, 0.12); } },
  shoot:  { gap: 40, fn: (s) => { s.tone('square', 900, 300, 0.08, 0.1); s.noise('highpass', 3000, 3000, 0.04, 0.06); } },
  shotgun: { gap: 60, fn: (s) => { s.noise('lowpass', 3000, 400, 0.18, 0.28); s.tone('square', 260, 70, 0.14, 0.14); } },
  impulse: { gap: 60, fn: (s) => { s.tone('sawtooth', 200, 90, 0.2, 0.14); s.noise('bandpass', 400, 1200, 0.15, 0.1); } },
  slam:   { fn: (s) => { s.tone('sine', 140, 40, 0.3, 0.45); s.noise('lowpass', 900, 120, 0.25, 0.25); } },
  throw:  { fn: (s) => s.noise('bandpass', 400, 1500, 0.14, 0.14) },
  beamCharge: { gap: 200, fn: (s) => s.tone('sawtooth', 120, 420, 0.4, 0.07) },
  beam:   { fn: (s) => { s.tone('sawtooth', 700, 120, 0.45, 0.18); s.tone('square', 1400, 300, 0.3, 0.07); s.noise('bandpass', 1500, 300, 0.4, 0.14); } },
  chain:  { fn: (s) => { s.noise('highpass', 2000, 6000, 0.18, 0.22); s.tone('sawtooth', 1800, 400, 0.18, 0.1); } },
  blackhole: { fn: (s) => { s.tone('sine', 500, 60, 0.6, 0.3); s.noise('bandpass', 800, 100, 0.5, 0.12); } },
  fire:   { gap: 200, fn: (s) => s.noise('lowpass', 1200, 300, 0.2, 0.12) },

  // ---- Fähigkeiten ----
  dash:   { fn: (s) => { s.noise('bandpass', 400, 3500, 0.18, 0.2); s.tone('sine', 300, 700, 0.15, 0.08); } },
  shieldOn:  { fn: (s) => { s.tone('sine', 300, 700, 0.18, 0.22); s.tone('sine', 450, 1050, 0.18, 0.12); } },
  shieldOff: { fn: (s) => s.tone('sine', 600, 220, 0.18, 0.18) },
  pulse:  { big: true, fn: (s) => { s.tone('sine', 180, 35, 0.45, 0.5); s.noise('lowpass', 1800, 150, 0.4, 0.3); } },
  frost:  { fn: (s) => { s.tone('triangle', 1600, 800, 0.35, 0.14); s.tone('triangle', 2400, 1200, 0.3, 0.09, 0.04); s.noise('highpass', 5000, 8000, 0.25, 0.08); } },
  blink:  { fn: (s) => { s.tone('sine', 1500, 200, 0.25, 0.18); s.noise('highpass', 3000, 800, 0.2, 0.08); } },
  buff:   { fn: (s) => { s.tone('triangle', 500, 1000, 0.18, 0.18); s.tone('triangle', 750, 1500, 0.2, 0.12, 0.08); } },
  ultimate: { big: true, fn: (s) => { s.tone('sawtooth', 80, 700, 0.45, 0.2); s.tone('sine', 120, 30, 0.9, 0.5, 0.4); s.noise('lowpass', 400, 4000, 0.4, 0.2); s.noise('lowpass', 3000, 100, 0.8, 0.3, 0.4); } },
  ultReady: { fn: (s) => { s.tone('triangle', 660, 660, 0.1, 0.2); s.tone('triangle', 990, 990, 0.1, 0.2, 0.1); s.tone('triangle', 1320, 1320, 0.25, 0.2, 0.2); } },
  bloodburst: { big: true, fn: (s) => { s.tone('sawtooth', 160, 40, 0.8, 0.35); s.tone('square', 170, 45, 0.8, 0.15); s.noise('lowpass', 2500, 100, 0.7, 0.3); } },

  // ---- Treffer und Gegner ----
  hurt:   { gap: 80, big: true, fn: (s) => { s.tone('sawtooth', 240, 60, 0.25, 0.3); s.noise('lowpass', 2000, 300, 0.2, 0.22); } },
  kill:   { gap: 35, fn: (s) => { s.tone('triangle', 520 + Math.random() * 120, 160, 0.12, 0.16); s.noise('bandpass', 1500, 500, 0.06, 0.07); } },
  killBig: { gap: 60, fn: (s) => { s.tone('triangle', 300, 90, 0.22, 0.26); s.noise('lowpass', 2500, 200, 0.2, 0.2); } },
  enemyShot: { gap: 70, fn: (s) => s.tone('square', 520, 260, 0.1, 0.05) },
  missile: { gap: 120, fn: (s) => { s.tone('sawtooth', 200, 600, 0.25, 0.07); s.noise('bandpass', 600, 1800, 0.25, 0.06); } },
  warn:   { gap: 100, fn: (s) => s.tone('square', 880, 880, 0.07, 0.07) },
  blast:  { gap: 60, fn: (s) => { s.noise('lowpass', 2200, 150, 0.3, 0.3); s.tone('sine', 110, 40, 0.28, 0.3); } },
  wave:   { gap: 80, fn: (s) => s.tone('sine', 220, 90, 0.18, 0.12) },
  laser:  { gap: 150, fn: (s) => s.tone('sawtooth', 900, 800, 0.2, 0.06) },

  // ---- Einsammeln ----
  heal:   { fn: (s) => { s.tone('sine', 523, 523, 0.1, 0.22); s.tone('sine', 659, 659, 0.1, 0.22, 0.09); s.tone('sine', 784, 784, 0.18, 0.22, 0.18); } },
  drop:   { fn: (s) => { s.tone('triangle', 800, 1400, 0.12, 0.16); s.tone('triangle', 1200, 1800, 0.14, 0.12, 0.07); } },

  // ---- Boss und Spielverlauf ----
  bossIntro: { big: true, fn: (s) => { s.tone('sawtooth', 70, 45, 1.2, 0.3); s.tone('square', 105, 68, 1.2, 0.12); s.noise('lowpass', 500, 80, 1, 0.2); } },
  hit:    { gap: 30, fn: (s) => { s.tone('triangle', 760, 420, 0.06, 0.13); s.noise('highpass', 3500, 3500, 0.03, 0.06); } },
  crack:  { gap: 30, fn: (s) => { s.noise('bandpass', 2500, 900, 0.09, 0.2); s.tone('square', 320, 140, 0.06, 0.1); } },
  crateHit:   { gap: 40, fn: (s) => { s.tone('square', 220, 150, 0.06, 0.1); s.noise('bandpass', 1200, 600, 0.06, 0.12); } },
  crateBreak: { gap: 60, fn: (s) => { s.noise('lowpass', 2500, 200, 0.28, 0.26); s.tone('triangle', 200, 60, 0.2, 0.2); } },
  bossHit:   { gap: 50, fn: (s) => s.tone('square', 180, 100, 0.08, 0.1) },
  bossDown:  { big: true, fn: (s) => { s.noise('lowpass', 3000, 80, 1.1, 0.4); s.tone('sine', 120, 25, 1, 0.55); [523, 659, 784, 1047].forEach((f, i) => s.tone('triangle', f, f, 0.3, 0.2, 0.5 + i * 0.12)); } },
  upgrade:   { big: true, fn: (s) => { [392, 523, 659, 784].forEach((f, i) => s.tone('square', f, f, 0.12, 0.1, i * 0.07)); } },
  notice:    { gap: 300, fn: (s) => { s.tone('triangle', 440, 440, 0.1, 0.14); s.tone('triangle', 660, 660, 0.18, 0.14, 0.09); } },
  event:     { big: true, fn: (s) => { s.tone('sawtooth', 220, 220, 0.25, 0.16); s.tone('sawtooth', 165, 165, 0.45, 0.16, 0.25); s.noise('lowpass', 600, 150, 0.6, 0.12); } },
  death:     { big: true, fn: (s) => { s.tone('sawtooth', 400, 40, 1.3, 0.3); s.tone('square', 300, 30, 1.3, 0.12); s.noise('lowpass', 1200, 60, 1.2, 0.2); } },

  // ---- Meteoriten ----
  meteorWarn: { gap: 0, fn: (s) => { s.tone('square', 1000, 1000, 0.05, 0.05); } },
  // arg = Fallzeit: pfeifender Ton, der sich nach unten bewegt
  meteorFall: { gap: 40, fn: (s, t) => { s.tone('sine', 1800, 260, t || 0.7, 0.07); s.noise('bandpass', 2500, 500, t || 0.7, 0.05); } },
  xpGet:      { gap: 40, fn: (s) => { s.tone('sine', 900, 1400, 0.05, 0.05); } },                                                                                   // XP-Kugel eingesammelt
  levelUp:    { gap: 200, big: true, fn: (s) => { s.tone('triangle', 500, 500, 0.1, 0.16); s.tone('triangle', 750, 750, 0.1, 0.16, 0.09); s.tone('triangle', 1000, 1000, 0.2, 0.16, 0.18); } },   // Level-up
  ventWarn:   { gap: 300, fn: (s) => { s.tone('sine', 80, 150, 0.6, 0.1); s.noise('lowpass', 500, 1000, 0.6, 0.07); } },                                  // Lava-Schlot kündigt Ausbruch an
  ventBlast:  { gap: 150, big: true, fn: (s) => { s.noise('lowpass', 2000, 200, 0.55, 0.28); s.tone('sawtooth', 170, 40, 0.5, 0.16); } },                // Ausbruch
  acidBurp:   { gap: 200, fn: (s) => { s.tone('sine', 180, 520, 0.16, 0.1); s.tone('sine', 240, 680, 0.14, 0.09, 0.1); s.noise('bandpass', 700, 1400, 0.12, 0.06); } },   // Säurepfütze blubbert
  beltFlip:   { gap: 400, fn: (s) => { s.tone('square', 240, 120, 0.14, 0.05); s.tone('square', 360, 180, 0.14, 0.04, 0.12); } },                       // Schlackenband kehrt um
  meteorHit:  { gap: 40, big: true, fn: (s) => { s.noise('lowpass', 2800, 90, 0.7, 0.45); s.tone('sine', 130, 28, 0.6, 0.6); s.noise('highpass', 1500, 800, 0.1, 0.12); } },
};

// Bei Taste oder Mausklick den Ton freischalten (Browser-Regel)
for (const ev of ['keydown', 'mousedown']) window.addEventListener(ev, () => { if (Sfx.init() && Sfx.ctx.state === 'suspended') Sfx.ctx.resume().catch(() => {}); });
