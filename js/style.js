// STYLECODE "Neon Void" – die einzige Quelle für Farben, Schrift und UI-Bausteine.
// Dieselbe Datei liest auch tools/gen_art.js (Node), um die Sprites zu zeichnen.
// Regeln im Klartext: Organise/STYLE.md. Hier stehen nur Daten und kleine Zeichenhelfer.

const STYLE = {
  name: 'Neon Void',

  // Farbregel: KALT = Spieler-Seite (violett, cyan), WARM = Gegner-Seite (rot, gelb),
  // GRÜN = Heilung/Gutes, LILA+TÜRKIS = Ultimate/Bloodburst, GRAU = Strukturen.
  pal: {
    ink: '#05060f', void: '#070914', voidLight: '#0e1430',
    grid: '#101d3d', gridMajor: '#17407a', frame: '#1f7fc8',

    violet: '#8a4bff', violetMid: '#5b2bd0', violetDark: '#1c0d4a',
    cyan: '#3de8ff', cyanMid: '#1aa6c8', cyanDark: '#0d5a78', ice: '#e6fdff',

    red: '#ff2d3d', redMid: '#a01828', redDark: '#3a0810', redHi: '#ff8a8a', pink: '#ff9aa6',
    yellow: '#ffd91f', orange: '#ff8a1f',

    green: '#39ff6e', greenMid: '#1aa043', greenDark: '#0a3a1c',
    purple: '#b24bff', purpleDark: '#6a1fd0', teal: '#3dffc0',

    // aus dem Original übernommen (Lebensbalken, Uhr, Schwert): Balkenrahmen blau, Uhr grau/gelb/orange, Schwert in Eisstufen
    hpLit: '#00b5ff', hpLitMid: '#00a5e7', hpDark: '#000d98', hpDarkMid: '#000fbc', hpShade: '#00374d',
    clockGrey: '#7e7e7e', clockOrange: '#ff5e00', clockOrange2: '#ff7600', clockAmber: '#ffbb00', clockYellow: '#fff200',
    swordCyan: '#40fff9', swordMid: '#7efffb', swordLight: '#befffd', swordIce: '#e5fffe',

    grey: '#8a93a8', greyMid: '#505870', greyDark: '#262b3d',
    white: '#ffffff',
  },

  font: '"Pixelify Sans", monospace',

  // Schriftgrößen in Bühneneinheiten (Bühne 480 x 360)
  type: { title: 56, h1: 24, h2: 14, body: 10, small: 8 },

  // Todes-Tönung je Death-Screen (passend zu DEATH_SCREENS in config.js): wird mit der Zeit "heller"
  deathTints: {
    death1: '#ff2d3d', death2: '#ff6a2d', death3: '#ffb02d', death4: '#d8e02d',
    death5: '#3dff8a', death6: '#3de8ff', death7: '#8a4bff',
    death8: '#ff4b6e',
    death9: '#ff8a2d',
    death10: '#ffc92d',
    death11: '#e6e62d',
    death12: '#9aff2d',
    death13: '#2dff9a',
    death14: '#2de8d8',
    death15: '#2d9aff',
    death16: '#5a6bff',
    death17: '#b04bff',
    death18: '#ff4bd8',
    death19: '#ff2d7a',
    deathSecret1: '#ffffff', deathSecret2: '#ff4bd8', deathSecret3: '#ffd91f', deathSecret4: '#e6fdff',
  },
};

// ---------- Zeichenhelfer für Code-UI (Browser) ----------

function uiFont(px) { return px + 'px ' + STYLE.font; }

