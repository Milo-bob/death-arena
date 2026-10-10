// Anzeigen: Lebensbalken, Schadenszahlen, Uhr, Bossleiste, roter Rand und die Bildschirme (Start, Tod).

const HP_STEPS = [94.6, 89.1, 83.6, 78.1, 72.6, 67.1, 61.6, 56.1, 50.6, 45.1, 37.6, 30.1, 25.1, 17.6, 12.1, 5.1, 0.1];


// Schadenszahl, die nach oben wegschwebt
class FloatingText {
  constructor(name, x, y, opts) {
    this.name = name; this.x0 = x; this.y0 = y; this.age = 0; this.alive = true; this.opts = opts || null;      // opts: { text, color, size } = Zahl statt Sprite
  }
  update(dt) {
    this.age += dt;
    if (this.age >= 1) this.alive = false;
  }
  draw(ctx) {
    const k = this.age, o = this.opts;
    if (o) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - k) / 0.3);
      const nx = STAGE_W / 2 + this.x0 + 5 * k, ny = STAGE_H / 2 - (this.y0 + 5 * k) - 10 - 8 * k, ns = Cos.cur('numbers').style;
      if (ns) Cos2.drawNumber(ctx, ns, o, nx, ny, k);                                  // Cosmetic: Stil der Schadenszahlen
      else uiText(ctx, o.text, nx, ny, { size: o.size, color: o.color, align: 'center' });
      ctx.restore();
      return;
    }
    drawSprite(ctx, this.name, this.x0 + 5 * k, this.y0 + 5 * k, 90, 250);
  }
}

// HUD-Teile, die in der Welt hängen (werden mit der Kamera verschoben): Lebensbalken über dem Spieler, Schadenszahlen, Bossleiste
function drawWorldHud(ctx) {
  const p = G.player;
  let idx = 0;
  for (const t of HP_STEPS) if (p.hpPct < t) idx++;
  drawSprite(ctx, 'hp' + Math.min(17, idx), p.x, p.y, 90, 300);

  for (const t of G.texts) t.draw(ctx);
  if (G.boss) G.boss.drawBar(ctx);
}

// Blutmond: roter Schleier über der ganzen Welt und pulsierender Rand
function drawBloodMoonTint(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(110, 0, 25, 0.2)';
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.restore();
  drawSprite(ctx, 'damageOverlay', 0, 0, 90, 100, { alpha: 0.3 + 0.1 * Math.sin(G.realTime * 2), stretchX: STAGE_W / 480 });
}

// HUD fest auf dem Bildschirm: roter Rand, Uhr, Meldung, Hotbar
function drawHud(ctx) {
  const p = G.player;
  if (G.flashT > 0 && G.flashMax > 0) {                       // Bildschirmblitz beim Ausloesen eines Effekts
    ctx.save(); ctx.globalAlpha = (G.flashAlpha || 0.5) * G.flashT / G.flashMax; ctx.fillStyle = G.flashColor; ctx.fillRect(0, 0, STAGE_W, STAGE_H); ctx.restore();
  }

  // roter Rand bei wenig Leben
  // Das Pulsieren läuft über die Deckkraft (in player.overlayAlpha). Die Größe bleibt fest, sonst blitzt der Bildrand durch.
  const a = p.overlayAlpha;
  if (a > 0) drawSprite(ctx, 'damageOverlay', 0, 0, 90, 100, { alpha: a, stretchX: STAGE_W / 480 });

  // Uhr oben rechts: zählt hoch, im Bosskampf runter
  let clock;
  if (G.bossFight) clock = G.boss ? Math.max(0, 30 - Math.floor(G.bossTimer / 2)) : 30;
  else clock = Math.min(30, Math.floor((G.time % CFG.waves.length) / 4));
  if (!G.sr) drawSprite(ctx, 'clock' + clock, STAGE_W / 2 - 70, 160, 90, 375);       // Speedrun: eigene Uhr (SpeedRun.drawHud)

  if (G.noticeT > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, G.noticeT);
    uiText(ctx, G.noticeText, STAGE_W / 2, 44, { size: G.noticeSize, color: G.noticeColor, align: 'center', glow: G.noticeColor });
    ctx.restore();
  }

  if (G.bloodMoon) {                                           // Restzeit des Blutmonds oben in der Mitte
    uiText(ctx, 'CRIMSON ECLIPSE', STAGE_W / 2, 18, { size: STYLE.type.small, color: STYLE.pal.red, align: 'center' });
    uiBar(ctx, STAGE_W / 2 - 40, 22, 80, 5, G.bloodMoonLeft / CFG.bloodMoon.duration, STYLE.pal.red);
  }

  let evY = G.bloodMoon ? 36 : 18;                             // weitere Event-Anzeigen rutschen untereinander
  if (G.meteorShower) {                                        // Restzeit des Meteoritenhagels (unter der Eclipse-Anzeige, falls beide laufen)
    uiText(ctx, 'METEOR SHOWER', STAGE_W / 2, evY, { size: STYLE.type.small, color: STYLE.pal.orange, align: 'center' });
    uiBar(ctx, STAGE_W / 2 - 40, evY + 4, 80, 5, G.meteorLeft / CFG.meteors.duration, STYLE.pal.orange);
    evY += 18;
  }
  if (MapEnv.blz && MapEnv.blz.state !== 'idle' && !G.bossFight) {                 // Blizzard: Vorwarnung mit Pfeil, dann Restzeit
    const B = MapEnv.blz, w = MapEnv.windVec(), warn = B.state === 'warn';
    uiText(ctx, warn ? 'BLIZZARD - WIND ' + ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(B.ang / 45) % 8] : 'BLIZZARD', STAGE_W / 2, evY, { size: STYLE.type.small, color: STYLE.pal.ice, align: 'center' });
    uiBar(ctx, STAGE_W / 2 - 40, evY + 4, 80, 5, warn ? 1 - B.t / G.map.env.blizzard.warn : B.t / G.map.env.blizzard.dur, STYLE.pal.ice);
    if (warn) { ctx.save(); ctx.fillStyle = STYLE.pal.ice; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.realTime * 10); for (let i = 0; i < 3; i++) pxLine(ctx, STAGE_W / 2 + w[0] * (60 + i * 10) - w[0] * 8, evY + 30 - w[1] * (20 + i * 6), STAGE_W / 2 + w[0] * (60 + i * 10) + w[0] * 8, evY + 30 - w[1] * (20 + i * 6) - w[1] * 0, 2); ctx.restore(); }
    evY += 18;
  }
  if (G.collapse && !G.bossFight) {
    uiText(ctx, G.collapseWarn ? 'ARENA UNSTABLE' : 'ARENA COLLAPSE', STAGE_W / 2, evY, { size: STYLE.type.small, color: STYLE.pal.red, align: 'center' });
    uiBar(ctx, STAGE_W / 2 - 40, evY + 4, 80, 5, G.collapseLeft / CFG.collapse.duration, STYLE.pal.red);
  }

  Tutorial.draw(ctx);
  if (G.sr) SpeedRun.drawHud(ctx);
  Xp.drawHud(ctx);
  MsFx.draw(ctx);                                                // Meilenstein-Fanfare (js/milestonefx.js)
  drawHotbar(ctx, p);
}

// ---------- Hotbar unten Mitte (im Stil von Minecraft Dungeons, aber ohne Lebensanzeige) ----------
// Mitte: Ultimate-Kugel, die sich mit Kills füllt. Links: Waffen-Slots (1 Schwert, 2 Schuss, E Beam).
// Rechts: Ability-Slots (Q, Shift, siehe CFG.loadout.slots). Abklingzeit = dunkle Abdeckung, die von oben abschmilzt.
const SLOT = 22, SLOT_GAP = 3, HOTBAR_Y = 329, ORB = { cx: 320, cy: 340, r: 17 };       // cx = Mitte der 640 breiten Bühne

// Zeichnet ein Sprite mittig bei (cx, cy) in Canvas-Bühnenkoordinaten (y nach unten), auf die Breite targetW
function drawIcon(ctx, name, cx, cy, targetW, alpha, gray) {
  const im = IMG[name];
  if (!im || !im.ok) return;
  const k = targetW / (im.w / im.res);
  const ox = cx + (im.rcx - im.w / 2) / im.res * k, oy = cy + (im.rcy - im.h / 2) / im.res * k;     // Drehpunkt so legen, dass die Bildmitte bei (cx, cy) liegt
  drawSprite(ctx, name, ox - STAGE_W / 2, STAGE_H / 2 - oy, 90, 100 * k, { alpha, gray });
}

// o: icon, iconW, key, color (Rahmen), ready (0..1, 1 = einsatzbereit), selected, active, left (Sekunden Abklingzeit), count (Zahl rechts oben), charge (0..1 von unten, gelb)
function drawSlot(ctx, x, y, o) {
  const P = STYLE.pal, T = STYLE.type;
  if (o.selected) y -= 3;
  const frame = o.active ? P.yellow : o.selected ? P.cyan : o.ready >= 1 ? o.color : P.greyMid;
  uiPanel(ctx, x, y, SLOT, SLOT, { color: frame, fill: P.void, alpha: 0.9, notch: 2, glow: o.selected || o.active });
  drawIcon(ctx, o.icon, x + SLOT / 2, y + SLOT / 2, o.iconW, o.ready >= 1 || o.active ? 1 : 0.55);
  if (o.charge > 0) {
    const h = (SLOT - 2) * o.charge;
    ctx.fillStyle = 'rgba(255,217,31,0.35)';
    ctx.fillRect(x + 1, y + SLOT - 1 - h, SLOT - 2, h);
  }
  if (o.ready < 1 && !o.active) {
    const h = (SLOT - 2) * (1 - o.ready);
    ctx.fillStyle = 'rgba(5,6,15,0.7)';
    ctx.fillRect(x + 1, y + 1, SLOT - 2, h);
    if (o.left > 0.05) uiText(ctx, o.left < 10 ? o.left.toFixed(1) : String(Math.ceil(o.left)), x + SLOT / 2, y + SLOT / 2 + 3, { size: T.small, align: 'center', color: P.ice });
  }
  uiText(ctx, o.key, x + SLOT - 2, y + SLOT - 2, { size: T.small, align: 'right', color: o.selected ? P.ice : P.yellow });
  if (o.count) uiText(ctx, o.count, x + SLOT - 2, y + 8, { size: T.small, align: 'right', color: P.ice });
}

// Ultimate-Kugel: füllt sich von unten, bereit = leuchtet türkis und pulsiert
function drawUltOrb(ctx, frac, ready, o) {
  const P = STYLE.pal, { cx, cy, r } = o || ORB, mini = !!o;
  const liquid = ready ? P.teal : P.purpleDark, edge = ready ? P.teal : P.purple;
  ctx.save();
  // Kugel Pixel für Pixel: Hintergrund, Flüssigkeit unter der Wellenlinie, helle Wellenkante
  const n = Math.round(r / PIXEL), gx = Math.round(cx / PIXEL), gy = Math.round(cy / PIXEL);
  const top = cy + r - 2 * r * clamp(frac, 0, 1);
  for (let j = -n; j <= n; j++) {
    const w = Math.floor(Math.sqrt(Math.max(0, n * n + 0.5 - j * j)));
    for (let i = -w; i <= w; i++) {
      const px = (gx + i) * PIXEL, py = (gy + j) * PIXEL;
      const wave = top + (frac < 1 ? Math.round(Math.sin(px * 0.45 + G.realTime * 3) * 0.6) * PIXEL : 0);
      ctx.fillStyle = py < wave - PIXEL / 2 ? P.void : py < wave + PIXEL / 2 ? (ready ? P.ice : P.purple) : liquid;
      if (frac <= 0 && py >= wave - PIXEL / 2) ctx.fillStyle = P.void;
      ctx.fillRect(px, py, PIXEL, PIXEL);
    }
  }
  ctx.fillStyle = edge;
  if (ready && Math.floor(G.realTime * 5) % 2 === 0) { ctx.globalAlpha = 0.35; pxRing(ctx, cx, cy, r + 3, 1); ctx.globalAlpha = 1; }      // pulsierender harter Rand statt Leuchten
  pxRing(ctx, cx, cy, r, 2);
  if (!mini) { ctx.globalAlpha = 0.35; pxRing(ctx, cx, cy, r - 4, 1); }
  ctx.restore();
  if (mini) return;
  // Taste V als kleines Schild am unteren Rand
  uiPanel(ctx, cx - 7, cy + r - 5, 14, 11, { color: ready ? P.teal : P.greyMid, fill: P.void, alpha: 1, notch: 2 });
  uiText(ctx, Input.label('ultimate'), cx, cy + r + 4, { size: STYLE.type.small, align: 'center', color: ready ? P.teal : P.grey });
}

// Daten aller Hotbar-Slots (Optionen fuer drawSlot): Nahkampf, Fernkampf, starke Waffe, Abilities je Stufe, Held-Artefakt (oder null).
// Wird vom HUD und von den Touch-Tasten (touch.js) gemeinsam benutzt, damit beide gleich aussehen (inkl. Cosmetic-HUD-Themes).
function hudSlots(p) {
  const P = STYLE.pal, b = p.beam, beamBusy = b.state === 'fire';
  const melee = Save.equipped('melee'), ranged = Save.equipped('ranged'), heavyId = Save.equipped('heavy');
  const ICONS = {};
  for (const [k, v] of Object.entries(CFG.items.catalog)) ICONS[k] = [v.icon, v.iconW];
  const out = {};
  out.melee = { icon: ICONS[melee][0], iconW: ICONS[melee][1], key: Input.label('weapon1'), color: P.cyan, ready: 1, selected: p.weapon === WEAPON.SWORD, count: melee === 'sword' ? 'x' + Loadout.sword.number : '' };
  out.ranged = { icon: ICONS[ranged][0], iconW: ICONS[ranged][1], key: Input.label('weapon2'), color: P.cyan, ready: 1, selected: p.weapon === WEAPON.SHOT };
  const hk = Input.label('beam');
  if (heavyId === 'grenade') out.heavy = { icon: 'grenadeIcon', iconW: 18, key: hk, color: P.cyan, ready: 1 - p.grenadeCd / CFG.grenade.cooldown, left: p.grenadeCd };
  else if (heavyId === 'firetrail') out.heavy = { icon: 'fireIcon', iconW: 18, key: hk, color: P.orange, ready: 1, active: p.fire.on, charge: p.fire.fuel < 1 || p.fire.on ? p.fire.fuel : 0 };
  else if (heavyId === 'chain' || heavyId === 'blackhole') out.heavy = { icon: ICONS[heavyId][0], iconW: 18, key: hk, color: P.cyan, ready: 1 - p.heavyCd / CFG[heavyId].cooldown, left: p.heavyCd };
  else if (heavyId !== 'beam') out.heavy = { icon: null, key: hk, color: P.greyMid, ready: 1 };
  else out.heavy = { icon: 'beamLoad2', iconW: 14, key: hk, color: P.yellow, ready: beamBusy ? clamp(1 - b.clock / CFG.beam.maxClock, 0, 1) : 1, active: b.state === 'load', charge: b.state === 'load' ? b.clock / CFG.beam.maxClock : 0 };
  out.abilities = CFG.loadout.tiers.map((tier) => {
    const id = p.slots[tier.id], key = Input.label('ability_' + tier.id);
    if (!id) return { icon: null, key, color: P.greyMid, ready: 1 };
    const st = p.abilityStatus(id), passive = CFG.loadout.abilities[id].passive;
    return { icon: st.icon, iconW: st.iconW, key: passive ? '' : key, color: P.cyan, ready: st.active ? 1 : st.frac, active: st.active, left: st.left };
  });
  const art = Hero.artifact();
  if (art) {
    const cd = p.cds[art.id] || 0, total = CFG[art.id].cooldown, on = art.id === 'fortress' && p.fortressT > 0;
    out.artifact = { icon: art.icon, iconW: 18, key: Input.label('artifact'), color: P.yellow, ready: on ? 1 : 1 - cd / total, active: on, left: cd };
  } else out.artifact = null;
  return out;
}

function drawHotbar(ctx, p) {
  const P = STYLE.pal, T = STYLE.type, { cx, r } = ORB;
  const lx = cx - r - 6;                                       // rechte Kante der linken Gruppe
  const D = hudSlots(p);

  if (!Save.data.touch) {                                      // Touch-Modus: die Slots unten Mitte entfallen, die Touch-Tasten (touch.js) zeigen dasselbe
  // links: 1 Schwert, 2 Schuss, E Beam
  const slotX = (i) => lx - SLOT - (2 - i) * (SLOT + SLOT_GAP);
  drawSlot(ctx, slotX(0), HOTBAR_Y, D.melee);
  drawSlot(ctx, slotX(1), HOTBAR_Y, D.ranged);
  drawSlot(ctx, slotX(2), HOTBAR_Y, D.heavy);

  // Mitte: Ultimate
  const ultReady = G.ultCharge > CFG.ult.readyAt;
  drawUltOrb(ctx, G.ultCharge / (CFG.ult.readyAt + 1), ultReady);
  if (ultReady) {                                             // kleine Kugel: Fortschritt des nächsten Ultimates, Zahl = bereite Ultimates
    const mo = { cx: ORB.cx, cy: ORB.cy - ORB.r - 11, r: 7 }, full = 1 + G.ultStock >= CFG.ult.maxStack;
    drawUltOrb(ctx, full ? 1 : G.ultNext, full, mo);
    uiText(ctx, 'x' + (1 + G.ultStock), mo.cx + mo.r + 4, mo.cy + 3, { size: STYLE.type.small, align: 'left', color: P.teal });
  }

  // rechts: Ability-Slots (leer, bis man nach einem Boss eine gewählt hat)
  D.abilities.forEach((o, i) => drawSlot(ctx, cx + r + 6 + i * (SLOT + SLOT_GAP), HOTBAR_Y, o));

  // Held-Artefakt: vierter Slot rechts (nur Helden nach Vanguard, nicht im Tutorial)
  if (D.artifact) {
    drawSlot(ctx, cx + r + 6 + CFG.loadout.tiers.length * (SLOT + SLOT_GAP), HOTBAR_Y, D.artifact);
    // Gegenstück ohne Funktion auf der linken Seite, damit die Leiste symmetrisch bleibt (gleicher Slot-Stil, daher auch in den HUD-Skins)
    const dx = slotX(-1);
    drawSlot(ctx, dx, HOTBAR_Y, { icon: 'luckyIcon', iconW: 18, key: '', color: P.greyMid, ready: 1 });
    ctx.save(); ctx.globalAlpha = 0.7; ctx.fillStyle = P.void; ctx.fillRect(dx + 2, HOTBAR_Y + 2, SLOT - 4, SLOT - 4);      // abdunkeln (Filter/Graustufen gehen nicht überall)
    ctx.restore();
  }
  }

  // aktive Drop-Buffs mit Restzeit: oben links (unter dem XP-Balken und der Levelanzeige)
  let by = Xp.on ? 20 : 4;
  for (const [k, left] of Object.entries(p.buffs)) {
    if (left <= 0) continue;
    const B = CFG.drops.types[k];
    uiPanel(ctx, 4, by, 108, 11, { color: B.color, notch: 2 });
    drawIcon(ctx, B.icon, 10, by + 5.5, 9, 1);
    uiText(ctx, B.label.toUpperCase(), 17, by + 8, { size: T.small, color: B.color });
    uiBar(ctx, 64, by + 3, 44, 5, left / ((B.dur || 1) * (1 + Save.bonus('buffTime'))), B.color);
    by += 13;
  }
}

function deathScreenFor(t) {
  if (Math.abs(t - DEATH_SECRET_AT) < 0.1) return 'deathSecret1';              // Geheimscreen: genau zu dieser Sekunde sterben (config.js)
  let name = 'death1';
  for (const [from, img] of DEATH_SCREENS) if (t > from) name = img;
  return name;
}

// Aufforderung unten ("PRESS SPACE ...") mit leichtem Pulsieren
function drawPrompt(ctx, text, y) {
  const P = STYLE.pal;
  const pulse = 0.65 + 0.35 * Math.sin(G.realTime * 4);
  ctx.save();
  ctx.globalAlpha = pulse;
  uiPanel(ctx, STAGE_W / 2 - 90, y - 10, 180, 22, { color: P.red, glow: true });
  uiText(ctx, text, STAGE_W / 2, y + 5, { size: STYLE.type.h2, color: P.red, align: 'center' });
  ctx.restore();
}

