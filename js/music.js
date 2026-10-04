// Hintergrundmusik: wird live per WebAudio gespielt (Step-Sequencer), keine Dateien.
//
// SPIELMUSIK ('game', 158 BPM, 4/4): Dark Cyberpunk / Industrial Synthwave als Gameplay-Loop. Aufbau:
//   Intro (4 Takte, nur beim Start) -> Loop aus 10 Abschnitten à 8 Takten = 80 Takte (ca. 2 Minuten), der nahtlos von vorn beginnt:
//   A1 Main, A2, B Variation (Glitches), A3, C1 Intensivierung, C2, D1 Peak, D2 Peak, C3 Abkühlen, B2 Rückweg (Riser) -> A1 ...
//   Kick auf jedem Schlag, rollender verzerrter Maschinen-Bass, kurze dunkle Motive (phrygisch-dominant), Pulse-Arpeggio, gated Stabs, Noise-Sweeps.
//
// ADAPTIV (Music.setState): kein Wechsel zwischen Tracks, sondern Ebenen, die ein- und ausgeblendet werden:
//   danger (aus dem Leben: ab 60 % Leben steigend, bei ~12 % voll): mehr Hi-Hats/Percussion, Arpeggio, Stabs, mehr Verzerrung, Herzschlag (lub-dub) im Rhythmus, leicht höher.
//   boss (Bosskampf): schneller (+8 %), dramatischeres und höheres Motiv, Gallop-Bass, Doppel-Kicks, Snare-Rolls, Stabs, Crash beim Beginn.
//   Beides zusammen = maximale Intensität. Nach dem Boss blendet `boss` über ca. 7 s aus (Tempo langsamer, Motiv wechselt erst am Taktanfang).
// MENÜ- und TODESMUSIK ('menu', 'dead'): ruhige Tracks aus CALM unten.
//
// Aufruf über playMusic/pauseMusic/resumeMusic (assets.js). Zahlen und Muster sind unten als Tabellen, leicht änderbar.

const MUSIC_SCALE = [0, 1, 4, 5, 7, 8, 10, 12, 13, 16, 17, 19];       // phrygisch-dominant (Stufe 0 = Grundton E)
const CHORDS = { m: [0, 3, 7, 12, 15, 19], M: [0, 4, 7, 12, 16, 19] };
const N = null;
const Z = new Array(16).fill(0), NN = new Array(16).fill(null);

