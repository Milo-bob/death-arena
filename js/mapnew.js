// Umgebungsmechanik der Karten 5 und 6 (Zahlen in CFG.maps[].env, Anzeige in CFG.maps[].hazards). Gefahren stehen wie die der anderen Karten in G.hazards (mapenv.js).
// Karte 5 BLACKOUT: DarkVeil (alles ausserhalb von Licht ist unsichtbar; Licht = Spieler und Spawner/Breaches).
// Karte 6 SCRAPYARD: ScrapMagnet (Magnetkran: Ruhe -> Vorwarnung -> Feld; zieht oder stoesst ab, je Feld wechselt die Polung; biegt Geschosse, siehe MapEnv.bend).
// Im Bosskampf, im Tutorial und in der Siegphase ruhen die Gefahren. Gezeichnet wird mit den Pixel-Helfern aus style.js.

// ---------- Magnetkran (Karte 6) ----------
class ScrapMagnet {
  constructor() {
    const M = G.map.env.magnets;
    this.x = 0; this.y = 0; this.R = M.radius; this.reach = 24; this.gap = M.minGap;
    this.isMagnet = true;
    this.state = 'idle'; this.age = 0;
    this.pol = Math.random() < 0.5 ? 1 : -1;               // 1 = zieht heran, -1 = stoesst ab (wechselt je Feld)
    this.t = rand(2, M.idle[1]);
  }
  reset() { const M = G.map.env.magnets; this.state = 'idle'; this.age = 0; this.t = rand(M.idle[0], M.idle[1]); }
  get idle() { return this.state === 'idle'; }
  update(dt, on) {
    const M = G.map.env.magnets;
    if (!on) { if (this.state !== 'idle') this.reset(); return; }
    this.t -= dt; this.age += dt;
    if (this.state === 'idle' && this.t <= 0) {
      this.state = 'warn'; this.t = M.warn; this.age = 0; this.pol = -this.pol;
      if (dist2(this.x, this.y, G.player.x, G.player.y) < 320 * 320) Sfx.play('ventWarn');
    } else if (this.state === 'warn' && this.t <= 0) {
      this.state = 'on'; this.t = M.on; this.age = 0;
      if (dist2(this.x, this.y, G.player.x, G.player.y) < 320 * 320) Sfx.play('wave');
    } else if (this.state === 'on' && this.t <= 0) this.reset();
  }
  // Feldstaerke 0..1 an einer Stelle (naeher = staerker, Ein- und Ausblenden am Anfang und Ende)
  strength(x, y) {
    if (this.state !== 'on') return 0;
    const M = G.map.env.magnets, d = Math.hypot(x - this.x, y - this.y);
    if (d >= this.R) return 0;
    return (1 - d / this.R) * clamp(Math.min(this.age / 0.5, (M.on - this.age) / 0.6), 0, 1);
  }
  // Schub (Einheiten pro Bild) fuer eine Figur an (x, y): zum Kran (Polung 1) oder von ihm weg (-1)
  push(x, y, r) {
    const s = this.strength(x, y), d = Math.hypot(this.x - x, this.y - y);
    if (s <= 0 || d < 10) return [0, 0];
    const k = G.map.env.magnets.pull * s * this.pol / d;
    return [(this.x - x) * k, (this.y - y) * k];
  }
  draw(ctx, dim) {
    const P = STYLE.pal, t = G.realTime, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y, M = G.map.env.magnets, R = this.R;
    const pull = this.pol > 0, col = pull ? '#3a8bff' : '#ff3d5a', warn = this.state === 'warn' ? 1 - this.t / M.warn : 0, on = this.state === 'on';
    ctx.save();
    ctx.globalAlpha = 0.6 * dim; ctx.fillStyle = P.greyDark; pxDisc(ctx, cx, cy, 16);                       // Fundament
    ctx.globalAlpha = dim; ctx.fillStyle = P.greyMid; pxDisc(ctx, cx, cy, 11);
    ctx.fillStyle = on || warn > 0 ? col : P.grey; pxDisc(ctx, cx, cy, 6);
    ctx.fillStyle = P.white; ctx.globalAlpha = 0.8 * dim; pxFill(ctx, cx - 1, cy - 1, 2);
    if (this.state === 'warn') {                                                    // Vorwarnung: Feldrand blinkt in der Farbe der Polung
      const blink = warn > 0.6 && Math.floor(t * 12) % 2 === 0;
      ctx.globalAlpha = (0.2 + 0.5 * warn) * dim; ctx.fillStyle = blink ? P.white : col; pxRing(ctx, cx, cy, R, 1, 26, t * 0.2);
    } else if (on) {                                                                // Feld: Ringe laufen nach innen (zieht) oder nach aussen (stoesst)
      const fade = clamp(Math.min(this.age / 0.5, (M.on - this.age) / 0.6), 0, 1);
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.9 + k / 3) % 1, rr = R * (pull ? 1 - ph : ph);
        ctx.globalAlpha = 0.55 * fade * (1 - Math.abs(ph - 0.5)) * dim; ctx.fillStyle = col; pxRing(ctx, cx, cy, rr, 1, 26, 0);
      }
      ctx.globalAlpha = 0.12 * fade * dim; ctx.fillStyle = col; pxDisc(ctx, cx, cy, R);
      ctx.globalAlpha = 0.9 * fade * dim; ctx.fillStyle = col; pxRing(ctx, cx, cy, R, 1, 20, t * 0.4);
    }
    ctx.restore();
  }
}