// Reihe von Knoepfen (Maus/Touch) am Todes-/Endbildschirm: items = [[Beschriftung, Tastencode]], mittig bei cy. Klick = Tastendruck (UIHit, Option key).
function drawKeyButtons(ctx, items, cy, color) {
  const P = STYLE.pal, n = items.length, gap = 10, h = 22;
  const w = Math.min(150, Math.floor((STAGE_W - 24 - (n - 1) * gap) / n));
  const x0 = STAGE_W / 2 - (n * w + (n - 1) * gap) / 2, m = Input.mouse, col = color || P.red;
  items.forEach(([label, key], i) => {
    const x = x0 + i * (w + gap), y = cy - h / 2, hot = m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h;
    UIHit.add(x, y, w, h, () => {}, { key });
    ctx.save();
    ctx.globalAlpha = hot ? 1 : 0.85;
    uiPanel(ctx, x, y, w, h, { color: hot ? P.ice : col, fill: hot ? P.greyMid : P.void, glow: hot });
    ctx.restore();
    uiText(ctx, label, x + w / 2, y + 15, { size: STYLE.type.h2, color: hot ? P.ice : col, align: 'center' });
  });
}

// Maussteuerung in Menues: jede Zeichenfunktion meldet ihre klickbaren Flaechen an (UIHit.add), UIHit.update (einmal pro Bild vor dem Menue-Update)
// setzt bei Mausbewegung die Auswahl (select) und macht aus einem Klick einen Tastendruck: Leertaste, oder bei Reglern (lr) Pfeil links/rechts je nach Seite.
// noConfirm = nur auswaehlen (Reiter). Rechtsklick = ESC, Mausrad = hoch/runter. Die Liste wird zu Beginn jedes Zeichnens geleert.
const UIHit = {
  list: [], hover: null, blocks: [],                                   // blocks = Scrollleisten: dort wird nichts darunter ausgewaehlt oder bestaetigt
  add(x, y, w, h, select, o = {}) { this.list.push({ x, y, w, h, select, lr: !!o.lr, noConfirm: !!o.noConfirm, esc: !!o.esc, key: o.key, act: o.act }); },
  under() {
    const m = Input.mouse;
    if (this.blocks.some((b) => m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h)) return null;
    for (let i = this.list.length - 1; i >= 0; i--) {                 // zuletzt gezeichnet = oben
      const h = this.list[i];
      if (m.x >= h.x && m.x <= h.x + h.w && m.y >= h.y && m.y <= h.y + h.h) return h;
    }
    return null;
  },
  update() {
    if (G.bindWait) return;                                            // beim Belegen einer Taste zaehlt nur die Tastatur
    if (UIScroll.id && !Input.mouseHeld) UIScroll.id = null;
    if (UIScroll.id) return;                                          // beim Ziehen einer Scrollleiste wird nichts ausgewaehlt
    const h = this.under();
    if (Input.mouse.moved && h) {
      const key = h.x + ',' + h.y;
      if (key !== this.hover) { this.hover = key; Sfx.play('tick'); }
      h.select();
    }
    if (G.mode === 'dead' || G.mode === 'ending') {                    // Todes-/Endbildschirm: nur die Knoepfe (h.key) loesen die jeweilige Taste aus
      if (Input.clicked) {
        if (h && h.key) Input.pressedNow[h.key] = true;
        else if (G.mode === 'ending' && G.endAge < ENDING_MENU_AT) Input.pressedNow.Space = true;       // Szene ueberspringen
      }
      return;
    }
    if (Input.clicked && h) {
      h.select();
      if (h.act) h.act();
      else if (h.key) Input.pressedNow[h.key] = true;
      else if (h.esc) Input.pressedNow.Escape = true;
      else if (!h.noConfirm) Input.pressedNow[h.lr ? (Input.mouse.x > h.x + h.w / 2 ? 'ArrowRight' : 'ArrowLeft') : 'Space'] = true;
    }
    if (Input.rightClicked) Input.pressedNow.Escape = true;
    const wheel = Input.wheel || Input.takeSwipe();                    // Mausrad oder Wischen mit dem Finger
    if (wheel) Input.pressedNow[G.mode === 'pick' ? (wheel > 0 ? 'ArrowRight' : 'ArrowLeft') : (wheel > 0 ? 'ArrowDown' : 'ArrowUp')] = true;
  },
};

// Zurück-Knopf aller Menüs: rotes X oben rechts (Klick = ESC). Wird in G.draw am Ende gezeichnet, liegt also über allem.
function drawCloseX(ctx) {
  const P = STYLE.pal, s = 30, x = STAGE_W - s - 8, y = 8, m = Input.mouse, hot = m.x >= x && m.x <= x + s && m.y >= y && m.y <= y + s;
  UIHit.add(x - 2, y - 2, s + 4, s + 4, () => {}, { esc: true });
  ctx.save();
  ctx.fillStyle = hot ? '#3a0a0a' : P.void; ctx.globalAlpha = 0.95; ctx.fillRect(x, y, s, s);
  ctx.globalAlpha = 1; ctx.strokeStyle = hot ? '#ff6060' : '#d01c1c'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
  ctx.fillStyle = hot ? '#ff6060' : '#f02828';
  for (let i = 7; i < s - 7; i++) { ctx.fillRect(x + i - 1, y + i - 1, 3, 3); ctx.fillRect(x + s - i - 2, y + i - 1, 3, 3); }
  ctx.restore();
}
// Kaufbestaetigung (G.confirm, siehe G.openConfirm): Fenster mit BUY und CANCEL. Liegt oben, darunter ist nichts klickbar.
function drawConfirm(ctx) {
  const P = STYLE.pal, T = STYLE.type, c = G.confirm, w = 280, h = 110, x = STAGE_W / 2 - w / 2, y = 120, m = Input.mouse;
  UIHit.list.length = 0;
  ctx.save(); ctx.globalAlpha = 0.75; ctx.fillStyle = P.ink; ctx.fillRect(0, 0, STAGE_W, STAGE_H); ctx.restore();
  uiPanel(ctx, x, y, w, h, { color: P.yellow, fill: P.void, alpha: 0.98, glow: true });
  uiText(ctx, 'CONFIRM PURCHASE', STAGE_W / 2, y + 20, { size: T.h2, color: P.yellow, align: 'center' });
  uiText(ctx, uiFit(ctx, c.name, w - 24, T.h2), STAGE_W / 2, y + 44, { size: T.h2, color: P.ice, align: 'center' });
  uiText(ctx, c.price + ' CREDITS', STAGE_W / 2, y + 60, { size: T.body, color: P.yellow, align: 'center' });
  const bw = 112, by = y + h - 34, btns = [['BUY', 'Space', P.green], ['CANCEL', 'Escape', P.red]];
  btns.forEach(([label, key, col], i) => {
    const bx = x + 20 + i * (bw + 16), hot = c.sel === i || (m.x >= bx && m.x <= bx + bw && m.y >= by && m.y <= by + 24);
    UIHit.add(bx, by, bw, 24, () => { c.sel = i; }, { key: 'Space' });
    uiPanel(ctx, bx, by, bw, 24, { color: hot ? P.ice : col, fill: hot ? P.greyMid : P.void, glow: hot });
    uiText(ctx, label, bx + bw / 2, by + 17, { size: T.h2, color: hot ? P.ice : col, align: 'center' });
  });
}

// Hintergrundbild eines Menüs über die ganze (16:9-)Breite
function drawMenuBg(ctx, name, keepRatio) {
  const im = IMG[name];
  if (!im || !im.ok) return;
  if (!keepRatio || STAGE_W === 480) { ctx.drawImage(im.img, 0, 0, STAGE_W, STAGE_H); return; }
  // Bilder mit Figuren (Death-Screens): unverzerrt in der Mitte, links und rechts eine abgedunkelte gestreckte Kopie als Hintergrund
  ctx.drawImage(im.img, 0, 0, STAGE_W, STAGE_H);
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.drawImage(im.img, (STAGE_W - 480) / 2, 0, 480, STAGE_H);
}

// Scrollleiste (vertikal oder horizontal) fuer Menues mit mehr Eintraegen als Platz. Mit der Maus ziehen oder in die Leiste klicken
// (springt dorthin). Aufruf beim Zeichnen: set(neuerOffset) wird nur aufgerufen, solange gezogen wird. total/vis/off zaehlen Eintraege.
const UIScroll = {
  id: null, grab: 0, st: {},
  // Ausschnitt einer Liste: folgt der Auswahl, solange sie sich aendert (sel); sonst bestimmt die Scrollleiste. group = z. B. der Reiter (Wechsel setzt zurueck).
  win(id, group, sel, vis, total) {
    const S = this.st[id] || (this.st[id] = { off: 0, group: null, sel: null });
    if (S.group !== group || S.sel !== sel) {
      S.off = clamp(S.group === group ? S.off : 0, sel - (vis - 1), sel); S.group = group; S.sel = sel;
    }
    S.off = clamp(S.off, 0, Math.max(0, total - vis));
    return S;
  },
  bar(ctx, id, x, y, w, h, vertical, total, vis, off, set) {
    if (total <= vis) return;
    const P = STYLE.pal, len = vertical ? h : w, thumb = Math.max(16, Math.round(len * vis / total)), span = len - thumb, max = total - vis, m = Input.mouse;
    const at = (v) => v - (vertical ? y : x), pad = Input.touchSeen ? 12 : 4;           // Finger brauchen eine breitere Trefferflaeche
    const inside = m.x >= x - pad && m.x <= x + w + pad && m.y >= y - pad && m.y <= y + h + pad;
    UIHit.blocks.push({ x: x - pad, y: y - pad, w: w + 2 * pad, h: h + 2 * pad });
    let pos = Math.round(off / max * span);
    if (Input.clicked && inside) {
      const p = at(vertical ? m.y : m.x);
      this.id = id; this.grab = (p >= pos && p <= pos + thumb) ? p - pos : thumb / 2;       // Griff gepackt oder in die Leiste geklickt
    }
    if (!Input.mouseHeld && this.id === id) this.id = null;
    if (this.id === id) {
      const p = at(vertical ? m.y : m.x) - this.grab;
      set(clamp(Math.round(clamp(p / span, 0, 1) * max), 0, max));
      pos = Math.round(clamp(at(vertical ? m.y : m.x) - this.grab, 0, span));
    }
    const hot = this.id === id || inside;
    ctx.save();
    ctx.fillStyle = P.void; ctx.globalAlpha = 0.9; ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1; ctx.strokeStyle = P.greyMid; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = hot ? P.cyan : P.grey;
    if (vertical) ctx.fillRect(x + 1, y + pos, w - 2, thumb); else ctx.fillRect(x + pos, y + 1, thumb, h - 2);
    ctx.restore();
  },
};

// Menüzeile: gewählte Zeile hat cyanen Rahmen, Glühen und Pfeil. opts.hit = Auswahl per Maus (siehe UIHit), opts.lr = Regler
function drawMenuRow(ctx, y, text, sel, opts = {}) {
  const P = STYLE.pal, T = STYLE.type, w = opts.w || 190, h = opts.h || 24, cx = opts.cx === undefined ? STAGE_W / 2 : opts.cx, x = cx - w / 2, ty = y + Math.round(h / 2) + 5;
  if (opts.hit) UIHit.add(x, y, w, h, opts.hit, { lr: opts.lr });
  uiPanel(ctx, x, y, w, h, { color: opts.locked ? P.greyDark : sel ? P.cyan : P.greyMid, fill: P.void, alpha: 0.9, glow: sel && !opts.locked });
  uiText(ctx, text, cx, ty, { size: T.h2, color: opts.locked ? P.greyMid : sel ? P.ice : P.grey, align: 'center' });
  if (opts.locked) uiText(ctx, 'LV ' + opts.locked, x + w - 10, ty, { size: T.small, color: P.orange, align: 'right' });       // gesperrt bis zu diesem Spielerlevel
  if (sel) uiText(ctx, '>', x + 10, ty, { size: T.h2, color: opts.locked ? P.grey : P.cyan });
}

// Spielerlevel-Leiste: "LV n" und ein Balken bis zum naechsten Level (Hauptmenue, Todesbildschirm)
function drawLevelBar(ctx, x, y, w, info) {
  const P = STYLE.pal, T = STYLE.type, I = info || Save.levelInfo(), f = I.need ? I.xp / I.need : 1;
  uiText(ctx, 'LV ' + I.lv, x, y, { size: T.h2, color: P.yellow });
  const bx = x + 34, bw = w - 34;
  ctx.save();
  ctx.fillStyle = P.greyDark; ctx.fillRect(bx, y - 7, bw, 7);
  ctx.fillStyle = P.yellow; ctx.fillRect(bx, y - 7, Math.round(bw * f), 7);
  ctx.restore();
  uiText(ctx, I.need ? I.xp + ' / ' + I.need + ' XP' : 'MAX', bx + bw, y + 10, { size: T.small, color: P.grey, align: 'right' });
}

// Glühende Funken, die im Hauptmenü aufsteigen (reine Formel aus Zeit und Nummer, kein Zustand nötig)
function drawEmbers(ctx) {
  const P = STYLE.pal, t = G.realTime;
  ctx.save();
  for (let i = 0; i < 46; i++) {
    const speed = 12 + (i * 13) % 26, span = STAGE_H + 30;
    const y = STAGE_H + 10 - ((t * speed + i * 53) % span);
    const x = (i * 97) % STAGE_W + Math.sin(t * 0.8 + i) * 8;
    const life = 1 - (STAGE_H + 10 - y) / span;                          // oben verglühen sie
    ctx.globalAlpha = 0.55 * life * (0.6 + 0.4 * Math.sin(t * 5 + i * 3));
    ctx.fillStyle = i % 3 === 0 ? P.yellow : i % 3 === 1 ? P.orange : P.red;
    const s = i % 4 === 0 ? 2 : 1;
    ctx.fillRect(Math.round(x), Math.round(y), s, s);
  }
  ctx.restore();
}

// Kleiner pulsierender Hinweispunkt neben einer Menuezeile
function uiHintDot(ctx, x, y, t) {
  ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6); ctx.fillStyle = STYLE.pal.yellow;
  ctx.fillRect(x - 3, y - 3, 6, 6); ctx.restore();
}

// Ist eine ausgeruestete Waffe/ein Implant bereit zum Level-up (XP-Balken voll und genug Cores)?
function gearReady() {
  return CFG.items.slots.some((S) => { const id = Save.equipped(S.id); return id && Save.gearLv(id) < Save.gearMax() && Save.gearFrac(id) >= 1 && Save.data.souls >= Save.gearPrice(id); });
}

function drawStartScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type, t = G.realTime;
  if (!Cos2.drawMenuBg(ctx, Cos.cur('menubg'), t, 0, 0, STAGE_W, STAGE_H)) drawMenuBg(ctx, 'startscreen');       // Cosmetic: animierter Hintergrund
  drawEmbers(ctx);
  // Titel: pulsierendes Glühen, ab und zu ein kurzes cyanes Flackern (Glitch)
  ctx.save();
  if (Math.sin(t * 2.3) > 0.93) { ctx.globalAlpha = 0.6; uiText(ctx, 'DEATHARENA', STAGE_W / 2 + 2, 99, { size: T.title, color: P.cyan, align: 'center' }); }
  ctx.restore();
  uiText(ctx, 'DEATHARENA', STAGE_W / 2, 98 + Math.sin(t * 1.5) * 1.2, { size: T.title, color: P.red, align: 'center', glow: P.red });
  uiText(ctx, 'ONE WAY TICKET TO HELL', STAGE_W / 2, 124, { size: T.h2, color: P.yellow, align: 'center' });
  const labels = { play: 'PLAY', inventory: 'INVENTORY', cosmetics: 'COSMETICS', upgrades: 'UPGRADES', achievements: 'ACHIEVEMENTS', settings: 'SETTINGS', stats: 'STATISTICS' };
  menuItems().forEach((id, i) => {
    const y = 134 + i * 28;
    const lock = CFG.level.gates[id] && !Save.gateOpen(id) ? CFG.level.gates[id] : 0;
    drawMenuRow(ctx, y, labels[id], G.menuSel === i, { h: 22, hit: () => { G.menuSel = i; }, locked: lock });
    const dot = (id === 'play' && !Save.data.tutorialDone) || (id === 'upgrades' && ((Save.data.tutorialDone && !Save.data.upgradesSeen) || guideStep()));          // Hinweispunkt: erst das Tutorial, danach einmal die Upgrades (weg, sobald man dort war)
    if (dot || (id === 'settings' && !Save.data.settingsSeen)) uiHintDot(ctx, STAGE_W / 2 + 104, y + 11, t);
  });
  drawMenuIcons(ctx);
  drawSyncIndicator(ctx);
  uiText(ctx, 'LV ' + Save.plevel(), 12, 346, { size: T.h2, color: P.yellow });          // Hauptmenü: nur die Zahl, der Balken ist im Inventar
  const best = Save.data.best > 0 ? formatTime(Save.data.best) : '-', L = Save.data.last;
  uiText(ctx, 'BEST ' + best + '    RUNS ' + Save.data.runs + (Save.data.wins ? '    WINS ' + Save.data.wins : '') + '    CREDITS ' + Save.data.souls, STAGE_W / 2, 316, { size: T.body, color: P.ice, align: 'center' });
  if (L) uiText(ctx, 'LAST RUN ' + formatTime(L.time) + '  -  ' + L.bosses + ' BOSSES  -  ' + L.kills + ' KILLS' + (L.infinite ? '  (INFINITE)' : ''), STAGE_W / 2, 329, { size: T.small, color: P.grey, align: 'center' });
}

// Sync-Anzeige oben links im Hauptmenue: drehender Pixelring waehrend des Abgleichs, danach kurz "SAVED" (gruen) oder "SYNC FAILED" / "OFFLINE"
function drawSyncIndicator(ctx) {
  const upd = PWA.updateAt > 0;
  if (!Account.on && !upd) return;
  const P = STYLE.pal, T = STYLE.type, now = Date.now(), busy = upd || Account.syncing > 0 || now < Account.spinUntil, since = now - Account.doneAt, x = 36, y = 34;
  if (!busy && !(since < 2200 && Account.doneAt)) return;
  ctx.save();
  if (busy) {
    const head = Math.floor(G.realTime * 10) % 8;                                  // 8 Pixel im Kreis, der Kopf wandert, der Schweif wird dunkler
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2, age = (head - k + 8) % 8;
      ctx.globalAlpha = Math.max(0.15, 1 - age * 0.14); ctx.fillStyle = P.cyan;
      ctx.fillRect(Math.round(x + Math.sin(a) * 9) - 2, Math.round(y - Math.cos(a) * 9) - 2, 4, 4);
    }
    ctx.globalAlpha = 1; uiText(ctx, upd ? 'UPDATING' : 'SYNCING', x + 18, y + 4, { size: T.small, color: P.cyan });
  } else {
    ctx.globalAlpha = Math.min(1, (2200 - since) / 500);
    const ok = Account.doneOk, col = ok ? P.green : Account.doneOffline ? P.grey : P.red;
    ctx.fillStyle = col;
    if (ok) { [[-6, 0], [-4, 2], [-2, 4], [0, 2], [2, 0], [4, -2], [6, -4]].forEach(([dx, dy]) => ctx.fillRect(x + dx - 1, y + dy - 1, 3, 3)); }       // Haken
    else { for (let k = -5; k <= 5; k += 2) { ctx.fillRect(x + k - 1, y + k - 1, 3, 3); ctx.fillRect(x + k - 1, y - k - 1, 3, 3); } }                     // Kreuz
    uiText(ctx, ok ? 'SAVED' : Account.doneOffline ? 'OFFLINE' : 'SYNC FAILED', x + 18, y + 4, { size: T.small, color: col });
  }
  ctx.restore();
}