const GAME_BPM = 158, GAME_ROOT = 28, INTRO_BARS = 4;            // E1
// Akkordfolgen (je 4 Takte, r = Halbtöne über dem Grundton, q = m/M)
const PROGS = {
  a: [{ r: 0, q: 'm' }, { r: 0, q: 'm' }, { r: 1, q: 'M' }, { r: 7, q: 'M' }],
  b: [{ r: 0, q: 'm' }, { r: 8, q: 'M' }, { r: 1, q: 'M' }, { r: 7, q: 'M' }],
  c: [{ r: 0, q: 'm' }, { r: 1, q: 'M' }, { r: 0, q: 'm' }, { r: 7, q: 'M' }],
  d: [{ r: 0, q: 'm' }, { r: 1, q: 'M' }, { r: 8, q: 'M' }, { r: 7, q: 'M' }],
};
// Bass-Muster (16 Schritte, Halbtöne über dem Akkordgrundton, eine Oktave über der Tiefe). Wie ein Motor: stetige Pulse mit Oktavsprüngen.
const BASS = [
  [0, N, 0, 0, N, 0, N, 0, 0, N, 0, 0, N, 0, 12, N],
  [0, N, 0, N, 0, 0, 12, N, 0, N, 0, 0, 0, N, 7, N],
  [0, 0, N, 0, 0, N, 0, 12, 0, 0, N, 0, 0, N, 1, N],
  [0, 0, 0, N, 0, 0, 12, 0, 0, 0, 0, N, 0, 12, 0, 7],
  [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 12, 1, 12],         // Gallop: Peak und Boss
];
// Motive (je 2 Takte, Zahlen = Stufen in MUSIC_SCALE). Kurz, dunkel, wiederholt.
const MOTIFS = {
  m1:   [[0, N, N, 1, N, N, 0, N, 3, N, N, N, 1, N, N, N], [0, N, N, 1, N, N, 0, N, 4, N, 3, N, 1, N, 0, N]],
  m2:   [[7, N, N, 6, N, N, 7, N, 4, N, N, N, 6, N, N, N], [7, N, N, 6, N, N, 4, N, 3, N, 4, N, 6, N, 7, N]],
  m3:   [[0, N, 1, N, 0, N, 3, N, 4, N, 3, N, 1, N, 0, N], [0, N, 1, N, 0, N, 3, N, 5, N, 4, N, 3, N, 4, N]],
  peak: [[7, N, 8, N, 7, N, 5, N, 4, N, 5, N, 7, N, N, N], [7, N, 8, N, 9, N, 8, N, 7, N, 5, N, 4, N, 3, N]],
  boss: [[7, 7, N, 8, N, 7, N, 5, 7, N, 8, N, 9, N, 8, 7], [5, N, 7, N, 8, N, 9, N, 10, N, 9, N, 8, 7, 5, N]],      // dramatischer und höher
};
const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3];       // Index in die Akkordtöne
const BOSS_KICK = [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1];
// Abschnitte à 8 Takte: prog, motif, bass (BASS-Index), hat (0-3), perc (0-2), arp, stab, snare, pad (0-1), drive (Verzerrung 0-1), glitch, riser (letzter Takt), hit (Impact am Anfang), fill (Snare-Roll im letzten Takt)
const SECTIONS = [
  { name: 'A1', prog: 'a', motif: 'm1',   bass: 0, hat: 1, perc: 0, arp: 0, stab: 0, snare: 1, pad: 0.6, drive: 0.35, hit: 1 },
  { name: 'A2', prog: 'b', motif: 'm1',   bass: 1, hat: 2, perc: 1, arp: 0, stab: 0, snare: 1, pad: 0.7, drive: 0.4 },
  { name: 'B',  prog: 'c', motif: 'm2',   bass: 2, hat: 2, perc: 1, arp: 0, stab: 1, snare: 1, pad: 0.5, drive: 0.45, glitch: 1, fill: 1 },
  { name: 'A3', prog: 'a', motif: 'm1',   bass: 1, hat: 2, perc: 1, arp: 0, stab: 0, snare: 1, pad: 0.8, drive: 0.5 },
  { name: 'C1', prog: 'd', motif: 'm3',   bass: 3, hat: 3, perc: 2, arp: 1, stab: 0, snare: 1, pad: 0.8, drive: 0.7, hit: 1 },
  { name: 'C2', prog: 'c', motif: 'm3',   bass: 3, hat: 3, perc: 2, arp: 1, stab: 1, snare: 1, pad: 0.8, drive: 0.75, fill: 1 },
  { name: 'D1', prog: 'd', motif: 'peak', bass: 4, hat: 3, perc: 2, arp: 1, stab: 1, snare: 1, pad: 1, drive: 1, hit: 1 },
  { name: 'D2', prog: 'b', motif: 'peak', bass: 4, hat: 3, perc: 2, arp: 1, stab: 1, snare: 1, pad: 1, drive: 1, fill: 1 },
  { name: 'C3', prog: 'c', motif: 'm3',   bass: 3, hat: 3, perc: 1, arp: 0, stab: 0, snare: 1, pad: 0.8, drive: 0.6 },
  { name: 'B2', prog: 'a', motif: 'm2',   bass: 2, hat: 2, perc: 1, arp: 0, stab: 0, snare: 1, pad: 0.6, drive: 0.45, glitch: 1, riser: 1 },     // führt zurück zu A1
];

// Ruhige Tracks für Menü und Todesbildschirm (einfacher Sequencer, siehe playStepCalm)
const CALM = {
  menu: {
    bpm: 92, root: 28, leadFrom: 2,
    bars: [{ r: 0, q: 'm' }, { r: 8, q: 'M' }, { r: 5, q: 'm' }, { r: 7, q: 'M' }],
    bass: [0, N, N, N, N, N, N, N, 0, N, N, N, 7, N, N, N],
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    arp: [0, N, 1, N, 2, N, 1, N, 0, N, 1, N, 2, N, 4, N],
    lead: [
      [8, N, N, N, N, N, 9, N, N, N, 8, N, N, N, N, N],
      [6, N, N, N, N, N, N, N, 7, N, N, N, 6, N, N, N],
      [4, N, N, N, N, N, 6, N, N, N, 7, N, N, N, N, N],
      [9, N, N, N, 8, N, N, N, 6, N, N, N, N, N, N, N],
    ],
    padVol: 0.05, bassVol: 0.17, arpVol: 0.035, leadVol: 0.06,
  },
  dead: {
    bpm: 66, root: 28, leadFrom: 1,
    bars: [{ r: 0, q: 'm' }, { r: 1, q: 'M' }],
    bass: [0, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N],
    kick: Z, hat: Z, arp: NN,
    lead: [NN, [6, N, N, N, N, N, N, N, 4, N, N, N, N, N, N, N]],
    padVol: 0.055, bassVol: 0.2, arpVol: 0, leadVol: 0.05,
  },
};