// Text mit dunklem Rand. opts: size, color, align ('left'|'center'|'right'), glow (Farbe), baseline
function uiText(ctx, text, x, y, opts = {}) {
  const size = opts.size || STYLE.type.body;
  ctx.save();
  ctx.font = uiFont(size);
  ctx.textRendering = 'optimizeSpeed';       // schaltet Ligaturen ab (sonst wird "fi" in Pixelify Sans zu einem Zeichen)
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'alphabetic';
  ctx.lineJoin = 'round';
  if (opts.glow) {                           // harter Pixel-Schein: gefärbter Umriss statt weichem Leuchten
    ctx.lineWidth = Math.min(4, Math.max(2, size / 5)) + 2; ctx.strokeStyle = opts.glow; ctx.globalAlpha = 0.45;
    ctx.strokeText(text, x, y); ctx.globalAlpha = 1;
  }
  ctx.lineWidth = Math.min(4, Math.max(2, size / 5));
  ctx.strokeStyle = STYLE.pal.ink;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = opts.color || STYLE.pal.white;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Panel mit abgeschrägten Ecken: dunkle Füllung, helle Außenlinie, gedämpfte Innenlinie ("Doppelkante")
function uiPanel(ctx, x, y, w, h, opts = {}) {
  const P = STYLE.pal, c = opts.color || P.frame, n = STYLE.frameTheme ? Cos2.panelNotch(STYLE.frameTheme) : opts.notch === undefined ? 2 : opts.notch;       // HUD-Theme (Cos2) bestimmt die Ecken
  const path = (ins) => {
    const a = x + ins, b = y + ins, r = x + w - ins, d = y + h - ins, k = Math.max(0, n - ins);
    ctx.beginPath();
    ctx.moveTo(a + k, b); ctx.lineTo(r - k, b); ctx.lineTo(r, b + k); ctx.lineTo(r, d - k);
    ctx.lineTo(r - k, d); ctx.lineTo(a + k, d); ctx.lineTo(a, d - k); ctx.lineTo(a, b + k); ctx.closePath();
  };
  ctx.save();
  path(0.5); ctx.fillStyle = opts.fill || P.void; ctx.globalAlpha = opts.alpha === undefined ? 0.85 : opts.alpha; ctx.fill();
  ctx.globalAlpha = 1;
  if (opts.glow) { path(-1.5); ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.globalAlpha = 0.25; ctx.stroke(); ctx.globalAlpha = 1; }   // harter Außenschein
  path(0.5); ctx.lineWidth = 1; ctx.strokeStyle = c; ctx.stroke();
  path(2); ctx.strokeStyle = c; ctx.globalAlpha = 0.3; ctx.stroke();
  ctx.restore();
  if (STYLE.frameTheme) Cos2.panelDeco(ctx, x, y, w, h, c);
}

// Balken: Rahmen + gefüllte Segmente. frac 0..1
function uiBar(ctx, x, y, w, h, frac, color, opts = {}) {
  const P = STYLE.pal;
  ctx.save();
  ctx.fillStyle = P.ink; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = opts.back || P.greyDark; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  const fw = Math.round((w - 2) * Math.max(0, Math.min(1, frac)));
  ctx.fillStyle = color; ctx.fillRect(x + 1, y + 1, fw, h - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 1, y + 1, fw, 1);     // Glanzkante oben
  ctx.restore();
}

// Tastenkappe, z. B. uiKey(ctx, x, y, 'W')
function uiKey(ctx, x, y, label, w = 14, opts = {}) {
  const P = STYLE.pal;
  uiPanel(ctx, x, y, w, 14, { color: opts.color || P.red, fill: P.void, alpha: 1, notch: 2 });
  uiText(ctx, label, x + w / 2, y + 11, { size: STYLE.type.body, align: 'center', color: opts.color || P.red });
}

// ---------- Pixel-Formen ----------
// Alles, was im Code statt als Sprite gezeichnet wird (Risse, Meteoriten, Barrikaden, Ringe), soll wie die Sprites aus groben Pixeln bestehen.
// PIXEL = Kantenlänge eines Pixels in Bühneneinheiten. Alle Funktionen rasten auf dieses Gitter ein und zeichnen nur ctx.fillRect (keine geglätteten Linien).
const PIXEL = 2;
function pxFill(ctx, x, y, n = 1) { ctx.fillRect(Math.round(x / PIXEL) * PIXEL, Math.round(y / PIXEL) * PIXEL, PIXEL * n, PIXEL * n); }

// Pixel-Linie (Bresenham). size = Dicke in Pixeln (1 = dünn, 2 = dick)
function pxLine(ctx, x0, y0, x1, y1, size = 1) {
  let gx = Math.round(x0 / PIXEL), gy = Math.round(y0 / PIXEL);
  const ex = Math.round(x1 / PIXEL), ey = Math.round(y1 / PIXEL), dx = Math.abs(ex - gx), dy = -Math.abs(ey - gy), sx = gx < ex ? 1 : -1, sy = gy < ey ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 400; i++) {
    ctx.fillRect(gx * PIXEL, gy * PIXEL, PIXEL * size, PIXEL * size);
    if (gx === ex && gy === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; gx += sx; }
    if (e2 <= dx) { err += dx; gy += sy; }
  }
}