// ---- Kleine Symbole oben rechts im Hauptmenue: Konto, Musik, Sound, Effekte, Vollbild ----
const MENU_ICON_ART = {
  board: ['XXXXXXXXX', 'X.XXXXX.X', 'X.XXXXX.X', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....', '...XXX...', '..XXXXX..'],
  stats: ['......X..', '......X..', '..X...X..', '..X...X.X', '..X.X.X.X', 'X.X.X.X.X', 'X.X.X.X.X', 'X.X.X.X.X'],
  install: ['....X....', '....X....', '....X....', '..X.X.X..', '...XXX...', '....X....', 'X.......X', 'XXXXXXXXX'],
  account: ['...XXX...', '..XXXXX..', '..XXXXX..', '...XXX...', '.XXXXXXX.', 'XXXXXXXXX', 'XXXXXXXXX', 'XXXXXXXXX'],
  music: ['....XXXX', '....XXXX', '....X..X', '....X...', '....X...', '..XXX...', '.XXXX...', '.XXXX...', '..XX....'],
  sfx: ['...X.....', '..XX...X.', 'XXXX....X', 'XXXX..X.X', 'XXXX..X.X', 'XXXX....X', '..XX...X.', '...X.....'],
  fx: ['....X....', '....X....', '...XXX...', '..XXXXX..', 'XXXXXXXXX', '..XXXXX..', '...XXX...', '....X....', '....X....'],
  fullscreen: ['XXX...XXX', 'X.......X', 'X.......X', '.........', '.........', '.........', 'X.......X', 'X.......X', 'XXX...XXX'],
};
function drawMenuIcons(ctx) {
  const P = STYLE.pal, T = STYLE.type, t = G.realTime, m = Input.mouse, S = 26, GAP = 4;
  const ids = (statsOpen() ? ['stats'] : []).concat(['board', 'account'], PWA.visible ? ['install'] : [], ['music', 'sfx', 'fx', 'fullscreen']);
  const pct = (v) => Math.round(v * 100) + '%';
  const info = {
    stats: { name: 'STATISTICS (ALL SLOTS)', lvl: -1 },
    board: { name: 'LEADERBOARD [B]', lvl: -1 },
    install: { name: 'INSTALL AS APP' + (PWA.offlineReady ? ' (OFFLINE READY)' : ''), lvl: -1 },
    account: { name: Account.on ? 'ACCOUNT: ' + Account.meta.name.toUpperCase() : (Account.configured ? 'NOT LOGGED IN - CLICK TO LOG IN' : 'ACCOUNT (NOT SET UP)'), lvl: -1 },
    music: { name: 'MUSIC ' + pct(Save.data.musicVol), lvl: Save.data.musicVol },
    sfx: { name: 'SOUND FX ' + pct(Save.data.sfxVol), lvl: Save.data.sfxVol },
    fx: { name: 'EFFECTS: ' + ['OFF', 'REDUCED', 'FULL'][Juice.level], lvl: Juice.level / 2 },
    fullscreen: { name: 'FULLSCREEN: ' + (document.fullscreenElement ? 'ON' : 'OFF'), lvl: -1 },
  };
  const x0 = STAGE_W - 8 - ids.length * S - (ids.length - 1) * GAP, y = 8;
  let tip = null;
  ids.forEach((id, i) => {
    const x = x0 + i * (S + GAP), hot = m.x >= x && m.x <= x + S && m.y >= y && m.y <= y + S + 6;
    const off = (id === 'music' || id === 'sfx') && info[id].lvl <= 0.001 || (id === 'fx' && Juice.level === 0);
    const col = id === 'stats' || id === 'board' ? P.yellow : id === 'install' ? P.green : id === 'account' ? (Account.on ? P.green : P.orange) : off ? P.greyMid : P.cyan;
    UIHit.add(x, y, S, S + 6, () => {}, { act: () => G.menuQuick(id) });
    uiPanel(ctx, x, y, S, S, { color: hot ? P.ice : col, fill: P.void, alpha: 0.9, glow: hot });
    const art = MENU_ICON_ART[id], sc = 2, aw = art[0].length * sc, ah = art.length * sc, ax = x + Math.round((S - aw) / 2), ay = y + Math.round((S - ah) / 2);
    ctx.save(); ctx.fillStyle = hot ? P.ice : col;
    art.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) if (row[rx] === 'X') ctx.fillRect(ax + rx * sc, ay + ry * sc, sc, sc); });
    if (off) { ctx.fillStyle = P.red; for (let k = 3; k < S - 3; k++) ctx.fillRect(x + k, y + S - 1 - k, 3, 3); }             // durchgestrichen = aus
    if (info[id].lvl >= 0) { const n = id === 'fx' ? 3 : 4, on = id === 'fx' ? Juice.level + 1 : Math.round(info[id].lvl * 3) + (info[id].lvl > 0.001 ? 1 : 0); for (let k = 0; k < n; k++) { ctx.fillStyle = k < on ? col : P.greyDark; ctx.fillRect(x + 3 + k * Math.floor((S - 6) / n), y + S + 2, Math.floor((S - 6) / n) - 2, 3); } }
    if (id === 'account') {                                                         // Anzeige: gruener Punkt = angemeldet, roter blinkender Punkt = nicht angemeldet
      const c = !Account.configured ? P.greyMid : Account.on ? P.green : P.red, blink = Account.on || !Account.configured ? 1 : 0.5 + 0.5 * Math.sin(t * 6) ** 2;
      ctx.globalAlpha = 1; ctx.fillStyle = P.void; ctx.fillRect(x + S - 8, y - 5, 12, 12);
      ctx.globalAlpha = blink; ctx.fillStyle = c; ctx.fillRect(x + S - 6, y - 3, 8, 8);
    }
    ctx.restore();
    if (hot) tip = info[id].name;
  });
  if (tip) uiText(ctx, tip, STAGE_W - 8, y + S + 18, { size: T.small, color: P.ice, align: 'right' });
}

// Modus-Auswahl nach PLAY: Regular / Infinite / Tutorial, darunter eine Kurzbeschreibung des gewählten Modus
function drawModeSelectScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type, t = G.realTime;
  const labels = { regular: 'REGULAR', infinite: 'INFINITE MODE', speedrun: 'SPEEDRUN', pvp: 'PVP ARENA', tutorial: 'TUTORIAL', back: 'BACK' };
  const descs = {
    regular: ['The classic run on a walled map. Choose map and difficulty next.', 'Survive the waves and bosses, face Death at the end.'],
    infinite: ['An endless map without walls. Choose map and final boss time next.', 'Credits x' + CFG.infinite.coreFactor + ', own best time.'],
    speedrun: ['Race the clock: Boss Rush, Gauntlet and Seed Run, each with its own best time.', 'Same standard loadout for everyone (you only pick your weapons). No credits, no XP. Death ends the run.'],
    pvp: ['Fight other players in an arena. Create a lobby and share the code, or join a friend with their code.', 'Up to 4 players, all vs all or in teams. Your own weapons, abilities and upgrades count. Needs an internet connection.'],
    tutorial: ['A short guided level that teaches the basics.', 'You cannot die. Nothing is saved.'],
    back: ['Back to the main menu.', ''],
  };
  drawMenuBg(ctx, 'keysettings');
  drawEmbers(ctx);
  uiText(ctx, 'CHOOSE A MODE', STAGE_W / 2, 56, { size: T.h1, color: P.yellow, align: 'center', glow: P.yellow });
  const lw = 300, lcx = 40 + lw / 2, PX = 40 + lw + 24, PW = STAGE_W - 40 - PX, top = 90, GAP = 38, RH = 30;          // 6 Modi, zusammen so hoch wie das Info-Feld          // links die Modi, rechts das Info-Feld
  MODE_ITEMS.forEach((id, i) => {
    const y = top + i * GAP;
    const lock = CFG.level.gates[id] && !Save.gateOpen(id) ? CFG.level.gates[id] : 0;
    drawMenuRow(ctx, y, labels[id], G.modeSel === i, { w: lw, h: RH, cx: lcx, hit: () => { G.modeSel = i; }, locked: lock });
    if (id === 'tutorial' && !Save.data.tutorialDone) uiHintDot(ctx, 40 + lw + 8, y + 18, t);
  });
  const id = MODE_ITEMS[G.modeSel], d = descs[id], mc = { regular: P.yellow, infinite: P.cyan, speedrun: P.orange, pvp: P.red, tutorial: P.green }[id] || P.ice;
  uiPanel(ctx, PX, top, PW, MODE_ITEMS.length * GAP - (GAP - RH), { color: mc, fill: P.void, alpha: 0.92, glow: true });
  uiText(ctx, labels[id], PX + 14, top + 24, { size: T.h1, color: mc });
  let ty = top + 48;
  ty += 13 * uiWrap(ctx, d[0], PX + 14, ty, PW - 28, 13, { size: T.body, color: P.ice }) + 6;
  ty += 13 * uiWrap(ctx, d[1], PX + 14, ty, PW - 28, 13, { size: T.body, color: P.grey }) + 6;
  if (CFG.level.gates[id] && !Save.gateOpen(id)) uiWrap(ctx, 'LOCKED: reach player level ' + CFG.level.gates[id] + ' (you are level ' + Save.plevel() + '). Every run earns XP.', PX + 14, ty, PW - 28, 13, { size: T.body, color: P.orange });
}

// Endlos-Modus vor dem Start: Zeitpunkt des finalen Bosses wählen
function drawInfSetupScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type, m = CFG.infinite.finalMinutes[Save.data.infSel];
  drawMenuBg(ctx, 'keysettings');
  drawEmbers(ctx);
  uiText(ctx, 'INFINITE MODE', STAGE_W / 2, 56, { size: T.h1, color: P.cyan, align: 'center', glow: P.cyan });
  const mapName = CFG.maps[Save.mapUnlocked(Save.data.mapSel) ? Save.data.mapSel : 0].name;
  const rows = ['FINAL BOSS: ' + (m === null ? 'NEVER (ENDLESS)' : 'AFTER ' + m + ' MIN'), 'MAP: ' + mapName, 'START', 'BACK'];
  const lw = 330, PX = 40 + lw + 24, PW = STAGE_W - 40 - PX, top = 90, GAP = 46;
  rows.forEach((r, i) => drawMenuRow(ctx, top + i * GAP, r, G.infSel === i, { w: lw, h: 36, cx: 40 + lw / 2, hit: () => { G.infSel = i; }, lr: i < 2 }));
  uiPanel(ctx, PX, top, PW, rows.length * GAP - 10, { color: P.cyan, fill: P.void, alpha: 0.92, glow: true });
  uiText(ctx, 'HOW IT WORKS', PX + 14, top + 20, { size: T.h2, color: P.cyan });
  let ty = top + 40;
  ty += 12 * uiWrap(ctx, 'An endless map without walls. Enemies keep coming from every side.', PX + 14, ty, PW - 28, 12, { size: T.body, color: P.ice }) + 6;
  ty += 12 * uiWrap(ctx, 'Choose when the final boss (Death) arrives. Beat him to win.', PX + 14, ty, PW - 28, 12, { size: T.body, color: P.grey }) + 10;
  uiText(ctx, 'CREDITS x' + CFG.infinite.coreFactor, PX + 14, ty, { size: T.body, color: P.yellow });
  uiText(ctx, 'OWN BEST TIME: ' + (Save.data.bestInf > 0 ? formatTime(Save.data.bestInf) : '-'), PX + 14, ty + 14, { size: T.body, color: P.yellow });
}

// Kartenauswahl nach PLAY: drei Karten nebeneinander, gesperrte zeigen, was zum Freischalten fehlt
function drawMapSelectScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type, n = CFG.maps.length, gap = n > 3 ? 6 : 12, w = Math.min(140, Math.floor((STAGE_W - 20 - (n - 1) * gap) / n)), x0 = STAGE_W / 2 - (n * w + (n - 1) * gap) / 2, y = 70, h = 215, small = w < 130;
  drawMenuBg(ctx, 'keysettings');
  uiText(ctx, 'CHOOSE A MAP', STAGE_W / 2, 44, { size: T.h1, color: P.yellow, align: 'center' });
  CFG.maps.forEach((M, i) => {
    const x = x0 + i * (w + gap), sel = Save.data.mapSel === i, open = Save.mapUnlocked(i), yy = sel ? y - 6 : y, col = open ? M.frame : P.greyMid;
    UIHit.add(x, y - 6, w, h + 6, () => { Save.data.mapSel = i; G.mapBack = false; });
    uiPanel(ctx, x, yy, w, h, { color: sel ? col : P.greyMid, fill: P.void, alpha: 0.95, glow: sel });
    const im = IMG[M.ground];
    if (im && im.ok) { ctx.save(); ctx.globalAlpha = open ? 1 : 0.25; ctx.drawImage(im.img, 0, 0, 400, 240, x + 5, yy + 5, w - 10, 78); ctx.restore(); }
    uiText(ctx, small ? uiFit(ctx, M.name, w - 8, T.body) : M.name, x + w / 2, yy + 100, { size: small ? T.body : T.h2, color: open ? P.ice : P.grey, align: 'center' });
    if (small) uiWrap(ctx, M.desc, x + w / 2, yy + 111, w - 10, 9, { size: T.small, color: P.grey, align: 'center' }); else uiText(ctx, M.desc, x + w / 2, yy + 114, { size: T.small, color: P.grey, align: 'center', maxW: w - 12 });
    uiText(ctx, small ? 'LEVEL' : 'DIFFICULTY', x + 10, yy + 134, { size: T.small, color: P.grey });
    for (let k = 0; k < 4; k++) { ctx.fillStyle = k < M.level ? col : P.greyDark; ctx.fillRect(x + w - 8 - (4 - k) * 14, yy + 127, 11, 8); }
    uiText(ctx, 'CREDITS x' + M.diff.cores, x + 10, yy + 150, { size: T.small, color: open ? P.yellow : P.grey });
    if (open) {
      uiText(ctx, 'BEST ' + (Save.mapBestTime(i) > 0 ? formatTime(Save.mapBestTime(i)) : '-'), x + 10, yy + 165, { size: T.small, color: P.ice });
      uiText(ctx, 'HAZARDS', x + 10, yy + 181, { size: T.small, color: P.grey });
      (M.hazards && M.hazards.length ? M.hazards : ['NONE']).forEach((hz, k) => uiText(ctx, hz, x + 10, yy + 193 + k * 11, { size: T.small, color: M.hazards ? P.orange : P.greyMid }));
    } else {
      uiText(ctx, 'LOCKED', x + w / 2, yy + 172, { size: T.h2, color: P.red, align: 'center' });
      uiText(ctx, 'REACH ' + formatTime(Save.mapNeed(i)), x + w / 2, yy + 188, { size: T.small, color: P.grey, align: 'center' });
      uiText(ctx, 'ON ' + CFG.maps[i - 1].name, x + w / 2, yy + 200, { size: T.small, color: P.grey, align: 'center' });
    }
  });
  drawMenuRow(ctx, 292, 'BACK', G.mapBack, { w: 190, h: 22, hit: () => { G.mapBack = true; } });
}

function drawUpgradesScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type;
  drawMenuBg(ctx, 'keysettings');
  uiText(ctx, 'UPGRADES', STAGE_W / 2, 40, { size: T.h1, color: P.yellow, align: 'center' });
  uiText(ctx, 'CREDITS: ' + Save.data.souls, STAGE_W / 2, 58, { size: T.h2, color: P.yellow, align: 'center' });
  const guide = guideStep();
  // Reiter
  const tw = Math.min(130, (STAGE_W - 40) / UPGRADE_TABS.length);
  UPGRADE_TABS.forEach((t, i) => {
    const tx = STAGE_W / 2 - (UPGRADE_TABS.length * tw) / 2 + i * tw, on = G.upgradeTab === i;
    UIHit.add(tx + 2, 66, tw - 4, 18, () => { if (G.upgradeTab !== i) { G.upgradeTab = i; G.upgradeSel = 0; } }, { noConfirm: true });
    uiPanel(ctx, tx + 2, 66, tw - 4, 18, { color: on ? P.yellow : P.greyMid, fill: P.void, alpha: 0.9, glow: on });
    uiText(ctx, t.label, tx + tw / 2, 79, { size: T.small, color: on ? P.yellow : P.grey, align: 'center' });
    if (guide && guide.tab === t.id && !on) uiHintDot(ctx, tx + tw - 9, 75, G.realTime);          // gefuehrter Kauf: Punkt am Reiter
  });
  const rows = upgradeRows(UPGRADE_TABS[G.upgradeTab].id).concat([{ kind: 'back' }]);
  const GROUP_COLORS = [P.cyan, P.yellow, P.orange, P.green, P.purple];
  const curRow = rows[G.upgradeSel];
  if (curRow && curRow.kind !== 'back') {                              // Gruppe der gewaehlten Zeile + Position darin
    const g = upgradeGroup(curRow), same = rows.filter((q) => q.kind !== 'back' && upgradeGroup(q).label === g.label);
    uiText(ctx, g.label + '  ' + (same.indexOf(curRow) + 1) + '/' + same.length, 24, 98, { size: T.small, color: GROUP_COLORS[g.idx % GROUP_COLORS.length] });
  } else uiText(ctx, '< A / D >', 24, 98, { size: T.small, color: P.grey });
  const w = 372, x = 24, H = 34, GAP = 37, Y0 = 106, DX = x + w + 22, DW = STAGE_W - 24 - DX;      // links die Liste, rechts das Detail-Feld
  const VIS = 6;
  const SW = UIScroll.win('upgrades', G.upgradeTab, G.upgradeSel, VIS, rows.length);
  UIScroll.bar(ctx, 'upgrades', x + w + 6, Y0, 6, VIS * GAP - 3, true, rows.length, VIS, SW.off, (v) => { SW.off = v; });
  const off = SW.off;
  rows.slice(off, off + VIS).forEach((r, k) => {
    const i = off + k, sel = G.upgradeSel === i, y = Y0 + k * GAP;
    if (r.kind === 'back') { drawMenuRow(ctx, y + 2, 'BACK', sel, { w: 190, cx: x + w / 2, hit: () => { G.upgradeSel = i; } }); return; }
    UIHit.add(x, y, w, H, () => { G.upgradeSel = i; }, { noConfirm: true });        // Klick waehlt nur aus, gekauft wird ueber den Knopf rechts (oder per Leertaste)
    uiPanel(ctx, x, y, w, H, { color: sel ? P.cyan : P.greyMid, fill: P.void, alpha: 0.9, glow: sel });
    const g = upgradeGroup(r);                                          // farbiger Streifen links = Gruppe, wechselt die Farbe, beginnt eine neue Gruppe
    ctx.fillStyle = GROUP_COLORS[g.idx % GROUP_COLORS.length]; ctx.fillRect(x + 1, y + 3, 3, H - 6);
    const nameCol = sel ? P.ice : P.grey;
    if (guide && guide.kind === r.kind && guide.id === r.id) uiHintDot(ctx, x - 9, y + H / 2, G.realTime);        // gefuehrter Kauf: Punkt an der Zeile
    if (r.kind === 'up') {
      const U = CFG.meta.upgrades[r.id], lvl = Save.level(r.id), maxed = lvl >= U.max, afford = Save.data.souls >= Save.cost(r.id);
      uiText(ctx, U.name, x + 10, y + 14, { size: T.h2, color: nameCol });
      uiText(ctx, lvl ? U.desc(Save.bonus(r.id)) : 'NOT PURCHASED', x + 10, y + 27, { size: T.small, color: P.grey });
      const bw = U.max > 6 ? 8 : 14;                                      // viele Stufen: schmalere Balken
      for (let n = 0; n < U.max; n++) uiBar(ctx, x + w - 10 - (U.max - n) * bw, y + 5, bw - 3, 5, n < lvl ? 1 : 0, P.cyan);
      uiText(ctx, maxed ? 'MAX' : Save.cost(r.id) + ' CREDITS', x + w - 10, y + 27, { size: T.small, color: maxed ? P.cyan : afford ? P.yellow : P.red, align: 'right' });
    } else if (r.kind === 'ability') {
      const A = CFG.loadout.abilities[r.id], open = Save.isUnlocked(r.id), afford = Save.data.souls >= A.unlock;
      drawIcon(ctx, A.icon, x + 20, y + H / 2, 20, open ? 1 : 0.4);
      uiText(ctx, A.name, x + 40, y + 14, { size: T.h2, color: nameCol });
      uiText(ctx, ({ weak: 'WEAK', medium: 'MEDIUM', strong: 'STRONG' })[A.tier] + (A.passive ? ' - PASSIVE' : ''), x + 40, y + 27, { size: T.small, color: P.grey });
      if (open) {
        const maxed = Save.gearLv(r.id) >= Save.gearMax(), up = Save.data.souls >= Save.gearPrice(r.id);
        drawGearBar(ctx, r.id, x + w - 130, y + 6, 120);
        uiText(ctx, maxed ? 'MAX LEVEL' : 'LEVEL UP ' + Save.gearPrice(r.id) + ' CREDITS', x + w - 10, y + 27, { size: T.small, color: maxed ? P.cyan : up ? P.yellow : P.red, align: 'right' });
      } else uiText(ctx, A.unlock + ' CREDITS', x + w - 10, y + 27, { size: T.small, color: afford ? P.yellow : P.red, align: 'right' });
    } else if (r.kind === 'hero') {
      const Hc = CFG.heroes[r.id], owned = Save.heroOwned(r.id), open = Save.heroOpen(r.id), sel2 = Save.heroSelected() === r.id, afford = Save.data.souls >= Hc.cost;
      const hm = Hc.milestone && CFG.milestones.find((q) => q.id === Hc.milestone);
      drawIcon(ctx, Cos.sprite(Hc.sprite, 'skin'), x + 20, y + H / 2, 22, owned || open ? 1 : 0.4);        // Modell mit dem ausgeruesteten Skin
      uiText(ctx, Hc.name, x + 40, y + 14, { size: T.h2, color: owned || open ? nameCol : P.greyMid });
      uiText(ctx, Hc.modText, x + 40, y + 27, { size: T.small, color: owned ? P.cyan : P.grey });
      let top, topCol, bot = Hc.artifact ? Input.label('artifact') + ': ' + Hc.artifact.name : 'NO ARTIFACT';
      if (sel2) { top = 'SELECTED'; topCol = P.cyan; }
      else if (owned) { top = 'SELECT [SPACE]'; topCol = P.ice; }
      else if (!open) { top = 'LOCKED'; topCol = P.red; bot = Math.floor(Save.statValue(hm.stat)) + ' / ' + hm.need; }
      else { top = Hc.cost + ' CREDITS'; topCol = afford ? P.yellow : P.red; }
      uiText(ctx, top, x + w - 10, y + 14, { size: T.small, color: topCol, align: 'right' });
      uiText(ctx, bot, x + w - 10, y + 27, { size: T.small, color: !owned && !open ? P.grey : P.yellow, align: 'right' });
    } else if (r.kind === 'milestone') {
      const m = CFG.milestones.find((q) => q.id === r.id), done = Save.milestoneDone(m.id);
      const fmt = (stat, v) => stat === 'best' || stat === 'bestInf' || String(stat).startsWith('mapbest:') ? formatTime(v) : String(Math.floor(v));
      uiText(ctx, m.name, x + 10, y + 14, { size: T.body, color: done ? P.ice : P.grey });
      uiText(ctx, 'REWARD: ' + milestoneRewardText(m), x + 10, y + 27, { size: T.small, color: done ? P.cyan : m.reward.cores ? P.yellow : P.grey });
      uiBar(ctx, x + w - 130, y + 6, 120, 6, Math.min(1, Save.statValue(m.stat) / m.need), done ? P.cyan : P.yellow);
      uiText(ctx, done ? 'DONE' : fmt(m.stat, Save.statValue(m.stat)) + ' / ' + fmt(m.stat, m.need), x + w - 10, y + 27, { size: T.small, color: done ? P.cyan : P.grey, align: 'right' });
    } else {
      const I = CFG.items.catalog[r.id], slot = CFG.items.slots.find((s) => s.id === I.slot);
      const owned = Save.owns(r.id), eq = Save.equipped(I.slot) === r.id, afford = Save.data.souls >= I.cost;
      drawIcon(ctx, I.icon, x + 20, y + H / 2, 20, I.impl ? 1 : 0.4);
      uiText(ctx, I.name, x + 40, y + 14, { size: T.h2, color: I.impl ? nameCol : P.greyMid });
      uiText(ctx, slot.label, x + 40, y + 27, { size: T.small, color: P.grey });
      let txt, col;
      if (!I.impl) { txt = 'SOON'; col = P.greyMid; }
      else if (eq) { txt = 'EQUIPPED'; col = P.cyan; }
      else if (owned) { txt = 'EQUIP [SPACE]'; col = P.ice; }
      else { txt = I.cost + ' CREDITS'; col = afford ? P.yellow : P.red; }
      uiText(ctx, txt, x + w - 10, y + 14, { size: T.small, color: col, align: 'right' });
    }
  });
  if (rows.length > VIS) uiText(ctx, (off > 0 ? '^ ' : '') + (off + VIS < rows.length ? 'v' : ''), x + w, 98, { size: T.small, color: P.grey, align: 'right' });
  const cur = rows[G.upgradeSel];
  if (cur && cur.kind !== 'back') {                                // Erklaerung zum gewaehlten Eintrag: Feld rechts neben der Liste
    const [la, lb] = detailWrapped(ctx, cur, DW - 20), top = Y0, bh = VIS * GAP - 3;
    uiPanel(ctx, DX, top, DW, bh, { color: P.cyanDark || P.greyMid, fill: P.void, alpha: 0.9 });
    uiText(ctx, 'DETAILS', DX + 10, top + 13, { size: T.small, color: P.cyan });
    la.forEach((l, i) => uiText(ctx, l, DX + 10, top + 30 + i * DETAIL_LH, { size: T.small, color: P.ice }));
    lb.forEach((l, i) => uiText(ctx, l, DX + 10, top + 34 + (la.length + i) * DETAIL_LH, { size: T.small, color: P.grey }));
    const act = upgradeAction(cur);
    if (act) { const abw = Math.min(220, DW - 20); drawActionButton(ctx, DX + DW / 2 - abw / 2, top + bh - 34, abw, 24, act); }   // bleibt mit Rand im Detail-Feld
  }
}