// ---------- Lavapfuetze (Emberlord, Karte 2) ----------
// Bleibt `life` s liegen und verbrennt den Spieler bei Beruehrung (Schutzzeit nach einem Treffer begrenzt die Haeufigkeit). Im Bosskampf verschwindet sie.
class HeatPool {
  constructor(x = 0, y = 0, r = 15, life = 5, mul = 1, src = 'EMBERLORD') { this.x = x; this.y = y; this.r = r; this.life = this.max = life; this.mul = mul; this.src = src; this.alive = true; }
  update(dt) {
    if (G.bossFight || G.clearing) { this.alive = false; return; }
    this.life -= dt; if (this.life <= 0) { this.alive = false; return; }
    if (!Coop.guest) hurtPlayersAt(this.x, this.y, this.r, 'touch', this.mul * 0.6, this.src);
  }
  draw(ctx) {
    const P = STYLE.pal, cx = STAGE_W / 2 + this.x, cy = STAGE_H / 2 - this.y, k = this.life / this.max, t = G.realTime;
    ctx.save();
    ctx.globalAlpha = 0.7 * Math.min(1, k * 3); ctx.fillStyle = P.redDark; pxDisc(ctx, cx, cy, this.r);
    ctx.globalAlpha = 0.85 * Math.min(1, k * 3); ctx.fillStyle = k > 0.3 ? P.orange : P.redMid; pxDisc(ctx, cx, cy, this.r * 0.7);
    ctx.globalAlpha = 0.9 * Math.min(1, k * 3); ctx.fillStyle = P.yellow; pxFill(ctx, cx + Math.sin(t * 6 + this.x) * this.r * 0.4, cy - ((t * 14 + this.x) % 8), 1);
    ctx.restore();
  }
}

