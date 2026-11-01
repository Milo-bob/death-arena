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
      if (dist2(this.x, this.y, G.player.x, G.player.y) < 440 * 440) G.notice(this.pol > 0 ? 'MAGNET: PULLING!' : 'MAGNET: PUSHING!', this.pol > 0 ? '#3a8bff' : '#ff3d5a');
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
    const pull = this.pol > 0, col = pull ? '#3a8bff' : '#ff3d5a', colLight = pull ? '#a8d0ff' : '#ffb0b8', warn = this.state === 'warn' ? 1 - this.t / M.warn : 0, on = this.state === 'on';
    const fade = on ? clamp(Math.min(this.age / 0.5, (M.on - this.age) / 0.6), 0, 1) : 0, active = on || warn > 0;
    ctx.save();
    // Reichweite: immer als dezenter Ring sichtbar, damit man sie lernt
    ctx.globalAlpha = (active ? 0.35 : 0.22) * dim; ctx.fillStyle = active ? col : P.greyMid; pxRing(ctx, cx, cy, R, 1, 36, t * 0.05);
    if (this.state === 'warn') {                                                    // Vorwarnung: Rand und Flaeche pulsieren in der Farbe der Polung
      const blink = Math.floor(t * 10) % 2 === 0;
      ctx.globalAlpha = (0.08 + 0.12 * warn) * dim; ctx.fillStyle = col; pxDisc(ctx, cx, cy, R);
      ctx.globalAlpha = (0.5 + 0.5 * warn) * dim; ctx.fillStyle = blink ? P.white : col; pxRing(ctx, cx, cy, R, 2, 26, t * 0.2);
    }
    if (on) {                                                                       // Feld: Flaeche, nach innen (zieht) oder aussen (stoesst) laufende Ringe und Pfeile
      ctx.globalAlpha = 0.16 * fade * dim; ctx.fillStyle = col; pxDisc(ctx, cx, cy, R);
      for (let k = 0; k < 3; k++) { const ph = (t * 0.9 + k / 3) % 1, rr = R * (pull ? 1 - ph : ph); ctx.globalAlpha = 0.7 * fade * (1 - Math.abs(ph - 0.5)) * dim; ctx.fillStyle = colLight; pxRing(ctx, cx, cy, rr, 2, 26, 0); }
      for (let i = 0; i < 12; i++) {                                                // grosse Pfeile
        const a = i * 0.5236 + 0.26, ph = (t * 0.9 + (i % 3) / 3) % 1, rr = R * (pull ? 1 - ph : ph), ax = cx + Math.cos(a) * rr, ay = cy + Math.sin(a) * rr, d = pull ? -1 : 1, ux = Math.cos(a) * d, uy = Math.sin(a) * d;
        ctx.globalAlpha = 0.9 * fade * dim; ctx.fillStyle = '#ffffff'; pxLine(ctx, ax - uy * 4 - ux * 5, ay + ux * 4 - uy * 5, ax + ux * 3, ay + uy * 3, 1); pxLine(ctx, ax + uy * 4 - ux * 5, ay - ux * 4 - uy * 5, ax + ux * 3, ay + uy * 3, 1);
      }
      const p = G.player, dp = Math.hypot(p.x - this.x, p.y - this.y);
      if (dp < R) { ctx.globalAlpha = 0.85 * fade * dim; ctx.fillStyle = colLight; pxDashLine(ctx, cx, cy, STAGE_W / 2 + p.x, STAGE_H / 2 - p.y, 1, 4); }       // Strahl zum Spieler: er wird gezogen / gestossen
    }
    // Kran: Warnring am Boden, schwerer Fuss, Hufeisen mit rotem und blauem Pol
    const q = (v) => Math.round(v / PIXEL) * PIXEL;
    ctx.globalAlpha = 0.9 * dim; ctx.fillStyle = '#15110d'; pxDisc(ctx, cx, cy, 22); ctx.fillStyle = P.yellow; pxRing(ctx, cx, cy, 22, 2, 18, t * 0.15);
    ctx.fillStyle = P.greyDark; pxDisc(ctx, cx, cy, 19); ctx.fillStyle = P.greyMid; pxDisc(ctx, cx, cy, 15);
    ctx.fillStyle = '#3a3f4a'; ctx.fillRect(q(cx - 13), q(cy - 4), 6, 8);
    for (const [dy, c2] of [[-9, '#ff3d5a'], [9, '#3a8bff']]) { ctx.fillStyle = '#15110d'; ctx.fillRect(q(cx - 2), q(cy + dy - 4), 16, 8); ctx.fillStyle = c2; ctx.fillRect(q(cx), q(cy + dy - 3), 14, 6); ctx.fillStyle = '#ffffff'; ctx.fillRect(q(cx + 10), q(cy + dy - 3), 2, 6); }
    ctx.globalAlpha = dim; ctx.fillStyle = active ? col : P.grey; pxDisc(ctx, cx - 4, cy, 5); ctx.fillStyle = active ? colLight : P.greyMid; pxDisc(ctx, cx - 5, cy - 1, 2);
    if (active && Math.sin(t * 40) > 0) { ctx.globalAlpha = 0.9 * dim; ctx.fillStyle = P.white; pxLine(ctx, cx + 12, cy - 9, cx + 12 + rand(-3, 3), cy, 1); pxLine(ctx, cx + 12, cy, cx + 12 + rand(-3, 3), cy + 9, 1); }      // Blitzbogen zwischen den Polen
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
  this.rimWarnT = Math.max(0, (this.rimWarnT || 0) - dt);
  if (!R || !this.on || !p) return;
  const [dx, dy] = this.rimDepth(p.x, p.y);
  if (Math.max(dx, dy) < 1 - R.hot) return;
  if (this.rimWarnT <= 0) { this.rimWarnT = 2.5; G.notice('GRINDER RIM - GET BACK!', STYLE.pal.red); Sfx.play('warn'); }
  if (G.god || p.invincible || p.shield) return;
  p.hp -= R.dps * dt; Stats.dealt('SCRAP GRINDER', R.dps * dt, false);
  if (Math.random() < 0.3) Juice.sparks(p.x, p.y, STYLE.pal.yellow, 1, 2);
};
MapEnv.drawRim = function (ctx) {
  const E = G.map && G.map.env, R = E && E.rim;
  if (!R || G.pvp) return;
  const P = STYLE.pal, hw = CFG.map.halfW * G.arenaScale, hh = CFG.map.halfH * G.arenaScale, W = R.width, hot = W * R.hot, t = G.realTime, dim = this.on ? 1 : 0.4, g = PIXEL;
  const X0 = STAGE_W / 2 - hw, X1 = STAGE_W / 2 + hw, Y0 = STAGE_H / 2 - hh, Y1 = STAGE_H / 2 + hh;
  const vx0 = G.cam.x - 20, vx1 = G.cam.x + STAGE_W + 20, vy0 = -G.cam.y - 20, vy1 = -G.cam.y + STAGE_H + 20;
  const rect = (x, y, w, h, col, a) => { const ax = Math.max(x, vx0), ay = Math.max(y, vy0), bx = Math.min(x + w, vx1), by = Math.min(y + h, vy1); if (bx <= ax || by <= ay) return; ctx.globalAlpha = a * dim; ctx.fillStyle = col; ctx.fillRect(Math.round(ax / g) * g, Math.round(ay / g) * g, Math.max(g, Math.round((bx - ax) / g) * g), Math.max(g, Math.round((by - ay) / g) * g)); };
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  ctx.save();
  // Ein Streifen: dunkle Foerderbandflaeche mit nach innen laufenden Rippen, heisse Aussenzone mit vollen Warnstreifen und rotem Pulsieren, helle Innenkante, grosse Pfeile
  const strip = (horiz, near, sign) => {                                       // horiz = oberer/unterer Rand, near = Koordinate der Arenakante, sign = Richtung nach innen
    const len = horiz ? 2 * hw : 2 * hh, a0 = horiz ? X0 : Y0;
    const band = (o, w, col, al) => horiz ? rect(a0, sign > 0 ? near + o : near - o - w, len, w, col, al) : rect(sign > 0 ? near + o : near - o - w, a0, w, len, col, al);
    band(0, W, '#161a22', 0.92);
    const off = (t * 36) % 12;                                                  // Rippen wandern nach innen (Bandgeschwindigkeit)
    for (let o = hot + off; o < W - 1; o += 12) band(o, 2, '#3a4152', 1);
    for (let u = 0; u < len; u += 14) { const y = Math.floor(u / 14) % 2 === 0; if (horiz) rect(a0 + u, sign > 0 ? near : near - hot, 14, hot, y ? P.yellow : '#15110d', 1); else rect(sign > 0 ? near : near - hot, a0 + u, hot, 14, y ? P.yellow : '#15110d', 1); }
    band(0, hot, P.red, 0.12 + 0.2 * pulse);                                    // heisse Zone pulsiert rot
    band(W - 3, 3, P.orange, 1);                                                // helle Innenkante
    const sp = 40;
    for (let u = sp / 2; u < len; u += sp) {                                     // grosse Pfeile zur Mitte
      const d = (t * 36) % sp, e = near + sign * (hot + 4 + d * ((W - hot - 8) / sp)), px = a0 + u;
      ctx.globalAlpha = 0.95 * dim; ctx.fillStyle = P.yellow;
      if (horiz) { pxLine(ctx, px - 7, e - sign * 6, px, e, 2); pxLine(ctx, px + 7, e - sign * 6, px, e, 2); }
      else { pxLine(ctx, e - sign * 6, px - 7, e, px, 2); pxLine(ctx, e - sign * 6, px + 7, e, px, 2); }
    }
  };
  strip(true, Y0, 1); strip(true, Y1, -1); strip(false, X0, 1); strip(false, X1, -1);
  if (this.on) for (let i = 0; i < 10; i++) {                                    // Funken am Rand
    const a = (t * 1.1 + i * 0.31) % 1, side = i % 4, fx = side < 2 ? G.cam.x + STAGE_W / 2 + ((i * 97) % 520) - 260 : (side === 2 ? X0 + 5 : X1 - 5), fy = side < 2 ? (side === 0 ? Y0 + 4 : Y1 - 4) : -G.cam.y + STAGE_H / 2 + ((i * 61) % 300) - 150;
    ctx.globalAlpha = 0.9 * (1 - a); ctx.fillStyle = i % 2 ? P.yellow : P.white; pxFill(ctx, fx + Math.sin(t * 9 + i) * 5, fy + (side === 0 ? a * 8 : side === 1 ? -a * 8 : 0), 1);
  }
  ctx.restore();
};