// Knopf im Detail-Feld (Upgrades) bzw. in der Vorschau (Cosmetics): Klick = Leertaste auf dem gewaehlten Eintrag (kaufen, freischalten, ausruesten).
// act = { label, color }. Die Tastatur geht weiter wie bisher (Leertaste/Enter).
function drawActionButton(ctx, x, y, w, h, act) {
  const P = STYLE.pal, m = Input.mouse, hot = m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h;
  UIHit.add(x, y, w, h, () => {});
  uiPanel(ctx, x, y, w, h, { color: act.color, fill: hot ? P.voidLight : P.void, alpha: 0.95, glow: hot });
  uiText(ctx, act.label, x + w / 2, y + h / 2 + 5, { size: STYLE.type.h2, color: hot ? P.ice : act.color, align: 'center' });
}
// Was die Leertaste beim gewaehlten Eintrag der Upgrade-Liste tut, als Knopfbeschriftung (null = keine Aktion moeglich)
function upgradeAction(r) {
  const P = STYLE.pal, souls = Save.data.souls, pay = (txt, price) => ({ label: txt + ' - ' + price + ' CREDITS', color: souls >= price ? P.yellow : P.red });
  if (r.kind === 'up') return Save.level(r.id) >= CFG.meta.upgrades[r.id].max ? null : pay('BUY', Save.cost(r.id));
  if (r.kind === 'ability') {
    if (!Save.isUnlocked(r.id)) return pay('UNLOCK', CFG.loadout.abilities[r.id].unlock);
    return Save.gearLv(r.id) >= Save.gearMax() ? null : pay('LEVEL UP', Save.gearPrice(r.id));
  }
  if (r.kind === 'hero') {
    if (Save.heroOwned(r.id)) return Save.heroSelected() === r.id ? null : { label: 'SELECT', color: P.cyan };
    return Save.heroOpen(r.id) ? pay('BUY', CFG.heroes[r.id].cost) : null;
  }
  if (r.kind === 'milestone') return null;
  const I = CFG.items.catalog[r.id];
  if (!I.impl) return null;
  if (!Save.owns(r.id)) return pay('BUY', I.cost);
  return { label: Save.equipped(I.slot) === r.id ? 'UNEQUIP' : 'EQUIP', color: P.cyan };
}

// Text auf eine Breite umbrechen (gibt die Zeilen zurueck, zeichnet nichts)
const DETAIL_LH = 12;
function wrapLines(ctx, text, maxW, size) {
  ctx.save(); ctx.font = uiFont(size);
  const out = []; let line = '';
  for (const w of String(I18n.t(text)).split(" ")) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  ctx.restore();
  return out;
}
// Die zwei Erklaerungstexte eines Eintrags, jeweils umgebrochen: [Zeilen von Text 1, Zeilen von Text 2]
function detailWrapped(ctx, row, maxW) { const l = upgradeDetail(row); return [wrapLines(ctx, l[0], maxW, STYLE.type.small), wrapLines(ctx, l[1], maxW, STYLE.type.small)]; }

// Zwei Zeilen Erklaerung zu einem Eintrag im Upgrade-Menue: was ist es, welche Zahlen stecken dahinter
function upgradeDetail(r) {
  if (r.kind === 'up') {
    const U = CFG.meta.upgrades[r.id], lvl = Save.level(r.id), next = (lvl + 1) * U.step;
    return [U.info || U.name, 'LEVEL ' + lvl + '/' + U.max + '   NOW: ' + (lvl ? U.desc(Save.bonus(r.id)) : '-') + (lvl < U.max ? '   NEXT: ' + U.desc(next) : '   (MAX)')];
  }
  if (r.kind === 'ability') {
    const A = CFG.loadout.abilities[r.id];
    return [A.desc, abilityFacts(r.id)];
  }
  if (r.kind === 'hero') {
    const Hc = CFG.heroes[r.id], hm = Hc.milestone && CFG.milestones.find((q) => q.id === Hc.milestone);
    const l1 = Save.heroOwned(r.id) ? Hc.blurb : !Save.heroOpen(r.id) ? 'UNLOCK: ' + hm.name + '  (' + Math.floor(Save.statValue(hm.stat)) + '/' + hm.need + '), THEN ' + Hc.cost + ' CREDITS' : 'MILESTONE DONE. BUY FOR ' + Hc.cost + ' CREDITS. ' + Hc.blurb;
    return [l1, Hc.artifact ? 'ARTIFACT: ' + Hc.artifact.desc : 'NO ARTIFACT. SKINS WORK ON EVERY HERO.'];
  }
  if (r.kind === 'milestone') {
    const m = CFG.milestones.find((q) => q.id === r.id);
    return [m.name + '  ->  ' + milestoneRewardText(m), m.reward.cores ? 'PAID OUT ONCE AS CREDITS WHEN REACHED.' : m.reward.hero ? 'LETS YOU BUY THIS HERO IN THE HEROES TAB (COSTS CREDITS TOO).' : ''];
  }
  const I = CFG.items.catalog[r.id], slot = CFG.items.slots.find((s) => s.id === I.slot);
  const own = Save.owns(r.id) ? (Save.equipped(I.slot) === r.id ? 'EQUIPPED' : 'OWNED') : I.cost + ' CREDITS';
  return [I.desc, slot.label + ' - ' + own + (itemFacts(r.id) ? ' - ' + itemFacts(r.id) : '')];
}

const s1 = (v) => (Math.round(v * 100) / 100) + 'S';
function abilityFacts(id) {
  const C = CFG[id], tier = ({ weak: 'WEAK', medium: 'MEDIUM', strong: 'STRONG' })[CFG.loadout.abilities[id].tier];
  const f = {
    dash: () => 'COOLDOWN ' + s1(CFG.dash.baseCooldown) + ', SHORTER WITH EACH BOSS',
    blink: () => 'DURATION ' + s1(C.duration) + ', COOLDOWN ' + s1(C.cooldown),
    shield: () => 'DURATION ' + s1(CFG.shield.duration) + ', COOLDOWN ' + s1(CFG.shield.cooldown) + ', RADIUS ' + CFG.shield.radius,
    frost: () => 'RADIUS ' + C.radius + ', STUNS ' + s1(C.stun) + ', COOLDOWN ' + s1(C.cooldown),
    pulse: () => 'RADIUS ' + C.radius + ', STUNS ' + s1(C.stun) + ', COOLDOWN ' + s1(C.cooldown),
    field: () => 'RADIUS ' + C.radius + ', ENEMIES ' + Math.round((1 - C.slow) * 100) + '% SLOWER, ALWAYS ON',
    surge: () => 'DURATION ' + s1(C.duration) + ', SPEED x' + C.mult + ', COOLDOWN ' + s1(C.cooldown),
    decoy: () => 'DURATION ' + s1(C.duration) + ', COOLDOWN ' + s1(C.cooldown) + ', BOSSES IGNORE IT',
    shockstep: () => 'RADIUS ' + C.radius + ', STUNS ' + s1(C.stun) + ', COOLDOWN ' + s1(C.cooldown),
    adrenaline: () => 'DURATION ' + s1(C.duration) + ', COOLDOWN ' + s1(C.cooldown),
    drone: () => 'DURATION ' + s1(C.duration) + ', FIRES EVERY ' + s1(C.every) + ', COOLDOWN ' + s1(C.cooldown),
    overcharge: () => '+' + C.amount + ' CHARGE, COOLDOWN ' + s1(C.cooldown),
    storm: () => C.count + ' BOLTS, RANGE ' + C.range + ', COOLDOWN ' + s1(C.cooldown),
    nano: () => '+' + CFG.nano.perSecond + ' HP/S, x' + CFG.nano.calmMul + ' AFTER ' + CFG.nano.calmAfter + 'S WITHOUT A HIT, ALWAYS ON',
    blades: () => CFG.blades.count + ' BLADES, HIT EVERY ' + s1(CFG.blades.hitEvery) + ', ALWAYS ON',
    hack: () => CFG.hack.count + ' ENEMIES FOR ' + s1(CFG.hack.life) + ', RADIUS ' + CFG.hack.radius + ', COOLDOWN ' + s1(CFG.hack.cooldown),
    necromancy: () => 'UP TO ' + CFG.necromancy.count + ' FALLEN FOR ' + s1(CFG.necromancy.life) + ', COOLDOWN ' + s1(CFG.necromancy.cooldown),
    stims: () => 'SPEED + RAPID FIRE + GUARD, COOLDOWN ' + s1(CFG.stims.cooldown),
    berserk: () => 'DURATION ' + s1(C.duration) + ', COOLDOWN ' + s1(C.cooldown),
    thrusters: () => '+' + Math.round(CFG.passives.thrusters.speed * 100) + '% MOVE SPEED, ALWAYS ON',
    scanner: () => 'AIM CONE x' + CFG.passives.scanner.deg + ', RANGE x' + CFG.passives.scanner.range + ', ALWAYS ON',
    barrier: () => '-' + Math.round(CFG.passives.barrier.reduce * 100) + '% DAMAGE TAKEN, ALWAYS ON',
    capacitor: () => '+' + Math.round(CFG.passives.capacitor.ult * 100) + '% ULTIMATE CHARGE FROM KILLS, ALWAYS ON',
    overclock: () => 'ATTACKS ' + Math.round((CFG.passives.overclock.rate - 1) * 100) + '% FASTER, ALWAYS ON',
    aegis: () => 'BELOW ' + CFG.passives.aegis.hp + ' HP: ' + s1(CFG.passives.aegis.protect) + ' INVULNERABLE, COOLDOWN ' + s1(CFG.passives.aegis.cooldown),
    bombard: () => C.count + ' STRIKES, RADIUS ' + C.radius + ', COOLDOWN ' + s1(C.cooldown),
  };
  return tier + ' - ' + (f[id] ? f[id]() : '');
}
function itemFacts(id) {
  const I = CFG.items, f = {
    sword: () => 'BEST VS SWARMS, SPEED GROWS OVER TIME',
    lance: () => 'RANGE ' + CFG.lance.reach + ', COOLDOWN ' + s1(CFG.lance.cooldown),
    shot: () => 'COOLDOWN ' + s1(CFG.shot.baseCooldown) + ', FASTER WITH EACH BOSS',
    impulse: () => 'COOLDOWN ' + s1(CFG.impulse.cooldown) + ', WIDTH ' + CFG.impulse.width * 2,
    whip: () => 'RANGE ' + CFG.whip.range + ', COOLDOWN ' + s1(CFG.whip.cooldown),
    katana: () => 'FRONT + BACK, COOLDOWN ' + s1(CFG.katana.cooldown),
    hammer: () => 'RADIUS ' + CFG.hammer.radius + ', COOLDOWN ' + s1(CFG.hammer.cooldown) + ', BOSSES x' + CFG.hammer.bossMul,
    shotgun: () => CFG.shotgun.pellets + ' PELLETS, COOLDOWN ' + s1(CFG.shotgun.cooldown),
    boomerang: () => 'FLIGHT ' + CFG.boomerang.outFrames + ' FRAMES, COOLDOWN ' + s1(CFG.boomerang.cooldown),
    molotov: () => CFG.molotov.patches + ' FIRE PATCHES, COOLDOWN ' + s1(CFG.molotov.cooldown),
    chain: () => 'UP TO ' + CFG.chain.jumps + ' TARGETS, COOLDOWN ' + s1(CFG.chain.cooldown),
    blackhole: () => 'PULL ' + s1(CFG.blackhole.life) + ', RADIUS ' + CFG.blackhole.radius + ', COOLDOWN ' + s1(CFG.blackhole.cooldown),
    rocket: () => 'BLAST ' + CFG.rocket.blast + ', EXPLODES ON ENEMIES WITH MORE THAN ' + CFG.rocket.strongHits + ' HP, COOLDOWN ' + s1(CFG.rocket.cooldown),
    bounce: () => 'COOLDOWN x' + CFG.bounce.cdMul + ' OF BLASTER, LIFETIME ' + CFG.bounce.frames + ' FRAMES',
    beam: () => 'TAP = SHORT CHARGE (' + s1(CFG.beam.minClock / (CFG.beam.loadPerFrame * 30)) + '), HOLD = UP TO ' + s1(CFG.beam.maxClock / (CFG.beam.loadPerFrame * 30)) + ', YOU ONLY TURN',
    grenade: () => 'RADIUS ' + CFG.grenade.radius + ', COOLDOWN ' + s1(CFG.grenade.cooldown),
    firetrail: () => 'FUEL ' + s1(CFG.fire.burnTime) + ', RECHARGE ' + s1(CFG.fire.rechargeTime),
    armor: () => '-' + Math.round(I.armor.reduce * 100) + '% DAMAGE',
    regen: () => '+' + I.regen.perSecond + ' HP/S',
    phoenix: () => 'ONCE PER RUN, ' + I.phoenix.hp + ' HP RESTORED',
    damage: () => Math.round(I.damage.chance * 100) + '% CHANCE FOR x2, BOSSES +' + Math.round(I.damage.boss * 100) + '%',
    thorns: () => 'RADIUS ' + I.thorns.radius + ', ' + I.thorns.hits + ' HITS, BOSSES ' + I.thorns.bossDmg,
    vampire: () => '+' + I.vampire.heal + ' HP PER KILL',
    lucky: () => 'DROP CHANCE x' + I.lucky.mult,
  };
  return f[id] ? f[id]() : '';
}

// Fortschrittsbalken der Ausruestung (zeigt nur den Anteil bis zur naechsten Stufe, keine XP-Zahlen) + Stufenpunkte rechts
function drawGearBar(ctx, id, x, y, w) {
  const P = STYLE.pal, lv = Save.gearLv(id), max = Save.gearMax(), full = Save.gearFrac(id) >= 1;
  uiBar(ctx, x, y, w - max * 8 - 6, 4, Save.gearFrac(id), lv >= max ? P.yellow : full ? P.yellow : P.cyan);
  for (let n = 0; n < max; n++) uiBar(ctx, x + w - (max - n) * 8, y, 6, 4, n < lv ? 1 : 0, P.yellow);
}
// "LEVEL UP 120" bzw. "MAX" fuer die Hinweiszeile
function gearUpText(id) { return Save.gearLv(id) >= Save.gearMax() ? 'MAX LEVEL' : 'LEVEL UP ' + Save.gearPrice(id); }

// ---------- Inventar (eigener Menuepunkt): links die vier Slots, rechts die Details des gewaehlten Slots ----------
const SLOT_COLORS = { melee: 'cyan', ranged: 'purple', heavy: 'orange', artifact: 'yellow' };       // Farbe je Slot (Schluessel in STYLE.pal)
function slotColor(id) { return STYLE.pal[SLOT_COLORS[id]] || STYLE.pal.cyan; }