// ---------- Dunkelheit (Karte 5) ----------
// Alles ausserhalb von Licht ist unsichtbar (Gegner, Geschosse, Boden). Licht: Spieler, Mitspieler, Spawner (Breaches), kurz die eigenen Schuesse, im Bosskampf der Boss.
const DarkVeil = {
  cv: null,
  get on() { return !!(G.map && G.map.env && G.map.env.dark) && !G.pvp && !Tutorial.active && !(G.coop && G.coop.out); },
  // Leuchtradius des Spielers: im Bosskampf viel groesser, Umbras in der Naehe dimmen ihn
  playerR() {
    const D = G.map.env.dark;
    return D.playerLight * (G.bossFight ? D.bossLight : 1) * Elite.umbraDim(G.player) * Boss.lightFactor();
  },
  lights() {
    const D = G.map.env.dark, out = [{ x: G.player.x, y: G.player.y, r: this.playerR() }];
    for (const m of G.mates || []) if (!m.dead) out.push({ x: m.x, y: m.y, r: D.playerLight * (G.bossFight ? D.bossLight : 1) });
    for (const s of G.spawners) if (s.alive) out.push({ x: s.x, y: s.y, r: D.spawnerLight * Elite.umbraDim(s) });          // Spawner (Breaches) leuchten; Umbras in der Naehe dimmen auch sie
    let n = 0;
    for (const a of G.attacks) if (a.kind === 'shot' && a.alive && n++ < 24) out.push({ x: a.x, y: a.y, r: D.shotLight });
    if (G.bossFight) for (const b of G.bossList()) if (b.alive !== false) out.push({ x: b.x, y: b.y, r: 70 });
    return out;
  },
  draw(ctx) {
    if (!this.on || typeof document === 'undefined' || !document.createElement) return;
    if (!this.cv) { this.cv = document.createElement('canvas'); this.cv.width = STAGE_W; this.cv.height = STAGE_H; }
    const m = this.cv.getContext('2d'), D = G.map.env.dark, inner = 1 - D.edge;
    m.globalCompositeOperation = 'source-over'; m.globalAlpha = 1; m.clearRect(0, 0, STAGE_W, STAGE_H);
    m.fillStyle = '#000'; m.fillRect(0, 0, STAGE_W, STAGE_H);
    m.globalCompositeOperation = 'destination-out';
    for (const L of this.lights()) {
      const sx = STAGE_W / 2 + L.x - G.cam.x, sy = STAGE_H / 2 - L.y + G.cam.y;
      if (L.r <= 1 || sx < -L.r || sx > STAGE_W + L.r || sy < -L.r || sy > STAGE_H + L.r) continue;
      const g = m.createRadialGradient(sx, sy, L.r * inner, sx, sy, L.r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = g; m.beginPath(); m.arc(sx, sy, L.r, 0, 6.2832); m.fill();
    }
    m.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.cv, 0, 0);
  },
};

// Geschosse biegen (Karte 6): alle Magnetkraene mit aktivem Feld lenken ein Geschoss o (dir, x, y) zum Kran hin oder von ihm weg. f = Bilder seit dem letzten Update.
MapEnv.bend = function (o, f) {
  if (!G.hazards.length || !this.on) {
    return;
  }
  const M = G.map.env.magnets;
  if (!M) return;
  for (const h of G.hazards) {
    if (!h.isMagnet) continue;
    const s = h.strength(o.x, o.y);
    if (s <= 0) continue;
    const to = dirTo(o.x, o.y, h.x, h.y), want = h.pol > 0 ? to : to + 180, b = M.bend * s * f;
    o.dir += clamp(angleDiff(want, o.dir), -b, b);
  }
};