const Music = {
  gain: null, duck: null, send: null, delay: null, bassIn: null, crushIn: null, waves: null,
  name: null, step: 0, nextT: 0, timer: null, lastTick: 0,
  // adaptiver Zustand
  dangerT: 0, bossT: 0, danger: 0, boss: 0, bpmNow: GAME_BPM, cur: null, bossAccent: false, releaseAccent: false,

  hz(m) { return 440 * Math.pow(2, (m - 69) / 12); },

  // Ausgang anlegen (der AudioContext kommt aus Sfx): Hauptpegel, Sidechain-Bus, Echo, Bass-Verzerrer, Bitcrusher, Pulswellen
  ensure() {
    if (!Sfx.init()) return false;
    const c = Sfx.ctx;
    if (!this.gain) {
      this.gain = c.createGain(); this.gain.connect(c.destination);
      this.duck = c.createGain(); this.duck.connect(this.gain);              // Pad, Arpeggio, Lead, Stabs: werden von jeder Kick kurz leiser gedrückt
      this.send = c.createGain();
      this.delay = c.createDelay(1);
      const fb = c.createGain(), tone = c.createBiquadFilter(), wet = c.createGain();
      fb.gain.value = 0.36; wet.gain.value = 0.4;
      tone.type = 'lowpass'; tone.frequency.value = 2400;
      this.send.connect(this.delay); this.delay.connect(tone); tone.connect(fb); fb.connect(this.delay); tone.connect(wet); wet.connect(this.gain);
      // Bass: Eingang (Pegel = Verzerrungsgrad) -> Sättigungskurve -> Tiefpass -> Ausgang
      const sat = c.createWaveShaper(), curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 3) * 0.8; }
      sat.curve = curve;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      this.bassIn = c.createGain();
      this.bassIn.connect(sat); sat.connect(lp); lp.connect(this.gain);
      // Bitcrusher für Lead und Arpeggio: Treppenkurve (grobe Amplitudenstufen) = digitale Rauheit
      const crush = c.createWaveShaper(), cc = new Float32Array(1024), levels = 9;
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; cc[i] = Math.round(x * levels) / levels; }
      crush.curve = cc;
      this.crushIn = c.createGain(); this.crushIn.gain.value = 7;
      const crushOut = c.createGain(); crushOut.gain.value = 1 / 7;
      this.crushIn.connect(crush); crush.connect(crushOut); crushOut.connect(this.duck);
      this.waves = {};
      for (const [k, duty] of [['p125', 0.125], ['p25', 0.25], ['p50', 0.5]]) {          // Pulswellen
        const re = new Float32Array(48), im = new Float32Array(48);
        for (let n = 1; n < 48; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
        this.waves[k] = c.createPeriodicWave(re, im);
      }
    }
    this.setVolume(Save.data.musicVol);
    if (c.state === 'suspended') c.resume().catch(() => {});
    return true;
  },
  setVolume(v) { if (this.gain) this.gain.gain.value = v * 0.6; },

  // Spielzustand für die adaptive Ebene: hpFrac = Leben 0..1, boss = Bosskampf. Pro Bild aufrufen.
  setState(hpFrac, boss) {
    this.dangerT = clamp((0.6 - hpFrac) / 0.48, 0, 1);
    this.bossT = boss ? 1 : 0;
  },

  // name: 'game' ('battle'/'boss' sind Aliase) | 'menu' | 'dead' | null (Stille). Gleicher Name = nichts tun. Neuer Track beginnt von vorn.
  play(name) {
    if (name === 'battle' || name === 'boss') name = 'game';
    if (name === this.name && this.timer) return;
    this.stop();
    this.name = name;
    this.step = 0;
    this.cur = null;
    if (name === 'game') {
      this.danger = this.dangerT; this.boss = this.bossT; this.bpmNow = this.targetBpm();
      if (this.boss > 0.5) this.step = INTRO_BARS * 16;          // mitten im Bosskampf: kein Intro
    }
    if (name) this.start();
  },
  start() {
    if (!this.name || this.timer || !this.ensure()) return;
    this.nextT = Sfx.ctx.currentTime + 0.08;
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.tick(), 25);
  },
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; },
  pause() { this.stop(); },                 // Position (step) bleibt erhalten
  resume() { this.start(); },

  targetBpm() { return GAME_BPM * (1 + 0.08 * this.boss) + 4 * this.danger; },

  tick() {
    const c = Sfx.ctx, now = performance.now(), dt = Math.min(0.2, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (!c || !this.name) return;
    if (c.state === 'suspended') c.resume().catch(() => {});           // vor der ersten Eingabe blockt der Browser den Ton
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.05;       // nach Lücken (Tab-Wechsel) neu ansetzen
    // Zustände weich nachführen: Gefahr steigt schnell, fällt langsam; der Boss blendet über ca. 7 s aus
    this.danger += clamp(this.dangerT - this.danger, -0.2 * dt, 0.6 * dt);
    const was = this.boss;
    this.boss += clamp(this.bossT - this.boss, -0.14 * dt, 0.5 * dt);
    if (was < 0.15 && this.boss >= 0.15) this.bossAccent = true;
    if (was > 0.5 && this.boss <= 0.5) this.releaseAccent = true;
    while (this.nextT < c.currentTime + 0.2) {
      let sd;
      if (this.name === 'game') {
        const target = this.targetBpm();
        this.bpmNow += clamp(target - this.bpmNow, -3 * 60 / this.bpmNow / 4, 14 * 60 / this.bpmNow / 4);     // Tempo gleitet (rauf schnell, runter langsam)
        sd = 60 / this.bpmNow / 4;
        this.delay.delayTime.value = 60 / this.bpmNow * 0.75;
        this.playStepGame(this.step, this.nextT, sd);
      } else {
        sd = 60 / CALM[this.name].bpm / 4;
        this.delay.delayTime.value = 60 / CALM[this.name].bpm * 0.75;
        this.playStepCalm(CALM[this.name], this.step, this.nextT, sd);
      }
      this.step++;
      this.nextT += sd;
    }
  },

  // ---------------------------------------------------------------- Spielmusik
  // Ebenen und Muster für den aktuellen Takt festlegen (aus Abschnitt + Zustand), damit sich nichts mitten im Takt ändert
  planBar(sec, bossLv, dang) {
    const hat = Math.max(sec.hat, bossLv ? 3 : dang > 0.5 ? 3 : dang > 0.2 ? 2 : 0);
    const perc = Math.max(sec.perc, bossLv ? 2 : dang > 0.6 ? 2 : dang > 0.25 ? 1 : 0);
    return {
      hat, perc,
      arp: sec.arp || dang > 0.3 || bossLv,
      stab: sec.stab || bossLv || dang > 0.65,
      motif: bossLv ? MOTIFS.boss : MOTIFS[sec.motif],
      bass: bossLv ? 4 : sec.bass,
      drive: clamp(sec.drive + dang * 0.5 + this.boss * 0.4, 0, 1.4),
      heart: dang > 0.15 ? (dang - 0.15) / 0.85 : 0,
      shift: dang > 0.7 ? 2 : 0,                                   // viel Gefahr: leicht höhere Tonlage
      bossKick: bossLv, rolls: bossLv,
      arpVol: 0.7 + 0.3 * Math.max(dang, this.boss, sec.arp ? 1 : 0),
    };
  },

  playStepGame(step, t, sd) {
    const bar = Math.floor(step / 16), s = step % 16;
    if (bar < INTRO_BARS) { this.playIntro(bar, s, t, sd); return; }
    const lb = (bar - INTRO_BARS) % (SECTIONS.length * 8), secIdx = Math.floor(lb / 8), barInSec = lb % 8, sec = SECTIONS[secIdx];
    const prog = PROGS[sec.prog], chord = prog[barInSec % 4], tones = CHORDS[chord.q], root = GAME_ROOT + chord.r;
    if (s === 0 || !this.cur) this.cur = this.planBar(sec, this.boss > 0.5, this.danger);
    const C = this.cur, last = barInSec === 7, dang = this.danger;
    // Akzente bei Zustandswechseln (am Taktanfang)
    if (s === 0 && this.bossAccent) { this.bossAccent = false; this.noise(t, 1.2, 0.1, 'highpass', 5500); this.boom(t, 0.5); this.riser(t, sd * 16, 0.08); }
    if (s === 0 && this.releaseAccent) { this.releaseAccent = false; this.sweepDown(t, sd * 12); }
    if (s === 0 && sec.hit && barInSec === 0) { this.noise(t, 0.9, 0.06, 'highpass', 6500); this.boom(t, 0.35); }

    // --- Schlagzeug: Kick auf jedem Schlag, die Maschine läuft immer
    const kick = C.bossKick ? BOSS_KICK[s] : s % 4 === 0 ? 1 : (C.perc >= 1 && s === 10 ? 0.55 : dang > 0.8 && s === 14 ? 0.5 : 0);
    if (kick) this.kick(t, kick);
    if (sec.snare && (s === 4 || s === 12)) this.snare(t, 1);
    if (C.hat >= 3 && (s === 7 || s === 10)) this.snare(t, 0.3);           // Ghost-Notes
    if (C.hat === 1 && s % 4 === 2) this.hat(t, 1);
    else if (C.hat === 2) this.hat(t, s % 4 === 0 ? 2 : 1);
    else if (C.hat >= 3) this.hat(t, s % 4 === 2 ? 3 : s % 4 === 0 ? 2 : 1);
    if (C.perc >= 1 && (s === 3 || s === 7 || s === 11 || s === 14)) this.rim(t, 0.5 + 0.2 * C.perc);       // kurze elektronische Impulse, leicht synkopiert
    if (C.perc >= 2 && (s === 6 || s === 10 || s === 15)) this.tom(t, s === 15 ? 180 : 230, 0.3);
    if ((sec.fill && last && s >= 12) || (C.rolls && barInSec % 4 === 3 && s >= 12)) this.snare(t, 0.45 + (s - 12) * 0.14);        // Snare-Roll vor Abschnittsende / im Bosskampf alle 4 Takte
    if (C.heart > 0.02 && (s % 8 === 0 || s % 8 === 3)) this.heartbeat(t, C.heart * (s % 8 === 0 ? 1 : 0.65));      // lub-dub im Rhythmus
    if (sec.riser && last && s === 4) this.riser(t, sd * 12, 0.09);
    if (sec.fill && last && s === 8) this.riser(t, sd * 8, 0.06);

    // --- Bass: rollende, verzerrte Maschine
    const b = BASS[C.bass][s];
    if (b !== null) this.voice('sawtooth', root + 12 + b, t, sd * 1.7, 0.15 * (s % 4 === 0 ? 1.15 : 0.85), 500 + C.drive * 900 + (s % 4 === 0 ? 500 : 0), 0.006, { bus: 'bass', drive: C.drive });
    if (s === 0) this.voice('sawtooth', root, t, sd * 15.5, 0.05 + 0.03 * C.drive, 220, 0.02, { bus: 'bass', drive: C.drive + 0.2 });         // Sub-Drone unter dem Bass

    // --- Pad: dunkle, enge Fläche (kein Weltraum-Teppich), Filter fährt über den Takt auf
    if (s === 0 && sec.pad > 0) for (let i = 0; i < 3; i++) for (const d of [-9, 9]) this.voice('sawtooth', root + 24 + tones[i], t, sd * 16, 0.026 * sec.pad, 300, 0.25, { detune: d, sweepTo: 1000 + 600 * C.drive });

    // --- Motiv (kurz, wiederholt) mit Bitcrusher und Echo
    const mpat = C.motif[barInSec % 2], deg = mpat[s];
    if (deg !== null) {
      let len = 1;
      while (s + len < 16 && mpat[s + len] === null && len < 3) len++;
      this.voice(this.waves.p25, GAME_ROOT + 36 + MUSIC_SCALE[deg] + C.shift, t, sd * (len - 0.15), 0.085 + 0.02 * C.drive, 3800, 0.005, { bus: 'crush', send: 0.55, vib: len > 1 });
    }
    // --- Pulse-Arpeggio (zusätzlicher Puls)
    if (C.arp) this.voice(this.waves.p125, root + 36 + tones[ARP[s] % tones.length] + C.shift, t, sd * 0.9, 0.04 * C.arpVol, 4500, 0.003, { bus: 'crush', send: 0.35 });
    // --- gated Stabs auf den Synkopen
    if (C.stab && (s === 0 || s === 6 || s === 10)) for (let i = 0; i < 3; i++) this.voice('sawtooth', root + 36 + tones[i] + C.shift, t, sd * 1.4, 0.03, 2200, 0.004);
    // --- digitale Glitches (B-Abschnitte): kurze Pieptöne an zufälligen Stellen
    if (sec.glitch && (s === 5 || s === 9 || s === 13) && Math.random() < 0.4) {
      const m = GAME_ROOT + 60 + MUSIC_SCALE[Math.floor(Math.random() * 8) + 3];
      this.voice(this.waves.p50, m, t, sd * 0.5, 0.03, 6000, 0.002, { bus: 'crush', send: 0.4 });
      this.voice(this.waves.p50, m, t + sd * 0.5, sd * 0.4, 0.02, 6000, 0.002, { bus: 'crush' });
    }
  },

  // Kurzes Intro (4 Takte): dunkler Impuls, steigender Bass, Kick ab Takt 3, Riser, Snare-Roll, dann geht es nahtlos in A1
  playIntro(bar, s, t, sd) {
    const root = GAME_ROOT;
    if (bar === 0 && s === 0) {
      this.voice(this.waves.p50, root + 48, t, sd * 2, 0.06, 4000, 0.002, { bus: 'crush', send: 0.6 });        // elektronischer Impuls
      for (let i = 0; i < 3; i++) for (const d of [-9, 9]) this.voice('sawtooth', root + 24 + CHORDS.m[i], t, sd * 64, 0.032, 250, 1.5, { detune: d, sweepTo: 1500 });       // dunkle Fläche über das ganze Intro
    }
    if (bar >= 1 && BASS[0][s] !== null) this.voice('sawtooth', root + 12 + BASS[0][s], t, sd * 1.7, 0.08 + 0.025 * bar, 380 + bar * 220, 0.006, { bus: 'bass', drive: 0.2 + bar * 0.15 });
    if (bar === 0 && s % 8 === 0) this.voice('sawtooth', root + 12, t, sd * 8, 0.09, 260, 0.05, { bus: 'bass', drive: 0.3 });
    if (bar >= 2 && s % 4 === 0) this.kick(t, bar === 2 ? 0.7 : 1);
    if (bar >= 2 && s % 4 === 2) this.hat(t, 1);
    if (bar === 1 && (s === 6 || s === 14)) this.rim(t, 0.5);
    if (bar === 3 && s === 0) this.riser(t, sd * 16, 0.09);
    if (bar === 3 && s >= 12) this.snare(t, 0.5 + (s - 12) * 0.15);
    if (bar === 3 && s === 15) this.noise(t, 0.3, 0.05, 'highpass', 6000);
  },

  // ---------------------------------------------------------------- ruhige Tracks (Menü, Tod)
  playStepCalm(T, step, t, sd) {
    const nBars = T.bars.length, barIdx = Math.floor(step / 16) % nBars, s = step % 16, bar = T.bars[barIdx], tones = CHORDS[bar.q], root = T.root + bar.r;
    if (s === 0) for (let i = 0; i < 3; i++) for (const d of [-8, 8]) this.voice('sawtooth', root + 24 + tones[i], t, sd * 16, T.padVol, 350, 0.3, { detune: d, sweepTo: 1700 });
    if (T.bass[s] !== null) this.voice('sawtooth', root + 12 + T.bass[s], t, sd * 1.6, T.bassVol, 600, 0.008, { bus: 'bass', drive: 0.1 });
    if (T.kick[s]) this.kick(t, 0.8);
    if (T.hat[s]) this.hat(t, T.hat[s]);
    if (T.arp[s] !== null) this.voice(this.waves.p125, root + 36 + tones[T.arp[s] % tones.length], t, sd * 1.1, T.arpVol, 5000, 0.004, { send: 0.5 });
    if (barIdx >= T.leadFrom) {
      const pat = T.lead[barIdx % T.lead.length], deg = pat[s];
      if (deg !== null) {
        let len = 1;
        while (s + len < 16 && pat[s + len] === null && len < 4) len++;
        this.voice(this.waves.p25, root + 36 + MUSIC_SCALE[deg], t, sd * (len - 0.2), T.leadVol, 4200, 0.006, { send: 0.7, vib: true });
      }
    }
  },

  // ---------------------------------------------------------------- Klangbausteine
  // Ton: type = Wellenform (Name oder PeriodicWave), Lowpass bei cutoff.
  // o: bus ('bass' = verzerrt, 'crush' = Bitcrusher, sonst Sidechain-Bus), drive (Verzerrungsgrad, nur Bass), detune (Cent), sweepTo (Filter fährt dorthin), send (Anteil ins Echo), vib (Vibrato)
  voice(type, midi, t, dur, vol, cutoff, attack, o = {}) {
    const c = Sfx.ctx, osc = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    if (typeof type === 'string') osc.type = type; else osc.setPeriodicWave(type);
    osc.frequency.value = this.hz(midi);
    if (o.detune) osc.detune.value = o.detune;
    f.type = 'lowpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(cutoff, t);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.max(0.005, attack));
    g.gain.setValueAtTime(vol, t + Math.max(0.006, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f); f.connect(g);
    if (o.bus === 'bass') { this.bassIn.gain.setTargetAtTime(1 + (o.drive || 0) * 4.5, t, 0.05); g.connect(this.bassIn); }
    else g.connect(o.bus === 'crush' ? this.crushIn : this.duck);
    if (o.send) { const s = c.createGain(); s.gain.value = o.send; g.connect(s); s.connect(this.send); }
    if (o.vib) {
      const lfo = c.createOscillator(), depth = c.createGain();
      lfo.frequency.value = 6; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(18, t + dur * 0.6);
      lfo.connect(depth); depth.connect(osc.detune); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    osc.start(t); osc.stop(t + dur + 0.05);
  },
  kick(t, k = 1) {
    const c = Sfx.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(175, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.11);
    g.gain.setValueAtTime(0.62 * k, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + 0.22);
    const d = this.duck.gain;                                  // Sidechain-Pumpen
    d.cancelScheduledValues(t); d.setValueAtTime(0.35, t); d.linearRampToValueAtTime(1, t + 0.15);
  },
  noise(t, dur, vol, filter, freq) {
    const c = Sfx.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = Sfx.noiseBuf; s.loop = true; f.type = filter; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.gain); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  },
  // Rauschen + kurzer Ton + zweiter Rauschstoß kurz danach (Clap). k = Lautstärke-Faktor
  snare(t, k = 1) {
    this.noise(t, 0.15, 0.22 * k, 'bandpass', 2200);
    this.noise(t + 0.012, 0.09, 0.12 * k, 'bandpass', 1400);
    this.voice(this.waves.p50, 56, t, 0.09, 0.13 * k, 1500, 0.002, { bus: 'bass', drive: 0.1 });
  },
  // 1 = leise geschlossen, 2 = Akzent, 3 = offene Hi-Hat auf der Gegenzeit
  hat(t, kind) { this.noise(t, kind === 3 ? 0.11 : 0.035, kind === 2 ? 0.055 : kind === 3 ? 0.06 : 0.03, 'highpass', kind === 3 ? 7000 : 9500); },
  rim(t, k) { this.noise(t, 0.03, 0.09 * k, 'bandpass', 3400); },                   // kurzer elektronischer Impuls
  tom(t, hz, vol = 0.4) {
    const c = Sfx.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(hz, t); o.frequency.exponentialRampToValueAtTime(hz * 0.5, t + 0.14);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + 0.18);
  },
  boom(t, vol) {
    const c = Sfx.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + 0.65);
  },
  // Herzschlag: tiefer Thump
  heartbeat(t, k) {
    const c = Sfx.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.14);
    g.gain.setValueAtTime(0.42 * k, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + 0.22);
  },
  // Riser: Rauschen, dessen Filter nach oben fährt und lauter wird
  riser(t, dur, vol = 0.1) {
    const c = Sfx.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = Sfx.noiseBuf; s.loop = true; f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    g.gain.setValueAtTime(0.01, t); g.gain.linearRampToValueAtTime(vol, t + dur);
    s.connect(f); f.connect(g); g.connect(this.gain); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  },
  // Abwärts-Sweep: Übergang zurück in den normalen Loop nach dem Boss
  sweepDown(t, dur) {
    const c = Sfx.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = Sfx.noiseBuf; s.loop = true; f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(200, t + dur);
    g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.gain); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  },
};