// ---------- Evolutions-Rezepte (Inventar + Pausenmenue) ----------
// Farbe des Partners = Farbe seiner Gruppe: Ability schwach cyan / mittel gelb / stark orange, Implant gruen
function evoPartner(R, live) {
  const P = STYLE.pal;
  if (R.needs.ability) {
    const id = R.needs.ability, A = CFG.loadout.abilities[id];
    return { name: A.name, kind: 'ABILITY', icon: A.icon, iconW: A.iconW, color: ({ weak: P.cyan, medium: P.yellow, strong: P.orange })[A.tier] || P.cyan, have: live ? G.player.has(id) : Save.isUnlocked(id) };
  }
  const id = R.needs.implant, I = CFG.items.catalog[id];
  return { name: I.name, kind: 'IMPLANT', icon: I.icon, iconW: I.iconW, color: P.green, have: live ? Save.equipped('artifact') === id : Save.owns(id) };
}
// alle Rezepte, in denen das Item vorkommt (als Waffe oder als Implant-Partner)
function evoRecipesOf(itemId) {
  const L = CFG.evolutions.list;
  return Object.keys(L).filter((id) => L[id].weapon === itemId || L[id].needs.implant === itemId);
}
// kleines Rezept-Symbol: Rahmen in der Partnerfarbe, Partner-Icon drin; gedimmt, solange der Partner fehlt
function drawEvoChip(ctx, cx, cy, partner, s) {
  const P = STYLE.pal, x = cx - s / 2, y = cy - s / 2;
  uiPanel(ctx, x, y, s, s, { color: partner.have ? partner.color : P.greyMid, fill: P.ink, alpha: 1, notch: 2, glow: partner.have });
  drawIcon(ctx, partner.icon, cx, cy, Math.min(s - 4, partner.iconW), partner.have ? 1 : 0.8, !partner.have);
}
// Rezeptzeile im Inventar: [Waffe] + [Partner] = NAME, darunter Bedarf und Status
function drawEvoRecipe(ctx, x, y, w, id) {
  const P = STYLE.pal, T = STYLE.type, R = CFG.evolutions.list[id], W = CFG.items.catalog[R.weapon], pt = evoPartner(R, false);
  uiPanel(ctx, x, y, w, 34, { color: pt.have ? P.yellow : P.greyMid, fill: P.void, alpha: 0.92 });
  ctx.fillStyle = pt.color; ctx.fillRect(x + 1, y + 4, 3, 26);                                    // Farbstreifen = Partnerfarbe
  uiPanel(ctx, x + 9, y + 6, 22, 22, { color: slotColor(R.slot), fill: P.ink, alpha: 1, notch: 2 });
  drawIcon(ctx, W.icon, x + 20, y + 17, Math.min(18, W.iconW + 2), 1);
  uiText(ctx, '+', x + 36, y + 21, { size: T.h2, color: P.grey, align: 'center' });
  uiPanel(ctx, x + 41, y + 6, 22, 22, { color: pt.have ? pt.color : P.greyMid, fill: P.ink, alpha: 1, notch: 2, glow: pt.have });
  drawIcon(ctx, pt.icon, x + 52, y + 17, Math.min(18, pt.iconW + 2), pt.have ? 1 : 0.8, !pt.have);
  uiText(ctx, '=', x + 69, y + 21, { size: T.h2, color: P.grey, align: 'center' });
  uiText(ctx, uiFit(ctx, R.name, w - 85, T.h2), x + 77, y + 15, { size: T.h2, color: pt.have ? P.yellow : P.grey });
  const status = pt.have ? '' : (R.needs.ability ? 'LOCKED: ' : 'NOT OWNED: ');
  uiText(ctx, uiFit(ctx, status + pt.name + ' (' + pt.kind + ')', w - 85, T.small), x + 77, y + 28, { size: T.small, color: pt.have ? pt.color : P.red });
}

// Cores oben rechts: die Beschriftung sitzt links neben der Zahl, egal wie viele Stellen sie hat
function drawCoreCount(ctx) {
  const P = STYLE.pal, T = STYLE.type, num = String(Save.data.souls);
  ctx.save(); ctx.font = uiFont(T.h2); const nw = ctx.measureText(num).width; ctx.restore();
  uiText(ctx, 'CREDITS', STAGE_W - 56 - nw - 6, 37, { size: T.small, color: P.grey, align: 'right' });
  uiText(ctx, num, STAGE_W - 56, 38, { size: T.h2, color: P.yellow, align: 'right', glow: P.yellow });
}

// Text mit Zeilenumbruch (maxW in Buehneneinheiten), gibt die Zeilenzahl zurueck
function uiWrap(ctx, text, x, y, maxW, lineH, opts = {}) {
  ctx.save(); ctx.font = uiFont(opts.size || STYLE.type.body);
  const lines = []; let line = '';
  for (const w of I18n.t(text).split(" ")) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  ctx.restore();
  lines.forEach((l, i) => uiText(ctx, l, x, y + i * lineH, opts));
  return lines.length;
}
// Text auf eine Breite kuerzen ("..")
function uiFit(ctx, text, maxW, size) {
  ctx.save(); ctx.font = uiFont(size);
  let t = text = I18n.t(text);
  while (t.length > 3 && ctx.measureText(t).width > maxW) t = t.slice(0, -1);
  ctx.restore();
  return t === text ? t : t.trimEnd() + '..';
}
// Eckklammern um ein Rechteck (Sci-Fi-Rahmen)
function uiCorners(ctx, x, y, w, h, color, len = 5) {
  ctx.save(); ctx.fillStyle = color;
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.fillRect(sx > 0 ? cx : cx - len, sy > 0 ? cy : cy - 1, len, 1);
    ctx.fillRect(sx > 0 ? cx : cx - 1, sy > 0 ? cy : cy - len, 1, len);
  }
  ctx.restore();
}
// Wirkung pro Stufe als Text (Waffen: Tempo, Implants: Staerke)
function gearStepText(id) {
  const k = Save.gearKind(id), s = Math.round(CFG.gear.step[k] * 100);
  return k === 'weapon' ? '+' + s + '% FASTER PER LEVEL' : '+' + s + '% STRENGTH PER LEVEL';
}
// Grosse Stufenanzeige: breiter Balken (Fortschritt zur naechsten Stufe) und darunter ein Kaestchen je Stufe
function drawGearMeter(ctx, id, x, y, w, col) {
  const P = STYLE.pal, lv = Save.gearLv(id), max = Save.gearMax(), full = Save.gearFrac(id) >= 1, pulse = full && lv < max ? 0.7 + 0.3 * Math.sin(G.realTime * 8) : 1;
  ctx.save(); ctx.globalAlpha = pulse;
  uiBar(ctx, x, y, w, 9, Save.gearFrac(id), lv >= max || full ? P.yellow : col);
  ctx.restore();
  const bw = (w - (max - 1) * 3) / max;
  for (let n = 0; n < max; n++) {
    ctx.fillStyle = P.ink; ctx.fillRect(x + n * (bw + 3), y + 13, bw, 6);
    ctx.fillStyle = n < lv ? P.yellow : P.greyDark; ctx.fillRect(x + n * (bw + 3) + 1, y + 14, bw - 2, 4);
    if (n < lv) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x + n * (bw + 3) + 1, y + 14, bw - 2, 1); }
  }
}

function drawInventoryScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type, t = G.realTime, slots = CFG.items.slots;
  drawMenuBg(ctx, 'keysettings');
  drawEmbers(ctx);
  uiText(ctx, 'INVENTORY', 24, 40, { size: T.h1, color: P.yellow, glow: P.yellow });
  drawCoreCount(ctx);
  drawLevelBar(ctx, 190, 38, 150);                                   // Spielerlevel mit Fortschrittsbalken

  // links: die vier Slots
  const lx = 24, lw = 170, H = 52, GAP = 6, Y0 = 56;
  slots.forEach((S, i) => {
    const sel = G.invSel === i, y = Y0 + i * (H + GAP), col = slotColor(S.id), id = Save.equipped(S.id), I = id ? CFG.items.catalog[id] : null;
    const x = lx + (sel ? 6 : 0), w = lw - (sel ? 6 : 0);
    UIHit.add(lx, y, lw, H, () => { G.invSel = i; });
    uiPanel(ctx, x, y, w, H, { color: sel ? col : P.greyMid, fill: sel ? P.voidLight : P.void, alpha: 0.92, glow: sel });
    ctx.save(); ctx.globalAlpha = sel ? 1 : 0.45; ctx.fillStyle = col; ctx.fillRect(x + 1, y + 4, 3, H - 8); ctx.restore();           // Farbstreifen = Slot-Farbe
    uiPanel(ctx, x + 9, y + 8, 30, 30, { color: sel ? col : P.greyMid, fill: P.ink, alpha: 1, notch: 3 });
    if (I) drawIcon(ctx, I.icon, x + 24, y + 23 + (sel ? Math.round(Math.sin(t * 4)) : 0), Math.min(24, I.iconW + 4), 1);
    else uiText(ctx, '?', x + 24, y + 28, { size: T.h2, color: P.greyMid, align: 'center' });
    uiText(ctx, S.label, x + 46, y + 17, { size: T.small, color: col });
    uiText(ctx, I ? uiFit(ctx, I.name, w - 54, T.body) : 'EMPTY', x + 46, y + 29, { size: T.body, color: I ? (sel ? P.ice : P.grey) : P.greyMid });
    if (I) drawGearBar(ctx, id, x + 46, y + 34, w - 54);
    if (id) evoRecipesOf(id).slice(0, 3).forEach((eid, k) => drawEvoChip(ctx, x + w - 12 - k * 15, y + 12, evoPartner(CFG.evolutions.list[eid], false), 12));      // Rezept-Hinweis
  });
  const by = Y0 + slots.length * (H + GAP) + 2, backSel = G.invSel === slots.length;
  UIHit.add(lx, by, lw, 24, () => { G.invSel = slots.length; });
  uiPanel(ctx, lx, by, lw, 24, { color: backSel ? P.cyan : P.greyMid, fill: P.void, alpha: 0.9, glow: backSel });
  uiText(ctx, 'BACK', lx + lw / 2, by + 17, { size: T.h2, color: backSel ? P.ice : P.grey, align: 'center' });
  if (backSel) uiText(ctx, '>', lx + 10, by + 17, { size: T.h2, color: P.cyan });

  // rechts: Details des gewaehlten Slots
  const px = 206, pw = STAGE_W - 24 - px, py = 56, ph = by + 24 - py;
  const si = Math.min(G.invSel, slots.length - 1), S = slots[si], col = slotColor(S.id), id = Save.equipped(S.id), I = id ? CFG.items.catalog[id] : null;
  uiPanel(ctx, px, py, pw, ph, { color: backSel ? P.greyMid : col, fill: P.void, alpha: 0.92, glow: !backSel });
  if (backSel) {
    uiText(ctx, 'BACK TO MAIN MENU', px + pw / 2, py + ph / 2, { size: T.h2, color: P.greyMid, align: 'center' });
  } else {
    // grosses Symbol mit pulsierendem Schein und Eckklammern
    const ix = px + 14, iy = py + 12, isz = 54;
    ctx.save(); ctx.globalAlpha = 0.14 + 0.08 * Math.sin(t * 3); ctx.fillStyle = col;
    pxGlow(ctx, ix + isz / 2, iy + isz / 2, isz * 0.62); ctx.restore();
    uiPanel(ctx, ix, iy, isz, isz, { color: col, fill: P.ink, alpha: 0.95, notch: 4 });
    uiCorners(ctx, ix - 3, iy - 3, isz + 6, isz + 6, col);
    if (I) drawIcon(ctx, I.icon, ix + isz / 2, iy + isz / 2 + Math.round(Math.sin(t * 2.5) * 2), 38, 1);
    else uiText(ctx, '?', ix + isz / 2, iy + isz / 2 + 7, { size: T.h1, color: P.greyMid, align: 'center' });
    uiText(ctx, S.label, ix + isz + 12, iy + 12, { size: T.small, color: col });
    uiText(ctx, I ? uiFit(ctx, I.name, pw - isz - 40, 16) : 'EMPTY SLOT', ix + isz + 12, iy + 32, { size: 16, color: I ? P.ice : P.greyMid, glow: I ? col : undefined });
    uiText(ctx, Save.ownedFor(S.id).length + ' OWNED', ix + isz + 12, iy + 48, { size: T.small, color: P.grey });
    const tx = px + 14, tw = pw - 28;
    let ty = iy + isz + 16;
    if (I) {
      ty += 11 * uiWrap(ctx, I.desc, tx, ty, tw, 11, { size: T.body, color: P.grey });
      const f = itemFacts(id);
      if (f) ty += 2 + 10 * uiWrap(ctx, f, tx, ty + 1, tw, 10, { size: T.small, color: P.cyan });
      if (id === 'phoenix' && Save.cosOwned('revive', 'totem')) {                              // geheimes Cosmetic (Achievement POSTMORTAL): Animation der Wiederbelebung waehlen
        const on = Save.cosEquipped('revive') === 'totem', m = Input.mouse, hot = m.x >= tx && m.x <= tx + tw && m.y >= ty + 4 && m.y <= ty + 24;
        UIHit.add(tx, ty + 4, tw, 20, () => {}, { key: 'KeyT' });
        uiPanel(ctx, tx, ty + 4, tw, 20, { color: hot ? P.ice : on ? P.green : P.greyMid, fill: hot ? P.voidLight : P.void, alpha: 0.95, glow: on || hot });
        uiText(ctx, 'REVIVE ANIMATION: ' + (on ? 'TOTEM OF UNDYING' : 'REVIVAL RING'), tx + 8, ty + 18, { size: T.small, color: on ? P.green : P.grey });
        uiText(ctx, '[T] SWITCH', tx + tw - 8, ty + 18, { size: T.small, color: P.yellow, align: 'right' });
        ty += 28;
      }
    } else uiText(ctx, 'Nothing equipped. Press SPACE to choose an item.', tx, ty, { size: T.body, color: P.grey });
    // Evolutions-Rezepte dieses Items: so viele, wie zwischen Beschreibung und Stufenblock wirklich Platz haben (nie darueber hinaus)
    const my = py + ph - 58;                                                                  // Oberkante des Stufenblocks (Linie bei my - 14)
    if (id) {
      const all = evoRecipesOf(id).slice(0, 2), free = (my - 18) - (ty + 2);
      const n = Math.max(0, Math.min(all.length, Math.floor((free - 12) / 37)));
      if (n) {
        const top = my - 18 - n * 37 - 12;
        uiText(ctx, 'EVOLUTION  -  NEEDS ' + CFG.evolutions.minUps + ' BOSSES IN A RUN', tx, top + 7, { size: T.small, color: P.yellow });
        all.slice(0, n).forEach((eid, k) => drawEvoRecipe(ctx, tx, top + 11 + k * 37, tw, eid));
      }
    }
    // Stufe
    if (I) {
      const lv = Save.gearLv(id), max = Save.gearMax(), maxed = lv >= max, price = Save.gearPrice(id), afford = Save.data.souls >= price;
      ctx.fillStyle = col; ctx.globalAlpha = 0.35; ctx.fillRect(tx, my - 14, tw, 1); ctx.globalAlpha = 1;
      uiText(ctx, 'LEVEL ' + lv + ' / ' + max, tx, my - 3, { size: T.h2, color: P.yellow });
      uiText(ctx, 'NOW +' + Math.round(lv * CFG.gear.step[Save.gearKind(id)] * 100) + '%' + (maxed ? '' : '   NEXT +' + Math.round((lv + 1) * CFG.gear.step[Save.gearKind(id)] * 100) + '%'), px + pw - 14, my - 3, { size: T.small, color: P.grey, align: 'right' });
      drawGearMeter(ctx, id, tx, my + 4, tw, col);
      uiText(ctx, uiFit(ctx, gearStepText(id) + '  -  FILLS WHILE YOU PLAY', tw, T.small), tx, my + 32, { size: T.small, color: P.greyMid });
      const up = maxed ? 'MAX LEVEL' : '[U] LEVEL UP  -  ' + price + ' CREDITS';
      if (!maxed) UIHit.add(tx - 4, my + 33, 170, 18, () => {}, { key: 'KeyU' });             // Antippen = U (Touch)
      uiText(ctx, up, tx, my + 46, { size: T.body, color: maxed ? P.cyan : afford ? P.yellow : P.red });
      uiText(ctx, '[SPACE] CHANGE', px + pw - 14, my + 46, { size: T.small, color: P.cyan, align: 'right' });
    } else uiText(ctx, '[SPACE] CHOOSE ITEM', px + pw / 2, py + ph - 12, { size: T.body, color: P.cyan, align: 'center' });
    // Level-up-Effekt: Ringe laufen vom Symbol nach aussen, kurzer Aufheller
    const fx = t - (G.invFlashAt || -9);
    if (fx >= 0 && fx < 0.7) {
      ctx.save();
      const k = fx / 0.7, cx = ix + isz / 2, cy = iy + isz / 2;
      ctx.globalAlpha = 0.25 * (1 - k); ctx.fillStyle = P.white; ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = P.yellow; ctx.globalAlpha = 1 - k;
      pxRing(ctx, cx, cy, 20 + 60 * k, 2); pxRing(ctx, cx, cy, 10 + 40 * k, 1);
      ctx.restore();
      uiText(ctx, 'LEVEL UP!', px + pw - 14, iy + 12, { size: T.h2, color: P.yellow, align: 'right', glow: P.yellow });
    }
  }
  if (G.invPick) drawInvPick(ctx);
}

// Auswahlfenster im Inventar: alle gekauften Items des Slots als Karten mit Symbol, Kurzinfo, Stufe und Balken
function drawInvPick(ctx) {
  const P = STYLE.pal, T = STYLE.type, K = G.invPick, S = CFG.items.slots.find((q) => q.id === K.slot), col = slotColor(K.slot), t = G.realTime;
  const w = 380, H = 40, GAP = 44, VIS = 5, x = STAGE_W / 2 - w / 2, y0 = 92;
  UIHit.list.length = 0;                                           // das Auswahlfenster liegt oben: darunter ist nichts klickbar
  ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = P.ink; ctx.fillRect(0, 0, STAGE_W, STAGE_H); ctx.restore();
  const rows = Math.max(1, Math.min(VIS, K.list.length));
  uiPanel(ctx, x - 12, y0 - 40, w + 24, 40 + rows * GAP + 54, { color: col, fill: P.void, alpha: 0.97, glow: true });
  uiCorners(ctx, x - 15, y0 - 43, w + 30, 40 + rows * GAP + 60, col, 7);
  uiText(ctx, S.label + ' - CHOOSE', STAGE_W / 2, y0 - 16, { size: T.h2, color: col, align: 'center', glow: col });
  if (!K.list.length) { uiText(ctx, 'NOTHING PURCHASED YET (ITEMS)', STAGE_W / 2, y0 + 22, { size: T.body, color: P.grey, align: 'center' }); return; }
  const off = clamp(K.sel - (VIS - 1), 0, Math.max(0, K.list.length - VIS));
  K.list.slice(off, off + VIS).forEach((id, k) => {
    const i = off + k, sel = K.sel === i, y = y0 + k * GAP, I = id ? CFG.items.catalog[id] : null, eq = Save.equipped(K.slot) === id;
    UIHit.add(x, y, w, H, () => { K.sel = i; });
    uiPanel(ctx, x + (sel ? 4 : 0), y, w - (sel ? 4 : 0), H, { color: sel ? col : P.greyMid, fill: sel ? P.voidLight : P.void, alpha: 0.92, glow: sel });
    uiPanel(ctx, x + 8 + (sel ? 4 : 0), y + 6, 28, 28, { color: sel ? col : P.greyMid, fill: P.ink, alpha: 1, notch: 3 });
    if (I) drawIcon(ctx, I.icon, x + 22 + (sel ? 4 : 0), y + 20 + (sel ? Math.round(Math.sin(t * 4)) : 0), Math.min(22, I.iconW + 2), 1);
    uiText(ctx, I ? I.name : 'EMPTY', x + 44 + (sel ? 4 : 0), y + 16, { size: T.h2, color: sel ? P.ice : P.grey });
    uiText(ctx, I ? uiFit(ctx, itemFacts(id) || I.desc, 210, T.small) : 'Leave the slot empty', x + 44 + (sel ? 4 : 0), y + 30, { size: T.small, color: sel ? P.cyan : P.greyMid });
    if (eq) uiText(ctx, 'EQUIPPED', x + w - 10, y + 15, { size: T.small, color: P.cyan, align: 'right' });
    if (id) evoRecipesOf(id).slice(0, 3).forEach((eid, k) => drawEvoChip(ctx, x + w - 70 - k * 15, y + 11, evoPartner(CFG.evolutions.list[eid], false), 12));
    if (id) {
      uiText(ctx, 'LV ' + Save.gearLv(id), x + w - 10 - 70, y + 31, { size: T.small, color: P.yellow, align: 'right' });
      uiBar(ctx, x + w - 10 - 64, y + 25, 64, 5, Save.gearFrac(id), Save.gearFrac(id) >= 1 ? P.yellow : col);
    }
  });
  const sid = K.list[K.sel];                                                        // Touch: Knopf fuer die Stufe des markierten Items
  if (sid) {
    const maxed = Save.gearLv(sid) >= Save.gearMax(), bw = 200, bx = STAGE_W / 2 - bw / 2, by = y0 + rows * GAP + 18, m = Input.mouse;
    const hot = !maxed && m.x >= bx && m.x <= bx + bw && m.y >= by && m.y <= by + 22, c = maxed ? P.cyan : Save.data.souls >= Save.gearPrice(sid) ? P.yellow : P.red;
    if (!maxed) UIHit.add(bx, by, bw, 22, () => {}, { key: 'KeyU' });
    uiPanel(ctx, bx, by, bw, 22, { color: hot ? P.ice : c, fill: hot ? P.greyMid : P.void, glow: hot });
    uiText(ctx, maxed ? 'MAX LEVEL' : 'LEVEL UP  -  ' + Save.gearPrice(sid) + ' CREDITS', STAGE_W / 2, by + 15, { size: T.h2, color: hot ? P.ice : c, align: 'center' });
  }
}