// ---------- Schredderrand (Karte 6) ----------
// Aeusserer Streifen der Arena (env.rim): schiebt zur Mitte (nach aussen staerker) und verbrennt den Spieler im aeusseren Anteil. Folgt der Arena-Groesse (G.arenaScale).
MapEnv.rimDepth = function (x, y) {                                                // 0 = innen, 1 = ganz am Rand; dazu die Richtung zur Mitte je Achse
  const R = G.map.env.rim, hw = CFG.map.halfW * G.arenaScale, hh = CFG.map.halfH * G.arenaScale;
  const dx = clamp(1 - (hw - Math.abs(x)) / R.width, 0, 1), dy = clamp(1 - (hh - Math.abs(y)) / R.width, 0, 1);
  return [dx, dy];
};
MapEnv.rimPush = function (x, y) {
  if (!this.on) return [0, 0];
  const R = G.map.env.rim, [dx, dy] = this.rimDepth(x, y);
  return [-Math.sign(x) * R.push * dx * dx, -Math.sign(y) * R.push * dy * dy];
};
MapEnv.updateRim = function (dt) {
  const E = G.map && G.map.env, R = E && E.rim, p = G.player;
  if (!R || !this.on || !p || G.god || p.invincible || p.shield) return;
  const [dx, dy] = this.rimDepth(p.x, p.y);
  if (Math.max(dx, dy) < 1 - R.hot) return;
  p.hp -= R.dps * dt; Stats.dealt('SCRAP GRINDER', R.dps * dt, false);
  if (Math.random() < 0.3) Juice.sparks(p.x, p.y, STYLE.pal.yellow, 1, 2);
};
MapEnv.drawRim = function (ctx) {
  const E = G.map && G.map.env, R = E && E.rim;
  if (!R || G.pvp) return;
  const P = STYLE.pal, hw = CFG.map.halfW * G.arenaScale, hh = CFG.map.halfH * G.arenaScale, W = R.width, hot = W * R.hot, t = G.realTime, dim = this.on ? 1 : 0.4, g = PIXEL;
  const X0 = STAGE_W / 2 - hw, X1 = STAGE_W / 2 + hw, Y0 = STAGE_H / 2 - hh, Y1 = STAGE_H / 2 + hh;
  const vx0 = STAGE_W / 2 + G.cam.x - STAGE_W / 2 - 20, vx1 = STAGE_W / 2 + G.cam.x + STAGE_W / 2 + 20, vy0 = STAGE_H / 2 - G.cam.y - STAGE_H / 2 - 20, vy1 = STAGE_H / 2 - G.cam.y + STAGE_H / 2 + 20;
  const rect = (x, y, w, h, col, a) => { const ax = Math.max(x, vx0), ay = Math.max(y, vy0), bx = Math.min(x + w, vx1), by = Math.min(y + h, vy1); if (bx <= ax || by <= ay) return; ctx.globalAlpha = a * dim; ctx.fillStyle = col; ctx.fillRect(Math.round(ax / g) * g, Math.round(ay / g) * g, Math.max(g, Math.round((bx - ax) / g) * g), Math.max(g, Math.round((by - ay) / g) * g)); };
  ctx.save();
  // Streifen: Grundflaeche, Warnstreifen im heissen Aussenteil, nach innen laufende Pfeile
  const strip = (horiz, near, sign) => {                                       // horiz = oberer/unterer Rand, near = Koordinate der Arenakante, sign = Richtung nach innen
    const len = horiz ? 2 * hw : 2 * hh, a0 = horiz ? X0 : Y0;
    const band = (o, w, col, al) => horiz ? rect(a0, sign > 0 ? near + o : near - o - w, len, w, col, al) : rect(sign > 0 ? near + o : near - o - w, a0, w, len, col, al);
    band(0, W, P.greyDark, 0.55); band(0, hot, '#3a2a08', 0.7);
    for (let u = 0; u < len; u += 16) { const on = Math.floor(u / 16) % 2 === 0; const st = on ? P.yellow : '#15110d'; if (horiz) rect(a0 + u, sign > 0 ? near : near - hot, 16, hot, st, 0.55); else rect(sign > 0 ? near : near - hot, a0 + u, hot, 16, st, 0.55); }
    const sp = 30, off = (t * 40) % sp;                                          // Pfeile laufen zur Mitte
    for (let u = sp / 2; u < len; u += sp) {
      const d = (off + 0) % sp, depth = W - d - 6;                               // Abstand zur Kante, waechst bis zur Mitte hin
      const e = near + sign * (W - d), px = a0 + u;
      ctx.globalAlpha = 0.8 * dim * (1 - d / sp * 0.4); ctx.fillStyle = P.orange;
      if (horiz) { pxLine(ctx, px - 5, e - sign * 4, px, e, 1); pxLine(ctx, px + 5, e - sign * 4, px, e, 1); }
      else { pxLine(ctx, e - sign * 4, px - 5, e, px, 1); pxLine(ctx, e - sign * 4, px + 5, e, px, 1); }
    }
  };
  strip(true, Y0, 1); strip(true, Y1, -1); strip(false, X0, 1); strip(false, X1, -1);
  ctx.globalAlpha = dim; ctx.fillStyle = P.yellow;
  if (this.on) for (let i = 0; i < 6; i++) {                                    // Funken am Rand
    const a = (t * 0.9 + i * 0.37) % 1, side = i % 4;
    const fx = side < 2 ? STAGE_W / 2 + G.cam.x + (i * 53 % 380) - 190 : (side === 2 ? X0 + 4 : X1 - 4), fy = side < 2 ? (side === 0 ? Y0 + 3 : Y1 - 3) : STAGE_H / 2 - G.cam.y + (i * 41 % 240) - 120;
    ctx.globalAlpha = 0.8 * (1 - a); pxFill(ctx, fx + Math.sin(t * 9 + i) * 4, fy + (side === 0 ? a * 6 : side === 1 ? -a * 6 : 0), 1);
  }
  ctx.restore();
};
