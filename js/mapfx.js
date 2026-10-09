// Kartenatmosphaere: animierte Hintergruende, wechselnde Beleuchtung, Boss-Phasen und Kartenrand-Effekte (rein optisch, ausser den Spielwirkungen in mapenv.js).
// Pro Karte ein Stil (CFG.maps[].fx.kind): 'void' pulsierende Gitterlinien + Datenfunken, 'foundry' aufsteigende Glut + glimmende Schlote, 'toxic' Blasen + Giftnebel,
// 'cryo' Schneefall + Glitzern + Blizzard-Streifen. Alle Effekte bestehen aus groben Pixeln (style.js) und folgen der Einstellung Effects (OFF = nichts, REDUCED = die Haelfte).
// Boss-Kampf: this.boss blendet auf 1 (Gitter wird rot und schnell, mehr Glut, dichterer Nebel, Schneesturm); vor einem Boss (letzte 12 s) steigt this.pre (Vignette pulsiert).
// Zeichen-Haken in G.drawPlay: drawBelow (Welt, unter den Figuren), drawAbove (Welt, ueber den Figuren), drawScreen (Bildschirm, vor dem HUD).

const MapFx = {
  parts: [], t: 0, boss: 0, pre: 0, acc: 0, pingT: 0, pings: [], edgeAcc: 0,

  reset() { this.parts = []; this.t = 0; this.boss = 0; this.pre = 0; this.acc = 0; this.pingT = 1.5; this.pings = []; this.edgeAcc = 0; },
  get kind() { return (G.map && G.map.fx && G.map.fx.kind) || null; },
  get level() { return Juice.scale; },                                // 0 aus, 0.5 reduziert, 1 voll

  // Naht ein Boss (letzte 12 s vor dem Zeitplan oder dem finalen Boss)?
  nearBoss() {
    if (G.bossFight || G.victory > 0 || Tutorial.active) return false;
    if (G.finalAt !== null && G.finalAt - G.time < 12 && G.finalAt - G.time > 0) return true;
    const st = CFG.boss.steps, len = (G.map.bossOrder || CFG.boss.order).length;
    if (!G.infinite && G.bossCount >= len) return false;
    const next = Math.ceil((G.time + 0.01) / st) * st;
    return next - G.time < 12 && (G.infinite || next <= st * len);
  },

  // ---------- Partikel ----------
  rates() {                                                           // Partikel pro Sekunde bei voller Stufe
    const b = this.boss, gust = MapEnv.gust ? 1 : 0;
    switch (this.kind) {
      case 'void': return { mote: 12 + 10 * b };
      case 'foundry': return { ember: 24 * (1 + 2 * b) };
      case 'toxic': return { bubble: 8 * (1 + b), mist: 0.5 * (1 + b) };
      case 'cryo': return { snow: 26 * (1 + 1.5 * b + 4 * gust) };
      default: return {};
    }
  },
  spawn(type) {
    const c = G.cam, bw = 350, bh = 205, P = STYLE.pal;
    const x = c.x + rand(-bw, bw), y = c.y + rand(-bh, bh), q = { x, y, t: 0, life: 4, type, ph: rand(0, 6.28), s: 1, vx: 0, vy: 0, c: P.cyan };
    if (type === 'mote') { q.vy = rand(5, 14); q.vx = rand(-3, 3); q.life = rand(5, 9); q.c = [P.cyan, P.violet, P.ice, P.cyanMid][randInt(0, 3)]; q.s = Math.random() < 0.25 ? 2 : 1; }
    else if (type === 'ember') { q.vy = rand(22, 48); q.vx = rand(-6, 6); q.life = rand(1.6, 3.4); q.s = Math.random() < 0.3 ? 2 : 1; }
    else if (type === 'bubble') { q.vy = rand(7, 16); q.vx = rand(-2, 2); q.life = rand(2.5, 5); q.s = rand(2, 5); }
    else if (type === 'mist') { q.vx = rand(-7, 7); q.vy = rand(-4, 4); q.life = rand(9, 15); q.s = rand(50, 95); }
    else if (type === 'snow') {
      q.y = c.y + bh + 10; q.x = c.x + rand(-bw - 80, bw + 80);       // Schnee faellt von oben herein (bei Sturm auch von der Seite)
      q.vy = -rand(28, 55); q.vx = rand(-6, 10); q.life = rand(6, 11); q.s = Math.random() < 0.3 ? 2 : 1;
      if (MapEnv.gust) { const a = MapEnv.blz.ang; q.x = c.x - fwdX(a) * (bw + 30) + rand(-60, 60) + (Math.abs(fwdX(a)) < 0.3 ? rand(-bw, bw) : 0); q.y = c.y - fwdY(a) * (bh + 20) + rand(-bh, bh) * (Math.abs(fwdY(a)) < 0.3 ? 1 : 0.3); }
    }
    this.parts.push(q);
  },
  update(dt) {
    if (!G.map) return;
    this.t += dt;
    this.boss += ((G.bossFight ? 1 : 0) - this.boss) * Math.min(1, dt * 1.4);
    this.pre += ((this.nearBoss() ? 1 : 0) - this.pre) * Math.min(1, dt * 1.2);
    const c = G.cam, lv = this.level;
    if (lv > 0 && this.kind) {
      const R = this.rates();
      for (const k of Object.keys(R)) {
        this['a_' + k] = (this['a_' + k] || 0) + dt * R[k] * lv;
        while (this['a_' + k] >= 1 && this.parts.length < 220) { this['a_' + k] -= 1; this.spawn(k); }
        if (this['a_' + k] > 3) this['a_' + k] = 0;
      }
    }
    const wind = MapEnv.gust ? MapEnv.windVec() : [0, 0];
    for (const q of this.parts) {
      q.t += dt;
      if (q.type === 'snow') { q.x += (q.vx + wind[0] * 70) * dt; q.y += (q.vy + wind[1] * 70) * dt; q.x += Math.sin(q.t * 2 + q.ph) * 4 * dt; }
      else { q.x += q.vx * dt + (q.type === 'ember' ? Math.sin(q.t * 3 + q.ph) * 9 * dt : 0); q.y += q.vy * dt; }
    }
    this.parts = this.parts.filter((q) => q.t < q.life && Math.abs(q.x - c.x) < 420 && Math.abs(q.y - c.y) < 330);
    // Gitter-Wellen vom Spieler aus (Neon Void)
    if (this.kind === 'void' && lv > 0) {
      this.pingT -= dt;
      if (this.pingT <= 0) { this.pingT = (3.2 - 1.8 * this.boss) / Math.max(0.5, lv); this.pings.push({ x: G.player.x, y: G.player.y, t: 0 }); }
      for (const p of this.pings) p.t += dt;
      this.pings = this.pings.filter((p) => p.t < 1.6);
    }
    // Funken am Kartenrand, wenn man nah dran ist
    if (!CFG.map.infinite && lv > 0 && this.kind) this.edgeSparks(dt);
  },
  // Rand: Abstand zum naechsten Kartenrand (Weltkoordinaten)
  edgeDist(x, y) {
    const hw = CFG.map.halfW * G.arenaScale, hh = CFG.map.halfH * G.arenaScale;
    return Math.min(hw - Math.abs(x), hh - Math.abs(y));
  },
  edgeSparks(dt) {
    const p = G.player, d = this.edgeDist(p.x, p.y);
    if (d > 110) return;
    this.edgeAcc += dt * (1 - d / 110) * 22 * this.level;
    const hw = CFG.map.halfW * G.arenaScale, hh = CFG.map.halfH * G.arenaScale, col = G.map.frame;
    while (this.edgeAcc >= 1) {
      this.edgeAcc -= 1;
      // Punkt am naechsten Rand, in Spielernaehe verteilt
      const nearX = hw - Math.abs(p.x) < hh - Math.abs(p.y);
      const q = nearX ? { x: Math.sign(p.x || 1) * hw, y: p.y + rand(-60, 60) } : { x: p.x + rand(-60, 60), y: Math.sign(p.y || 1) * hh };
      this.parts.push({ x: q.x, y: q.y, t: 0, life: rand(0.5, 1.0), type: 'spark', ph: 0, s: 1, vx: (nearX ? -Math.sign(p.x || 1) : 0) * rand(10, 40) + rand(-8, 8), vy: (nearX ? 0 : -Math.sign(p.y || 1)) * rand(10, 40) + rand(-8, 8), c: col });
    }
  },

  // ---------- Zeichnen ----------
  // Unter den Figuren (Weltkoordinaten): Gitter-Pulse, glimmende Schlote, Nebel, Glitzern, pulsierender Kartenrand
  drawBelow(ctx) {
    if (!G.map || !this.kind || this.level === 0) return;
    const P = STYLE.pal, c = G.cam, t = this.t, k = this.kind, lv = this.level, b = this.boss;
    const [mx, my] = Juice.margin, x0 = c.x - STAGE_W / 2 - mx - 20, x1 = c.x + STAGE_W / 2 + mx + 20, y0 = c.y - STAGE_H / 2 - my - 20, y1 = c.y + STAGE_H / 2 + my + 20;
    const sx = (wx) => STAGE_W / 2 + wx, sy = (wy) => STAGE_H / 2 - wy;
    ctx.save();
    if (k === 'void') {                                                // Gitterlinien pulsieren als laufende Welle (Boss: rot und schnell)
      const sp = 1.6 + 3 * b, col = b > 0.5 ? P.red : P.cyan;
      ctx.fillStyle = col;
      for (let gx = Math.ceil(x0 / 100) * 100; gx < x1; gx += 100) {
        ctx.globalAlpha = (0.05 + 0.2 * (0.5 + 0.5 * Math.sin(t * sp - gx * 0.011))) * lv;
        ctx.fillRect(Math.round(sx(gx)) - 1, sy(y1), 2, y1 - y0);
      }
      for (let gy = Math.ceil(y0 / 100) * 100; gy < y1; gy += 100) {
        ctx.globalAlpha = (0.05 + 0.2 * (0.5 + 0.5 * Math.sin(t * sp - gy * 0.011 + 1.3))) * lv;
        ctx.fillRect(sx(x0), Math.round(sy(gy)) - 1, x1 - x0, 2);
      }
      ctx.globalAlpha = 1; ctx.fillStyle = col;
      for (const p of this.pings) {                                    // Welle vom Spieler: wachsender Pixelring
        ctx.globalAlpha = 0.5 * (1 - p.t / 1.6) * lv;
        pxRing(ctx, sx(p.x), sy(p.y), 20 + p.t * 190, 1, 40, 0);
      }
    } else if (k === 'foundry') {                                      // glimmende Schlote im Boden: Zellen mit Hash, pulsierend (im Boss heller)
      for (let gx = Math.floor(x0 / 160) * 160; gx < x1; gx += 160) for (let gy = Math.floor(y0 / 160) * 160; gy < y1; gy += 160) {
        const h = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453, hv = h - Math.floor(h);
        if (hv > 0.42) continue;
        const pulse = 0.5 + 0.5 * Math.sin(t * (1.5 + hv * 3) + hv * 20);
        ctx.fillStyle = b > 0.4 ? P.yellow : P.orange; ctx.globalAlpha = (0.05 + 0.1 * pulse + 0.1 * b) * lv;
        pxGlow(ctx, sx(gx + 80 + hv * 40), sy(gy + 80 - hv * 30), 26 + 14 * pulse);
      }
    } else if (k === 'toxic') {                                        // Giftnebel (grosse, gedaempfte Dither-Flecken)
      for (const q of this.parts) {
        if (q.type !== 'mist') continue;
        const f = Math.min(1, q.t / 2, (q.life - q.t) / 2);
        ctx.fillStyle = b > 0.4 ? P.greenMid : P.green; ctx.globalAlpha = (0.05 + 0.04 * b) * f * lv;
        pxGlow(ctx, sx(q.x), sy(q.y), q.s * (1 + 0.15 * Math.sin(t + q.ph)));
      }
    } else if (k === 'cryo') {                                         // Eisglitzern: Zellen blitzen kurz als kleines Kreuz auf
      ctx.fillStyle = P.ice;
      for (let gx = Math.floor(x0 / 70) * 70; gx < x1; gx += 70) for (let gy = Math.floor(y0 / 70) * 70; gy < y1; gy += 70) {
        const h = Math.sin(gx * 9.1 + gy * 31.7) * 9731.3, hv = h - Math.floor(h);
        if (hv > 0.3) continue;
        const ph = (t * (0.3 + hv) + hv * 9) % 1;
        if (ph > 0.35) continue;
        const a = Math.sin(ph / 0.35 * Math.PI), px = sx(gx + hv * 60), py = sy(gy + (hv * 7 % 1) * 60);
        ctx.globalAlpha = 0.85 * a * lv;
        pxFill(ctx, px, py, 1); if (a > 0.5) { pxFill(ctx, px - 2, py, 1); pxFill(ctx, px + 2, py, 1); pxFill(ctx, px, py - 2, 1); pxFill(ctx, px, py + 2, 1); }
      }
    }
    // Kartenrand: laufende Striche, stark wenn man nah dran ist, im Boss schneller
    if (!CFG.map.infinite) {
      const hw = CFG.map.halfW * G.arenaScale, hh = CFG.map.halfH * G.arenaScale, d = this.edgeDist(G.player.x, G.player.y), near = clamp(1 - d / 150, 0, 1);
      const sp = 26 + 40 * b, col = G.map.frame;
      ctx.fillStyle = col;
      const edge = (ax, ay, bx, by) => {                                // Linie von (ax,ay) nach (bx,by) in Weltkoordinaten, Striche wandern
        const len = Math.hypot(bx - ax, by - ay), n = Math.floor(len / 16), ux = (bx - ax) / len, uy = (by - ay) / len, off = (t * sp) % 16;
        for (let i = -1; i < n; i++) {
          const u = i * 16 + off;
          if (u < 0 || u > len - 6) continue;
          const wx = ax + ux * u, wy = ay + uy * u;
          if (wx < x0 || wx > x1 || wy < y0 || wy > y1) continue;
          ctx.globalAlpha = (0.2 + 0.7 * near) * lv; pxFill(ctx, sx(wx), sy(wy) - 1, 2); pxFill(ctx, sx(wx + ux * 4), sy(wy + uy * 4) - 1, 2);
        }
      };
      edge(-hw, hh - 4, hw, hh - 4); edge(hw, -hh + 4, -hw, -hh + 4); edge(-hw + 4, -hh, -hw + 4, hh); edge(hw - 4, hh, hw - 4, -hh);
      if (near > 0) {                                                   // Naehe zum Rand: Warnleuchten an der Wand
        const p = G.player, nx = hw - Math.abs(p.x) < hh - Math.abs(p.y);
        ctx.globalAlpha = 0.1 * near * lv; ctx.fillStyle = col;
        pxGlow(ctx, sx(nx ? Math.sign(p.x || 1) * hw : p.x), sy(nx ? p.y : Math.sign(p.y || 1) * hh), 70);
      }
    }
    ctx.restore();
  },

  // Ueber den Figuren (Weltkoordinaten): Funken, Glut, Blasen, Schnee
  drawAbove(ctx) {
    if (!G.map || this.level === 0 || !this.parts.length) return;
    const P = STYLE.pal, t = this.t, b = this.boss, gust = MapEnv.gust ? MapEnv.windVec() : null;
    ctx.save();
    for (const q of this.parts) {
      if (q.type === 'mist') continue;
      const age = q.t / q.life, cx = STAGE_W / 2 + q.x, cy = STAGE_H / 2 - q.y, fade = Math.min(1, q.t / 0.4, (q.life - q.t) / 0.6);
      if (q.type === 'mote') {
        ctx.globalAlpha = 0.75 * fade * (0.5 + 0.5 * Math.sin(t * 3 + q.ph));
        ctx.fillStyle = b > 0.5 ? P.red : q.c; pxFill(ctx, cx, cy, q.s);
      } else if (q.type === 'ember') {
        ctx.globalAlpha = fade * (1 - age * 0.6);
        ctx.fillStyle = age < 0.3 ? P.yellow : age < 0.65 ? P.orange : P.red; pxFill(ctx, cx, cy, q.s);
      } else if (q.type === 'bubble') {
        const r = q.s * (0.5 + 0.7 * age), pop = age > 0.88;
        ctx.globalAlpha = 0.8 * fade; ctx.fillStyle = pop ? P.ice : P.green;
        if (pop) { pxFill(ctx, cx - r, cy, 1); pxFill(ctx, cx + r, cy, 1); pxFill(ctx, cx, cy - r, 1); pxFill(ctx, cx, cy + r, 1); }
        else { pxRing(ctx, cx, cy, r, 1); ctx.fillStyle = P.ice; ctx.globalAlpha = 0.6 * fade; pxFill(ctx, cx - r * 0.4, cy - r * 0.4, 1); }
      } else if (q.type === 'snow') {
        ctx.globalAlpha = 0.85 * fade; ctx.fillStyle = q.s > 1 ? P.white : P.ice;
        if (gust) pxLine(ctx, cx, cy, cx - gust[0] * 9, cy + gust[1] * 9, 1);       // im Sturm: Streifen in Windrichtung (Welt-y zeigt nach oben)
        else pxFill(ctx, cx, cy, q.s);
      } else if (q.type === 'spark') {
        ctx.globalAlpha = (1 - age); ctx.fillStyle = q.c; pxFill(ctx, cx, cy, 1);
      }
    }
    ctx.restore();
  },

  // Bildschirm (vor dem HUD): Beleuchtung, Vignette vor dem Boss, Boss-Phase, Blizzard-Weiss
  drawScreen(ctx) {
    if (!G.map || !this.kind || this.level === 0 || Tutorial.active && Tutorial.phase === 'brief') return;
    const P = STYLE.pal, t = this.t, lv = this.level, b = this.boss, pre = this.pre, k = this.kind;
    ctx.save();
    // Beleuchtung: langsam wechselnder Farbstich je Karte (Zeit des Laufs), Alpha klein, damit nichts verdeckt wird
    const gt = G.time;
    let col = P.cyan, a = 0.04;
    if (k === 'void') { const m = 0.5 + 0.5 * Math.sin(gt / 40); col = m > 0.5 ? P.violet : P.cyan; a = 0.03 + 0.04 * Math.abs(m - 0.5) * 2; }
    else if (k === 'foundry') { col = P.orange; a = 0.04 + 0.03 * (0.5 + 0.5 * Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1)); }
    else if (k === 'toxic') { col = P.green; a = 0.045 + 0.035 * (0.5 + 0.5 * Math.sin(gt / 9)); }
    else if (k === 'cryo') { const m = 0.5 + 0.5 * Math.sin(gt / 35); col = m > 0.5 ? P.teal : P.cyan; a = 0.03 + 0.04 * m; }
    ctx.globalAlpha = a * lv; ctx.fillStyle = col; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    // Vignette: nur noch im Bosskampf (Kartenfarbe, atmet). Die pulsierende Warn-Vignette vor dem Boss ist entfernt (pre zaehlt weiter, wirkt aber nicht mehr auf den Rand).
    const vg = b * 0.7;
    if (vg > 0.02) {
      const warn = k === 'cryo' || k === 'void' ? P.red : P.orange, pulse = 0.55 + 0.45 * Math.sin(t * (pre > b ? 6 : 2.4));
      ctx.fillStyle = b > pre ? G.map.frame : warn;
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = 0.2 * vg * pulse * (1 - i / 6) * lv;
        const w = (6 - i) * 7;
        ctx.fillRect(0, 0, w, STAGE_H); ctx.fillRect(STAGE_W - w, 0, w, STAGE_H); ctx.fillRect(0, 0, STAGE_W, w * 0.75); ctx.fillRect(0, STAGE_H - w * 0.75, STAGE_W, w * 0.75);
      }
    }
    // Blizzard: Weissschleier und Windstreifen
    if (MapEnv.blz && MapEnv.blz.state !== 'idle') {
      const B = MapEnv.blz, ramp = B.state === 'gust' ? MapEnv.gustRamp() : 0, w = MapEnv.windVec();
      ctx.fillStyle = P.ice; ctx.globalAlpha = 0.2 * ramp * lv; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      ctx.fillStyle = P.white;
      const n = B.state === 'gust' ? 46 : 10;
      for (let i = 0; i < n; i++) {
        const sp = 260 + (i * 37 % 120), seed = (i * 97.3) % 1, u = (seed * 700 + t * sp) % 700;
        const x = ((seed * 977 + (w[0] >= 0 ? u : -u)) % (STAGE_W + 40) + STAGE_W + 40) % (STAGE_W + 40) - 20, y = ((i * 53.7 + (w[1] > 0 ? -u : u) * Math.abs(w[1])) % STAGE_H + STAGE_H) % STAGE_H;
        ctx.globalAlpha = (B.state === 'gust' ? 0.55 : 0.25) * lv * (B.state === 'warn' ? 0.5 + 0.5 * Math.sin(t * 8) : ramp);
        pxLine(ctx, x, y, x - w[0] * 16, y + w[1] * 16, 1);
      }
    }
    ctx.restore();
  },
};