// ---------- Cosmetics-Menue: oben die Kategorien, links die Items, rechts eine Live-Vorschau ----------
function drawCosmeticsScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type, t = G.realTime, C = CFG.cosmetics, cat = C.cats[G.cosTab], items = Cos.items(cat.id);
  drawMenuBg(ctx, 'keysettings');
  drawEmbers(ctx);
  uiText(ctx, 'COSMETICS', 24, 40, { size: T.h1, color: P.yellow, glow: P.yellow });
  drawCoreCount(ctx);

  // Kategorien
  // (es sind mehr Kategorien als Platz: ein Fenster von VISTAB Reitern folgt der Auswahl, Pfeile zeigen, dass es weitergeht)
  const VISTAB = 9, tg = 3, tx0 = 24, tw = Math.floor((STAGE_W - 48 - (VISTAB - 1) * tg) / VISTAB), tmax = Math.max(0, C.cats.length - VISTAB);
  if (G.cosTabSeen !== G.cosTab) { G.cosTabSeen = G.cosTab; G.cosTabOff = clamp(G.cosTabOff === undefined ? G.cosTab - 4 : G.cosTabOff, G.cosTab - VISTAB + 1, G.cosTab); }       // Auswahl bleibt sichtbar, sonst bestimmt die Scrollleiste
  const toff = clamp(G.cosTabOff, 0, tmax);
  UIScroll.bar(ctx, 'cosTabs', tx0, 73, STAGE_W - 48, 5, false, C.cats.length, VISTAB, toff, (v) => { G.cosTabOff = v; });
  C.cats.slice(toff, toff + VISTAB).forEach((c, k) => {
    const i = toff + k, x = tx0 + k * (tw + tg), sel = G.cosTab === i;
    UIHit.add(x, 50, tw, 20, () => { G.cosTab = i; G.cosSel = Math.max(0, Cos.items(c.id).findIndex((q) => q.id === Save.cosEquipped(c.id))); }, { noConfirm: true });
    uiPanel(ctx, x, 50, tw, 20, { color: sel ? P.cyan : P.greyMid, fill: sel ? P.voidLight : P.void, alpha: 0.92, glow: sel });
    uiText(ctx, c.label, x + tw / 2, 64, { size: T.small, color: sel ? P.ice : P.grey, align: 'center' });
  });
  if (toff > 0) uiText(ctx, '<', 14, 64, { size: T.body, color: P.yellow, align: 'center' });
  if (toff + VISTAB < C.cats.length) uiText(ctx, '>', STAGE_W - 14, 64, { size: T.body, color: P.yellow, align: 'center' });
  uiText(ctx, (G.cosTab + 1) + '/' + C.cats.length, STAGE_W / 2, 44, { size: T.small, color: P.grey, align: 'center' });

  // Liste links
  const lx = 24, lw = 232, H = 28, GAP = 4, Y0 = 80, VIS = 7;
  const selIt = items[Math.min(G.cosSel, items.length - 1)];
  if (G.colorPick && (G.cosSel >= items.length || !Cos.canColor(cat.id, selIt))) G.colorPick = null;
  const lmax = Math.max(0, items.length - VIS), lkey = G.cosTab + ':' + G.cosSel;
  if (G.cosListSeen !== lkey) {                                                                       // Auswahl (oder Reiter) hat sich geaendert: Ausschnitt nachfuehren
    G.cosListOff = clamp(G.cosListSeen && G.cosListSeen.split(':')[0] === '' + G.cosTab ? G.cosListOff : 0, G.cosSel - (VIS - 1), G.cosSel); G.cosListSeen = lkey;
  }
  const off = clamp(G.cosListOff, 0, lmax);
  if (!G.colorPick) UIScroll.bar(ctx, 'cosList', lx + lw + 3, Y0, 5, VIS * (H + GAP) - GAP, true, items.length, VIS, off, (v) => { G.cosListOff = v; });
  (G.colorPick ? [] : items.slice(off, off + VIS)).forEach((it, k) => {
    const i = off + k, sel = G.cosSel === i, y = Y0 + k * (H + GAP), owned = Save.cosOwned(cat.id, it.id), eq = Save.cosEquipped(cat.id) === it.id, afford = Save.data.souls >= it.cost;
    UIHit.add(lx, y, lw, H, () => { G.cosSel = i; }, { noConfirm: true });          // Klick waehlt nur aus, gekauft wird ueber den Knopf in der Vorschau
    const x = lx + (sel ? 5 : 0), w = lw - (sel ? 5 : 0);
    uiPanel(ctx, x, y, w, H, { color: sel ? it.color : P.greyMid, fill: sel ? P.voidLight : P.void, alpha: 0.92, glow: sel });
    ctx.save(); ctx.fillStyle = it.color; ctx.globalAlpha = sel ? 1 : 0.5;
    ctx.fillRect(x + 8, y + 7, 14, 14); ctx.restore();                                           // Farbfeld des Items
    ctx.strokeStyle = P.ink; ctx.strokeRect(x + 8.5, y + 7.5, 13, 13);
    uiText(ctx, it.name, x + 30, y + 18, { size: T.body, color: sel ? P.ice : P.grey });
    const st = eq ? 'EQUIPPED' : owned ? 'OWNED' : it.cost + ' CREDITS';
    uiText(ctx, st, x + w - 8, y + 18, { size: T.small, color: eq ? P.cyan : owned ? P.ice : afford ? P.yellow : P.red, align: 'right' });
  });
  if (items.length > VIS && !G.colorPick) uiText(ctx, (off > 0 ? '^ ' : '') + (off + VIS < items.length ? 'v' : ''), lx + lw - 6, Y0 - 3, { size: T.small, color: P.grey, align: 'right' });
  const by = Y0 + VIS * (H + GAP) + 2, backSel = G.cosSel === items.length;
  if (G.colorPick) drawColorPick(ctx, cat, selIt, lx, Y0 - 2, lw, by + 22 - Y0 + 2);
  else {
    UIHit.add(lx, by, lw, 22, () => { G.cosSel = items.length; });
    uiPanel(ctx, lx, by, lw, 22, { color: backSel ? P.cyan : P.greyMid, fill: P.void, alpha: 0.9, glow: backSel });
    uiText(ctx, 'BACK', lx + lw / 2, by + 15, { size: T.h2, color: backSel ? P.ice : P.grey, align: 'center' });
    if (backSel) uiText(ctx, '>', lx + 10, by + 15, { size: T.h2, color: P.cyan });
  }

  // Vorschau rechts (zeigt die gewaehlte Farbe; bei offener Farbwahl die Farbe, auf der der Cursor steht)
  const px = 268, pw = STAGE_W - 24 - px, py = 80, ph = by + 22 - py;
  const ents = backSel || !Cos.canColor(cat.id, selIt) ? null : Cos.colorEntries(cat.id, selIt);
  const it = backSel ? selIt : Cos.colored(cat.id, selIt, G.colorPick && ents ? ents[Math.min(G.colorPick.sel, ents.length - 1)].id : undefined);
  uiPanel(ctx, px, py, pw, ph, { color: backSel ? P.greyMid : it.color, fill: P.void, alpha: 0.92, glow: !backSel });
  if (!backSel) {
    drawCosmeticPreview(ctx, cat.id, it, px + 8, py + 8, pw - 16, 118);
    uiText(ctx, it.name, px + pw / 2, py + 146, { size: T.h2, color: P.ice, align: 'center', glow: it.color });
    uiWrap(ctx, cat.desc, px + 12, py + 162, pw - 24, 11, { size: T.small, color: P.grey });
    const owned = Save.cosOwned(cat.id, it.id), eq = Save.cosEquipped(cat.id) === it.id, afford = Save.data.souls >= it.cost;
    const msg = eq ? 'EQUIPPED' : owned ? '[SPACE] EQUIP' : '[SPACE] BUY  -  ' + it.cost + ' CREDITS';
    if (CFG.cosmetics.colors[cat.id]) {                                                 // Farbwahl: nur bei Items, die Farben vertragen
      const cy = py + ph - 62;
      if (ents) {
        const cur = ents.find((q) => q.id === Save.cosColor(cat.id)) || ents[0], bw = 240, bx = px + pw / 2 - bw / 2, m = Input.mouse, hot = !G.colorPick && m.x >= bx && m.x <= bx + bw && m.y >= cy && m.y <= cy + 20;
        if (!G.colorPick) UIHit.add(bx, cy, bw, 20, () => {}, { key: 'KeyC' });
        uiPanel(ctx, bx, cy, bw, 20, { color: hot ? P.ice : P.greyMid, fill: hot ? P.voidLight : P.void, alpha: 0.95, glow: hot });
        ctx.fillStyle = cur.color; pxDisc(ctx, bx + 14, cy + 10, 5);
        uiText(ctx, CFG.cosmetics.colorLabel[cat.id] + ': ' + uiFit(ctx, cur.name, bw - 130, T.small), bx + 26, cy + 14, { size: T.small, color: hot ? P.ice : P.grey });
        uiText(ctx, '[C]', bx + bw - 8, cy + 14, { size: T.small, color: P.yellow, align: 'right' });
      } else uiText(ctx, 'THIS ONE KEEPS ITS OWN COLORS', px + pw / 2, cy + 14, { size: T.small, color: P.greyMid, align: 'center' });
    }
    if (!eq && !G.colorPick) drawActionButton(ctx, px + pw / 2 - 120, py + ph - 34, 240, 24, { label: owned ? 'EQUIP' : 'BUY - ' + it.cost + ' CREDITS', color: owned ? P.cyan : afford ? P.yellow : P.red });
    else uiText(ctx, G.colorPick ? '[SPACE] PICK COLOR   [ESC] CANCEL' : msg, px + pw / 2, py + ph - 14, { size: T.body, color: G.colorPick ? P.yellow : eq || owned ? P.cyan : afford ? P.yellow : P.red, align: 'center' });
  } else uiText(ctx, 'BACK TO MAIN MENU', px + pw / 2, py + ph / 2, { size: T.h2, color: P.greyMid, align: 'center' });
}

// Farbwahl-Overlay (ersetzt die Item-Liste): Farben als Kreise mit Namen im Raster. Cursor/Hover waehlt (die Vorschau rechts zeigt sie sofort), Klick/Leertaste uebernimmt.
function drawColorPick(ctx, cat, it, x, y, w, h) {
  const P = STYLE.pal, T = STYLE.type, cp = G.colorPick, entries = Cos.colorEntries(cat.id, it), n = entries.length, COLS = 3, RH = 48, gy = y + 24, VISR = Math.floor((h - 24 - 4) / RH);
  const cw = Math.floor((w - 12) / COLS), gx = x + 6, rows = Math.ceil(n / COLS), active = Save.cosColor(cat.id);
  const SW = UIScroll.win('colorPick', 0, Math.floor(cp.sel / COLS), VISR, rows);
  uiPanel(ctx, x, y, w, h, { color: P.cyan, fill: P.void, alpha: 0.96, glow: true });
  uiText(ctx, CFG.cosmetics.colorLabel[cat.id], x + w / 2, y + 16, { size: T.h2, color: P.ice, align: 'center' });
  UIScroll.bar(ctx, 'colorPick', x + w + 3, gy, 5, VISR * RH, true, rows, VISR, SW.off, (v) => { SW.off = v; });
  entries.forEach((c, i) => {
    const r = Math.floor(i / COLS) - SW.off;
    if (r < 0 || r >= VISR) return;
    const cx0 = gx + (i % COLS) * cw, cy0 = gy + r * RH, sel = i === cp.sel, isActive = (c.id || null) === (active || null);
    UIHit.add(cx0, cy0, cw, RH - 2, () => { cp.sel = i; });
    if (sel) uiPanel(ctx, cx0 + 1, cy0, cw - 2, RH - 2, { color: P.cyan, fill: P.voidLight, alpha: 0.9, glow: true });
    ctx.fillStyle = c.color; pxDisc(ctx, cx0 + cw / 2, cy0 + 16, 10);
    ctx.fillStyle = isActive ? P.yellow : sel ? P.ice : P.greyMid; pxRing(ctx, cx0 + cw / 2, cy0 + 16, 14, 1);
    uiText(ctx, uiFit(ctx, c.name, cw - 4, T.small), cx0 + cw / 2, cy0 + 40, { size: T.small, color: sel ? P.ice : isActive ? P.yellow : P.grey, align: 'center' });
  });
}

// Live-Vorschau eines Cosmetics im Kasten (x, y, w, h in Buehnenpixeln). Benutzt dieselben Zeichenfunktionen wie das Spiel (Cos.*) in einem
// verschobenen Koordinatensystem: (0, 0) = Mitte des Kastens, y nach oben. Eigene Partikelliste, wird beim Wechseln des Items geleert.
function drawCosmeticPreview(ctx, cat, it, x, y, w, h) {
  Juice.force = 2;                                                                    // die Vorschau soll den Effekt zeigen, auch wenn EFFECTS auf OFF/REDUCED steht
  try { drawCosmeticPreviewInner(ctx, cat, it, x, y, w, h); } finally { Juice.force = undefined; }
}
function drawCosmeticPreviewInner(ctx, cat, it, x, y, w, h) {
  const P = STYLE.pal, t = G.realTime, cx = x + w / 2, cy = y + h / 2;
  const pv = G.cosPrev || (G.cosPrev = { list: [], ghosts: [], last: t, key: '', lastKill: -1, ghostT: 0 });
  const key = cat + ':' + it.id;
  if (pv.key !== key) { pv.key = key; pv.list = []; pv.ghosts = []; pv.lastKill = -1; }
  const dt = clamp(t - pv.last, 0, 0.1); pv.last = t;
  const pick = (c) => (cat === c ? it : Cos.cur(c));
  const skin = pick('skin'), blade = pick('blade'), trail = pick('trail'), kill = pick('kill'), aura = pick('aura'), gear = pick('gear');
  const endless = pick('endless');
  const ship = Cos.sprite(Hero.sprite(), 'skin', skin);
  const enemy = pick('enemy'), boss = pick('boss'), melee = Save.equipped('melee'), ranged = Save.equipped('ranged'), heavy = Save.equipped('heavy');
  const showShip = cat !== 'enemy' && cat !== 'boss';

  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = P.ink; ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 0.25; ctx.fillStyle = P.grid;                                    // dezentes Raster
  for (let gx = x; gx < x + w; gx += 12) ctx.fillRect(gx, y, 1, h);
  for (let gy = y; gy < y + h; gy += 12) ctx.fillRect(x, gy, w, 1);
  ctx.globalAlpha = 1;
  ctx.translate(cx - STAGE_W / 2, cy - STAGE_H / 2);

  if (Cos2.PREVIEW_CATS.indexOf(cat) >= 0) {                                          // neue Kategorien (js/cosmetics2.js): eigene Vorschau
    pv.list = Cos.stepParticles(pv.list, dt);
    Cos2.previewCat(ctx, cat, it, w, h, t, dt, pv);
    for (const q of pv.list) Cos.drawParticle(ctx, q);
    ctx.restore();
    uiPanel(ctx, x - 1, y - 1, w + 2, h + 2, { color: it.color, fill: 'rgba(0,0,0,0)', alpha: 0, notch: 3 });
    uiCorners(ctx, x - 3, y - 3, w + 6, h + 6, it.color);
    return;
  }

  // Position und Blickrichtung des Vorschau-Schiffs
  let px = 0, py = 0, dir = 90 + Math.sin(t * 0.8) * 25, moving = false;
  const path = (tt) => [Math.cos(tt * 1.6) * 40, Math.sin(tt * 1.6) * 20];
  if (cat === 'trail' || cat === 'gear' || cat === 'endless' || cat === 'skin') {
    // Skin-Vorschau: das Schiff laeuft 3.8 s und steht dann 1.7 s still (zeigt z. B. wie sich Pixel Dissolve wieder zusammensetzt)
    let pt = t;
    if (cat === 'skin') { pv.pathT = (pv.pathT || 0) + ((t % 5.5) < 3.8 ? dt : 0); pt = pv.pathT; moving = (t % 5.5) < 3.8; } else moving = true;
    [px, py] = path(pt); const [nx, ny] = path(pt + 0.05);
    dir = Math.atan2(nx - px, ny - py) / DEG;
  } else if (cat === 'kill') px = -30;
  else if (cat === 'blade' || cat === 'proj') { px = -w / 4 - 10; dir = 90; }              // Schiff links, die Angriffe fliegen nach rechts
  const fx = { x: px, y: py, dir };
  Cos2.state = { moving, dash: cat === 'skin' && t % 3 < 0.45, hp: cat === 'skin' ? 0.12 + 0.88 * (0.5 + 0.5 * Math.cos(t * 0.9)) : 1 };       // Zustand fuer Skins mit Verhalten (Dash, Leben schwankt)

  // Partikel erzeugen
  if (trail.shape === 'echo') { pv.ghostT -= dt; if (moving && pv.ghostT <= 0) { pv.ghostT = 0.05; pv.ghosts.push({ x: px, y: py, dir, t: 0, life: 0.5 }); } }
  else if (cat === 'trail' && Cos2.FLOOR_SHAPES[trail.shape]) {                      // Boden-Marken (Fussspuren, Pfoten, Blumen, Ripple) statt Partikel
    if (pv.markId !== trail.id) { pv.markId = trail.id; Cos2.decals = []; Cos2.lastPos = null; Cos2.floorDist = 0; }
    Cos2.floorTick(dt, fx, true, trail);
  }
  else if (cat === 'trail') Cos.trailTick(pv.list, trail, fx, dt, moving, t);
  Cos.auraTick(pv.list, aura, px, py, dt);
  Cos.gearTick(pv.list, gear, px, py, dir, dt, moving);
  Cos.endlessTick(pv.list, endless, { x: px, y: py, dir }, dt, moving);
  const swordDir = t * 200;
  if (cat === 'blade' || cat === 'proj') {                                            // Sandbox mit der gerade gezeigten Waffe pflegen und steppen (SHOTS: nur Waffen mit Projektilen)
    const list = (cat === 'proj' ? [ranged, heavy] : [melee, ranged, heavy]).filter(Boolean), slot = Math.floor(t / 3.6) % Math.max(1, list.length), id = list[slot];
    if (id && (!pv.sbx || pv.sbx.id !== id)) { Cos.previewInit(pv, id, w); pv.list = []; }
    if (id) Cos.previewStep(pv, blade, dt, t, cat === 'proj' ? { proj: it } : undefined);
  }
  const bossL = { x: -38, y: 0, radius: 24 }, bossR = { x: 42, y: 0, radius: 19 };
  if (cat === 'boss') { Cos.bossTick(pv.list, bossL, dt, boss); Cos.bossTick(pv.list, bossR, dt, boss); }
  if (cat === 'kill') {                                                                // Bodenmarken (Stempel, Grabstein, Tinte) bleiben liegen (genau dort, wo der Dummy-Gegner stirbt, der letzte Kill ersetzt den vorigen)
    if (pv.markId !== kill.id) { pv.markId = kill.id; Cos2.decals = []; }
    const k = Math.floor(t / 1.6);
    if (k !== pv.lastKill && t % 1.6 > 0.9) { pv.lastKill = k; Cos2.decals = []; Cos.emitKill(pv.list, 30, 0, P.orange, 6, kill); }
  }
  if (cat === 'kill' || cat === 'trail') Cos2.stepDecals(dt);
  pv.list = Cos.stepParticles(pv.list, dt);
  for (const g of pv.ghosts) g.t += dt;
  pv.ghosts = pv.ghosts.filter((g) => g.t < g.life);

  // Zeichnen
  if (cat === 'endless') {                                                             // Boden-Effekte: die Kamera wandert, als wuerde man durch die Endlos-Karte fliegen
    const cam = { x: t * 26, y: Math.sin(t * 0.5) * 30 };
    Cos.drawEndlessGround(ctx, endless, cam, w / 2 + 2, h / 2 + 2, t);
  }
  if (cat === 'kill' || (cat === 'trail' && Cos2.FLOOR_SHAPES[trail.shape])) Cos2.drawDecals(ctx);          // Bodenmarken liegen unter dem Schiff
  const drawShipStack = () => {                                                       // Schiff mit Aura und Gear (im Spiel liegen die Waffen dahinter)
    if (!showShip) return;
    for (const g of pv.ghosts) drawSprite(ctx, ship, g.x, g.y, g.dir, 250, { alpha: 0.4 * (1 - g.t / g.life) });
    Cos.drawAura(ctx, aura, px, py, t);
    Cos.drawEndless(ctx, endless, px, py, t, { homeX: -w * 0.35, homeY: 0, mins: 5 * (1 + Math.floor(t / 1.2) % 8) });
    Cos.drawGear(ctx, gear, px, py, dir, t, 'back');
    Cos.drawShip(ctx, ship, px, py, dir, 250, {}, skin, t);
    Cos.drawGear(ctx, gear, px, py, dir, t, 'front');
  };
  if (cat !== 'blade' && cat !== 'proj') drawShipStack();
  if (cat === 'blade' || cat === 'proj') {                                             // die ECHTEN Angriffe der ausgeruesteten Waffen, nacheinander (wie im Spiel, hinter dem Spieler)
    const list = (cat === 'proj' ? [ranged, heavy] : [melee, ranged, heavy]).filter(Boolean), slot = Math.floor(t / 3.6) % Math.max(1, list.length), id = list[slot];
    if (id) {
      Cos.previewDraw(ctx, pv, blade, t, cat === 'proj' ? { proj: it } : undefined);
      uiText(ctx, CFG.items.catalog[id].name, STAGE_W / 2, STAGE_H / 2 + h / 2 - 5, { size: STYLE.type.small, color: P.grey, align: 'center' });
    } else uiText(ctx, 'NO WEAPON EQUIPPED', STAGE_W / 2, STAGE_H / 2, { size: STYLE.type.small, color: P.greyMid, align: 'center' });
    drawShipStack();                                                                    // Spieler ganz oben, wie im Spiel
  }
  if (cat === 'enemy') {                                                               // drei Gegnertypen mit Farbe und Zusatz
    const look = { x: Math.cos(t * 1.3) * 80, y: Math.sin(t * 1.3) * 50 };
    [['circle', -44, 10, 270], ['triangle', 0, 11, 90 + Math.sin(t) * 20], ['square', 44, 11, 270]].forEach(([ty, ex, rad, dr]) => {
      drawSprite(ctx, Cos.tinted(ty, enemy.filter || ''), ex, 0, dr, 280);
      Cos.drawEnemyFx(ctx, enemy, { x: ex, y: 0, radius: rad * 1.3 }, t, look);
    });
    uiText(ctx, 'SHIELD ENEMIES KEEP THEIR COLORS', STAGE_W / 2, STAGE_H / 2 + h / 2 - 5, { size: STYLE.type.small, color: P.greyMid, align: 'center' });
  }
  if (cat === 'boss') {
    Cos.drawBoss(ctx, 'octagon', bossL, 90 + t * 30, 210, {}, t, boss);
    Cos.drawBoss(ctx, 'kite', bossR, 90 + Math.sin(t) * 40, 175, {}, t, boss);
  }
  if (cat === 'kill' && t % 1.6 < 0.9) drawSprite(ctx, 'circle', 30, 0, 270, 250);
  for (const q of pv.list) Cos.drawParticle(ctx, q);
  ctx.restore();
  uiPanel(ctx, x - 1, y - 1, w + 2, h + 2, { color: it.color, fill: 'rgba(0,0,0,0)', alpha: 0, notch: 3 });
  uiCorners(ctx, x - 3, y - 3, w + 6, h + 6, it.color);
}

function drawBindsScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type, A = Input.actions;
  drawMenuBg(ctx, 'keysettings');
  uiText(ctx, 'KEYBINDS', STAGE_W / 2, 44, { size: T.h1, color: P.yellow, align: 'center' });
  const rows = A.concat([{ id: '_reset' }, { id: '_back' }]);
  const w = 340, x = STAGE_W / 2 - w / 2, H = 24, GAP = 27, Y0 = 56, VIS = 9;
  const SW = UIScroll.win('binds', 0, G.bindSel, VIS, rows.length);
  UIScroll.bar(ctx, 'binds', x + w + 6, Y0, 6, VIS * GAP - 3, true, rows.length, VIS, SW.off, (v) => { SW.off = v; });
  const off = SW.off;
  rows.slice(off, off + VIS).forEach((r, k) => {
    const i = off + k, sel = G.bindSel === i, y = Y0 + k * GAP;
    if (r.id === '_reset') { drawMenuRow(ctx, y, 'RESTORE DEFAULTS', sel, { w: 250, hit: () => { G.bindSel = i; } }); return; }
    if (r.id === '_back') { drawMenuRow(ctx, y, 'BACK', sel, { w: 250, hit: () => { G.bindSel = i; } }); return; }
    UIHit.add(x, y, w, H, () => { G.bindSel = i; });
    uiPanel(ctx, x, y, w, H, { color: sel ? P.cyan : P.greyMid, fill: P.void, alpha: 0.9, glow: sel });
    uiText(ctx, r.label, x + 10, y + 16, { size: T.body, color: sel ? P.ice : P.grey });
    const waiting = sel && G.bindWait;
    uiText(ctx, waiting ? 'PRESS A KEY ...' : Input.codeLabel(Input.code(r.id)), x + w - 10, y + 16, { size: T.body, color: waiting ? P.yellow : P.cyan, align: 'right' });
  });
  if (G.bindWait) uiText(ctx, 'PRESS A NEW KEY    ESC = CANCEL', STAGE_W / 2, 348, { size: T.small, color: P.grey, align: 'center' });
}

function drawPauseScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type;
  ctx.fillStyle = 'rgba(5,6,15,0.75)'; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  uiText(ctx, 'PAUSE', STAGE_W / 2, 80, { size: T.title, color: P.cyan, align: 'center', glow: P.cyan });
  if (!Tutorial.active) {                                              // Komfort: Stand des Laufs
    const so = Math.floor(G.time * CFG.meta.perSecond + G.bosses * CFG.meta.perBoss) + G.lootCores;
    uiText(ctx, 'TIME ' + formatTime(G.time) + '    LEVEL ' + Xp.level + '    KILLS ' + G.kills + '    BOSSES ' + G.bosses + '    CREDITS +' + so, STAGE_W / 2, 94, { size: T.small, color: P.grey, align: 'center' });
    Xp.drawPause(ctx);
  }
  const bars = Math.round(Save.data.musicVol * 10);
  const rows = {
    resume: 'RESUME',
    music: 'MUSIC  ' + '|'.repeat(bars) + '.'.repeat(10 - bars),
    sfx: 'SOUND FX  ' + '|'.repeat(Math.round(Save.data.sfxVol * 10)) + '.'.repeat(10 - Math.round(Save.data.sfxVol * 10)),
    abilities: 'ABILITIES',
    binds: 'KEYBINDS',
    exitfs: 'EXIT FULLSCREEN',
    quit: G.pauseConfirm ? 'SURE? [SPACE]' : Tutorial.active ? 'LEAVE TUTORIAL' : 'GIVE UP',
  };
  const pItems = pauseItems(), step = pItems.length > 6 ? 28 : 32;
  pItems.forEach((id, i) => drawMenuRow(ctx, 104 + i * step, rows[id], G.pauseSel === i, { w: 260, hit: () => { if (G.pauseSel !== i) { G.pauseSel = i; G.pauseConfirm = false; } }, lr: id === 'music' || id === 'sfx' }));
  if (!Tutorial.active) drawPauseEvos(ctx);
}

// Evolutionen im Pausenmenue: eine Karte je Waffenslot. Aktiv = Name der Evolution, sonst das beste Rezept der ausgerüsteten Waffe mit Stand des Partners
function drawPauseEvos(ctx) {
  const P = STYLE.pal, T = STYLE.type, E = CFG.evolutions, p = G.player, slots = CFG.items.slots.filter((s) => s.id !== 'artifact');
  const w = 146, gap = 6, x0 = STAGE_W / 2 - (slots.length * w + (slots.length - 1) * gap) / 2, y = 298, h = 36;
  slots.forEach((S, i) => {
    const x = x0 + i * (w + gap), wid = Save.equipped(S.id), W = wid ? CFG.items.catalog[wid] : null, col = slotColor(S.id), done = p.evolved[S.id];
    const recs = wid ? Object.keys(E.list).filter((id) => E.list[id].slot === S.id && E.list[id].weapon === wid) : [];
    const rid = done || recs.find((id) => evoPartner(E.list[id], true).have) || recs[0], R = rid ? E.list[rid] : null, pt = R ? evoPartner(R, true) : null;
    uiPanel(ctx, x, y, w, h, { color: done ? P.yellow : col, fill: P.void, alpha: 0.92, glow: !!done });
    ctx.fillStyle = col; ctx.globalAlpha = 0.6; ctx.fillRect(x + 1, y + 4, 3, h - 8); ctx.globalAlpha = 1;
    if (W) drawIcon(ctx, W.icon, x + 19, y + h / 2, Math.min(20, W.iconW + 2), 1);
    let l1, c1, l2, c2;
    if (done) { l1 = R.name; c1 = P.yellow; l2 = 'EVOLVED'; c2 = P.cyan; }
    else if (!W) { l1 = S.label; c1 = P.greyMid; l2 = 'EMPTY SLOT'; c2 = P.greyMid; }
    else if (!R) { l1 = W.name; c1 = P.grey; l2 = 'NO EVOLUTION'; c2 = P.greyMid; }
    else {
      l1 = R.name; c1 = P.grey;
      const need = Math.max(0, E.minUps - G.bosses);
      l2 = !pt.have ? 'NEEDS ' + pt.name : need ? 'BOSSES ' + G.bosses + '/' + E.minUps : 'READY AFTER NEXT BOSS';
      c2 = !pt.have ? P.red : need ? P.yellow : P.green;
    }
    const tx = x + (pt && !done ? 46 : 34), tw = w - (tx - x) - 6;
    uiText(ctx, uiFit(ctx, l1, tw, T.body), tx, y + 15, { size: T.body, color: c1 });
    uiText(ctx, uiFit(ctx, l2, tw, T.small), tx, y + 28, { size: T.small, color: c2 });
    if (pt && !done) drawEvoChip(ctx, x + 38, y + h / 2, pt, 12);
  });
}

// Ability-Tausch im Pausenmenue: gesammelte Abilities nach Gruppe, Leertaste setzt die gewaehlte in den Slot
function drawSwapScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type, p = G.player, rows = G.swapRows();
  ctx.fillStyle = 'rgba(5,6,15,0.85)'; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  uiText(ctx, 'ABILITIES', STAGE_W / 2, 42, { size: T.h1, color: P.cyan, align: 'center', glow: P.cyan });
  uiText(ctx, 'COLLECTED ABILITIES CAN BE SWAPPED INTO THEIR SLOT ANY TIME', STAGE_W / 2, 58, { size: T.small, color: P.grey, align: 'center' });
  const COLORS = { weak: P.cyan, medium: P.yellow, strong: P.orange };
  const w = 400, x = STAGE_W / 2 - w / 2, H = 32, GAP = 35, Y0 = 70, VIS = 6;
  const all = rows.concat(['_back']), off = clamp(G.swapSel - (VIS - 1), 0, Math.max(0, all.length - VIS));
  if (!rows.length) uiText(ctx, 'NOTHING COLLECTED YET - DEFEAT A BOSS', STAGE_W / 2, 120, { size: T.body, color: P.grey, align: 'center' });
  all.slice(off, off + VIS).forEach((id, k) => {
    const i = off + k, sel = G.swapSel === i, y = Y0 + k * GAP;
    if (id === '_back') { drawMenuRow(ctx, y + 2, 'BACK', sel, { w: 190, hit: () => { G.swapSel = i; } }); return; }
    UIHit.add(x, y, w, H, () => { G.swapSel = i; });
    const A = CFG.loadout.abilities[id], eq = p.slots[A.tier] === id, tier = CFG.loadout.tiers.find((t) => t.id === A.tier);
    uiPanel(ctx, x, y, w, H, { color: sel ? P.cyan : P.greyMid, fill: P.void, alpha: 0.9, glow: sel });
    ctx.fillStyle = COLORS[A.tier]; ctx.fillRect(x + 1, y + 3, 3, H - 6);
    drawIcon(ctx, A.icon, x + 20, y + H / 2, 20, eq ? 1 : 0.6);
    uiText(ctx, A.name, x + 40, y + 14, { size: T.h2, color: sel ? P.ice : P.grey });
    uiText(ctx, tier.label + (A.passive ? ' - PASSIVE' : ' - KEY ' + Input.label('ability_' + A.tier)), x + 40, y + 27, { size: T.small, color: P.grey });
    uiText(ctx, eq ? 'EQUIPPED' : 'EQUIP [SPACE]', x + w - 10, y + 27, { size: T.small, color: eq ? P.cyan : P.yellow, align: 'right' });
  });
  const cur = all[G.swapSel];
  if (cur && cur !== '_back') {
    const lines = upgradeDetail({ kind: 'ability', id: cur });
    uiPanel(ctx, x, 316, w, 28, { color: P.greyMid, fill: P.void, alpha: 0.9 });
    uiText(ctx, lines[0], x + 10, 327, { size: T.small, color: P.ice });
    uiText(ctx, lines[1], x + 10, 339, { size: T.small, color: P.grey });
  }
}

function drawSettingsScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type;
  drawMenuBg(ctx, 'keysettings');
  uiText(ctx, 'SETTINGS', STAGE_W / 2, 40, { size: T.h1, color: P.yellow, align: 'center' });
  uiText(ctx, 'SOUND, EFFECTS AND FULLSCREEN: ICONS IN THE MAIN MENU', STAGE_W / 2, 54, { size: T.small, color: P.greyMid, align: 'center' });
  const rows = {
    attackmode: 'ATTACK: ' + (Save.data.attackMode === 'toggle' ? 'TOGGLE' : 'HOLD'),
    mouseaim: 'MOUSE AIMING: ' + (Save.data.mouseAim ? 'ON' : 'OFF'),
    touch: 'TOUCH CONTROLS: ' + (Save.data.touch ? 'ON' : 'OFF'),
    language: 'LANGUAGE: ' + (Save.data.lang === 'de' ? 'DEUTSCH' : 'ENGLISH'),
    slot: 'SLOT  ' + [0, 1, 2].map((i) => i === Save.slot ? '[' + (i + 1) + ']' : ' ' + (i + 1) + ' ').join(' '),
    back: 'BACK',
    controls: 'CONTROLS',
    binds: 'KEYBINDS',
    account: 'ACCOUNT: ' + (Account.on ? Account.meta.name.toUpperCase() : 'NOT LOGGED IN'),
    transfer: 'EXPORT / IMPORT SAVE',
    resetAll: G.resetConfirm ? 'SURE? DELETE SLOT ' + (Save.slot + 1) : 'RESET SAVE FILE (SLOT ' + (Save.slot + 1) + ')',
  };
  const colW = 300, gap = 20, ROW = 28;
  let idx = 0;
  SETTINGS_COLS.forEach((col, ci) => {
    const cx = STAGE_W / 2 + (ci === 0 ? -1 : 1) * (colW / 2 + gap / 2), accent = ci === 0 ? P.cyan : P.orange;
    uiText(ctx, col.label, cx, 76, { size: T.h2, color: accent, align: 'center' });
    col.items.forEach((id, k) => {
      const i = idx++, y = 84 + k * ROW;
      drawMenuRow(ctx, y, rows[id], G.settingsSel === i, { w: colW, h: 24, cx, hit: () => { G.settingsSel = i; }, lr: id === 'slot' });
      if (id === 'account' && Account.configured && !Account.on) uiHintDot(ctx, cx + colW / 2 - 12, y + 12, G.realTime);
    });
  });
  const backI = idx;
  const cw = 150, cg = 6, cx0 = STAGE_W / 2 - (3 * cw + 2 * cg) / 2;                  // die drei Spielstaende als Karten (Klick wechselt den Slot)
  for (let i = 0; i < Save.SLOTS; i++) {
    const x = cx0 + i * (cw + cg), y = 254, on = i === Save.slot, I = Save.slotInfo(i);
    UIHit.add(x, y, cw, 38, () => { Save.switchSlot(i); G.resetConfirm = false; }, { noConfirm: true });
    uiPanel(ctx, x, y, cw, 38, { color: on ? P.yellow : P.greyMid, fill: on ? P.voidLight : P.void, alpha: 0.92, glow: on });
    uiText(ctx, 'SLOT ' + (i + 1) + (on ? '  - ACTIVE' : ''), x + 8, y + 13, { size: T.small, color: on ? P.yellow : P.grey });
    uiText(ctx, I ? 'BEST ' + (I.best > 0 ? formatTime(I.best) : '-') + '   RUNS ' + I.runs : 'EMPTY', x + 8, y + 25, { size: T.small, color: I ? P.ice : P.greyMid });
    if (I) uiText(ctx, 'CREDITS ' + I.souls + (I.wins ? '   WINS ' + I.wins : ''), x + 8, y + 35, { size: T.small, color: P.yellow });
  }
  drawMenuRow(ctx, 308, rows.back, G.settingsSel === backI, { w: 190, h: 22, hit: () => { G.settingsSel = backI; } });
}