// Gestrichelte Pixel-Linie: dash = Länge von Strich und Lücke in Pixeln
function pxDashLine(ctx, x0, y0, x1, y1, size = 1, dash = 3) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / PIXEL));
  for (let i = 0; i <= n; i++) {
    if (Math.floor(i / dash) % 2) continue;
    pxFill(ctx, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, size);
  }
}

// Gefüllte Pixel-Scheibe um (cx, cy) mit Radius r (zeilenweise)
function pxDisc(ctx, cx, cy, r) {
  const n = Math.round(r / PIXEL), gx = Math.round(cx / PIXEL), gy = Math.round(cy / PIXEL);
  for (let j = -n; j <= n; j++) {
    const w = Math.floor(Math.sqrt(Math.max(0, n * n + 0.5 - j * j)));
    ctx.fillRect((gx - w) * PIXEL, (gy + j) * PIXEL, (2 * w + 1) * PIXEL, PIXEL);
  }
}

// Pixel-Bogen von Winkel a0 bis a1 (Bogenmaß, Canvas-Richtung: 0 = rechts, wächst im Uhrzeigersinn)
function pxArc(ctx, cx, cy, r, a0, a1, thick = 1) {
  const steps = Math.max(8, Math.round(r * Math.abs(a1 - a0) * 0.8));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * i / steps;
    ctx.fillRect(Math.round((cx + Math.cos(a) * r) / PIXEL) * PIXEL, Math.round((cy + Math.sin(a) * r) / PIXEL) * PIXEL, PIXEL * thick, PIXEL * thick);
  }
}

// Pixel-Umriss eines Linienzugs (pts = [[x, y], ...]); closed schließt ihn
function pxPoly(ctx, pts, closed = true, size = 1) {
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; pxLine(ctx, a[0], a[1], b[0], b[1], size); }
}

// Gefüllte Pixel-Fläche eines Vielecks (zeilenweise, gerade-ungerade-Regel)
function pxPolyFill(ctx, pts) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  for (let gy = Math.floor(y0 / PIXEL); gy <= Math.ceil(y1 / PIXEL); gy++) {
    const y = (gy + 0.5) * PIXEL, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const gx0 = Math.round(xs[k] / PIXEL), gx1 = Math.round(xs[k + 1] / PIXEL);
      if (gx1 > gx0) ctx.fillRect(gx0 * PIXEL, gy * PIXEL, (gx1 - gx0) * PIXEL, PIXEL);
    }
  }
}

// "Schein" im Pixel-Look: Scheibe im Schachbrettmuster (Dither) statt weichem Leuchten
function pxGlow(ctx, cx, cy, r) {
  const n = Math.round(r / PIXEL), gx = Math.round(cx / PIXEL), gy = Math.round(cy / PIXEL);
  for (let j = -n; j <= n; j++) {
    const w = Math.floor(Math.sqrt(Math.max(0, n * n + 0.5 - j * j)));
    for (let i = -w; i <= w; i++) if ((i + j + gx + gy) % 2 === 0) ctx.fillRect((gx + i) * PIXEL, (gy + j) * PIXEL, PIXEL, PIXEL);
  }
}

// Pixel-Ring: Linie der Dicke thick (Pixel). dashes > 0: gestrichelt mit so vielen Strichen (phase 0..1 dreht ihn)
function pxRing(ctx, cx, cy, r, thick = 1, dashes = 0, phase = 0) {
  const steps = Math.max(16, Math.round(r * 1.6));
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    if (dashes && Math.floor((t + phase) * dashes * 2) % 2) continue;
    const a = t * Math.PI * 2;
    ctx.fillRect(Math.round((cx + Math.cos(a) * r) / PIXEL) * PIXEL, Math.round((cy + Math.sin(a) * r) / PIXEL) * PIXEL, PIXEL * thick, PIXEL * thick);
  }
}
