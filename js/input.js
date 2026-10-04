// Tastatur und Maus. Statt Scratchs "Taste gedrückt?" fragen wir Input.down(...) ab.

const Input = {
  keys: {},        // true, solange die Taste gehalten wird
  pressedNow: {},  // true nur in dem Frame, in dem die Taste gedrückt wurde
  clicked: false,
  wheel: 0,        // -1 oder 1 im Frame, in dem das Mausrad gedreht wurde
  mouse: { x: -999, y: -999, moved: false },     // Mausposition in Buehnenkoordinaten (0..STAGE_W, 0..STAGE_H), moved = in diesem Frame bewegt
  rightClicked: false,

  down(code) { return !!this.keys[code]; },
  pressed(code) { return !!this.pressedNow[code]; },
  // Belegbare Aktionen: Standardtasten. Eigene Belegung steht in Save.data.binds (nur die geaenderten).
  actions: [
    { id: 'up', label: 'UP', def: 'KeyW' },
    { id: 'left', label: 'LEFT', def: 'KeyA' },
    { id: 'down', label: 'DOWN', def: 'KeyS' },
    { id: 'right', label: 'RIGHT', def: 'KeyD' },
    { id: 'attack', label: 'ATTACK', def: 'Space' },
    { id: 'weapon1', label: 'WEAPON 1 (MELEE)', def: 'Digit1' },
    { id: 'weapon2', label: 'WEAPON 2 (RANGED)', def: 'Digit2' },
    { id: 'beam', label: 'HEAVY WEAPON', def: 'KeyE' },
    { id: 'ability_weak', label: 'ABILITY WEAK', def: 'ShiftLeft' },
    { id: 'ability_medium', label: 'ABILITY MEDIUM', def: 'KeyQ' },
    { id: 'ability_strong', label: 'ABILITY STRONG', def: 'KeyR' },
    { id: 'ultimate', label: 'ULTIMATE', def: 'KeyV' },
  ],
  code(action) { return (Save.data.binds && Save.data.binds[action]) || this.actions.find((a) => a.id === action).def; },
  actDown(action) { return this.down(this.code(action)); },
  actPressed(action) { return this.pressed(this.code(action)); },
  // Kurzer Tastentext fuer Anzeigen (HUD, Menue)
  label(action) { return this.codeLabel(this.code(action)); },
  codeLabel(c) {
    const map = { Space: 'SPC', ShiftLeft: 'SH', ControlLeft: 'CTRL', AltLeft: 'ALT', Tab: 'TAB', ArrowUp: 'UP', ArrowDown: 'DN', ArrowLeft: 'LT', ArrowRight: 'RT', Backquote: '`', Enter: 'ENT' };
    if (map[c]) return map[c];
    return c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'N');
  },
  // Taste einer Aktion zuweisen. Ist sie schon belegt, tauschen die beiden Aktionen ihre Tasten.
  bind(action, code) {
    const old = this.code(action), other = this.actions.find((a) => a.id !== action && this.code(a.id) === code);
    Save.data.binds = Save.data.binds || {};
    if (other) Save.data.binds[other.id] = old;
    Save.data.binds[action] = code;
    Save.write();
  },
  resetBinds() { Save.data.binds = {}; Save.write(); },
  // Erste in diesem Frame gedrueckte Taste (fuer das Umbelegen), sonst null
  firstPressed() { return Object.keys(this.pressedNow)[0] || null; },
  endFrame() { this.pressedNow = {}; this.clicked = false; this.rightClicked = false; this.mouse.moved = false; this.wheel = 0; },
  // Mausposition aus einem Browser-Event in Buehnenkoordinaten umrechnen (das Canvas wird per CSS skaliert)
  setMouse(e) {
    const cv = document.getElementById('gameCanvas'), r = cv.getBoundingClientRect();
    this.mouse.x = (e.clientX - r.left) / r.width * STAGE_W;
    this.mouse.y = (e.clientY - r.top) / r.height * STAGE_H;
  },
};

const normCode = (c) => (c === 'ShiftRight' ? 'ShiftLeft' : c);     // beide Shift-Tasten zaehlen gleich
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
  const c = normCode(e.code);
  if (!Input.keys[c]) Input.pressedNow[c] = true;
  // Backspace = "Zurück" wie Escape (Escape beendet im Browser den Vollbildmodus)
  if (c === 'Backspace') { e.preventDefault(); Input.pressedNow.Escape = true; }
  Input.keys[c] = true;
});
window.addEventListener('keyup', (e) => { Input.keys[normCode(e.code)] = false; });
window.addEventListener('blur', () => { Input.keys = {}; });
window.addEventListener('mousedown', (e) => { Input.setMouse(e); if (e.button === 2) Input.rightClicked = true; else Input.clicked = true; });
window.addEventListener('mousemove', (e) => { Input.setMouse(e); Input.mouse.moved = true; });
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('wheel', (e) => { Input.wheel = e.deltaY > 0 ? 1 : -1; });
