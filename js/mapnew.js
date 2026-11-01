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