// Controls panel: explains every action in general terms and always shows the CURRENT keys (they can be rebound in Settings > Keybinds)
function drawKeysScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type;
  drawMenuBg(ctx, 'keysettings');
  uiText(ctx, 'CONTROLS', STAGE_W / 2, 40, { size: T.h1, color: P.yellow, align: 'center' });

  // chips: one key chip per action id, returns the x position after the last chip
  const chips = (x, y, ids, color) => {
    for (const id of ids) {
      const lab = Input.label(id), w = Math.max(14, lab.length * 6 + 8);
      uiKey(ctx, x, y, lab, w, { color });
      x += w + 3;
    }
    return x;
  };
  const panel = (x, y, w, h, title, color) => {
    uiPanel(ctx, x, y, w, h, { color: P.frame });
    uiText(ctx, title, x + 8, y + 12, { size: T.small, color });
  };
  // one row: key chips, name next to them, short explanation below
  const row = (x, y, ids, name, sub, color) => {
    const nx = chips(x + 8, y, ids, color);
    uiText(ctx, name, nx + 4, y + 11, { size: T.body, color: P.ice });
    uiText(ctx, sub, x + 8, y + 22, { size: T.small, color: P.grey });
  };

  const W = Math.floor((STAGE_W - 48 - 24) / 3), C1 = 24, C2 = C1 + W + 12, C3 = C2 + W + 12;      // drei Spalten
  panel(C1, 54, W, 78, 'MOVE & AIM', P.cyan);
  const mx = chips(C1 + 8, 70, ['up', 'left', 'down', 'right'], P.cyan);
  uiText(ctx, 'MOVE', mx + 4, 81, { size: T.body, color: P.ice });
  uiText(ctx, 'You always face the way you move.', C1 + 8, 100, { size: T.small, color: P.grey });
  uiText(ctx, 'Weapons fire where you face.', C1 + 8, 111, { size: T.small, color: P.grey });

  panel(C1, 136, W, 134, 'GOOD TO KNOW', P.yellow);
  const tips = ['Beat a boss to pick a new ability (1 of 3).', 'Passive abilities need no key.', 'ESC, P or BACKSPACE pauses the game.', 'Rebind keys: Settings > Keybinds.'];
  let ty = 158;
  tips.forEach((t) => { ty += 12 * uiWrap(ctx, t, C1 + 8, ty, W - 16, 12, { size: T.small, color: P.grey }) + 3; });

  panel(C2, 54, W, 150, 'COMBAT', P.red);
  row(C2, 70, ['attack'], 'ATTACK', 'Hold to use the weapon.', P.red);
  row(C2, 98, ['weapon1', 'weapon2'], 'SWITCH WEAPON', 'Melee / ranged (or wheel).', P.red);
  row(C2, 126, ['beam'], 'HEAVY WEAPON', 'Tap or hold, per weapon.', P.yellow);
  row(C2, 154, ['ultimate'], 'ULTIMATE', 'Needs a full orb (kills).', P.teal);

  panel(C3, 54, W, 150, 'ABILITIES', P.cyan);
  row(C3, 70, ['ability_weak'], 'WEAK SLOT', 'Short cooldown, small.', P.cyan);
  row(C3, 94, ['ability_medium'], 'MEDIUM SLOT', 'Longer cooldown, stronger.', P.cyan);
  row(C3, 118, ['ability_strong'], 'STRONG SLOT', 'Long cooldown, huge effect.', P.cyan);
  row(C3, 142, ['artifact'], 'HERO ARTIFACT', 'Heroes after Vanguard only.', P.yellow);

  // Menue-Bedienung (frueher als Hinweiszeile unten auf jedem Bildschirm)
  panel(C2, 208, 2 * W + 12, 78, 'MENUS', P.green);
  const mrow = (x, y, key, text, kw) => { uiText(ctx, key, x, y, { size: T.small, color: P.ice }); uiText(ctx, text, x + kw, y, { size: T.small, color: P.grey, maxW: W - kw - 6 }); };
  [['W/S, ARROWS', 'SELECT (OR MOUSE)'], ['A/D, ARROWS', 'CHANGE / SWITCH TAB'], ['SPACE, ENTER', 'CONFIRM / BUY / EQUIP'], ['ESC, X, R-CLICK', 'BACK']].forEach(([k, t], i) => mrow(C2 + 8, 230 + i * 12, k, t, 84));
  [['U', 'LEVEL UP GEAR (INVENTORY)'], ['TAB', 'RUN DETAILS / OWN DATA'], ['P, BACKSPACE', 'PAUSE (ALSO ESC)'], ['L M N V F' + (PWA.visible ? ' I' : '') + (statsOpen() ? ' T' : ''), 'MAIN MENU ICONS']].forEach(([k, t], i) => mrow(C2 + W + 18, 230 + i * 12, k, t, 62));

  uiText(ctx, 'SURVIVE.', STAGE_W / 2, 296, { size: T.h2, color: P.red, align: 'center', glow: P.red });
  UIHit.add(STAGE_W / 2 - 80, 306, 160, 24, () => {});                // Klick = zurueck
  drawPrompt(ctx, 'BACK [SPACE]', 322);
}

const PIXEL_FONT = STYLE.font;

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// Text mit dunklem Rand, mittig (Kurzform von uiText aus style.js)
function outlinedText(ctx, text, x, y, size, color) {
  uiText(ctx, text, x, y, { size, color, align: 'center' });
}

// Die Texte der Death-Screens: mittig, in der Breite des Original-Textes
// Neue Meilensteine als Textzeilen: höchstens 3, der Rest als "+N MORE"
// Belohnung eines Meilensteins als Text ("+60 CREDITS" / "SKIN: CRIMSON")
function milestoneRewardText(m) {
  if (m.reward.cores) return '+' + m.reward.cores + ' CREDITS';
  if (m.reward.hero) return 'HERO: ' + CFG.heroes[m.reward.hero].name;
  return '';
}
function milestoneLines() {
  const list = G.newMilestones, lines = list.slice(0, 3).map((m) => 'MILESTONE: ' + m.name + '  (' + milestoneRewardText(m) + ')');
  if (list.length > 3) lines.push('+' + (list.length - 3) + ' MORE MILESTONES');
  return lines;
}

// Ein Text des Death-Screens (Eintrag aus DEATH_TEXTS) in der Tönung tint
function drawDeathItem(ctx, t, tint) {
  ctx.save();
  ctx.textRendering = 'optimizeSpeed';
  ctx.fillStyle = tint;
  ctx.font = t.px + 'px ' + PIXEL_FONT;
  if (t.rot) {
    ctx.translate(t.x + (STAGE_W - 480) / 2, t.y);
    ctx.rotate(t.rot * DEG);
    ctx.textAlign = 'left';
    ctx.fillText(I18n.t(t.text), 0, 0);
  } else {
    const target = Math.min(480 - 2 * t.x, 480 - 20);
    const w = ctx.measureText(I18n.t(t.text)).width;
    const px = clamp(t.px * target / w, t.px * 0.6, t.px * 1.4);
    ctx.font = px + 'px ' + PIXEL_FONT;
    ctx.textAlign = 'center';
    ctx.fillText(I18n.t(t.text), STAGE_W / 2, t.y);
  }
  ctx.restore();
}
function drawDeathTexts(ctx, name) {
  for (const t of DEATH_TEXTS[name] || []) drawDeathItem(ctx, t, STYLE.deathTints[name] || t.fill);     // Textfarbe = Tönung des Death-Screens
}

// ---------- Ending (Sieg über den finalen Boss) ----------
// Teil A (ENDING_SPLIT s): Der Tod verliert die Fassung. Seine Sätze erscheinen nacheinander, das "DEATH" wird zu "END".
// Teil B: Sieg-Bildschirm mit Statistik und Belohnung. Zeiten in Sekunden seit Beginn des Endings.
const ENDING_LINES = [[1.5, 1], [3.5, 2], [5.0, 3], [6.5, 4], [8.5, 5]];     // [ab Sekunde, Index in DEATH_TEXTS.deathSecret4]
const ENDING_SPLIT = 11, ENDING_MENU_AT = 13.5;
function drawEndingScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type, t = G.endAge;
  if (t < ENDING_SPLIT) {
    const tint = STYLE.deathTints.deathSecret4;
    ctx.save();
    const shake = t > 1.5 ? Math.min(3, 0.4 + t * 0.3) : 0;                         // je panischer er wird, desto mehr zittert alles
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawMenuBg(ctx, 'deathSecret4', true);
    const title = Object.assign({}, DEATH_TEXTS.deathSecret4[0], { text: t < 9.6 ? 'DEATH' : 'END', x: t < 9.6 ? 35.75 : 119.76 });
    drawDeathItem(ctx, title, tint);
    for (const [from, idx] of ENDING_LINES) if (t >= from) drawDeathItem(ctx, DEATH_TEXTS.deathSecret4[idx], tint);
    ctx.restore();
    if (t < 1.5) { ctx.fillStyle = 'rgba(255,255,255,' + (1.5 - t) / 1.5 + ')'; ctx.fillRect(0, 0, STAGE_W, STAGE_H); }       // Sieg-Blitz
    return;
  }
  const k = Math.min(1, (t - ENDING_SPLIT) / 0.8);
  drawMenuBg(ctx, 'deathSecret3', true);
  ctx.save(); ctx.globalAlpha = k;
  outlinedText(ctx, 'YOU WIN', STAGE_W / 2, 100, 64, P.yellow);
  uiText(ctx, 'If you read this you have finished the game', STAGE_W / 2, 126, { size: T.h2, color: P.ice, align: 'center' });
  uiText(ctx, 'I am proud of you!', STAGE_W / 2, 144, { size: T.h2, color: P.yellow, align: 'center' });
  const rows = [['TIME', formatTime(G.time)], ['BOSSES', String(G.bosses)], ['KILLS', String(G.kills)], ['CREDITS', '+' + G.earned]];
  rows.forEach(([a, b], i) => {
    uiText(ctx, a, STAGE_W / 2 - 70, 190 + i * 18, { size: T.h2, color: P.grey });
    uiText(ctx, b, STAGE_W / 2 + 70, 190 + i * 18, { size: T.h2, color: P.ice, align: 'right' });
  });
  if (G.levelRes) uiText(ctx, '+' + G.levelRes.xp + ' XP   -   LV ' + G.levelRes.to + (G.levelRes.to > G.levelRes.from ? '   LEVEL UP!' : ''), STAGE_W / 2, 264, { size: T.small, color: P.yellow, align: 'center' });
  milestoneLines().forEach((l, i) => uiText(ctx, l, STAGE_W / 2, 275 + i * 11, { size: T.small, color: P.cyan, align: 'center' }));
  ctx.restore();
  if (t > ENDING_MENU_AT && !G.deathDetails) drawKeyButtons(ctx, [['MENU [SPACE]', 'Space'], ['DETAILS [TAB]', 'Tab']], 322);
  if (G.deathDetails && Stats.summary) drawRunDetails(ctx, Stats.summary);
}

// Spielerlevel nach einem Lauf: "+N XP" und bei Aufstieg "LEVEL UP! LV a -> b" mit dem, was freigeschaltet wurde. Gibt die naechste freie y-Zeile zurueck.
function drawLevelResult(ctx, R, ry) {
  const r = G.levelRes, T = STYLE.type, P = STYLE.pal;
  if (!r) return ry;
  uiText(ctx, '+' + r.xp + ' XP   (LV ' + r.to + ')', R, ry, { size: T.small, color: P.yellow, align: 'right' }); ry += 11;
  if (r.to > r.from) {
    uiText(ctx, 'LEVEL UP!  LV ' + r.from + ' > ' + r.to, R, ry, { size: T.small, color: P.green, align: 'right', glow: P.green }); ry += 11;
    for (const id of Object.keys(CFG.level.gates)) {
      const g = CFG.level.gates[id];
      if (g > r.from && g <= r.to) { uiText(ctx, 'UNLOCKED: ' + id.toUpperCase(), R, ry, { size: T.small, color: P.green, align: 'right' }); ry += 11; }
    }
  }
  return ry;
}

function drawDeathScreen(ctx) {
  const name = deathScreenFor(G.time);
  drawMenuBg(ctx, name, true);
  if (G.infinite) uiText(ctx, 'INFINITE MODE', 12, 24, { size: STYLE.type.h2, color: STYLE.deathTints[name] || STYLE.pal.red });
  drawDeathTexts(ctx, name);
  const tint = STYLE.deathTints[name] || STYLE.pal.red;
  if (!G.deathDetails && G.deadAge > 1) drawKeyButtons(ctx, [['MENU [SPACE]', 'Space'], ['RETRY [R]', 'KeyR'], ['DETAILS [TAB]', 'Tab']], 338, tint);
  const sm = Stats.summary, R = STAGE_W - 12;                                  // Layout: Belohnungen oben rechts, Zeit und Killer unten, damit nichts mit dem Spruch überlappt
  uiText(ctx, '+' + G.earned + ' CREDITS', R, 24, { size: STYLE.type.h2, color: STYLE.pal.yellow, align: 'right' });
  let ry = 36;
  ry = drawLevelResult(ctx, R, ry);
  if (G.starterBonus && G.starterBonus.extra > 0) { uiText(ctx, 'STARTER BONUS +' + G.starterBonus.extra + '  (RUN ' + G.starterBonus.run + '/' + G.starterBonus.of + ')', R, ry, { size: STYLE.type.small, color: STYLE.pal.green, align: 'right' }); ry += 11; }
  milestoneLines().forEach((l, i) => uiText(ctx, l, R, ry + i * 11, { size: STYLE.type.small, color: STYLE.pal.cyan, align: 'right' }));
  if (G.newBest) uiText(ctx, 'NEW BEST TIME!', STAGE_W / 2, 24, { size: STYLE.type.h2, color: STYLE.pal.yellow, align: 'center', glow: STYLE.pal.yellow });
  outlinedText(ctx, 'Time: ' + formatTime(G.time) + '  (' + G.time.toFixed(1) + ' s)', STAGE_W / 2, 292, 22, STYLE.pal.ice);
  if (sm) uiText(ctx, 'KILLED BY: ' + sm.killer, STAGE_W / 2, 312, { size: STYLE.type.small, color: STYLE.pal.ice, align: 'center' });
  if (G.deathDetails && sm) drawRunDetails(ctx, sm);
}

// Zweite Seite des Todesbildschirms (TAB): Todesursache, Schaden pro Quelle, Kills pro Waffe (Daten aus runstats.js)
function drawRunDetails(ctx, sm) {
  const P = STYLE.pal, T = STYLE.type;
  ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  const won = sm.killer === 'VICTORY';
  uiText(ctx, won ? 'VICTORY' : 'KILLED BY: ' + sm.killer, STAGE_W / 2, 30, { size: T.h1 || T.h2, color: won ? P.yellow : P.red, align: 'center' });
  uiText(ctx, 'TIME ' + formatTime(G.time) + '   LEVEL ' + sm.level + '   BOSSES ' + G.bosses + '   KILLS ' + G.kills + '   HITS TAKEN ' + sm.hitCount + '   DAMAGE ' + Math.round(sm.taken), STAGE_W / 2, 54, { size: T.small, color: P.grey, align: 'center' });
  uiText(ctx, 'SAFE SPOT BLOCKED ' + (sm.savedHits || 0) + ' HITS (ABOUT ' + Math.round(sm.savedDmg || 0) + ' DAMAGE)', STAGE_W / 2, 68, { size: T.small, color: sm.savedHits ? P.green : P.grey, align: 'center' });
  const col = (x, title, rows, color, fmt) => {
    const w = Math.floor((STAGE_W - 36 - 24) / 2), top = 76, rowH = 29, max = rows.length ? rows[0][1] : 1, total = rows.reduce((s, r) => s + r[1], 0) || 1;
    uiPanel(ctx, x, top, w, 256, { color: P.greyMid, fill: P.void, alpha: 0.95 });
    uiText(ctx, title, x + 10, top + 14, { size: T.h2, color });
    if (!rows.length) uiText(ctx, 'NOTHING YET', x + 10, top + 44, { size: T.small, color: P.grey });
    rows.slice(0, 7).forEach(([name, v], i) => {
      const y = top + 40 + i * rowH;
      uiText(ctx, uiFit(ctx, name, w * 0.6, T.small), x + 10, y, { size: T.small, color: i === 0 ? P.ice : P.grey });
      uiText(ctx, fmt(v, total), x + w - 10, y, { size: T.small, color: i === 0 ? P.yellow : P.grey, align: 'right' });
      ctx.fillStyle = P.greyMid; ctx.fillRect(x + 10, y + 6, w - 20, 4);
      ctx.fillStyle = color; ctx.fillRect(x + 10, y + 6, Math.max(2, Math.round((w - 20) * v / max)), 4);
    });
    if (rows.length > 7) uiText(ctx, '+' + (rows.length - 7) + ' MORE', x + 10, top + 40 + 7 * rowH, { size: T.small, color: P.grey });
  };
  const cw = Math.floor((STAGE_W - 36 - 24) / 2);
  col(18, 'DAMAGE TAKEN', sm.dmg, P.red, (v, tot) => Math.round(v) + ' (' + Math.round(100 * v / tot) + '%)');
  col(18 + cw + 24, 'KILLS BY WEAPON', sm.kills, P.cyan, (v) => String(v));
  const btns = [['BACK [TAB]', 'Tab'], ['MENU [SPACE]', 'Space']];
  if (G.mode !== 'ending') btns.push(['RETRY [R]', 'KeyR']);
  drawKeyButtons(ctx, btns, 340);
}


// Ability-Wahl nach einem Boss: Karten nebeneinander, Auswahl mit A/D oder Pfeilen, Bestätigen mit Leertaste/Enter (oder Ziffer)
function drawPickScreen(ctx) {
  const P = STYLE.pal, T = STYLE.type, k = G.pick;
  ctx.fillStyle = 'rgba(5,6,15,0.78)'; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  const evo = k.kind === 'evo', xp = k.kind === 'xp';
  uiText(ctx, evo ? 'EVOLUTION' : xp ? 'LEVEL UP!' : 'NEW ABILITY', STAGE_W / 2, 50, { size: T.h1 || T.h2, color: evo ? P.yellow : P.cyan, align: 'center', glow: xp ? P.cyan : undefined });
  uiText(ctx, evo ? 'ONE PER WEAPON SLOT - [ESC] SKIPS (OFFERED AGAIN AFTER THE NEXT BOSS)' : xp ? 'LEVEL ' + k.level + ' - PICK ONE UPGRADE, IT LASTS FOR THIS RUN' : k.tier ? 'SLOT: ' + k.tier.label : 'COLLECT ONE - SWAP LATER IN THE PAUSE MENU', STAGE_W / 2, 70, { size: T.small, color: P.yellow, align: 'center' });
  const n = k.ids.length, w = 140, gap = 10, x0 = STAGE_W / 2 - (n * w + (n - 1) * gap) / 2, y = 95, h = 190;
  k.ids.forEach((id, i) => {
    let A = xp ? null : CFG.loadout.abilities[id];
    if (xp) {                                                       // Level-up-Karte: Perk mit Wirkung je Stapel und Stand (x/max)
      const PK = CFG.xp.perks[id], have = Xp.stacks(id);
      A = { icon: PK.icon, iconW: PK.iconW, name: PK.name, desc: PK.desc, effect: Xp.effectText(id), xp: true, foot: 'OWNED ' + have + '/' + PK.max + '  >  ' + (have + 1) + '/' + PK.max };
    }
    if (evo) {                                                      // Evolutionskarte: Symbol der Waffe, gleiche Karte wie bei Abilities
      const R = CFG.evolutions.list[id], I = CFG.items.catalog[R.weapon], N = R.needs.ability ? CFG.loadout.abilities[R.needs.ability].name : CFG.items.catalog[R.needs.implant].name;
      A = { icon: I.icon, iconW: I.iconW, name: R.name, desc: R.desc, evo: true, foot: I.name + ' + ' + N };
    }
    const x = x0 + i * (w + gap), sel = i === k.sel;
    UIHit.add(x, y - 6, w, h + 6, () => { k.sel = i; });
    uiPanel(ctx, x, sel ? y - 6 : y, w, h, { color: sel ? P.cyan : P.greyMid, fill: P.void, alpha: 0.95, glow: sel });
    const yy = sel ? y - 6 : y;
    drawIcon(ctx, A.icon, x + w / 2, yy + 36, A.iconW * 2.2, 1);
    uiText(ctx, A.name, x + w / 2, yy + 80, { size: T.h2, color: sel ? P.ice : P.grey, align: 'center' });
    // Beschreibung grob umbrechen
    const words = A.desc.split(' '); let line = '', ly = yy + 100;
    for (const wd of words) {
      if ((line + ' ' + wd).length > 20 && line) { uiText(ctx, line, x + w / 2, ly, { size: T.small, color: P.grey, align: 'center' }); line = wd; ly += 11; }
      else line = line ? line + ' ' + wd : wd;
    }
    uiText(ctx, line, x + w / 2, ly, { size: T.small, color: P.grey, align: 'center' });
    if (A.effect) uiWrap(ctx, A.effect, x + 8, ly + 18, w - 16, 11, { size: T.small, color: P.cyan });       // Level-up: was ein Stapel bringt
    if (A.xp) { uiText(ctx, '[' + (i + 1) + ']  ' + A.foot, x + w / 2, yy + h - 8, { size: T.small, color: P.yellow, align: 'center' }); return; }
    if (A.evo) { uiText(ctx, A.foot, x + w / 2, yy + h - 14, { size: T.small, color: P.yellow, align: 'center' }); return; }
    const tl = CFG.loadout.tiers.find((t) => t.id === A.tier);
    uiText(ctx, tl.label + ' SLOT', x + w / 2, yy + h - 22, { size: T.small, color: ({ weak: P.cyan, medium: P.yellow, strong: P.orange })[A.tier], align: 'center' });
    uiText(ctx, '[' + (i + 1) + ']  ' + (A.passive ? 'PASSIVE' : 'KEY ' + Input.label('ability_' + A.tier)), x + w / 2, yy + h - 8, { size: T.small, color: P.yellow, align: 'center' });
  });
  if (Tutorial.active) uiText(ctx, 'After every boss you pick a new ability like this. Choose one.', STAGE_W / 2, 84, { size: T.small, color: P.yellow, align: 'center' });
  if (k.age > 0.6) drawPrompt(ctx, 'SELECT [SPACE]', 318);
}
