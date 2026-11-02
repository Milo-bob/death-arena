// Gamepad-Unterstützung (Xbox/PlayStation/Switch-Pro u. ä. über die Gamepad-API, "Standard"-Belegung).
// Der Controller wird in virtuelle Tastendrücke übersetzt (Input.keys / Input.pressedNow), der Rest des Spiels merkt keinen Unterschied.
// Im Lauf (G.mode === 'play'): linker Stick = laufen (stufenlos, wie der Touch-Stick), rechter Stick = zielen, sonst in Laufrichtung schauen.
//   A / RT = Angriff, X = Ability schwach, Y = Ability mittel, B = Ability stark, RB = Ultimate, LB = Artefakt, LT = schwere Waffe,
//   Steuerkreuz links/rechts = Waffe 1/2, Start = Pause. Belegung der Tasten folgt der Tastenbelegung der Einstellungen (Input.code).
// In Menüs: Stick/Steuerkreuz = Pfeiltasten (mit Wiederholung), A = Leertaste, B/Start = Escape, X = C, Y = G, LB/RB = Q/E.
// Pad.on() ist wahr, solange der Controller zuletzt benutzt wurde (Tastatur/Maus schalten wieder zurück), nur dann gilt das freie Zielen.

const Pad = {
  connected: false,
  lastUse: 0,                       // performance.now() der letzten Controller-Eingabe
  lastKbm: 0,                       // ... der letzten Tastatur-/Mausbewegung
  held: {},                         // virtuelle Tasten, die der Controller gerade hält
  rep: {},                          // Wiederholzeiten der Menü-Richtungen
  deadzone: 0.25,
  prevPlay: false,

  on() { return this.connected && this.lastUse > this.lastKbm; },

  pad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) if (p && p.connected) return p;
    return null;
  },

  // Stick mit Totzone: { x, y, mag } mit mag 0..1 (nach der Totzone neu skaliert)
  stick(p, ix) {
    const x = p.axes[ix] || 0, y = p.axes[ix + 1] || 0, m = Math.hypot(x, y);
    if (m < this.deadzone) return { x: 0, y: 0, mag: 0 };
    const s = Math.min(1, (m - this.deadzone) / (1 - this.deadzone));
    return { x: x / m, y: y / m, mag: s };
  },

  btn(p, i) { const b = p.buttons[i]; return !!b && (b.pressed || b.value > 0.5); },

  // Alle Controller-Wünsche eines Bildes als Menge virtueller Tasten (halten) bestimmen
  poll(dt) {
    const p = this.pad();
    if (!p) { this.connected = false; this.release(); this.clearSticks(); return; }
    this.connected = true;
    const L = this.stick(p, 0), R = this.stick(p, 2);
    const b = (i) => this.btn(p, i);
    const dUp = b(12), dDown = b(13), dLeft = b(14), dRight = b(15);
    const any = L.mag > 0 || R.mag > 0 || p.buttons.some((x) => x && (x.pressed || x.value > 0.5));
    if (any) this.lastUse = performance.now();

    const want = {};
    const playing = G.mode === 'play';
    if (playing !== this.prevPlay) { this.release(); this.prevPlay = playing; }         // Wechsel zwischen Menü und Lauf: nichts hängen lassen
    if (playing) {
      const t = Input.touch;
      if (L.mag > 0) { t.mv.on = true; t.mv.dir = Math.atan2(L.x, -L.y) * 180 / Math.PI; this.drove = true; }
      else if (this.drove) t.mv.on = false;
      if (R.mag > 0.35) { t.aim.on = true; t.aim.dir = Math.atan2(R.x, -R.y) * 180 / Math.PI; this.drove = true; }
      else if (this.drove) t.aim.on = false;
      if (L.mag === 0 && R.mag <= 0.35) this.drove = false;                          // beide Sticks los: Touch darf wieder übernehmen
      if (b(0) || b(7)) want[Input.code('attack')] = true;
      if (b(2)) want[Input.code('ability_weak')] = true;
      if (b(3)) want[Input.code('ability_medium')] = true;
      if (b(1)) want[Input.code('ability_strong')] = true;
      if (b(5)) want[Input.code('ultimate')] = true;
      if (b(4)) want[Input.code('artifact')] = true;
      if (b(6)) want[Input.code('beam')] = true;
      if (dLeft) want[Input.code('weapon1')] = true;
      if (dRight) want[Input.code('weapon2')] = true;
      if (b(9)) want.Escape = true;
    } else {
      this.clearSticks();
      const dirs = [['ArrowUp', dUp || L.y < -0.5], ['ArrowDown', dDown || L.y > 0.5], ['ArrowLeft', dLeft || L.x < -0.5], ['ArrowRight', dRight || L.x > 0.5]];
      for (const [code, down] of dirs) this.repeat(code, down, dt);
      if (b(0)) want.Space = true;
      if (b(1) || b(9)) want.Escape = true;
      if (G.mode === 'dead' || G.mode === 'ending') {                                // Ergebnisbildschirm: X = noch ein Lauf, Y = teilen, LB = Details
        if (b(2)) want.KeyR = true;
        if (b(3)) want.KeyH = true;
        if (b(4)) want.Tab = true;
      } else {
        if (b(2)) want.KeyC = true;
        if (b(3)) want.KeyG = true;
        if (b(4)) want.KeyQ = true;
        if (b(5)) want.KeyE = true;
      }
    }
    this.apply(want);
  },

  // Menü-Richtung: erst ein Druck, nach kurzer Pause schnelle Wiederholung (wie eine gehaltene Taste)
  repeat(code, down, dt) {
    if (!down) { delete this.rep[code]; return; }
    const r = this.rep[code];
    if (r === undefined) { Input.pressedNow[code] = true; this.rep[code] = 0.38; return; }
    this.rep[code] = r - dt;
    if (this.rep[code] <= 0) { Input.pressedNow[code] = true; this.rep[code] = 0.11; }
  },

  apply(want) {
    for (const code in want) {
      if (!this.held[code]) { Input.pressedNow[code] = true; Input.keys[code] = true; this.held[code] = true; }
    }
    for (const code in this.held) {
      if (!want[code]) { Input.keys[code] = false; delete this.held[code]; }
    }
  },

  release() {
    for (const code in this.held) Input.keys[code] = false;
    this.held = {}; this.rep = {};
  },

  // Nur zurücksetzen, was der Controller selbst gesetzt hat (sonst würde er die Touch-Sticks jedes Bild löschen)
  clearSticks() {
    if (this.drove && Input.touch) { Input.touch.mv.on = false; Input.touch.aim.on = false; }
    this.drove = false;
  },
};

window.addEventListener('gamepadconnected', () => {
  Pad.connected = true; Pad.lastUse = performance.now();
  if (typeof G !== 'undefined' && G.realTime !== undefined) { G.toastText = 'CONTROLLER CONNECTED'; G.toastAt = G.realTime; }
});
window.addEventListener('gamepaddisconnected', () => { Pad.connected = !!Pad.pad(); Pad.release(); Pad.clearSticks(); });
// Tastatur oder Maus schalten zurück (Maus nur bei echter Bewegung, ein ruhender Mauszeiger zählt nicht)
window.addEventListener('keydown', () => { Pad.lastKbm = performance.now(); }, true);
window.addEventListener('mousedown', () => { Pad.lastKbm = performance.now(); }, true);
window.addEventListener('mousemove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) Pad.lastKbm = performance.now(); }, true);
window.addEventListener('touchstart', () => { Pad.lastKbm = performance.now(); }, true);
// Manche Browser melden ein schon angeschlossenes Gamepad erst nach dem ersten Tastendruck am Controller
if (Pad.pad()) Pad.connected = true;
