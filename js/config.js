// ============================================================================================
//  CONFIG: alle Zahlen des Spiels an einem Ort. Zum Balancen nur hier drehen.
//
//  Geschwindigkeiten stehen "pro Bild" (Scratch lief mit 30 Bildern pro Sekunde),
//  im Code rechnen wir sie mit dt auf Sekunden um (siehe util.js: framesOf).
//
//  INHALT (mit Strg+F nach der Nummer, z. B. "[4]", springen)
//   [1]  Globale Konstanten
//   [2]  Spieler        player, ult, bloodburst
//   [3]  Waffen         sword, lance (Nahkampf) | shot, impulse (Fernkampf) | beam, grenade, fire (Starke Waffe)
//   [4]  Inventar       items (Slots, Katalog mit Preisen, Artefakt-Werte)
//   [5]  Abilities      loadout (Slots, Auswahl) | dash, shield, blink, frost, pulse, field
//   [6]  Meta           meta (Seelen, Upgrades) | milestones (Belohnung: Cores oder Cosmetic)
//   [7]  Gegner         enemy | waves, guardSpawn, supportSpawn (Spawn-Takt) | patterns | events | spawner
//   [8]  Welt-Events    flood (Gegnerflut) | bloodMoon (Blutmond) | meteors (Meteoritenhagel)
//   [9]  Drops          powerup (Heilung) | drops (Buffs)
//   [10] Bosse          boss
//   [11] Welt           map, camera, spawnPoints
//   [9b] XP im Lauf     xp (Level-ups, Perks)
//   [12] Spielende      finalBoss (Ende per Boss), ending (Belohnung), DEATH_SCREENS
// ============================================================================================


// ---------- [1] Globale Konstanten ----------
const FPS = 30;
const STAGE_W = 480;          // Scratch-Bühne: 480 x 360, Mittelpunkt (0,0), y zeigt nach oben
const STAGE_H = 360;
const SCALE = 2;              // Canvas = 960 x 720
const DEG = Math.PI / 180;
const WEAPON_NAMES_LIST = ['Blade', 'Blaster'];   // Reihenfolge = Tasten 1, 2 (Leertaste greift mit der gewählten Waffe an). Die starke Waffe liegt separat auf E.
const WEAPON = { SWORD: 0, SHOT: 1 };

const CFG = {

  // ==========================================================================================
  //  [2] SPIELER
  // ==========================================================================================
  player: {
    size: 250,                // Größe in Prozent, gleich wie der Kreis-Gegner (beide 16 px große Sprites)
    speed: 5.5,               // Original: 5.5 (war 6.2, gesenkt, weil das Schwert beim Angreifen kaum noch bremst). Muss schneller bleiben als die ersten Bosse (Oktagon 3.25, Kite 3.75; Karte 3: bis 4.3)
    boostSpeed: 7.3,          // Original: 7.5, gilt, wenn das Ultimate geladen ist
    hitRadius: 10,            // gleich wie der Kreis-Gegner
    maxHp: 100,
    startInvincible: 0.125,
    hitCooldown: 0.35,        // so lange kann man nach einem Treffer nicht getroffen werden (war 0.75, mehr als halbiert; Upgrade Recovery im gleichen Verhältnis)
    turnSmoothing: 0.2,       // wie schnell sich der Spieler in Laufrichtung dreht
    turnSmoothingBig: 0.4,    // ... bei Drehungen ueber 90 Grad (schnelle 180-Grad-Wende, um Gegner hinter sich zu treffen)
    turnMinStep: 8,           // mindestens so viele Grad pro Bild, damit der Schluss der Drehung nicht ausschleicht
    tapSeconds: 0.14,         // kurzer Tastendruck (kuerzer als das): Spieler dreht sich nur in die Richtung, ohne zu laufen. Laenger gehalten: er laeuft los
    faceTolerance: 25,        // zeigt er schon (fast) in die Tastenrichtung, laeuft er sofort los
    releaseGrace: 0.07,       // Toleranz beim Loslassen: lässt man erst eine von zwei Richtungstasten los, bleibt die alte Richtung so lange gültig (Diagonale bleibt erhalten)
    moveGrace: 0.12,          // direkt nach dem Laufen zaehlt ein neuer Druck sofort als Laufen (fluessiges Richtungswechseln)
    afkSeconds: 7.5,          // so lange stillstehen, dann Leben-Verlust
    afkDamage: 0.5,
    hitDamageMin: 8,
    hitDamageMax: 10,
    ramp: { marks: [300, 600, 900], add: [0.5, 1.0, 1.5] },        // Gegner machen ab diesen Wellen-Sekunden (5 / 10 / 15 Min.; 15 nur im Endlos-Modus) mehr Schaden: dieser Wert wird zum Karten-Schadensfaktor (diff.damage) ADDIERT, der Wert ersetzt den vorigen (nicht im Tutorial). Karte 1 ist so bei der Haelfte (7 Min.) bei 1.5 = Basiswert von Karte 2
    kiteBaseDamage: 7.5,      // Kite-Boss: fester Schaden = 7.5 + Boss-Stufe
    // [Leben größer als, Schadensfaktor] (der rote Rand hängt nicht an diesen Stufen, siehe `warn`)
    // Original: 0.65 / 0.55 / 0.5 / 0.35 / 0.15 (das Sicherheitsnetz machte fast unsterblich). Jetzt deutlich weniger Nachlass.
    damageTiers: [[50, 1.0], [25, 0.85], [15, 0.7], [7.5, 0.55], [-1, 0.4]],
    // Roter Warnrand bei wenig Leben: ab `from` Leben wird er sichtbar und steigt gleichmäßig bis `full` (volle Stärke).
    // Unter `pulseBelow` Leben pulsiert die Deckkraft (pulseDepth = wie stark sie einbricht, pulseHz = Takt, schneller bei weniger Leben).
    warn: { from: 70, full: 12, minAlpha: 0.2, maxAlpha: 1, pulseBelow: 30, pulseDepth: 0.35, pulseHz: 1.2, pulseHzMax: 3 },
  },

  // Ultimate (Taste V): lädt sich durch Kills auf
  ult: {
    readyAt: 75,              // ab dieser Ladung ist das Ultimate bereit (Tempo-Boost)
    cost: 40,
    boostHeal: 20,            // Heilung beim ERSTEN Erreichen der Ladung pro Lauf (Original: 35 bei jedem Mal, war die Heal-Meta)
    maxStack: 5,              // so viele Ultimates lassen sich insgesamt speichern (große + kleine Kugel)
    stackRates: [1, 0.5, 0.42, 0.37],   // Ladetempo des 1., 2., 3., 4. Ultimates (der Sprung 1 -> 2 ist am größten, danach kleine Schritte)
    stackTail: 0.9,           // ab dem 5. Ultimate: Tempo des Vorgängers x diesen Faktor
    chargeFactor: 0.75,      // Kills laden das Ultimate nur drei viertel so schnell wie im Original
    usableInBossFight: true,  // im Original wurde das Ultimate im Bosskampf sofort gelöscht; Schaden an Bossen: CFG.boss.ultDamage
  },

  // Bloodburst: Notfallangriff bei Beinahe-Tod (nur automatisch durch niedrige Leben)
  bloodburst: {
    triggerHp: 3.5,
    rearmHp: 75,
    heal: 5,
    comboWindow: 1.5,         // Kill-Kombo (Lücke unter 1.5 s): löst keinen Bloodburst mehr aus, zählt nur für das Achievement COMBO BREAKER
    cooldown: 120,            // Sekunden, bis der nächste Bloodburst möglich ist (Original: sofort wieder)
    protectSeconds: 2.5,      // so lange ist man danach (fast) unverwundbar (Original ca. 4.5 s)
  },


  // ==========================================================================================
  //  [3] WAFFEN  (Leertaste greift an, 1 = Nahkampf, 2 = Fernkampf, E = Starke Waffe)
  //  Welche Waffe in welchem Slot liegt, steht in [4] items. moveFactor = Lauftempo, solange man angreift.
  // ==========================================================================================

  // --- Nahkampf: Schwert ---
  // Wirkung aller Angriffstempo-Boni je Waffe (1 = voll, mehr = staerker): Schwert bekommt mehr davon als der Blaster. Andere Waffen: 1.
  hasteScale: { sword: 1.6, shot: 0.7 },
  // Plasma Blade: Klingen halten Gegner auf Abstand. Jeder Treffer stoesst den Gegner knock Einheiten vom Spieler weg und betaeubt ihn nur kurz (stun, normal 0.5 s),
  // damit mehrere Klingen ihn nacheinander treffen. Jeder Boss-Schritt: Groesse +upSize, Rueckstoss +upKnock (bis maxKnock). Bosse und Tanks werden nicht geschoben.
  sword: { baseSpeed: 30, baseSize: 0.9, baseNumber: 1, maxSize: 1.9, upSize: 0.09, spawnTime: 0.066, moveFactor: 0.92, knock: 14, upKnock: 2.5, maxKnock: 32, stun: 0.2 },

  // --- Nahkampf: Lanze ---
  // Stoß in Blickrichtung. Ab Spielzeit backAtTime stößt sie auch nach hinten, ab sidesAtTime auch zu den Seiten
  // (wie die Klingenzahl beim Schwert, dazwischen steigen nur Reichweite und Tempo).
  // reach = Reichweite, width = halbe Breite, thrust = Dauer eines Stoßes, cooldown = Pause.
  // Zielhilfe (schwächer als beim Schuss): der vordere Stoß richtet sich auf Gegner im Kegel aimAssistDeg aus,
  // die anderen Stöße bleiben im festen Winkel dazu.
  lance: { aimAssistDeg: 15, aimAssistRange: 130, backAtTime: 60, sidesAtTime: 180, reach: 80, width: 10, thrust: 0.22, cooldown: 0.4, moveFactor: 0.85, maxReach: 150, minCooldown: 0.1 },

  // --- Fernkampf: Schuss ---
  // Gebufft (Original: Tempo 8, Größe 1, Cooldown 0.5 s, 25 Bilder Reichweite): breiterer Treffer, schneller, weiter und mit Zielhilfe:
  // liegt ein Gegner im Kegel von aimAssistDeg Grad vor dem Spieler, zielt der Schuss darauf.
  shot: { baseSpeed: 10, baseSize: 2, baseCooldown: 0.35, maxSpeed: 12, maxSize: 11, minCooldown: 0.18, frames: 30,
          hitPad: 3, aimAssistDeg: 25, aimAssistRange: 320,
          // Nachladen (nur Blaster): erst ab Doppelschuss (Stufe 1). Nach `mag` Salven kommt eine kurze Pause `time` (s), danach wieder lange freies Feuern.
          // Mit dem dritten Schuss (Stufe 2) wird die Pause etwas laenger. Index = Schuss-Stufe (0 = Einzelschuss, kein Nachladen). Pause laeuft mit dem Angriffstempo schneller.
          // Durchschlag (nur Blaster, waffenspezifisches Upgrade): alle `every` Waffen-Upgrades (Boss-Siege, Weapon-Tuning) fliegt der Schuss durch ein Ziel mehr (bis `max`),
          // dazu +1 bei maximaler Ausruestungsstufe des Blasters (Inventar leveln). Ziele = Gegner, Bosse, Spawner, Barrikaden.
          pierce: { every: 2, max: 2, maxGearBonus: 1 },
          reload: [null, { mag: 18, time: 0.6 }, { mag: 18, time: 0.8 }], idleRefill: 1.2 },

  // --- Fernkampf: Impuls ---
  // Welle fliegt vorwärts. width = halbe Breite, push = Rückstoß pro Bild, frames = Lebensdauer.
  impulse: { speed: 15, frames: 36, width: 34, thick: 5, push: 20, cooldown: 0.8, maxWidth: 52, minCooldown: 0.5 },

  // --- Nahkampf (Vorbild Survivor.io): Peitsche, Katana, Hammer ---
  // range = Reichweite, arc = halber Winkel, life = Dauer des Treffers, delay = Verzoegerung (Katana-Rueckhieb), cooldown = Pause, moveFactor = Lauftempo beim Angreifen
  whip: { range: 80, arc: 24, life: 0.12, cooldown: 0.42, moveFactor: 0.8, aimAssistDeg: 20, aimAssistRange: 130 },
  // Katana: U-foermige Welle, die vom Spieler wegzeigt. range = Tiefe der Spitze vor dem Spieler, gap = Abstand der Armenden zum Spieler (vorderer und hinterer Hieb ueberlappen so nie),
  // width = halbe Breite (Start = Spielerbreite), curve = Rundung (1 = spitzes V, 2 = U), thick = Dicke an der Spitze
  katana: { range: 54, gap: 22, width: 10, curve: 2.2, thick: 12, chevron: true, life: 0.1, backDelay: 0.12, cooldown: 0.55, moveFactor: 0.75, aimAssistDeg: 25, aimAssistRange: 100 },
  // Hammer: Schlag offset Einheiten vor dem Spieler, radius = Wirkung, push = Rueckstoss, bossMul = Schadensfaktor gegen Bosse
  hammer: { offset: 30, radius: 52, life: 0.16, push: 24, bossMul: 2, cooldown: 1.15, moveFactor: 0.6 },

  // --- Waffen-Upgrades nach jedem Boss (zusaetzlich zu Schwert/Schuss/Lanze/Impuls in Loadout.weaponUp) ---
  // Pro besiegtem Boss wird jeder Wert in CFG[waffe][wert] um step veraendert, begrenzt durch max (nach oben) bzw. min (nach unten).
  // Zu Beginn jedes Laufs werden die Startwerte wiederhergestellt (Loadout.reset). Starke Waffen bekommen bewusst kleinere Schritte.
  weaponUps: {
    whip:      { range: { step: 3, max: 100 }, cooldown: { step: -0.02, min: 0.25 } },
    katana:    { range: { step: 3, max: 90 }, width: { step: 1.5, max: 36 }, cooldown: { step: -0.02, min: 0.3 } },
    hammer:    { radius: { step: 2.5, max: 76 }, push: { step: 1, max: 36 }, cooldown: { step: -0.04, min: 0.7 } },
    shotgun:   { frames: { step: 0.6, max: 14 }, cooldown: { step: -0.03, min: 0.45 } },
    rocket:    { blast: { step: 3, max: 85 }, cooldown: { step: -0.08, min: 0.8 } },
    boomerang: { radius: { step: 1, max: 18 }, speed: { step: 0.4, max: 12 }, cooldown: { step: -0.04, min: 0.4 } },
    molotov:   { spread: { step: 2, max: 38 }, patches: { step: 0.5, max: 9 }, cooldown: { step: -0.08, min: 0.9 } },
    grenade:   { radius: { step: 2, max: 85 }, cooldown: { step: -0.2, min: 4.5 } },
    chain:     { jumps: { step: 0.5, max: 9 }, range: { step: 6, max: 300 }, cooldown: { step: -0.15, min: 3 } },
    blackhole: { radius: { step: 2, max: 80 }, pullRadius: { step: 4, max: 190 }, cooldown: { step: -0.4, min: 7 } },
    fire:      { burnTime: { step: 0.15, max: 7 }, rechargeTime: { step: -0.2, min: 6 } },
    beam:      { loadPerFrame: { step: 0.004, max: 0.15 } },
  },

  // --- Fernkampf: Schrotflinte (Faecher aus Schuessen), Bumerang, Molotov ---
  // pellets Kugeln im Winkel +-spread, kurze Reichweite (frames). Bumerang: outFrames hin, danach zurueck, nur ein Wurf in der Luft.
  // Molotov: fliegt flightFrames, dann patches Feuerflecken im Abstand spread (Verhalten der Flecken siehe fire).
  shotgun: { pellets: 5, spread: 22, speed: 12, frames: 9, cooldown: 0.8 },
  boomerang: { speed: 9, outFrames: 20, radius: 12, maxLife: 4, cooldown: 0.7 },
  // Raketenwerfer: grosse Rakete (radius), trifft alles auf dem Weg (touchHits je Gegner einmal), explodiert nach fuse s, an Bossen/Spawnern oder an einem
  // starken Gegner (mehr als strongHits Leben). Explosion: blast = Radius, blastHits = Treffer je Gegner, bossDmg = Boss-Leben, spawnerDmg = Spawner-Leben.
  rocket: { speed: 5.5, radius: 9, fuse: 1.0, strongHits: 3, touchHits: 2, blast: 56, blastHits: 2, bossDmg: 3, spawnerDmg: 3, blastTime: 0.35, cooldown: 1.5, aimAssistDeg: 15, aimAssistRange: 260 },
  molotov: { speed: 6, flightFrames: 14, patches: 6, spread: 24, cooldown: 1.8 },

  // --- Starke Waffe: Kettenblitz (E) und Schwarzes Loch (E) ---
  // Kettenblitz: springt bis zu jumps Ziele weit (range zum ersten, link zwischen den Zielen), hits = Treffer, bossDmg = Boss-Leben.
  // Schwarzes Loch: liegt distance vor dem Spieler, zieht life s lang alles im pullRadius mit pull (pro Bild) heran, explodiert dann im radius.
  chain: { range: 230, link: 120, jumps: 6, hits: 2, bossDmg: 2, life: 0.3, cooldown: 5 },
  blackhole: { distance: 90, life: 2.6, pullRadius: 140, pull: 2.2, radius: 60, hits: 3, bossDmg: 4, cooldown: 12 },

  // --- Fernkampf: Prallschuss ---
  // Wie der Schuss (gleiche Stufen), prallt aber an den Kartenraendern ab. frames = Lebensdauer in Bildern, cdMul = Faktor auf die Abklingzeit.
  bounce: { frames: 70, cdMul: 1.35 },

  // --- Starke Waffe: Beam (halten = laden, loslassen = feuern) ---
  // decayPerSecond: im Original -0.05 pro "warte 0.05" (real ca. 0.066 s) = ca. 0.75 pro Sekunde
  beam: { loadPerFrame: 0.1, maxClock: 10, decayPerSecond: 0.75, beamSizes: [250, 300, 350] },

  // --- Starke Waffe: Plasmagranate (E drücken) ---
  // Fliegt flightFrames Bilder mit speed, explodiert bei Kontakt oder nach fuse Sekunden.
  // hits = Treffer pro Gegner im Radius, bossDmg = Boss-Leben.
  grenade: { speed: 7, flightFrames: 14, fuse: 1.1, radius: 65, hits: 3, bossDmg: 5, blastTime: 0.35, cooldown: 7 },

  // --- Starke Waffe: Feuerpfad (E = ein/aus) ---
  // Hinterlässt Feuerflecken. burnTime = Sekunden Brennstoff, rechargeTime = Sekunden zum Auffüllen,
  // minStart = Mindestfüllung zum Einschalten.
  fire: { radius: 14, life: 2.5, tick: 0.45, dropEvery: 0.14, burnTime: 5, rechargeTime: 10, minStart: 0.3, bossDmg: 0.5 },


  // ==========================================================================================
  //  [4] INVENTAR (eigener Menüpunkt; gekauft wird im Shop unter UPGRADES)
  //  4 Slots, je ein Item ausgerüstet. impl: false = Konzept steht, Inhalt kommt noch (nicht kaufbar).
  //  Start: Schwert und Schuss. Der Beam kostet bewusst fast nichts (nach dem ersten Tod kaufbar), Artefakte sind teuer.
  //  Neues Item: hier im catalog eintragen (+ Icon in tools/gen_art.js und assets.js), Werte in [3] bzw. unten bei den Artefakten.
  // ==========================================================================================
  items: {
    slots: [
      { id: 'melee', label: 'MELEE' },
      { id: 'ranged', label: 'RANGED' },
      { id: 'heavy', label: 'HEAVY WEAPON' },
      { id: 'artifact', label: 'IMPLANT' },
    ],
    start: { owned: { sword: true, shot: true }, equipped: { melee: 'sword', ranged: 'shot', heavy: null, artifact: null } },
    catalog: {
      // Nahkampf
      sword:     { slot: 'melee',    icon: 'sword',       iconW: 18, impl: true, cost: 0,   name: 'PLASMA BLADE',       desc: 'Rotating slash, great against swarms.' },
      whip:      { slot: 'melee',    icon: 'whipIcon',    iconW: 20, impl: true, cost: 120, name: 'ARC WHIP',      desc: 'Fast long-range strike in a narrow arc.' },
      katana:    { slot: 'melee',    icon: 'katanaIcon',  iconW: 20, impl: true, cost: 300, name: 'PHOTON BLADE',        desc: 'Two quick slashes: one forward, one backward right after.' },
      hammer:    { slot: 'melee',    icon: 'hammerIcon',  iconW: 20, impl: true, cost: 400, name: 'GRAVITY HAMMER',        desc: 'Slow ground slam: pushes enemies away, bosses take double.' },
      lance:     { slot: 'melee',    icon: 'lanceIcon',   iconW: 20, impl: true, cost: 250, name: 'PULSE LANCE',         desc: 'Long thrust that pierces whole rows.' },
      // Fernkampf
      shot:      { slot: 'ranged',   icon: 'shot',        iconW: 18, impl: true, cost: 0,   name: 'BLASTER',        desc: 'Fast projectiles at range. Every 2nd boss upgrade lets shots pierce one more target (max 2), +1 at max gear level.' },
      impulse:   { slot: 'ranged',   icon: 'impulseIcon', iconW: 20, impl: true, cost: 150, name: 'SHOCK EMITTER',        desc: 'Wide wave: pushes enemies away and erases projectiles.' },
      shotgun:   { slot: 'ranged',   icon: 'shotgunIcon',   iconW: 20, impl: true, cost: 180, name: 'SCATTER CANNON', desc: 'Five pellets in a fan, strong only up close.' },
      boomerang: { slot: 'ranged',   icon: 'boomerangIcon', iconW: 20, impl: true, cost: 260, name: 'PLASMA DISC',     desc: 'Flies out and returns, hitting on both trips.' },
      molotov:   { slot: 'ranged',   icon: 'molotovIcon',   iconW: 20, impl: true, cost: 340, name: 'THERMITE FLASK',      desc: 'Thrown flask that leaves a burning carpet.' },
      rocket:    { slot: 'ranged',   icon: 'rocketIcon',  iconW: 20, impl: true, cost: 380, name: 'ROCKET BLASTER',  desc: 'Big rockets hurt everything they touch and explode on strong enemies.' },
      bounce:    { slot: 'ranged',   icon: 'bounceIcon',  iconW: 20, impl: true, cost: 220, name: 'RICOCHET RIFLE',   desc: 'Shots bounce off the map edges and come back.' },
      // Starke Waffe
      beam:      { slot: 'heavy',    icon: 'beamIcon',    iconW: 20, impl: true, cost: 1,   name: 'BEAM',          desc: 'Charge and release: huge damage, but you stand still.' },
      grenade:   { slot: 'heavy',    icon: 'grenadeIcon', iconW: 20, impl: true, cost: 200, name: 'PLASMA GRENADE', desc: 'Thrown grenade: explodes on contact, large area damage.' },
      chain:     { slot: 'heavy',    icon: 'chainIcon',     iconW: 20, impl: true, cost: 350, name: 'TESLA CHAIN',  desc: 'Lightning jumps from enemy to enemy, hits bosses too.' },
      blackhole: { slot: 'heavy',    icon: 'blackholeIcon', iconW: 20, impl: true, cost: 450, name: 'SINGULARITY', desc: 'Pulls enemies together, then explodes.' },
      firetrail: { slot: 'heavy',    icon: 'fireIcon',    iconW: 20, impl: true, cost: 300, name: 'THERMAL TRAIL',     desc: 'Toggle: burning trail while the fuel lasts.' },
      // Artefakt
      armor:     { slot: 'artifact', icon: 'armorIcon',   iconW: 20, impl: true, cost: 300, name: 'RESISTANCE',      desc: 'You take 15% less damage.' },
      regen:     { slot: 'artifact', icon: 'regenIcon',   iconW: 20, impl: true, cost: 400, name: 'REGENERATION',  desc: 'Slowly restores health.' },
      phoenix:   { slot: 'artifact', icon: 'phoenixIcon', iconW: 20, impl: true, cost: 600, name: 'REVIVAL CORE',   desc: 'Once per run: revive with half health.' },
      damage:    { slot: 'artifact', icon: 'damageIcon',  iconW: 20, impl: true, cost: 500, name: 'DAMAGE AMPLIFIER', desc: 'Hits have a 25% chance to deal double damage, bosses take 20% more.' },
      thorns:    { slot: 'artifact', icon: 'thornsIcon',  iconW: 20, impl: true, cost: 450, name: 'SPIKE PLATING',  desc: 'When you are hit, nearby enemies take damage.' },
      vampire:   { slot: 'artifact', icon: 'vampireIcon', iconW: 20, impl: true, cost: 550, name: 'BIO FUELER',    desc: 'Every defeated enemy heals a little extra.' },
      lucky:     { slot: 'artifact', icon: 'luckyIcon',   iconW: 20, impl: true, cost: 350, name: 'FORTUNE CHIP',   desc: 'Enemies drop buffs much more often.' },
    },
    // Werte der Artefakte
    armor: { reduce: 0.15 },                 // Schadensverringerung
    regen: { perSecond: 1 },              // Leben pro Sekunde
    phoenix: { hp: 50, protect: 3 },         // Leben nach der Wiederbelebung, Schutzzeit
    damage: { chance: 0.25, boss: 0.2 },     // Chance auf doppelten Treffer, Mehrschaden gegen Bosse
    thorns: { radius: 60, hits: 2, bossDmg: 1 },   // Dornenpanzer: Radius, Treffer pro Gegner, Boss-Leben
    vampire: { heal: 0.5 },                  // Vampirring: zusaetzliche Heilung pro Kill
    lucky: { mult: 1.7 },                    // Gluecksklee: Faktor auf die Drop-Chance
  },

  // ==========================================================================================
  //  [4b] AUSRUESTUNG LEVELN (Waffen, Implants, Abilities)
  //  Jedes Item/jede Ability hat Stufe 0..max. Beim Benutzen sammelt sie im Hintergrund XP (der Spieler sieht nur den Balken im Inventar).
  //  Aufstieg kostet Cores: Preis = Basis x (Stufe+1) x Anteil der fehlenden XP (mindestens minPriceFrac). Volle XP = fast gratis.
  //  Wirkung pro Stufe: Staerke/Tempo x (1 + Stufe x Schritt). Waffen: Abklingzeit kuerzer, Beam laedt schneller. Abilities: Abklingzeit kuerzer.
  //  Passive Abilities und Implants: ihre Werte werden staerker.
  // ==========================================================================================
  gear: {
    need: [2000, 5000, 10000, 18000, 30000],        // XP bis zur naechsten Stufe (Laenge = Hoechststufe)
    xp: { attack: 1, heavy: 10, ability: 15, perSecond: 1.5 },       // XP pro Angriff / starker Waffe / Ability-Einsatz / Sekunde (Passive, Implants, Feuerpfad)
    step: { weapon: 0.08, ability: 0.08, passive: 0.12, implant: 0.12 },
    priceBase: 100, priceMul: 2, minPriceFrac: 0.1,  // Basispreis = max(Itempreis, priceBase) x priceMul
  },

  // ==========================================================================================
  //  [4c] COSMETICS (Hauptmenue > COSMETICS): rein optisch, kein Einfluss aufs Spiel. Kauf mit Cores, danach ausruesten.
  //  filter = CSS-Filter fuers Sprite (hue-rotate verschiebt die Farbe), fx/shape = eigene Form- und Partikeleffekte (Umsetzung in js/cosmetics.js),
  //  colors = Farbpalette, style: pick (zufaellig), cycle (Regenbogen), glitch (zuckend).
  //  Neues Item: hier eintragen (id, name, cost, color = Farbe fuer die Anzeige). Standard ist immer das erste Item (cost 0).
  // ==========================================================================================
  cosmetics: {
    cats: [
      { id: 'skin',  label: 'SKIN',  desc: 'Recolor your ship. Some skins also change how it looks and moves.' },
      { id: 'blade', label: 'GLOW',  desc: 'Color of ALL your weapons: blades, shots, lances, rockets, beams. Some add trails, stars or lightning.' },
      { id: 'trail', label: 'TRAIL', desc: 'What you leave behind while you run: sparks, bubbles, smoke, or marks on the ground (footprints, paw prints, flowers, ripples).' },
      { id: 'kill',  label: 'KILLS', desc: 'What happens when an enemy dies: colors, rings, shards, blasts, or a mark left on the ground (stamps, gravestone, ink).' },
      { id: 'aura',  label: 'AURA',  desc: 'An effect that surrounds your ship all the time.' },
      { id: 'gear',  label: 'GEAR',  desc: 'Parts attached to your ship: wings, horns, a crown, a jetpack.' },
      { id: 'enemy', label: 'FOES',  desc: 'How normal enemies look. Shield enemies and elites keep their colors, but get the effects.' },
      { id: 'boss',  label: 'BOSSES', desc: 'How bosses look: recolors, glitches, shadows, flames.' },
      { id: 'endless', label: 'ENDLESS', desc: 'Only shown in Infinite Mode: floor effects and markers for the wall-less map. Some need an Endless survival time.' },
      // Neu: gelten immer fuer die ganze Kategorie (alle Waffen, alle Kills, alle Treffer ...), nie nur fuer eine einzelne Waffe oder Faehigkeit
      { id: 'proj',  label: 'SHOTS',  desc: 'The look of ALL your projectiles: shots, pellets, rockets, discs, grenades. Uses your Glow color.' },
      { id: 'hit',   label: 'HITS',   desc: 'What every hit shows, from any weapon: comic words.' },
      { id: 'weather', label: 'WEATHER', desc: 'Pure decoration over the whole arena: rain, snow, fireflies, ash. Does not change the game.' },
      { id: 'pet',   label: 'PET',    desc: 'A little companion that follows you, cheers after bosses and hides when you die. Cannot be hurt, does nothing.' },
      { id: 'hud',   label: 'HUD',    desc: 'New frames and colors for the in-game HUD: hotbar, orb, bars.' },
      { id: 'numbers', label: 'DIGITS', desc: 'Style of the damage numbers that float up from you.' },
      { id: 'sound', label: 'SOUND',  desc: 'Sound pack for hits, kills, shots and impacts. Select one to hear it.' },
      { id: 'menubg', label: 'MENU',  desc: 'Animated background of the main menu.' },
      { id: 'death', label: 'DEATH',  desc: 'How your ship goes down when you die.' },
      { id: 'intro', label: 'INTRO',  desc: 'The title card that appears when a boss shows up. Works for every boss.' },
      { id: 'victory', label: 'WIN',  desc: 'A little celebration after every boss you defeat.' },
      { id: 'revive', label: 'REVIVE', desc: 'The animation when the Revival Core saves you.' },
    ],
    items: {
      // fx am Skin: glitch (versetzte Farbkopien, Ruckeln), holo (flackernd durchscheinend mit Scan-Linie)
      skin: [
        { id: 'default', name: 'NEON VIOLET', cost: 0,   color: STYLE.pal.violet, filter: '' },
        { id: 'crimson', name: 'CRIMSON',     cost: 80,  color: STYLE.pal.red,    filter: 'hue-rotate(100deg)' },
        { id: 'solar',   name: 'SOLAR GOLD',  cost: 140, color: STYLE.pal.yellow, filter: 'hue-rotate(150deg) brightness(1.15)' },
        { id: 'toxic',   name: 'TOXIC',       cost: 110, color: STYLE.pal.green,  filter: 'hue-rotate(225deg)' },
        { id: 'frost',   name: 'FROST',       cost: 110, color: STYLE.pal.cyan,   filter: 'hue-rotate(-75deg) brightness(1.1)' },
        { id: 'rose',    name: 'ROSE',        cost: 90,  color: STYLE.pal.pink,   filter: 'hue-rotate(50deg)' },
        { id: 'ghost',   name: 'GHOST',       cost: 200, color: STYLE.pal.ice,    filter: 'grayscale(1) brightness(1.3)' },
        { id: 'glitch',  name: 'GLITCH',      cost: 260, color: STYLE.pal.cyan,   filter: 'hue-rotate(-75deg)', fx: 'glitch' },
        { id: 'holo',    name: 'HOLOGRAM',    cost: 320, color: STYLE.pal.teal,   filter: 'hue-rotate(-100deg) brightness(1.3)', fx: 'holo' },
        { id: 'rainbow', name: 'PRISM',       cost: 380, color: STYLE.pal.pink,   filter: '', fx: 'rainbow' },
        { id: 'phantom', name: 'PHANTOM',     cost: 340, color: STYLE.pal.ice,    filter: 'grayscale(0.6) brightness(1.25)', fx: 'phantom' },
        { id: 'shadow',  name: 'SHADOW',      cost: 360, color: STYLE.pal.purple, filter: '', fx: 'shadow' },
        { id: 'ember',   name: 'EMBER',       cost: 400, color: STYLE.pal.orange, filter: 'hue-rotate(120deg) brightness(1.2)', fx: 'ember' },
        { id: 'void',    name: 'STARLIT VOID', cost: 420, color: STYLE.pal.violet, filter: 'hue-rotate(-30deg) brightness(0.45)', fx: 'void' },
        { id: 'chrome',  name: 'CHROME',      cost: 450, color: STYLE.pal.white,  filter: 'grayscale(1) brightness(1.55) contrast(1.2)', fx: 'chrome' },
        // Neu: einfache Farben (Meilensteine Cryo Station, Achievements) und zwei mit Effekt
        { id: 'iceberg', name: 'ICEBERG',     cost: 120, color: STYLE.pal.ice,    filter: 'hue-rotate(-60deg) brightness(1.25) saturate(0.7)' },
        { id: 'mint',    name: 'MINT',        cost: 100, color: STYLE.pal.teal,   filter: 'hue-rotate(-130deg) brightness(1.25)' },
        { id: 'sunset',  name: 'SUNSET',      cost: 130, color: STYLE.pal.orange, filter: 'hue-rotate(75deg) brightness(1.15)' },
        { id: 'bubblegum', name: 'BUBBLEGUM', cost: 110, color: STYLE.pal.pink,   filter: 'hue-rotate(25deg) brightness(1.3) saturate(1.4)' },
        { id: 'midnight', name: 'MIDNIGHT',   cost: 150, color: STYLE.pal.violet, filter: 'hue-rotate(-20deg) brightness(0.6) saturate(1.4)' },
        { id: 'lime',    name: 'ACID LIME',   cost: 140, color: STYLE.pal.green,  filter: 'hue-rotate(190deg) brightness(1.3) saturate(1.6)' },
        { id: 'copper',  name: 'COPPER',      cost: 160, color: STYLE.pal.redMid, filter: 'hue-rotate(130deg) saturate(1.4) brightness(0.9)' },
        { id: 'obsidian', name: 'OBSIDIAN',   cost: 240, color: STYLE.pal.greyMid, filter: 'grayscale(1) brightness(0.45) contrast(1.4)', special: true },
        { id: 'aurora',  name: 'AURORA',      cost: 330, color: STYLE.pal.teal,   filter: 'hue-rotate(-120deg) brightness(1.2)', fx: 'holo' },
        { id: 'scorch',  name: 'SCORCHED',    cost: 380, color: STYLE.pal.red,    filter: 'hue-rotate(100deg) brightness(0.7)', fx: 'ember' },
        // Neu: Meilenstein-/Achievement-Belohnungen (Cryo Station, Endless, Elite) und zwei mit Effekt
        { id: 'royal',   name: 'ROYAL BLUE',  cost: 130, color: STYLE.pal.cyan,   filter: 'hue-rotate(-35deg) brightness(0.9) saturate(1.5)' },
        { id: 'tangerine', name: 'TANGERINE', cost: 120, color: STYLE.pal.orange, filter: 'hue-rotate(110deg) brightness(1.25) saturate(1.3)' },
        { id: 'sakura',  name: 'SAKURA',      cost: 120, color: STYLE.pal.pink,   filter: 'hue-rotate(35deg) brightness(1.4) saturate(0.8)' },
        { id: 'venom',   name: 'VENOM',       cost: 200, color: STYLE.pal.green,  filter: 'hue-rotate(215deg) brightness(0.7) saturate(1.8)' },
        { id: 'permafrost', name: 'PERMAFROST', cost: 340, color: STYLE.pal.ice,  filter: 'hue-rotate(-65deg) brightness(1.3) saturate(0.8)', fx: 'holo' },
        { id: 'inferno2', name: 'MOLTEN CORE', cost: 390, color: STYLE.pal.orange, filter: 'hue-rotate(125deg) brightness(1.1) saturate(1.5)', fx: 'ember' },
        // Neu: Skins mit Verhalten (wirken bei allen Helden). dissolve/slime/mech reagieren aufs Laufen und Dashen, cracks/hbeat aufs Leben
        { id: 'dissolve', name: 'PIXEL DISSOLVE', cost: 360, color: STYLE.pal.cyan,  filter: '', fx: 'dissolve' },
        { id: 'cloud',    name: 'PIXEL CLOUD',    cost: 380, color: STYLE.pal.cyan,  filter: '', fx: 'cloud' },
        { id: 'lens',    name: 'GRAVITY LENS', cost: 420, color: STYLE.pal.violet, filter: 'hue-rotate(-20deg) brightness(0.8)', fx: 'lens' },
        { id: 'mech',    name: 'MECH SHELL',  cost: 440, color: STYLE.pal.grey,   filter: 'grayscale(0.7) brightness(1.1)', fx: 'mech' },
        { id: 'slime',   name: 'SLIME',       cost: 300, color: STYLE.pal.green,  filter: 'hue-rotate(225deg) saturate(1.3)', fx: 'slime' },
        { id: 'twin',    name: 'GHOST TWIN',  cost: 400, color: STYLE.pal.ice,    filter: '', fx: 'twin' },
        { id: 'wire',    name: 'WIREFRAME',   cost: 380, color: STYLE.pal.green,  filter: '', fx: 'wire' },
        { id: 'cracks',  name: 'BATTLE WORN', cost: 320, color: STYLE.pal.red,    filter: '', fx: 'cracks' },
        { id: 'hbeat',   name: 'PULSE CORE',  cost: 340, color: STYLE.pal.pink,   filter: '', fx: 'hbeat' },
      ],
      // fx am Glow: comet (Nachbilder), sparkle (Funkelsterne, Sternschuesse), volt (Blitze)
      blade: [
        { id: 'default', name: 'PLASMA CYAN', cost: 0,   color: STYLE.pal.cyan,   filter: '' },
        { id: 'violet',  name: 'VOID VIOLET', cost: 100, color: STYLE.pal.purple, filter: 'hue-rotate(80deg) saturate(2.2)' },
        { id: 'inferno', name: 'INFERNO',     cost: 160, color: STYLE.pal.red,    filter: 'hue-rotate(170deg) saturate(2.2)' },
        { id: 'toxic',   name: 'TOXIC GREEN', cost: 120, color: STYLE.pal.green,  filter: 'hue-rotate(-55deg) saturate(2.2)' },
        { id: 'gold',    name: 'GOLDEN',      cost: 160, color: STYLE.pal.yellow, filter: 'hue-rotate(-145deg) saturate(2.2)' },
        { id: 'rose',    name: 'ROSE QUARTZ', cost: 100, color: STYLE.pal.pink,   filter: 'hue-rotate(130deg) saturate(2.2)' },
        { id: 'ghost',   name: 'WHITE FIRE',  cost: 220, color: STYLE.pal.white,  filter: 'grayscale(1) brightness(1.5)' },
        { id: 'comet',   name: 'COMET TAIL',  cost: 280, color: STYLE.pal.orange, filter: 'hue-rotate(170deg) saturate(2.2)', fx: 'comet' },
        { id: 'sparkle', name: 'STARFALL',    cost: 300, color: STYLE.pal.yellow, filter: 'hue-rotate(-145deg) saturate(2.2)', fx: 'sparkle' },
        { id: 'volt',    name: 'HIGH VOLTAGE', cost: 340, color: STYLE.pal.ice,   filter: 'hue-rotate(-20deg) brightness(1.2)', fx: 'volt' },
        // Neu: Meilenstein-/Achievement-Belohnungen und Effekt-Varianten
        { id: 'arctic',  name: 'ARCTIC BLUE', cost: 120, color: STYLE.pal.ice,    filter: 'hue-rotate(-25deg) brightness(1.3) saturate(1.4)' },
        { id: 'sunset',  name: 'SUNSET',      cost: 140, color: STYLE.pal.orange, filter: 'hue-rotate(150deg) brightness(1.15) saturate(2)' },
        { id: 'lime',    name: 'ACID LIME',   cost: 140, color: STYLE.pal.green,  filter: 'hue-rotate(-90deg) brightness(1.3) saturate(2.4)' },
        { id: 'magenta', name: 'MAGENTA',     cost: 140, color: STYLE.pal.pink,   filter: 'hue-rotate(110deg) brightness(1.1) saturate(2.4)' },
        { id: 'glacier', name: 'GLACIER TAIL', cost: 300, color: STYLE.pal.ice,   filter: 'hue-rotate(-25deg) brightness(1.3) saturate(1.4)', fx: 'comet' },
        { id: 'meteor',  name: 'METEOR SHOWER', cost: 320, color: STYLE.pal.orange, filter: 'hue-rotate(170deg) saturate(2.4) brightness(1.1)', fx: 'sparkle' },
        { id: 'tesla',   name: 'TESLA COIL',  cost: 360, color: STYLE.pal.purple, filter: 'hue-rotate(80deg) saturate(2.2) brightness(1.2)', fx: 'volt' },
        // Neu: Slash Echo = jeder Angriff (jede Waffe) laesst eingefrorene Abbilder zurueck, die nach und nach zerfallen
        { id: 'echo',    name: 'SLASH ECHO',  cost: 340, color: STYLE.pal.cyan,   filter: '', fx: 'echo' },
        { id: 'echogold', name: 'GILDED ECHO', cost: 380, color: STYLE.pal.yellow, filter: 'hue-rotate(-145deg) saturate(2.2)', fx: 'echo' },
      ],
      // shape am Trail: ring (steigende Blasen), plus (Sternenstaub), smoke (wachsende Rauchquadrate), echo (Nachbilder des Schiffs)
      trail: [
        { id: 'none',    name: 'NO TRAIL',    cost: 0,   color: STYLE.pal.greyMid, colors: null },
        { id: 'ember',   name: 'EMBERS',      cost: 120, color: STYLE.pal.orange, colors: [STYLE.pal.yellow, STYLE.pal.orange, STYLE.pal.red], style: 'pick' },
        { id: 'frost',   name: 'FROST DUST',  cost: 120, color: STYLE.pal.ice,    colors: [STYLE.pal.ice, STYLE.pal.cyan, STYLE.pal.cyanMid], style: 'pick' },
        { id: 'toxic',   name: 'TOXIC SPORES', cost: 150, color: STYLE.pal.green, colors: [STYLE.pal.green, STYLE.pal.teal, STYLE.pal.greenMid], style: 'pick' },
        { id: 'glitch',  name: 'GLITCH',      cost: 200, color: STYLE.pal.purple, colors: [STYLE.pal.cyan, STYLE.pal.purple, STYLE.pal.white, STYLE.pal.red], style: 'glitch' },
        { id: 'rainbow', name: 'RAINBOW',     cost: 300, color: STYLE.pal.yellow, colors: [STYLE.pal.red, STYLE.pal.orange, STYLE.pal.yellow, STYLE.pal.green, STYLE.pal.cyan, STYLE.pal.violet], style: 'cycle' },
        { id: 'bubbles', name: 'BUBBLES',     cost: 220, color: STYLE.pal.cyan,   colors: [STYLE.pal.ice, STYLE.pal.cyan, STYLE.pal.teal], style: 'pick', shape: 'ring' },
        { id: 'stardust', name: 'STARDUST',   cost: 260, color: STYLE.pal.yellow, colors: [STYLE.pal.yellow, STYLE.pal.white, STYLE.pal.pink], style: 'pick', shape: 'plus' },
        { id: 'smoke',   name: 'SMOKE STACK', cost: 180, color: STYLE.pal.grey,   colors: [STYLE.pal.grey, STYLE.pal.greyMid, STYLE.pal.ice], style: 'pick', shape: 'smoke' },
        { id: 'echo',    name: 'AFTERIMAGE',  cost: 340, color: STYLE.pal.violet, colors: [STYLE.pal.violet], style: 'pick', shape: 'echo' },
        // Marken am Boden (frueher Kategorie FLOOR, Umsetzung Cos2.floorTick): bleiben liegen und verblassen von allein, haben keine Partikel
        { id: 'boots',   name: 'FOOTPRINTS',  cost: 160, color: STYLE.pal.grey,   shape: 'boots' },
        { id: 'paws',    name: 'PAW PRINTS',  cost: 180, color: STYLE.pal.ice,    shape: 'paws' },
        { id: 'flowers', name: 'FLOWER PATH', cost: 260, color: STYLE.pal.pink,   shape: 'flowers' },
        { id: 'ripple',  name: 'NEON RIPPLE', cost: 300, color: STYLE.pal.cyan,   shape: 'ripple' },
      ],
      // shape bei Kill-Effekten: shockring (Ringe), shatter (fallende Scherben), supernova (Ring + Strahlen), bloom (Plus-Blueten)
      kill: [
        { id: 'default', name: 'CLASSIC',     cost: 0,   color: STYLE.pal.orange, colors: null },
        { id: 'cyan',    name: 'ICE BURST',   cost: 60,  color: STYLE.pal.cyan,   colors: [STYLE.pal.cyan, STYLE.pal.ice, STYLE.pal.white] },
        { id: 'gold',    name: 'GOLD RUSH',   cost: 90,  color: STYLE.pal.yellow, colors: [STYLE.pal.yellow, STYLE.pal.orange, STYLE.pal.white] },
        { id: 'pink',    name: 'NEON POP',    cost: 90,  color: STYLE.pal.pink,   colors: [STYLE.pal.pink, STYLE.pal.purple, STYLE.pal.white] },
        { id: 'toxic',   name: 'TOXIC SPLASH', cost: 110, color: STYLE.pal.green, colors: [STYLE.pal.green, STYLE.pal.teal, STYLE.pal.yellow] },
        { id: 'confetti', name: 'CONFETTI',   cost: 180, color: STYLE.pal.violet, colors: [STYLE.pal.red, STYLE.pal.yellow, STYLE.pal.green, STYLE.pal.cyan, STYLE.pal.violet, STYLE.pal.pink] },
        { id: 'shockring', name: 'SHOCKWAVE', cost: 200, color: STYLE.pal.cyan,   colors: [STYLE.pal.cyan, STYLE.pal.ice, STYLE.pal.white], shape: 'shockring' },
        { id: 'shatter', name: 'SHATTER',     cost: 240, color: STYLE.pal.ice,    colors: [STYLE.pal.ice, STYLE.pal.cyanMid, STYLE.pal.white, STYLE.pal.cyan], shape: 'shatter' },
        { id: 'bloom',   name: 'PIXEL BLOOM', cost: 260, color: STYLE.pal.pink,   colors: [STYLE.pal.pink, STYLE.pal.yellow, STYLE.pal.white], shape: 'bloom' },
        { id: 'supernova', name: 'SUPERNOVA', cost: 320, color: STYLE.pal.yellow, colors: [STYLE.pal.yellow, STYLE.pal.white, STYLE.pal.orange], shape: 'supernova' },
        // Neu: eigene Abläufe statt Funken (shape wird in js/cosmetics2.js umgesetzt)
        { id: 'grave',   name: 'GRAVESTONE',  cost: 300, color: STYLE.pal.grey,   colors: [STYLE.pal.grey, STYLE.pal.greyMid, STYLE.pal.white], shape: 'grave' },
        { id: 'coins',   name: 'COIN RAIN',   cost: 340, color: STYLE.pal.yellow, colors: [STYLE.pal.yellow, STYLE.pal.orange, STYLE.pal.white], shape: 'coins' },
        { id: 'ink',     name: 'INK SPLAT',   cost: 360, color: STYLE.pal.pink,   colors: [STYLE.pal.pink, STYLE.pal.cyan, STYLE.pal.yellow, STYLE.pal.green], shape: 'ink' },
        { id: 'fireworks', name: 'FIREWORKS', cost: 380, color: STYLE.pal.red,    colors: [STYLE.pal.red, STYLE.pal.yellow, STYLE.pal.cyan, STYLE.pal.pink, STYLE.pal.green], shape: 'fireworks' },
        { id: 'glitchdel', name: 'GLITCH DELETE', cost: 400, color: STYLE.pal.cyan, colors: [STYLE.pal.cyan, STYLE.pal.pink, STYLE.pal.white, STYLE.pal.red], shape: 'glitchdel' },
        // Stempel am Boden (frueher unter HITS): bleiben liegen, wo der Gegner gestorben ist
        { id: 'claws',   name: 'CLAW MARKS',   cost: 260, color: STYLE.pal.red,    colors: [STYLE.pal.red, STYLE.pal.orange], shape: 'claws' },
        { id: 'skulls',  name: 'SKULL STAMPS', cost: 300, color: STYLE.pal.ice,    colors: [STYLE.pal.ice, STYLE.pal.white, STYLE.pal.grey], shape: 'skulls' },
        { id: 'stars',   name: 'STAR STAMPS',  cost: 280, color: STYLE.pal.yellow, colors: [STYLE.pal.yellow, STYLE.pal.orange, STYLE.pal.white], shape: 'starstamp' },
      ],
      // Auren: motes (Lichtpunkte), halo (Ring), arcs (Blitzbogen), pulse (Herzschlag-Ring), flames (Flammenkranz)
      aura: [
        { id: 'none',    name: 'NO AURA',     cost: 0,   color: STYLE.pal.greyMid, fx: null },
        { id: 'motes',   name: 'ORBIT MOTES', cost: 150, color: STYLE.pal.cyan,   fx: 'motes' },
        { id: 'halo',    name: 'HALO',        cost: 180, color: STYLE.pal.yellow, fx: 'halo' },
        { id: 'pulse',   name: 'HEARTBEAT',   cost: 200, color: STYLE.pal.purple, fx: 'pulse' },
        { id: 'arcs',    name: 'STATIC ARCS', cost: 260, color: STYLE.pal.cyan,   fx: 'arcs' },
        { id: 'flames',  name: 'FLAME WREATH', cost: 300, color: STYLE.pal.orange, fx: 'flames' },
      ],
      // Anbauten: wings, horns, crown, antenna, jetpack
      gear: [
        { id: 'none',    name: 'NO GEAR',     cost: 0,   color: STYLE.pal.greyMid, fx: null },
        { id: 'antenna', name: 'ANTENNA',     cost: 100, color: STYLE.pal.green,  fx: 'antenna' },
        { id: 'horns',   name: 'DEVIL HORNS', cost: 160, color: STYLE.pal.red,    fx: 'horns' },
        { id: 'wings',   name: 'NEON WINGS',  cost: 240, color: STYLE.pal.cyan,   fx: 'wings' },
        { id: 'jetpack', name: 'JETPACK',     cost: 280, color: STYLE.pal.orange, fx: 'jetpack' },
        { id: 'crown',   name: 'GOLDEN CROWN', cost: 400, color: STYLE.pal.yellow, fx: 'crown' },
      ],
      // Gegner (Farbe/Zusaetze fuer alle normalen Gegner ausser den Schild-Gegnern, fx: googly, outline)
      enemy: [
        { id: 'default', name: 'STANDARD',    cost: 0,   color: STYLE.pal.red,    filter: '' },
        { id: 'frost',   name: 'FROST FOES',  cost: 80,  color: STYLE.pal.cyan,   filter: 'hue-rotate(170deg)' },
        { id: 'toxic',   name: 'TOXIC FOES',  cost: 80,  color: STYLE.pal.green,  filter: 'hue-rotate(110deg)' },
        { id: 'void',    name: 'VOID FOES',   cost: 100, color: STYLE.pal.purple, filter: 'hue-rotate(-90deg)' },
        { id: 'gilded',  name: 'GILDED',      cost: 120, color: STYLE.pal.yellow, filter: 'hue-rotate(40deg) brightness(1.15)' },
        { id: 'mono',    name: 'MONOCHROME',  cost: 140, color: STYLE.pal.grey,   filter: 'grayscale(1)' },
        { id: 'googly',  name: 'GOOGLY EYES', cost: 200, color: STYLE.pal.white,  filter: '', fx: 'googly' },
        { id: 'candy',   name: 'CANDY',        cost: 100, color: STYLE.pal.pink,   filter: 'hue-rotate(320deg) saturate(1.3)' },
        { id: 'rust',    name: 'RUSTED',       cost: 120, color: STYLE.pal.redMid, filter: 'sepia(1) saturate(1.6) brightness(0.8)' },
        { id: 'evil',    name: 'EVIL EYES',    cost: 220, color: STYLE.pal.red,    filter: '', fx: 'evil' },
        { id: 'static',  name: 'STATIC SHOCK', cost: 260, color: STYLE.pal.cyan,   filter: 'hue-rotate(170deg)', fx: 'static' },
        { id: 'sats',    name: 'SATELLITES',   cost: 280, color: STYLE.pal.yellow, filter: '', fx: 'orbit' },
        { id: 'outline', name: 'NEON OUTLINE', cost: 300, color: STYLE.pal.cyan,  filter: '', fx: 'outline' },
        // Neu (Elite-Gegner behalten ihre Farbe, nur die Effekte gelten dort)
        { id: 'glacier', name: 'GLACIER FOES', cost: 100, color: STYLE.pal.ice,   filter: 'hue-rotate(185deg) brightness(1.2) saturate(0.8)' },
        { id: 'bubble',  name: 'BUBBLEGUM FOES', cost: 110, color: STYLE.pal.pink, filter: 'hue-rotate(335deg) brightness(1.3) saturate(1.5)' },
        { id: 'frostbite', name: 'FROSTBITE',  cost: 240, color: STYLE.pal.cyan,   filter: 'hue-rotate(170deg)', fx: 'outline' },
        { id: 'hex',     name: 'HEX MARKED',   cost: 300, color: STYLE.pal.purple, filter: 'hue-rotate(-90deg)', fx: 'orbit' },
      ],
      // Bosse (Farbe/Zusaetze fuer alle Bosse, fx: glitch, shadow, infernal)
      boss: [
        { id: 'default', name: 'STANDARD',    cost: 0,   color: STYLE.pal.red,    filter: '' },
        { id: 'frost',   name: 'FROST LORD',  cost: 100, color: STYLE.pal.cyan,   filter: 'hue-rotate(170deg)' },
        { id: 'toxic',   name: 'TOXIC LORD',  cost: 100, color: STYLE.pal.green,  filter: 'hue-rotate(110deg)' },
        { id: 'void',    name: 'VOID LORD',   cost: 120, color: STYLE.pal.purple, filter: 'hue-rotate(-90deg)' },
        { id: 'gilded',  name: 'GILDED',      cost: 160, color: STYLE.pal.yellow, filter: 'hue-rotate(40deg) brightness(1.15)' },
        { id: 'mono',    name: 'MONOCHROME',  cost: 180, color: STYLE.pal.grey,   filter: 'grayscale(1)' },
        { id: 'ruby',     name: 'RUBY',        cost: 150, color: STYLE.pal.pink,   filter: 'hue-rotate(320deg) saturate(1.4)' },
        { id: 'rust',    name: 'RUSTED TITAN', cost: 170, color: STYLE.pal.redMid, filter: 'sepia(1) saturate(1.6) brightness(0.8)' },
        { id: 'king',    name: 'THE KING',    cost: 280, color: STYLE.pal.yellow, filter: 'hue-rotate(40deg) brightness(1.1)', fx: 'crown' },
        { id: 'storm',   name: 'STORMBORN',   cost: 290, color: STYLE.pal.cyan,   filter: 'hue-rotate(170deg)', fx: 'static' },
        { id: 'sats',    name: 'WARDEN',      cost: 300, color: STYLE.pal.yellow, filter: '', fx: 'orbit' },
        { id: 'shadow',  name: 'SHADOW',     cost: 300, color: STYLE.pal.redMid, filter: 'brightness(0.7) contrast(1.2)', fx: 'shadow' },
        { id: 'glitch',  name: 'GLITCH BOSS', cost: 320, color: STYLE.pal.cyan,   filter: '', fx: 'glitch' },
        { id: 'infernal', name: 'INFERNAL',   cost: 360, color: STYLE.pal.orange, filter: 'hue-rotate(15deg) saturate(1.4)', fx: 'infernal' },
        // Neu (Cryo-Bosse sind schon blau gefaerbt: diese Looks wirken dort als Aufsatz, die Effekte immer)
        { id: 'permafrost', name: 'PERMAFROST', cost: 330, color: STYLE.pal.ice,  filter: 'hue-rotate(185deg) brightness(1.2)', fx: 'static' },
        { id: 'cryoking', name: 'FROST KING',  cost: 380, color: STYLE.pal.cyan,   filter: 'hue-rotate(170deg) brightness(1.1)', fx: 'crown' },
        { id: 'blizzard', name: 'BLIZZARD',    cost: 340, color: STYLE.pal.white,  filter: 'grayscale(1) brightness(1.4)', fx: 'orbit' },
      ],
      // Endlos-Modus (wirken nur im Endlos-Lauf, die Karte hat dort keine Waende). needInf = Minuten Endlos-Bestzeit, die man zum Kaufen braucht.
      // fx: beacon (Pfeil zum Startpunkt), sonar (Ping-Ringe), chrono (Siegel = 1 pro 5 Min Laufzeit), warp (Tempolinien),
      //     grid (Bodenraster, Farbe = color), stars (Sternenfeld mit Tiefe)
      endless: [
        { id: 'none',    name: 'NOTHING',        cost: 0,   color: STYLE.pal.greyMid, fx: null },
        { id: 'beacon',  name: 'HOME BEACON',    cost: 150, color: STYLE.pal.green,   fx: 'beacon' },
        { id: 'sonar',   name: 'SONAR PING',     cost: 200, color: STYLE.pal.cyan,    fx: 'sonar' },
        { id: 'grid',    name: 'NEON GRID',      cost: 220, color: STYLE.pal.cyan,    fx: 'grid' },
        { id: 'stars',   name: 'DEEP SPACE',     cost: 300, color: STYLE.pal.ice,     fx: 'stars',  needInf: 10 },
        { id: 'bloodgrid', name: 'BLOOD GRID',   cost: 280, color: STYLE.pal.red,     fx: 'grid',   needInf: 10 },
        { id: 'chrono',  name: 'CHRONO SIGILS',  cost: 340, color: STYLE.pal.yellow,  fx: 'chrono', needInf: 20 },
        { id: 'warp',    name: 'WARP LINES',     cost: 380, color: STYLE.pal.violet,  fx: 'warp',   needInf: 30 },
      ],

      // ---- Neue Kategorien (Umsetzung: js/cosmetics2.js, Objekt Cos2). Standard ist immer das erste Item. ----
      // Geschosse: Form fuer ALLE Projektile des Spielers (Schuss, Schrot, Prallschuss, Rakete, Scheibe, Granate)
      proj: [
        { id: 'default', name: 'STANDARD',    cost: 0,   color: STYLE.pal.cyan,   shape: null },
        { id: 'plane',   name: 'PAPER PLANES', cost: 200, color: STYLE.pal.white,  shape: 'plane' },
        { id: 'arrow',   name: 'ARROWS',      cost: 220, color: STYLE.pal.yellow, shape: 'arrow' },
        { id: 'note',    name: 'MUSIC NOTES', cost: 260, color: STYLE.pal.pink,   shape: 'note' },
        { id: 'fish',    name: 'FISH',        cost: 280, color: STYLE.pal.teal,   shape: 'fish' },
        { id: 'star',    name: 'SHURIKEN',    cost: 300, color: STYLE.pal.ice,    shape: 'shuriken' },
      ],
      // Treffer: passiert bei JEDEM Treffer auf Gegner und Bosse, egal womit (Stempel am Boden sind jetzt unter KILLS)
      hit: [
        { id: 'none',    name: 'NOTHING',     cost: 0,   color: STYLE.pal.greyMid, shape: null },
        { id: 'comic',   name: 'COMIC WORDS', cost: 240, color: STYLE.pal.yellow, shape: 'comic' },
      ],
      weather: [
        { id: 'none',    name: 'CLEAR',       cost: 0,   color: STYLE.pal.greyMid, shape: null },
        { id: 'rain',    name: 'RAIN',        cost: 200, color: STYLE.pal.cyanMid, shape: 'rain' },
        { id: 'snow',    name: 'SNOWFALL',    cost: 200, color: STYLE.pal.white,  shape: 'snow' },
        { id: 'fireflies', name: 'FIREFLIES', cost: 240, color: STYLE.pal.yellow, shape: 'fireflies' },
        { id: 'ash',     name: 'FALLING ASH', cost: 220, color: STYLE.pal.grey,   shape: 'ash' },
      ],
      pet: [
        { id: 'none',    name: 'NO PET',      cost: 0,   color: STYLE.pal.greyMid, shape: null },
        { id: 'drone',   name: 'MINI DRONE',  cost: 300, color: STYLE.pal.cyan,   shape: 'drone' },
        { id: 'dog',     name: 'SHADOW DOG',  cost: 360, color: STYLE.pal.purple, shape: 'dog' },
        { id: 'cat',     name: 'GHOST CAT',   cost: 340, color: STYLE.pal.ice,    shape: 'cat' },
      ],
      // HUD-Themes: ersetzen Farben und Rahmen des HUD (Hotbar, Kugel, Balken)
      hud: [
        { id: 'default', name: 'NEON VOID',   cost: 0,   color: STYLE.pal.cyan,   theme: null },
        { id: 'retro',   name: 'RETRO CONSOLE', cost: 240, color: STYLE.pal.pink, theme: 'retro' },
        { id: 'terminal', name: 'TERMINAL',   cost: 260, color: STYLE.pal.green,  theme: 'terminal' },
        { id: 'blueprint', name: 'BLUEPRINT', cost: 280, color: STYLE.pal.cyan,   theme: 'blueprint' },
        { id: 'wood',    name: 'WOODEN',      cost: 260, color: STYLE.pal.orange, theme: 'wood' },
      ],
      numbers: [
        { id: 'default', name: 'STANDARD',    cost: 0,   color: STYLE.pal.red,    style: null },
        { id: 'flame',   name: 'FLAMES',      cost: 220, color: STYLE.pal.orange, style: 'flame' },
        { id: 'ice',     name: 'ICICLES',     cost: 220, color: STYLE.pal.cyan,   style: 'ice' },
        { id: 'hearts',  name: 'PIXEL HEARTS', cost: 260, color: STYLE.pal.pink,  style: 'hearts' },
        { id: 'coins',   name: 'COINS',       cost: 280, color: STYLE.pal.yellow, style: 'coins' },
      ],
      // Sound-Pakete: ersetzen die Klaenge von Treffer, Kill, Schuss, Schlag, Explosion, Schaden
      sound: [
        { id: 'default', name: 'STANDARD',    cost: 0,   color: STYLE.pal.cyan,   pack: null },
        { id: 'arcade',  name: '8-BIT ARCADE', cost: 220, color: STYLE.pal.yellow, pack: 'arcade' },
        { id: 'drums',   name: 'DRUM KIT',    cost: 240, color: STYLE.pal.orange, pack: 'drums' },
        { id: 'laser',   name: 'RETRO LASER', cost: 260, color: STYLE.pal.green,  pack: 'laser' },
        { id: 'squeak',  name: 'RUBBER SQUEAK', cost: 200, color: STYLE.pal.pink, pack: 'squeak' },
      ],
      menubg: [
        { id: 'default', name: 'STANDARD',    cost: 0,   color: STYLE.pal.red,    bg: null },
        { id: 'stars',   name: 'STAR DRIFT',  cost: 200, color: STYLE.pal.ice,    bg: 'stars' },
        { id: 'city',    name: 'NIGHT CITY',  cost: 260, color: STYLE.pal.purple, bg: 'city' },
        { id: 'arena',   name: 'BURNING ARENA', cost: 280, color: STYLE.pal.orange, bg: 'arena' },
      ],
      death: [
        { id: 'default', name: 'STANDARD',    cost: 0,   color: STYLE.pal.red,    anim: null },
        { id: 'dissolve', name: 'PIXEL DUST', cost: 260, color: STYLE.pal.cyan,   anim: 'dissolve' },
        { id: 'scrap',   name: 'SCRAP BLAST', cost: 300, color: STYLE.pal.orange, anim: 'scrap' },
        { id: 'tomb',    name: 'TOMBSTONE',   cost: 320, color: STYLE.pal.grey,   anim: 'tomb' },
        { id: 'hole',    name: 'BLACK HOLE',  cost: 360, color: STYLE.pal.violet, anim: 'hole' },
      ],
      intro: [
        { id: 'default', name: 'NO CARD',     cost: 0,   color: STYLE.pal.greyMid, card: null },
        { id: 'comic',   name: 'COMIC BURST', cost: 240, color: STYLE.pal.yellow, card: 'comic' },
        { id: 'arcade',  name: 'ARCADE ALERT', cost: 260, color: STYLE.pal.pink,  card: 'arcade' },
        { id: 'horror',  name: 'HORROR',      cost: 300, color: STYLE.pal.red,    card: 'horror' },
      ],
      victory: [
        { id: 'none',    name: 'NOTHING',     cost: 0,   color: STYLE.pal.greyMid, pose: null },
        { id: 'fanfare', name: 'FANFARE',     cost: 240, color: STYLE.pal.yellow, pose: 'fanfare' },
        { id: 'flag',    name: 'PLANT A FLAG', cost: 260, color: STYLE.pal.red,   pose: 'flag' },
        { id: 'dance',   name: 'VICTORY SPIN', cost: 280, color: STYLE.pal.cyan,  pose: 'dance' },
      ],
      // achOnly = nicht kaeuflich, nur als Belohnung (Achievement)
      revive: [
        { id: 'default', name: 'REVIVAL RING', cost: 0,  color: STYLE.pal.yellow, anim: null },
        { id: 'totem',   name: 'TOTEM OF UNDYING', cost: 999, color: STYLE.pal.green, anim: 'totem', achOnly: 'Trigger the Revival Core 64 times' },
      ],
    },
  },

  // ==========================================================================================
  //  [5] ABILITIES (Q / Shift / R)
  //  3 Slots, einer pro Gruppe (schwach, mittel, stark). Nach jedem besiegten Boss wählt man eine Ability für den nächsten leeren Slot
  //  (Reihenfolge wie in `tiers`). `unlock` = Seelenpreis im Upgrade-Menü (0 = von Anfang an da, pro Gruppe muss mindestens eine frei sein).
  //  `start` = was man zu Beginn eines Laufs schon hat (null = leer).
  //  Neue Ability: unten bei `abilities` eintragen, Werte als eigener Block darunter, Verhalten in Player.useAbilities/abilityStatus.
  // ==========================================================================================
  loadout: {
    tiers: [
      { id: 'weak', key: 'Shift', label: 'WEAK' },
      { id: 'medium', key: 'Q', label: 'MEDIUM' },
      { id: 'strong', key: 'R', label: 'STRONG' },
    ],
    start: { weak: null, medium: null, strong: null },
    abilities: {
      dash:     { tier: 'weak',   name: 'DASH',        icon: 'dash1',     iconW: 20, unlock: 0,   desc: 'Quick burst forward, invulnerable and damaging while it lasts.' },
      blink:    { tier: 'weak',   name: 'PHASE',       icon: 'blinkIcon', iconW: 18, unlock: 60,  desc: 'Turn invisible and invulnerable for 2 s, movement stays free.' },
      shield:   { tier: 'medium', name: 'FORCE BUBBLE', icon: 'bubble',    iconW: 16, unlock: 0,   desc: 'Bubble blocks all hits and projectiles and pushes enemies away.' },
      frost:    { tier: 'medium', name: 'CRYO RING',   icon: 'frostIcon', iconW: 18, unlock: 100, desc: 'Briefly freezes all nearby enemies.' },
      thrusters: { tier: 'weak',  name: 'SPEED THRUSTERS',  icon: 'thrustersIcon',  iconW: 18, unlock: 70,  passive: true, desc: 'Always on: you move 12% faster.' },
      scanner:  { tier: 'weak',   name: 'TARGET SCANNER', icon: 'scannerIcon',    iconW: 18, unlock: 100, passive: true, desc: 'Always on: much stronger aim assist (wider cone, longer range).' },
      shockstep: { tier: 'weak',  name: 'STUN PULSE', icon: 'shockstepIcon', iconW: 18, unlock: 50,  desc: 'Small shockwave: nearby enemies stop briefly.' },
      adrenaline: { tier: 'weak', name: 'COMBAT SPEED',    icon: 'adrenalineIcon', iconW: 18, unlock: 120, desc: 'Attack faster for 5 s.' },
      surge:    { tier: 'weak',   name: 'BOOST',      icon: 'surgeIcon',   iconW: 18, unlock: 40,  desc: 'Short speed boost: run much faster for 3 s.' },
      barrier:  { tier: 'medium', name: 'KINETIC BARRIER', icon: 'barrierIcon',  iconW: 18, unlock: 130, passive: true, desc: 'Always on: you take 12% less damage.' },
      capacitor: { tier: 'medium', name: 'CAPACITOR BANK', icon: 'capacitorIcon', iconW: 18, unlock: 160, passive: true, desc: 'Always on: kills charge your ultimate 30% faster.' },
      drone:    { tier: 'medium', name: 'COMBAT DRONE', icon: 'droneIcon',     iconW: 18, unlock: 150, desc: 'A drone orbits you for 8 s and shoots nearby enemies.' },
      overcharge: { tier: 'medium', name: 'POWER SURGE', icon: 'overchargeIcon', iconW: 18, unlock: 220, desc: 'Instantly charges a big chunk of your ultimate.' },
      decoy:    { tier: 'medium', name: 'HOLO DECOY',      icon: 'decoyIcon',   iconW: 18, unlock: 90,  desc: 'Leaves a hologram that enemies follow for 4 s.' },
      overclock: { tier: 'strong', name: 'OVERCLOCK',      icon: 'overclockIcon', iconW: 18, unlock: 260, passive: true, desc: 'Always on: all attacks come 15% faster.' },
      aegis:    { tier: 'strong', name: 'AEGIS PROTOCOL', icon: 'aegisIcon',     iconW: 18, unlock: 320, passive: true, desc: 'Always on: a hit that would drop you below 20 health makes you invulnerable for 2.5 s (40 s cooldown).' },
      storm:    { tier: 'strong', name: 'STORM',  icon: 'stormIcon',     iconW: 18, unlock: 300, desc: 'Eight lightning bolts strike enemies and bosses one after another.' },
      berserk:  { tier: 'strong', name: 'OVERDRIVE',      icon: 'berserkIcon',   iconW: 18, unlock: 350, desc: 'Run and attack faster for 7 s, briefly invulnerable at the start.' },
      nano:     { tier: 'weak',   name: 'NANO REGEN',     icon: 'nanoIcon',   iconW: 18, unlock: 110, passive: true, desc: 'Always on: nanites repair you. Much faster while you have not been hit for a few seconds.' },
      blades:   { tier: 'medium', name: 'ORBIT BLADES',   icon: 'bladesIcon', iconW: 18, unlock: 180, passive: true, desc: 'Always on: three blades spin around you and cut everything they touch.' },
      hack:     { tier: 'medium', name: 'NEURAL HACK',    icon: 'hackIcon',   iconW: 18, unlock: 200, desc: 'Takes over the nearest enemies: they fight for you for 10 s.' },
      necromancy: { tier: 'strong', name: 'NECROMANCY',   icon: 'necroIcon',  iconW: 18, unlock: 280, desc: 'Raises enemies that just fell nearby as your minions for 12 s.' },
      stims:    { tier: 'strong', name: 'COMBAT STIMS',   icon: 'stimIcon',   iconW: 18, unlock: 240, desc: 'Gives you speed, rapid fire and a short guard at once.' },
      bombard:  { tier: 'strong', name: 'ORBITAL STRIKE', icon: 'bombardIcon', iconW: 18, unlock: 200, desc: 'Several strikes around you damage enemies and bosses.' },
      pulse:    { tier: 'strong', name: 'SHOCKWAVE',  icon: 'pulseIcon', iconW: 18, unlock: 0,   desc: 'Pushes all enemies away and erases nearby projectiles.' },
      field:    { tier: 'strong', name: 'GRAVITY FIELD',   icon: 'fieldIcon', iconW: 18, unlock: 150, passive: true, desc: 'Always on: enemies in the field are slower and take a little damage.' },
    },
  },

  // --- schwach: Dash ---
  dash: { baseCooldown: 1.5, minCooldown: 0.5, upCooldown: 0.25, maxLevel: 3, stepsPerFrame: 10 },

  // --- schwach: Blink (unsichtbar + unverwundbar, Gegner verlieren dich) ---
  blink: { duration: 2, cooldown: 12 },

  // --- passive Abilities (immer aktiv, keine Taste) ---
  // thrusters: Lauftempo +speed. scanner: Zielhilfe x deg (Winkel) und x range (Reichweite). barrier: reduce = weniger Schaden.
  // capacitor: ult = mehr Ultimate-Ladung durch Kills. overclock: rate = Angriffstempo x. aegis: unter hp Leben (nach dem Treffer) protect s unverwundbar, danach cooldown s Pause.
  passives: { thrusters: { speed: 0.12 }, scanner: { deg: 1.6, range: 1.4 }, barrier: { reduce: 0.12 }, capacitor: { ult: 0.3 }, overclock: { rate: 1.15 }, aegis: { hp: 20, protect: 2.5, cooldown: 40 } },

  // --- schwach: Schockschritt (stunnt Gegner im Radius, wie Frostring in klein) ---
  shockstep: { radius: 70, stun: 1.2, cooldown: 8, duration: 0.35 },

  // --- schwach: Adrenalin (Angriffstempo, duration s lang) ---
  adrenaline: { duration: 5, cooldown: 16 },

  // --- mittel: Kampfdrohne (kreist orbit Einheiten um dich, schiesst alle every s auf Ziele im range) ---
  drone: { duration: 8, cooldown: 20, orbit: 30, range: 230, every: 0.55 },

  // --- mittel: Ueberladung (amount Ultimate-Ladung, vor chargeFactor) ---
  overcharge: { amount: 60, cooldown: 45 },

  // --- stark: Blitzsturm (count Blitze im Abstand interval auf Ziele im range) ---
  storm: { count: 8, interval: 0.22, range: 280, hits: 2, bossDmg: 2, cooldown: 24 },

  // --- Verbuendete (Neural Hack, Necromancy): Ally-Einheiten kaempfen fuer dich (Klasse Ally in arsenal.js). speed = Tempo pro Bild, hits = Leben (Treffer),
  //     hitEvery = Pause zwischen zwei Beruehrungstreffern (beide Richtungen), bossDmg = Schaden an Bossen je Treffer
  allies: { speed: 3.4, hitEvery: 0.55, bossDmg: 0.5, seek: 320, follow: 60, max: 8 },
  hack: { count: 3, radius: 140, life: 10, bonusHits: 1, cooldown: 24 },
  necromancy: { count: 4, radius: 280, window: 10, life: 12, hits: 2, cooldown: 28 },

  // --- passiv: Orbit-Klingen (Waechter wie in Survivor.io): count Klingen kreisen im Abstand orbit mit speed Grad/s, Treffer alle hitEvery s pro Ziel ---
  blades: { count: 3, orbit: 20, speed: 230, radius: 12, hitEvery: 0.5, bossDmg: 0.35 },

  // --- passiv: Nano-Regeneration: perSecond Leben/s, nach calmAfter s ohne Treffer x calmMul ---
  nano: { perSecond: 0.8, calmAfter: 4, calmMul: 2.5 },

  // --- stark: Kampf-Stims (alle drei Drop-Buffs gleichzeitig, Dauer wie die Drops x durMul) ---
  stims: { durMul: 0.8, cooldown: 40 },

  // --- stark: Rausch (Tempo + Angriffstempo wie die Drops, dazu kurze Unverwundbarkeit) ---
  berserk: { duration: 7, protect: 1.5, cooldown: 45 },

  // --- schwach: Sprint (mult = Tempofaktor, duration = Dauer) ---
  surge: { mult: 1.6, duration: 3, cooldown: 9 },

  // --- mittel: Koeder (Trugbild, dem die Gegner folgen) ---
  decoy: { duration: 4, cooldown: 14 },

  // --- stark: Bombardement ---
  // count Einschlaege im Abstand interval s, zufaellig bis spread um den Spieler, delay s Vorwarnung, radius = Wirkung, hits = Treffer je Gegner, bossDmg = Boss-Leben
  bombard: { count: 7, interval: 0.3, spread: 150, delay: 0.8, radius: 42, hits: 2, bossDmg: 2, cooldown: 22 },

  // --- mittel: Schildblase ---
  // Ein Tastendruck, kein Halten. Blase um den Spieler (radius), blockt Geschosse und Treffer, schiebt Gegner weg.
  // Hält `duration` Sekunden (zweiter Druck beendet sie früher), danach Abklingzeit. Angriff ist währenddessen gesperrt.
  shield: { duration: 2.5, cooldown: 5, maxDuration: 3.5, minCooldown: 5, upDuration: 0.25, upCooldown: 0.5, radius: 25 },

  // --- mittel: Frostring (stunnt Gegner im Radius) ---
  frost: { radius: 130, stun: 2.5, cooldown: 12, duration: 0.5 },

  // --- stark: Druckwelle ---
  // Stößt alle Gegner im Radius weg (am Anfang stark, dann schwächer) und betäubt sie kurz.
  // push = Bühneneinheiten pro Bild am Anfang, bossFactor = wie viel davon Bosse abbekommen, clearShots = Gegnergeschosse im Radius löschen.
  pulse: { cooldown: 5, radius: 200, push: 17, duration: 0.4, stun: 0.6, bossFactor: 0.25, clearShots: true },

  // --- stark: Kraftfeld (passiv) ---
  // Radius, Tempofaktor der Gegner im Feld, Schaden in Treffern (Gegner-Leben) pro Sekunde
  field: { radius: 85, slow: 0.65, dps: 0.1 },


  // ==========================================================================================
  //  [6] META-FORTSCHRITT (Menü nach dem Tod)
  // ==========================================================================================

  // Nach jedem Lauf gibt es Seelen, im Upgrade-Menü kauft man dauerhafte Verbesserungen.
  // Kosten einer Stufe = cost * (aktuelle Stufe + 1). Absichtlich langsam (viel Grind).
  // Neues Upgrade: hier mit `tab` eintragen + Wirkung per Save.bonus(id) an der passenden Stelle.
  meta: {
    perSecond: 0.24,          // Seelen pro Sekunde Spielzeit (ein Lauf ist jetzt ca. 840 s statt 2000 s lang, deshalb 2.4x so viel pro Sekunde)
    perBoss: 25,              // Seelen pro besiegtem Boss (6 Bosse pro Lauf statt bis zu 13)
    // Starter-Bonus: in den ersten Laeufen (Lauf 1, 2, ...) werden die Lauf-Cores mit mult multipliziert und steigen mindestens auf min, damit man frueh etwas Erstes kaufen kann
    // (Stats kosten ab ca. 25-30 Cores). Danach normal. Tutorial zaehlt nicht als Lauf. Eintraege = Anzahl der Laeufe.
    starter: { mult: [3, 2.5, 2, 1.75, 1.5], min: [60, 50, 40, 35, 30] },
    upgrades: {
      health:   { tab: 'stats', name: 'HEALTH',            max: 15, cost: 50, step: 10,   desc: (v) => '+' + v + ' max health', info: 'More maximum health (base 100), the health bar adapts.' },
      speed:    { tab: 'stats', name: 'SPEED',        max: 15, cost: 30, step: 0.02, desc: (v) => '+' + Math.round(v * 100) + '% move speed', info: 'You move faster permanently.' },
      ult:      { tab: 'stats', name: 'ULTIMATE CHARGE',  max: 15, cost: 40, step: 0.05, desc: (v) => '+' + Math.round(v * 100) + '% charge from kills', info: 'Kills charge your ultimate faster.' },
      cooldown: { tab: 'stats', name: 'COOLDOWNS',    max: 15, cost: 50, step: 0.03, desc: (v) => '-' + Math.round(v * 100) + '% ability cooldown', info: 'Abilities, grenades and more are ready sooner.' },
      startUlt: { tab: 'stats', name: 'STARTING CHARGE',   max: 15, cost: 25, step: 4,    desc: (v) => '+' + v + ' charge at start', info: 'You begin every run with some ultimate charge.' },
      resist:   { tab: 'stats', name: 'DAMAGE RESISTANCE',           max: 15, cost: 60, step: 0.05, desc: (v) => '-' + Math.round(v * 100) + '% damage taken', info: 'Every hit you take hurts less.' },
      regen:    { tab: 'stats', name: 'REGENERATION',     max: 15, cost: 75, step: 0.25, desc: (v) => '+' + v.toFixed(2) + ' health per second', info: 'You slowly heal yourself permanently (even without an implant).' },
      blood:    { tab: 'stats', name: 'BURST RECHARGE',       max: 15, cost: 90, step: 0.06, desc: (v) => '-' + Math.round(v * 100) + '% emergency burst cooldown', info: 'The emergency burst near death is ready sooner.' },
      // Weitere Spieler-Werte (jeder Wert, der den Spieler selbst beeinflusst, ist hier kaufbar; Waffen und Ausrüstung haben ihre eigenen Boni)
      power:      { tab: 'stats', name: 'POWER',           max: 15, cost: 80, step: 0.04, desc: (v) => '+' + Math.round(v * 100) + '% double-hit chance and boss damage', info: 'Your attacks sometimes hit twice and bosses take more damage.' },
      attackSpeed: { tab: 'stats', name: 'ATTACK SPEED',  max: 15, cost: 70, step: 0.04, desc: (v) => '+' + Math.round(v * 100) + '% attack speed', info: 'All your weapons fire and swing faster.' },
      recovery:   { tab: 'stats', name: 'RECOVERY',       max: 15, cost: 70, step: 0.019, desc: (v) => '+' + v.toFixed(2) + ' s safe after a hit', info: 'After a hit you stay invulnerable a little longer.' },
      heal:       { tab: 'stats', name: 'HEALING',        max: 15, cost: 60, step: 0.1,  desc: (v) => '+' + Math.round(v * 100) + '% healing', info: 'Every kind of healing (kills, pickups, bursts) restores more.' },
      luck:       { tab: 'stats', name: 'LUCK',           max: 15, cost: 60, step: 0.1,  desc: (v) => '+' + Math.round(v * 100) + '% drop chance', info: 'Enemies drop buffs more often.' },
      buffTime:   { tab: 'stats', name: 'BUFF DURATION',  max: 15, cost: 50, step: 0.1,  desc: (v) => '+' + Math.round(v * 100) + '% buff duration', info: 'Speed, rapid fire and guard buffs last longer.' },
      magnet:     { tab: 'stats', name: 'MAGNET',         max: 15, cost: 40, step: 0.15, desc: (v) => '+' + Math.round(v * 100) + '% pickup range', info: 'You collect healing and buff drops from further away.' },
      coreDrop: { tab: 'stats', name: 'CORE EMITTER',      max: 15, cost: 90, step: 3,    desc: (v) => 'a core drops every ' + (CFG.coreDrop.base - v) + ' s', info: 'Every few seconds you automatically collect a core during a run.' },
      bounty:   { tab: 'stats', name: 'KILL BOUNTY',      max: 15, cost: 150, step: 0.02, desc: (v) => Math.round(v * 100) + '% chance of +1 core per kill', info: 'Every kill has a chance to drop an extra core (not from minions). Stacks with weapon perks.' },
      souls:    { tab: 'stats', name: 'CORE HARVESTER',    max: 15, cost: 45, step: 0.05, desc: (v) => '+' + Math.round(v * 100) + '% souls from runs', info: 'You get more souls after every run.' },
    },
  },

  // Core Emitter (Meta-Stat, Stufe 0 = aus): alle (base - Bonus) Sekunden bekommt der Spieler automatisch `value` Cores (gelbes "+CORE" und Impuls-Ring um den Spieler).
  coreDrop: { base: 70, value: 2 },

  // Meilensteine: Belohnung ist immer ein Core-Betrag { cores: n } oder ein einfaches Cosmetic { cos: 'kategorie:id' } (nur günstige Basis-Cosmetics).
  // Jede Meilenstein-Kategorie gibt eine Cosmetic-Kategorie (Zeit -> Skins, Bosse -> Boss-Looks, Gegner -> Kill-FX, Tutorial -> Glow) oder Cores (Läufe, Endlos).
  // stat: best = beste Zeit in s, bosses/kills = Summe über alle Läufe. Wird ein Meilenstein erreicht (oder war er in einem alten Spielstand schon erreicht), wird die Belohnung einmalig gutgeschrieben (Save.data.msPaid).
  milestones: [
    { id: 'time180',  name: 'SURVIVE 3 MINUTES',  stat: 'best',   need: 180, reward: { cos: 'skin:crimson' } },
    { id: 'time540',  name: 'SURVIVE 9 MINUTES',  stat: 'best',   need: 540, reward: { cos: 'skin:toxic' } },
    { id: 'boss3',    name: 'DEFEAT 3 BOSSES',      stat: 'bosses', need: 3,   reward: { cos: 'boss:frost' } },
    { id: 'boss5',    name: 'DEFEAT 5 BOSSES',      stat: 'bosses', need: 5,   reward: { cos: 'boss:toxic' } },
    { id: 'kill150',  name: 'DEFEAT 150 ENEMIES',   stat: 'kills',  need: 150, reward: { cos: 'kill:cyan' } },
    { id: 'kill600',  name: 'DEFEAT 600 ENEMIES',   stat: 'kills',  need: 600, reward: { cos: 'kill:gold' } },
    { id: 'time300',  name: 'SURVIVE 5 MINUTES',  stat: 'best',   need: 300,  reward: { cos: 'skin:rose' } },
    { id: 'runs10',   name: 'PLAY 10 RUNS',     stat: 'runs',   need: 10,   reward: { cores: 60 } },
    { id: 'boss8',    name: 'DEFEAT 8 BOSSES',      stat: 'bosses', need: 8,    reward: { cos: 'boss:void' } },
    { id: 'kill1500', name: 'DEFEAT 1500 ENEMIES',  stat: 'kills',  need: 1500, reward: { cos: 'kill:pink' } },
    { id: 'time840',  name: 'REACH THE FINAL BOSS', stat: 'best', need: 840,  reward: { cos: 'skin:frost' } },       // = CFG.finalBoss.at
    { id: 'runs30',   name: 'PLAY 30 RUNS',     stat: 'runs',   need: 30,   reward: { cores: 150 } },
    { id: 'boss15',   name: 'DEFEAT 15 BOSSES',     stat: 'bosses', need: 15,   reward: { cos: 'boss:ruby' } },
    { id: 'kill4000', name: 'DEFEAT 4000 ENEMIES',  stat: 'kills',  need: 4000, reward: { cos: 'kill:toxic' } },
    { id: 'win1',     name: 'DEFEAT DEATH',       cat: 'best', stat: 'wins', need: 1, reward: { cos: 'skin:solar' } },       // Sieg über den finalen Boss
    { id: 'boss25',   name: 'DEFEAT 25 BOSSES',     stat: 'bosses', need: 25,   reward: { cos: 'boss:gilded' } },
    { id: 'tutorial', name: 'COMPLETE THE TUTORIAL', cat: 'tutorial', stat: 'tutorial', need: 1, reward: { cores: 20 } },
    // Helden-Meilensteine (cat 'heroes'): schalten den Kauf des Helden frei (CFG.heroes, Upgrades > HEROES), zusaetzlich kostet der Held Cores
    { id: 'hero_bulwark', name: 'DEFEAT 18 BOSSES',            cat: 'heroes', stat: 'bosses', need: 18,  reward: { hero: 'bulwark' } },
    { id: 'hero_specter', name: 'SURVIVE 10 MINUTES IN A RUN', cat: 'heroes', stat: 'best',   need: 600, reward: { hero: 'specter' } },
    { id: 'hero_archon',  name: 'DEFEAT DEATH 2 TIMES',        cat: 'heroes', stat: 'wins',   need: 2,   reward: { hero: 'archon' } },
    { id: 'hero_alchemist', name: 'DEFEAT 3000 ENEMIES',       cat: 'heroes', stat: 'kills',  need: 3000, reward: { hero: 'alchemist' } },
    { id: 'hero_harbinger', name: 'DEFEAT DEATH 4 TIMES',      cat: 'heroes', stat: 'wins',   need: 4,   reward: { hero: 'harbinger' } },
    // Karte 4 (Cryo Station, cat 'cryo'): mapbest:<id> = beste Zeit auf der Karte, mapbosses:/mapkills:<id> = Summe der Bosse/Gegner in Läufen auf dieser Karte (nur normaler Modus)
    { id: 'cryo180',  name: 'SURVIVE 3 MIN ON CRYO STATION',     cat: 'cryo', stat: 'mapbest:cryo',   need: 180,  reward: { cos: 'skin:iceberg' } },
    { id: 'cryo420',  name: 'SURVIVE 7 MIN ON CRYO STATION',     cat: 'cryo', stat: 'mapbest:cryo',   need: 420,  reward: { cos: 'blade:arctic' } },
    { id: 'cryo600',  name: 'SURVIVE 10 MIN ON CRYO STATION',    cat: 'cryo', stat: 'mapbest:cryo',   need: 600,  reward: { cos: 'skin:mint' } },
    { id: 'cryo840',  name: 'REACH THE FINAL BOSS ON CRYO',      cat: 'cryo', stat: 'mapbest:cryo',   need: 840,  reward: { cos: 'skin:aurora' } },
    { id: 'cryoboss2', name: 'DEFEAT 2 BOSSES ON CRYO STATION',  cat: 'cryo', stat: 'mapbosses:cryo', need: 2,    reward: { cos: 'enemy:glacier' } },
    { id: 'cryoboss6', name: 'DEFEAT 6 BOSSES ON CRYO STATION',  cat: 'cryo', stat: 'mapbosses:cryo', need: 6,    reward: { cos: 'boss:blizzard' } },
    { id: 'cryoboss15', name: 'DEFEAT 15 BOSSES ON CRYO STATION', cat: 'cryo', stat: 'mapbosses:cryo', need: 15,  reward: { cos: 'boss:permafrost' } },
    { id: 'cryokill200', name: 'DEFEAT 200 ENEMIES ON CRYO STATION',  cat: 'cryo', stat: 'mapkills:cryo', need: 200,  reward: { cos: 'skin:royal' } },
    { id: 'cryokill1200', name: 'DEFEAT 1200 ENEMIES ON CRYO STATION', cat: 'cryo', stat: 'mapkills:cryo', need: 1200, reward: { cos: 'blade:glacier' } },
    // Endlos-Modus (cat 'endless' = eigene Kategorie im Meilenstein-Reiter): bestInf = beste Endlos-Zeit, infKills/infBosses = Summe über alle Endlos-Läufe
    { id: 'inf600',   name: 'SURVIVE 10 MIN IN ENDLESS',  cat: 'endless', stat: 'bestInf',   need: 600,  reward: { cos: 'skin:tangerine' } },
    { id: 'inf1200',  name: 'SURVIVE 20 MIN IN ENDLESS',  cat: 'endless', stat: 'bestInf',   need: 1200, reward: { cos: 'blade:sunset' } },
    { id: 'inf1800',  name: 'SURVIVE 30 MIN IN ENDLESS',  cat: 'endless', stat: 'bestInf',   need: 1800, reward: { cos: 'skin:permafrost' } },
    { id: 'inf3000',  name: 'SURVIVE 50 MIN IN ENDLESS',  cat: 'endless', stat: 'bestInf',   need: 3000, reward: { cos: 'blade:tesla' } },
    { id: 'infboss5', name: 'DEFEAT 5 BOSSES IN ENDLESS', cat: 'endless', stat: 'infBosses', need: 5,    reward: { cores: 100 } },
    { id: 'infboss15', name: 'DEFEAT 15 BOSSES IN ENDLESS', cat: 'endless', stat: 'infBosses', need: 15, reward: { cos: 'boss:cryoking' } },
    { id: 'infkill500', name: 'DEFEAT 500 ENEMIES IN ENDLESS',  cat: 'endless', stat: 'infKills', need: 500,  reward: { cores: 100 } },
    { id: 'infkill3000', name: 'DEFEAT 3000 ENEMIES IN ENDLESS', cat: 'endless', stat: 'infKills', need: 3000, reward: { cos: 'enemy:hex' } },
  ],


  // ==========================================================================================
  //  [7] GEGNER
  // ==========================================================================================
  enemy: {
    // Allgemein
    size: 250,
    miniSize: 350,
    miniHits: 5,
    // Treffer-Anzeige bei Gegnern mit mehr als 1 Leben (Quadrat/Raute ändern stattdessen ihre Farbe, Minibosse haben immer cracks):
    //   cracks = Risse sammeln sich auf dem Körper, Splitter beim Tod | swell = schwillt an wie vor der Explosion und platzt beim Tod | glitch = flackert und verzerrt sich
    // Typen ohne Eintrag (z. B. ein Kreis mit Blutmond-Extraleben) bekommen cracks.
    hitFx: { splitter: 'swell', leech: 'swell', miner: 'swell', tank: 'cracks', guard: 'cracks', necro: 'cracks', sniper: 'cracks', support: 'glitch', teleporter: 'glitch' },
    hitsMul: 1,               // Zähigkeit: Leben (Treffer) ALLER Gegner mal diesen Faktor, gerundet (Kreis/Dreieck 1->2, Quadrat/Raute 2->3, Tank 12->18, Minibosse 5->8). Nicht im Tutorial.
    killHeal: 0.25,           // Leben pro Kill (Original: 1)
    stun: 0.5,                // Zeit nach einem Treffer, in der der Gegner sich nicht bewegt
    // Typen
    circle: { speed: 4, miniExtraSpeed: 0.5, push: 5, radius: 10 },
    triangle: { dashSpeed: 0.5, dashFrames: 20, miniSpeed: 1.6, shootFirst: 1.5, shootEvery: 0.5, radius: 9 },
    square: { speed: 1.5, push: 1.5, missileFirst: 1.5, missileEvery: 2.5, radius: 10 },
    rhombus: { speed: 2, push: 2, waveFirst: 1.5, waveEvery: 1.5, radius: 10 },
    // Unterstützer (neu): hält Abstand und wirkt eine Aura auf Verbündete oder den Spieler (siehe patterns.support). Prioritätsziel.
    support: { speed: 2, push: 2, radius: 9, hits: 2 },
    // Weitere Gegner (neu). size = eigene Größe in Prozent (sonst size oben), radius gilt für Größe 250. Muster/Events: patterns und events.local.
    bomber:     { speed: 3.4, push: 4, radius: 9 },                    // läuft los, zündet in der Nähe, explodiert (Blast 'bomb')
    splitter:   { speed: 2.2, push: 3, radius: 10, size: 320, hits: 2, splitCount: 3, splitSize: 170 },   // zerfällt beim Tod in splitCount kleine Kreise
    sniper:     { speed: 1.8, push: 2, radius: 9, hits: 2 },           // zielt mit Laserlinie, schießt schnellen Bolzen
    miner:      { speed: 1.8, push: 2, radius: 9, hits: 2 },           // lässt Minen fallen
    leech:      { speed: 3.6, push: 4, radius: 8, hits: 2 },           // haftet am Spieler und saugt Leben
    necro:      { speed: 1.6, push: 2, radius: 10, hits: 3 },          // belebt gefallene Gegner wieder
    teleporter: { speed: 2.4, push: 3, radius: 9, hits: 2 },           // springt hinter den Spieler
    // Tank: viele Leben, wird nicht betäubt (hitCd = Pause zwischen zwei Treffern). dmg = Schaden je Angriffsart (sonst 1)
    tank:       { speed: 1.1, push: 0.5, radius: 10, size: 420, hits: 12, hitCd: 0.35, dmg: { beam: 6, grenade: 6, dash: 2 } },
    // Schild-Gegner (neu): zwingt zum Waffenwechsel. Ein Rüstungsfeld (Ring) schützt ihn von allen Seiten, je nach Rüstung wirken nur bestimmte Waffen.
    // hurts = diese Angriffe verletzen ihn, blocks = diese prallen ab (ein Schuss wird dabei verbraucht).
    // Kinds: 'sword', 'lance', 'shot', 'impulse', 'dash', 'beam'. plate (grau): Schuss/Impuls prallen ab. mirror (weiß): Schwert, Lanze und Dash prallen ab.
    guard: {
      speed: 2.7, push: 2, radius: 15, hits: 5, touchDmg: 1.6,        // touchDmg = Schadensfaktor bei Berührung
      armor: {
        plate: { hurts: ['sword', 'lance', 'dash', 'beam'], blocks: ['shot', 'impulse'] },
        mirror: { hurts: ['shot', 'impulse', 'beam'], blocks: ['sword', 'lance', 'dash'] },
      },
    },
    // Elite-Gegner (neu, siehe CFG.elite und js/elites.js): auf allen Karten gleich, sehr stark. sprite = Grafik eines vorhandenen Typs (umgefaerbt).
    phantom: { speed: 3.6, push: 0.5, radius: 10, size: 300, hits: 10, sprite: 'teleporter' },    // weicht Nahkampf aus, haelt Abstand, schiesst Salven
    bastion: { speed: 1.5, push: 0.3, radius: 10, size: 420, hits: 16, sprite: 'tank' },          // Schildfront haelt Schuesse ab, Rammstoss
    magnetar: { speed: 1.8, push: 0.3, radius: 10, size: 400, hits: 14, sprite: 'support' },       // zieht den Spieler heran, Erschuetterung mit Vorwarnung (gegen Kiten)
    // Geschosse der Gegner
    bolt: { speed: 7, frames: 30, radius: 5 },
    missile: { speed: 4, frames: 60, turn: 5, radius: 5 },
    wave: { drift: 1.5, push: 2.5 },
  },

  // Spawn-Takt der Gegner (Sekunden zwischen zwei Gegnern: zufällig zwischen min und max)
  waves: {
    length: 120,
    phase1: { cMin: 6.5, cMax: 7.5, tMin: 7.5, tMax: 8.5 },
    phase2: { cMin: 7.5, cMax: 8.5, tMin: 8.5, tMax: 9.5, rMin: 9.5, rMax: 10.5 },
    phase3: { cMin: 7.5, cMax: 9.5, tMin: 9, tMax: 10.5, rMin: 10.5, rMax: 11.5, sMin: 10, sMax: 11 },
    // Zeitpunkte, an denen alle Intervalle um 0.5 s kürzer werden
    shrinkTimes: [360, 480, 600],
    shrinkEvery: 60,          // danach jede Minute ab 660
    shrinkFrom: 660,
    shrinkStep: 0.5,
    floors: { cMin: 0.5, cMax: 1, tMin: 0.5, tMax: 1.5, rMin: 1, rMax: 2 },
    rateFactor: 0.8,          // Spawn-Takt der Grundgegner (kleiner = mehr Gegner). 0.8 = ca. 25 % mehr als im Original; Karte 2/3 multiplizieren mit diff.rate
  },

  // Spawn-Takt aller übrigen Gegner (Schild, Unterstützer, alle Extra-Typen und die Gegnerflut): rate = Wartezeiten mal diesen Faktor (kleiner = mehr), capMul = Obergrenze
  // gleichzeitig lebender Gegner (maxAlive) mal diesen Faktor, aufgerundet. Der Kartenfaktor diff.spawn gilt zusätzlich.
  spawnAll: { rate: 1, capMul: 1 },        // neutral; die Härte kommt pro Karte aus diff.allRate / diff.capMul

  // Schild-Gegner: erscheinen ab `from` Sekunden alle min bis max Sekunden. Ab `shrinkFrom` wird das Intervall pro Minute um 1 s kürzer (nicht unter floor).
  guardSpawn: { from: 120, min: 12, max: 17, shrinkFrom: 240, floor: 6 },

  // Unterstützer erscheinen ab `from` Sekunden alle min bis max Sekunden, höchstens `maxAlive` gleichzeitig.
  supportSpawn: { from: 210, min: 30, max: 40, maxAlive: 2 },
  // Weitere Gegnertypen: erscheinen ab `from` Sekunden alle min bis max Sekunden, höchstens maxAlive gleichzeitig
  extraSpawn: {
    bomber:     { from: 180, min: 14, max: 20, maxAlive: 4 },
    splitter:   { from: 200, min: 22, max: 30, maxAlive: 3 },
    leech:      { from: 260, min: 25, max: 35, maxAlive: 2 },
    teleporter: { from: 280, min: 26, max: 36, maxAlive: 2 },
    sniper:     { from: 320, min: 28, max: 38, maxAlive: 2 },
    miner:      { from: 340, min: 28, max: 38, maxAlive: 1 },
    tank:       { from: 400, min: 45, max: 60, maxAlive: 1 },
    necro:      { from: 440, min: 50, max: 70, maxAlive: 1 },
    // Elite-Gegner: ab dem Mittelspiel, fixedCap = Obergrenze gilt unabhaengig vom Kartenfaktor, up = Werte nach dem Upgrade (CFG.elite.upgradeAt)
    phantom:    { from: 300, min: 40, max: 55, maxAlive: 1, fixedCap: true, up: { min: 30, max: 42, maxAlive: 2 } },
    bastion:    { from: 360, min: 46, max: 62, maxAlive: 1, fixedCap: true, up: { min: 34, max: 46, maxAlive: 2 } },
    magnetar:   { from: 420, min: 52, max: 68, maxAlive: 1, fixedCap: true, up: { min: 38, max: 50, maxAlive: 2 } },
  },

  // Elite-Gegner (js/elites.js): zwei Gegner, die die schnellen Endgame-Waffen umgehen (Plasma Blade mit 4 Klingen, Dreifach-Blaster). Nicht kartenspezifisch.
  // Gemeinsam: viele Leben, hoher Schaden (dmg), werden nie betaeubt oder zurueckgestossen und nehmen nur alle `gate` Sekunden einen Treffer (schnelle Waffen verlieren
  // ihren Vorteil). Kein Ultimate-Kill-Schutz: das Ultimate raeumt sie wie alle Gegner ab.
  // Phantom: haelt Abstand, weicht Nahkampf-Angriffen (Schwert, Lanze) mit einem Sprung aus, schiesst Salven. Bastion: dreht langsam zum Spieler, die Schildfront
  // fing Schuesse ab (nur von hinten/seitlich verletzbar), stoesst mit Vorwarnung zu. Starke Waffen (Beam, Granate ...) wirken ueber dmg x-fach.
  // Upgrade (Mk II) ab upgradeAt Sekunden: alle Elite-Gegner (auch die schon da sind) werden zaeher, schneller, staerker und bekommen die Faehigkeit des anderen dazu
  // (Phantom weicht auch Schuessen aus, Bastion: breitere Schildfront, schneller gedreht).
  elite: {
    upgradeAt: 630,
    mk2: { hits: 1.4, speed: 1.15, dmg: 1.25 },
    phantom: {
      dmg: 1.5, gate: 0.45, gate2: 0.6, hue: 205,
      keepDist: 135, band: 28, dodgeRange: 34, shotRange: 60, dodgeSpeed: 9, dodgeTime: 0.22, dodgeCd: 1.4, dodgeCd2: 1.1,
      shootFirst: 1.6, shootEvery: 2.6, burst: 3, spread: 12, boltSpeed: 8, boltFrames: 34,
    },
    bastion: {
      dmg: 1.7, gate: 0.7, gate2: 0.95, hue: 35,
      arc: 70, arc2: 115, turn: 70, turn2: 120, shield: 7,
      bashMin: 4, bashMax: 6, range: 170, tele: 0.9, go: 0.5, speed: 7,
      dmgTable: { beam: 5, grenade: 5, bombard: 5, blackhole: 3, chain: 3, molotov: 2, fire: 2, dash: 3 },       // Schaden je Angriffsart (sonst 1)
    },
    // Magnetar: gegen Kiten und Abstandhalten. Zieht den Spieler im Umkreis `range` heran (staerker je naeher, Dash ist immun, im Safe Spot aus) und loest alle `every` s eine
    // Erschuetterung aus: `tele` s Vorwarnring, dann Schaden im Radius `radius`; danach `rest` s ohne Sog (Zeit zum Zuschlagen). Mk II: staerkerer Sog, groesserer Ring, zwei Schlaege.
    magnetar: {
      dmg: 1.6, gate: 0.6, gate2: 0.85, hue: 130,
      range: 190, minPull: 0.9, maxPull: 2.6, chargePull: 1.5, mk2Pull: 1.35,
      keepDist: 75, band: 25, first: 3, every: 5.5, every2: 4.2, tele: 0.9, tele2: 0.55, radius: 62, radius2: 80, rest: 1.2,
    },
  },

  // Kartenspezifische Gegner-Varianten (nur Karte 2 und 3, Spawn je Karte in CFG.maps[].foes). Eine Variante nutzt Muster, Grafik und Events ihres Basistyps `base`,
  // nur umgefärbt (hue) und mit eigener Größe (size = Faktor), Leben (hits vor Zähigkeit), Tempo (speed = Faktor) und einer Besonderheit:
  // death = beim Tod 'ember' (kleine Explosion) oder 'cloud' (Giftwolke), fan = schießt einen Fächer aus so vielen Geschossen (Abstand fanSpread Grad, every s),
  // drop = hinterlässt bei jedem Angriff eine Giftwolke, trail = lässt alle trail s eine Giftwolke fallen.
  variants: {
    cinder:   { name: 'CINDER',   base: 'circle',   hue: 20,  size: 1,    hits: 2, speed: 1.15, death: 'ember' },
    welder:   { name: 'WELDER',   base: 'triangle', hue: 35,  size: 1.1,  hits: 2, fan: 3, fanSpread: 14, every: 1.8 },
    smelter:  { name: 'SMELTER',  base: 'square',   hue: 10,  size: 1.15, hits: 3, fan: 3, fanSpread: 24, every: 3.6 },
    spore:    { name: 'SPORE',    base: 'circle',   hue: 95,  size: 0.9,  hits: 1, speed: 1.1,  death: 'cloud' },
    blighter: { name: 'BLIGHTER', base: 'rhombus',  hue: 110, size: 1.1,  hits: 3, drop: 'cloud' },
    hazmat:   { name: 'HAZMAT',   base: 'tank',     hue: 100, size: 0.95, hits: 9, trail: 2.2 },
    rime:     { name: 'RIME',      base: 'circle',   hue: 175, size: 0.95, hits: 2, speed: 1.2, death: 'frost', chill: true },
    icicle:   { name: 'ICICLE',    base: 'triangle', hue: 190, size: 1.1,  hits: 2, fan: 3, fanSpread: 12, every: 1.9, chill: true },
    frostbite: { name: 'FROSTBITE', base: 'rhombus', hue: 200, size: 1.1,  hits: 3, chill: true },
  },
  // Karte 4 (Kryo-Station): rime = schneller Kreis, bei dessen Tod ein Frostring entsteht, icicle = Dreieck mit Dreierfaecher, frostbite = Raute, deren Wellen frieren.
  // chill = Treffer (und der Frostring) kuehlen den Spieler: Tempo x CFG.chill.slow fuer CFG.chill.dur Sekunden.
  // Kaelte (Karte 4): Treffer von Frost-Gegnern verlangsamen den Spieler. Eisfelder (CFG.maps[].env.ice): grip = wie schnell die Geschwindigkeit der Eingabe folgt (pro Bild, kleiner = rutschiger), decay = Ausrutschen nach dem Verlassen (pro Bild).
  chill: { slow: 0.6, dur: 2.2 },
  ice: { grip: 0.055, decay: 0.8 },
  // Giftwolke (Spore, Blighter, Hazmat und die Giftbosse): Warnring warn s, dann life s Gefahrenzone (Radius radius), Schaden dmg-fach (die Schutzzeit nach einem Treffer begrenzt die Häufigkeit)
  cloud: { radius: 30, warn: 0.7, life: 4.5, dmg: 0.5, bossLife: 6, maxActive: 14 },

  // ---- Basis-Muster: jeder Gegnertyp bewegt sich nach einem eigenen Muster (Code: js/patterns.js, Patterns.base) ----
  patterns: {
    circle:   { amp: 38, freq: 3 },                                            // Zickzack: Ausschlag in Grad, Tempo des Schlängelns
    triangle: { orbitDist: 110, speed: 0.5, pull: 45 },                        // Umkreisen: Wunschabstand, Tempo, wie stark er Abstand korrigiert (Grad)
    square:   { anchorDist: 150 },                                             // Artillerie: bleibt ab diesem Abstand stehen
    rhombus:  { move: 1.1, stop: 0.7 },                                        // Stop-and-Go: Sekunden laufen / Sekunden stehen
    guard:    { bashMin: 2, bashMax: 3, range: 150, tele: 0.4, go: 0.4, speed: 10 },   // Rammstoß: Pause zwischen Stößen, Reichweite, Vorwarnung, Dauer, Tempo
    // Weitere Typen. bomber: triggerDist = ab hier zündet er, fuse = Sekunden bis zur Explosion, fuseSpeed = Tempofaktor währenddessen.
    // sniper: Abstand/Tempo, min/max = Pause zwischen Schüssen, tele = Zielzeit, lockAt = ab dieser Restzeit zielt er nicht mehr nach, range = Schussweite.
    // miner: min/max = Pause zwischen Minen, arm = Zeit bis scharf, life = Lebensdauer einer Mine, triggerR = Auslöse-Radius, count = Minen bei MINEFIELD.
    // leech: drain = Leben pro Sekunde, shakeStun = Betäubung nach dem Abschütteln (Dash, Blink, Druckwelle, Schild), reattach = Pause bis zum nächsten Haften.
    // necro: channel = Dauer des Wiederbelebens, range = Reichweite zu Leichen, corpseLife = so lange bleibt eine Leiche liegen.
    // teleporter: min/max = Pause zwischen Sprüngen, tele = Vorwarnung (Ring zeigt das Ziel), behind = Abstand hinter dem Spieler.
    bomber:     { triggerDist: 75, fuse: 1.0, fuseSpeed: 0.6 },
    sniper:     { keepDist: 210, fleeDist: 150, speed: 1.8, min: 3.5, max: 5, tele: 1.0, lockAt: 0.35, range: 330, boltSpeed: 16, boltFrames: 40 },
    miner:      { keepDist: 150, fleeDist: 100, speed: 1.8, min: 2.5, max: 3.5, arm: 1.0, life: 14, triggerR: 16, count: 3 },
    leech:      { drain: 2.5, shakeStun: 1.0, reattach: 1.5 },
    necro:      { keepDist: 180, fleeDist: 120, speed: 1.6, min: 4, max: 6, channel: 2.5, range: 230, corpseLife: 12 },
    teleporter: { min: 4.5, max: 6.5, tele: 0.7, behind: 60, minDist: 60 },
    // Unterstützer: radius = Aura, keepDist/fleeDist = Wunschabstand / ab hier flieht er, ampTime/ampRadius = Wirkung von AMPLIFY
    support: {
      radius: 85, keepDist: 170, fleeDist: 120, speed: 2, ampTime: 3, ampRadius: 1.7,
      kinds: {
        haste: { color: STYLE.pal.orange, hue: 0,   mult: 1.35 },              // Verbündete in der Aura laufen schneller
        mend:  { color: STYLE.pal.green,  hue: 100, every: 3 },                // heilt Verbündete um 1 Treffer alle 'every' Sekunden
        curse: { color: STYLE.pal.violet, hue: 250, slow: 0.75 },              // bremst den Spieler in der Aura
      },
    },
  },

  // ---- Gegner-Events ----
  // Globale Events (alle Gegner): der Director löst ab Spielzeit `from` alle min bis max Sekunden eines aus (nicht in Flut/Bosskampf).
  // weight = Gewicht bei der Auswahl, minEnemies = so viele freie Gegner müssen da sein.
  //   scatter:   alle laufen `out` Sekunden nach außen (outSpeed), dann stürmen alle `in` Sekunden von allen Seiten (inSpeed)
  //   formation: Gruppe in Form (shapes: line/wedge/block) marschiert an, bei breakDist Abstand stürmt sie los (chargeTele/Go/Speed)
  //   charge:    alle stehen `tele` Sekunden (Linie zeigt die Richtung), dann Sturm geradeaus für `go` Sekunden
  //   surround:  Ring aus `count` Kreisen mit Lücke (gap Grad) zieht sich von startR auf endR in `time` Sekunden zu
  // Lokale Events (alle Gegner EINES Typs gleichzeitig): ab `from`, alle min bis max Sekunden, wenn mindestens minCount da sind.
  //   tele = Vorwarnzeit. circle RUSH (go = Dauer, speedMul), triangle VOLLEY, square BARRAGE, rhombus CHAIN, guard SWITCH, support AMPLIFY
  events: {
    from: 100, min: 28, max: 45,
    global: {
      scatter:   { weight: 3, minEnemies: 4, out: 1.8, outSpeed: 2.6, in: 2.5, inSpeed: 5 },
      formation: { weight: 3, from: 100, types: ['circle', 'triangle', 'rhombus'], shapes: ['line', 'wedge', 'block'], speed: 2.2, turn: 2, spacing: 22, breakDist: 95, chargeTele: 0.4, chargeGo: 0.9, chargeSpeed: 6 },
      charge:    { weight: 3, minEnemies: 3, tele: 1.0, go: 0.8, speed: 8 },
      surround:  { weight: 2, from: 130, count: 14, startR: 230, endR: 40, time: 5.5, gap: 55, speed: 6 },
    },
    local: {
      circle:   { name: 'RUSH',    from: 40,  min: 16, max: 24, minCount: 3, tele: 0.7, go: 1.5, speedMul: 1.9 },
      triangle: { name: 'VOLLEY',  from: 60,  min: 14, max: 20, minCount: 2, tele: 0.7, act: 'volley' },
      rhombus:  { name: 'CHAIN',   from: 130, min: 14, max: 20, minCount: 2, tele: 0.7, act: 'chain' },
      guard:    { name: 'SWITCH',  from: 150, min: 14, max: 20, minCount: 1, tele: 0.8, act: 'switch' },
      support:  { name: 'AMPLIFY', from: 210, min: 14, max: 20, minCount: 1, tele: 0.8, act: 'amplify' },
      square:   { name: 'BARRAGE', from: 240, min: 14, max: 20, minCount: 2, tele: 0.8, act: 'barrage' },
      bomber:     { name: 'DETONATE',  from: 200, min: 16, max: 22, minCount: 2, tele: 0.5, act: 'ignite' },
      splitter:   { name: 'DIVIDE',    from: 220, min: 16, max: 22, minCount: 1, tele: 0.6, act: 'divide' },
      leech:      { name: 'LEAP',      from: 280, min: 16, max: 22, minCount: 2, tele: 0.6, go: 1.2, speedMul: 1.8 },
      teleporter: { name: 'AMBUSH',    from: 300, min: 16, max: 22, minCount: 2, tele: 0.8, act: 'tp' },
      sniper:     { name: 'CROSSFIRE', from: 340, min: 16, max: 22, minCount: 2, tele: 1.0, act: 'snipe' },
      miner:      { name: 'MINEFIELD', from: 360, min: 16, max: 22, minCount: 1, tele: 0.6, act: 'minefield' },
      tank:       { name: 'STOMP',     from: 420, min: 14, max: 20, minCount: 1, tele: 1.0, act: 'stomp' },
      necro:      { name: 'RAISE',     from: 460, min: 14, max: 20, minCount: 1, tele: 1.5, act: 'raise' },
    },
  },

  // Spawner: zerstörbares Objekt, das Gegner ausspuckt (Belohnung: Heilung + eventuell Miniboss)
  spawner: {
    hpMin: 7, hpMax: 15,
    lifetime: 30,
    hitCooldown: 0.5,
    firstAt: 135,
    respawnMin: 100, respawnMax: 150,
    ultDamage: 15,
    radius: 20,
    // Breach Gate (Rework): erscheint mit Animation (arrive s, in der Zeit unverwundbar), spuckt dann in Schüben Gegner aus:
    // alle pulseEvery s (unter pulseFastBelow Lebensanteil: pulseFast s) kündigt der Kern den Schub telegraph s vorher an,
    // dann kommen burstBase Gegner (+1 je burstEvery Spielsekunden, max burstMax). Bei mehr als enemyCap Gegnern in der Welt fällt der Schub aus.
    arrive: 1.4, pulseEvery: 3.0, pulseFast: 2.2, pulseFastBelow: 0.5, telegraph: 0.7,
    burstBase: 3, burstEvery: 300, burstMax: 5, enemyCap: 45,
    rewardUlt: 5, rewardHeal: 25, timeoutHeal: 10,
    miniChance: 85,           // % für Kreis/Dreieck-Miniboss (sonst Quadrat/Raute)
  },


  // ==========================================================================================
  //  [8] WELT-EVENTS
  // ==========================================================================================

  // Gegnerflut (neu): in jeder Welle zur Mitte (Sekunde `at` der Welle) für `duration` Sekunden.
  // Statt des normalen Takts spawnt alle `every` Sekunden ein Gegner aus einem Spawnpunkt.
  // every sinkt pro Welle um `everyStep` (Untergrenze `everyMin`). weights: Gewichte, Raute ab Welle 2, Quadrat ab Welle 3.
  flood: {
    at: 60, duration: 28,
    every: 0.7, everyStep: 0.08, everyMin: 0.3,
    weights: { circle: 5, triangle: 3, rhombus: 1.5, square: 1, guard: 1, support: 0.8,
               bomber: 1, splitter: 0.6, leech: 0.5, teleporter: 0.5, sniper: 0.4, miner: 0.3, tank: 0.3, necro: 0.2 },    // neue Typen erst ab ihrem extraSpawn.from
    dropChance: 0.08,         // Drop-Chance pro Kill während der Flut (sonst CFG.drops.chance)
  },

  // Blutmond (neu): Welt-Event zwischen Gegnerflut und Boss. In jeder Welle gibt es mit Wahrscheinlichkeit `chance` einen Blutmond
  // (ab Welle `fromWave`, 0 = die erste). Start zufällig nach dem Ende der Flut (+ `afterFlood` s) und so, dass er `beforeBoss` s
  // vor dem Wellenende (= Boss) endet. Gegner sind stärker (schneller, mehr Leben, Spieler bekommt mehr Schaden),
  // es kommen mehr Gegner (spawnFactor kleiner = schneller), dafür fallen mehr Drops und Kills laden das Ultimate besser auf.
  bloodMoon: {
    chance: 0.35, fromWave: 0, duration: 20, afterFlood: 5, beforeBoss: 5,
    speedFactor: 1.25, extraHits: 1, damageFactor: 1.4, spawnFactor: 0.75,
    dropChance: 0.12, ultFactor: 1.5,
  },

  // Hindernisse (neu, dynamische Arena): zerstörbare Barrikaden, die niemandem schaden, aber den Weg versperren (Spieler nur ohne Phase).
  // start/perWave/max: Anzahl zu Beginn, mehr pro Welle, Obergrenze. hpMin/hpMax: Treffer bis zur Zerstörung (Waffen treffen alle `hitCd` s einmal).
  // respawn: Sekunden, bis eine zerstörte Barrikade woanders wieder aufgebaut wird. min*: Mindestabstand beim Aufstellen zu Spieler, anderen Barrikaden, Spawnpunkten. margin: Abstand zum Kartenrand.
  obstacles: {
    start: 3, perWave: 1, max: 7, hpMin: 5, hpMax: 9, radius: 14, hitCd: 0.2, respawn: 22,
    // Beute beim Zerstoeren (Gewichte): nichts / Cores (gutgeschrieben am Laufende) / kleines Heilpowerup / Buff-Drop (nur schwache Buffs). Absichtlich klein gehalten.
    loot: { none: 25, cores: 30, heal: 22, buff: 23, coresMin: 1, coresMax: 3, healAmount: 8, buffs: ['haste', 'rapid', 'charge', 'magnet', 'coolant'] },
    minPlayer: 80, minOther: 55, minSpawn: 45, margin: 40,
    dmg: { bolt: 1, missile: 2, bomb: 3, boom: 1, ember: 1 },     // Schaden durch Gegnerschüsse und Explosionen (Deckung)
  },

  // Meteoritenhagel (neu): Welt-Event vor der Gegnerflut. In jeder Welle gibt es mit Wahrscheinlichkeit `chance` einen Hagel
  // (ab Welle `fromWave`). Start zufällig zwischen Wellensekunde `startMin` und dem Punkt, an dem er `beforeFlood` s vor der Flut endet.
  // Alle `every` Sekunden (pro Welle -`everyStep`, min `everyMin`) schlägt ein Meteorit ein: erst Warnkreis am Boden, nach `fall` s
  // Einschlag mit Radius `radius`. `aimShare` der Meteoriten zielen auf die aktuelle Spielerposition (mit `aimJitter` Streuung), der Rest fällt zufällig.
  // Gegner im Einschlag verlieren `enemyHits` Treffer, auch das ist eine Waffe gegen sie. Aufräumen: Einschlag-Krater bleiben `scorch` s sichtbar.
  meteors: {
    chance: 0.4, fromWave: 0, duration: 14, startMin: 10, beforeFlood: 4,
    every: 0.6, everyStep: 0.05, everyMin: 0.3,
    fall: 1.5, radius: 44, aimShare: 0.4, aimJitter: 40,
    enemyHits: 2, scorch: 4,
  },

  // Evolutionen (neu): Waffe + Partner = stärkere Form. Nach einem Boss-Kill erscheint eine Evolutions-Wahl (vor der Ability-Wahl, ESC überspringt),
  // wenn: die Waffe im Slot `slot` ausgerüstet ist (`weapon`), der Partner da ist (`needs.ability` = eingesetzte Ability, auch passive, oder `needs.implant` = ausgerüstetes Implant)
  // und in diesem Lauf mindestens `minUps` Bosse besiegt wurden. Slotgrenze: pro Waffenslot nur eine Evolution pro Lauf (`Player.evolved[slot]`).
  // Neue Evolution = Eintrag in `list` + Wirkung per `Player.evo('id')` an der Waffe (siehe Vortex: Player.useWeapon, Seeker: Shot.update, Overload: BeamAttack).
  evolutions: {
    minUps: 3,
    list: {
      vortex:   { slot: 'melee',  weapon: 'sword', needs: { ability: 'overclock' }, name: 'VORTEX BLADES',  desc: 'While the blades spin, a shockwave ring bursts out every few seconds and hits everything it passes.' },
      seeker:   { slot: 'ranged', weapon: 'shot',  needs: { ability: 'scanner' },   name: 'SEEKER ROUNDS',  desc: 'Your shots curve towards the nearest enemy.' },
      overload: { slot: 'heavy',  weapon: 'beam',  needs: { ability: 'capacitor' }, name: 'OVERLOAD BEAM',  desc: 'Bigger beam, more damage and it charges faster.' },
      railspear: { slot: 'melee', weapon: 'lance',   needs: { ability: 'thrusters' }, name: 'RAIL SPEAR',     desc: 'Every thrust also fires a piercing bolt in each spear direction.' },
      echowhip:  { slot: 'melee', weapon: 'whip',    needs: { ability: 'barrier' },   name: 'ECHO WHIP',      desc: 'Every lash is followed by a second one right behind it.' },
      eclipse:   { slot: 'melee', weapon: 'katana',  needs: { ability: 'berserk' },   name: 'ECLIPSE BLADE',  desc: 'Two extra slashes to both sides: the blade now covers all four directions.' },
      quake:     { slot: 'melee', weapon: 'hammer',  needs: { implant: 'armor' },     name: 'QUAKE HAMMER',   desc: 'Each slam sends out a shockwave that shoves and stuns everything around you.' },
      doomspread: { slot: 'ranged', weapon: 'shotgun', needs: { implant: 'damage' },  name: 'DOOMSPREAD',     desc: 'Four more pellets and a longer reach.' },
      napalm:    { slot: 'ranged', weapon: 'rocket',  needs: { ability: 'overcharge' }, name: 'NAPALM ROCKETS', desc: 'Explosions leave a ring of fire on the ground.' },
      twindisc:  { slot: 'ranged', weapon: 'boomerang', needs: { ability: 'surge' }, name: 'TWIN DISCS',     desc: 'Throw two discs at once, spread apart.' },
      inferno:   { slot: 'ranged', weapon: 'molotov', needs: { ability: 'adrenaline' }, name: 'INFERNO FLASK', desc: 'Four more fire patches in a wider circle.' },
      storm:     { slot: 'heavy',  weapon: 'chain',   needs: { ability: 'capacitor' }, name: 'STORM CHAIN',    desc: 'The lightning jumps four more times and further.' },
      horizon:   { slot: 'heavy',  weapon: 'blackhole', needs: { ability: 'field' },  name: 'EVENT HORIZON',  desc: 'Bigger pull and a bigger, harder final blast.' },
      prism:     { slot: 'ranged', weapon: 'bounce',  needs: { ability: 'shockstep' }, name: 'PRISM ROUNDS',   desc: 'Shots fly much further and two extra bouncing shots fan out to the sides.' },
      cryowave:  { slot: 'ranged', weapon: 'impulse', needs: { ability: 'frost' },     name: 'CRYO WAVE',      desc: 'A wider wave that also freezes every enemy it hits for a moment.' },
      wildfire:  { slot: 'heavy',  weapon: 'firetrail', needs: { implant: 'thorns' },  name: 'WILDFIRE',       desc: 'Bigger flames that burn longer, and the fuel lasts longer.' },
    },
    prism: { frames: 1.8, angle: 30 },                               // Reichweite x, Winkel der zwei Zusatzschüsse
    cryowave: { width: 1.4, stun: 1.2 },                             // Wellenbreite x, Betäubung (s)
    wildfire: { radius: 1.5, life: 1.5, fuel: 1.5 },                 // Feuerfleck-Radius x, Brenndauer x, Brennstoff-Dauer x
    vortex: { every: 2.5, radius: 80, speed: 190, width: 5 },        // Ring: Abstand der Wellen (s), Reichweite, Tempo (Einheiten/s), halbe Dicke der Trefferzone
    seeker: { turn: 4, range: 200 },                                 // Lenkung in Grad pro Bild, Suchreichweite
    overload: { size: 1.35, power: 1.4, load: 1.4 },                 // Beam-Größe, Schaden (Ladezeit-Wert), Lade-Tempo
    railspear: { frames: 22 },                                       // Reichweite der Begleit-Bolzen (Bilder)
    echowhip: { delay: 0.14 },                                       // Abstand des zweiten Hiebs (s)
    eclipse: { delay: 0.12 },                                        // Abstand der Seitenhiebe zum Rückhieb (s)
    doomspread: { pellets: 4, frames: 1.3 },                         // zusätzliche Schrote, Reichweite x
    napalm: { patches: 4, radius: 30 },                              // Feuerflecken pro Explosion, Abstand zur Mitte
    twindisc: { angle: 25 },                                         // Winkel der beiden Scheiben zur Zielrichtung
    inferno: { patches: 4, spread: 1.4 },                            // zusätzliche Feuerflecken, Spreizung x
    storm: { jumps: 4, range: 1.3 },                                 // zusätzliche Sprünge, Reichweite x
    horizon: { pull: 1.4, radius: 1.4, hits: 1 },                    // Zugradius x, Explosionsradius x, zusätzliche Treffer
  },

  // Schrumpfende Arena (neu): Welt-Event. In jeder Welle gibt es mit Wahrscheinlichkeit `chance` (ab Welle `fromWave`) einen Kollaps.
  // Start zufällig zwischen Wellensekunde `startMin` und `beforeBoss` s vor dem Boss. Erst `warn` s Warnung (roter Rand pulsiert),
  // dann schrumpft die Karte mit `speed` (Faktor pro Sekunde) auf `minScale` und bleibt dort, bis `duration` um ist; danach wächst sie wieder.
  // Der Spieler, Gegner und Barrikaden werden nach innen geschoben bzw. zerstört. Nicht im Bosskampf (der Arena-Boss hat seine eigene Schrumpfung) und nicht im Endlos-Modus (keine Wände).
  collapse: {
    chance: 0.3, fromWave: 1, duration: 26, startMin: 8, beforeBoss: 10,
    warn: 3, minScale: 0.55, speed: 0.08,
  },

  // Safe Spot (js/safespot.js): erscheint zu Beginn jedes Welt-Events (Swarm Surge, Crimson Eclipse, Meteoritenhagel, nicht die schrumpfende Arena).
  // Im Spot: unverwundbar, kein Angriff, alle Gegner bremsen und weichen langsam zurück. Das Zeitbudget läuft nur ab, solange man im Spot steht.
  safeSpot: {
    radius: 34, budget: 5,          // Radius in Einheiten, Gesamtzeit im Spot pro Event (Sekunden)
    minDist: 70, maxDist: 150,      // Abstand zum Spieler beim Erscheinen
    enemySlow: 0.1,                 // Gegner laufen mit diesem Anteil ihres Tempos weiter (0 = stehen)
    retreat: 1.1,                   // Rückzug aller Gegner vom Spot (Einheiten pro Bild)
    warnAt: 1.5,                    // Restzeit, ab der der Spot blinkt
    hintTime: 1.0,                  // so lange bleibt der Hinweis "no attacks" nach einem Angriffsversuch
  },


  // ==========================================================================================
  //  [9] DROPS
  // ==========================================================================================

  // Heal-Powerup: erscheint zufällig auf der Karte (Original-Zeitplan)
  powerup: {
    life: 5, radius: 9,
    firstAt: 60,
    earlyUntil: 630, earlyEveryMin: 110, earlyEveryMax: 130, earlyHeal: 15,
    lateEveryMin: 55, lateEveryMax: 65, lateHeal: 20,
  },

  // Buff-Drops (neu): besiegte Gegner lassen sie mit einer Chance fallen. Sie liegen `life` Sekunden herum.
  // haste: Lauftempo mal mult. rapid: Angriffstempo (Schwert dreht schneller, Schuss feuert schneller), Zeiten mal mult (kleiner = schneller).
  // guard: unverwundbar. charge: sofort Ultimate-Ladung (in Prozentpunkten, vor chargeFactor).
  // Weitere Buffs: power = Chance auf doppelten Treffer (+ Mehrschaden gegen Bosse), magnet = Aufsammelreichweite +range (Faktor) und Sog (pull pro Bild bis pullRange),
  // regen = hps Leben pro Sekunde, vampire = heal zusaetzliche Heilung pro Kill, chrono = Gegner laufen mit slow x Tempo, coolant = Abklingzeiten laufen rate x schneller,
  // nova = sofort: Gegner im Radius bleiben stehen (stun s). w = Gewicht beim zufaelligen Drop (seltener = kleiner). Instant-Buffs (charge, nova) haben keine Dauer und stehen nicht im HUD.
  // icon = Sprite (tools/gen_art.js).
  drops: {
    life: 8, radius: 9,
    chance: 0.04,             // normale Gegner
    miniChance: 0.6,          // Minibosse
    types: {
      haste:   { label: 'Speed',      icon: 'buffHaste',   color: STYLE.pal.cyan,     dur: 10, mult: 1.5, w: 20 },
      rapid:   { label: 'Rapid Fire', icon: 'buffRapid',   color: STYLE.pal.orange,   dur: 10, mult: 0.5, w: 20 },
      guard:   { label: 'Guard',      icon: 'buffGuard',   color: STYLE.pal.yellow,   dur: 4,  w: 6 },
      charge:  { label: 'Charge',     icon: 'buffCharge',  color: STYLE.pal.green,    amount: 13, w: 14 },
      power:   { label: 'Overpower',  icon: 'buffPower',   color: STYLE.pal.red,      dur: 12, chance: 0.5, boss: 0.4, w: 12 },
      magnet:  { label: 'Magnet',     icon: 'buffMagnet',  color: STYLE.pal.purple,   dur: 30, range: 3, pull: 4, pullRange: 190, w: 12 },
      regen:   { label: 'Repair',     icon: 'buffRegen',   color: STYLE.pal.teal,     dur: 8,  hps: 6, w: 12 },
      vampire: { label: 'Leech',      icon: 'buffVampire', color: STYLE.pal.redMid,   dur: 12, heal: 3, w: 8 },
      chrono:  { label: 'Chrono',     icon: 'buffChrono',  color: STYLE.pal.ice,      dur: 8,  slow: 0.45, w: 7 },
      coolant: { label: 'Coolant',    icon: 'buffCoolant', color: STYLE.pal.cyanMid,  dur: 10, rate: 3, w: 10 },
      nova:    { label: 'Nova',       icon: 'buffNova',    color: STYLE.pal.white,    radius: 150, stun: 2, duration: 0.35, w: 6 },
    },
  },


  // ==========================================================================================
  //  [10] BOSSE
  // ==========================================================================================
  // ==========================================================================================
  //  [9b] XP IM LAUF (js/xp.js)
  // ==========================================================================================
  // Besiegte Gegner lassen XP-Kugeln fallen (fliegen zum Spieler, wenn er nah genug ist, ältere kommen von selbst). Genug XP = Level-up: das Spiel pausiert und man
  // wählt 1 von 3 Perks (gelten nur für diesen Lauf, stapelbar bis max). Nach einem Boss wird ein aufgeschobenes Level-up angeboten. Im Tutorial gibt es keine XP.
  // need = base + step x aktuelles Level. value = XP pro Gegner (nach Typ, sonst normal; HEAVY-Typen heavy, Tank tank, Minibosse mini, Splitter-Kleine splitlet, Minions/Wiederbelebte 0), boss = XP pro besiegtem Boss.
  // orb: range = Sog-Radius (mal Aufsammelreichweite), speed/accel/maxSpeed = Flugtempo pro Bild, life = nach so vielen Sekunden fliegt die Kugel von selbst zum Spieler, cap = höchstens so viele Kugeln (Rest verschmilzt).
  // perks: je Perk name/desc/icon, max = Stapel, die Wirkung steht je Stapel in den Feldern (siehe Xp.val und die Haken in player.js/enemies.js/game.js).
  xp: {
    base: 12, step: 5, offerDelay: 0.35,
    value: { normal: 1, heavy: 2, tank: 4, elite: 6, mini: 8, splitlet: 0.25, boss: 25 },
    orb: { range: 70, delay: 0.25, speed: 4, accel: 0.5, maxSpeed: 13, life: 25, cap: 140, grab: 4 },
    perks: {
      power:    { name: 'POWER SURGE',      desc: 'Hits sometimes land twice and bosses take more damage.', icon: 'damageIcon',  iconW: 20, max: 5, chance: 0.06, boss: 0.08 },
      rapid:    { name: 'QUICK HANDS',      desc: 'All weapons attack faster.',                              icon: 'buffRapid',   iconW: 20, max: 5, per: 0.06 },
      speed:    { name: 'SWIFT',            desc: 'You move faster.',                                        icon: 'buffHaste',   iconW: 20, max: 5, per: 0.04 },
      health:   { name: 'VITALITY',         desc: 'More maximum health, healed right away.',                 icon: 'phoenixIcon', iconW: 20, max: 5, hp: 12 },
      regen:    { name: 'NANITES',          desc: 'You slowly regenerate health.',                           icon: 'regenIcon',   iconW: 20, max: 4, per: 0.25 },
      armor:    { name: 'PLATING',          desc: 'You take less damage.',                                   icon: 'armorIcon',   iconW: 20, max: 5, per: 0.04 },
      magnet:   { name: 'ATTRACTOR',        desc: 'Pick up XP, healing and drops from further away.',        icon: 'buffMagnet',  iconW: 20, max: 4, per: 0.25 },
      charge:   { name: 'CAPACITOR',        desc: 'Kills charge your ultimate faster.',                      icon: 'buffCharge',  iconW: 20, max: 4, per: 0.08 },
      cooldown: { name: 'HEAT SINKS',       desc: 'Abilities and heavy weapons recharge faster.',            icon: 'buffCoolant', iconW: 20, max: 4, per: 0.08 },
      luck:     { name: 'FORTUNE',          desc: 'Enemies drop buffs more often.',                          icon: 'luckyIcon',   iconW: 20, max: 4, per: 0.1 },
      leech:    { name: 'LIFESTEAL',        desc: 'Every kill heals a little extra.',                        icon: 'vampireIcon', iconW: 20, max: 4, per: 0.12 },
      recovery: { name: 'REFLEXES',         desc: 'Longer invulnerability after a hit.',                     icon: 'buffGuard',   iconW: 20, max: 4, per: 0.03 },
      tune:     { name: 'WEAPON TUNING',    desc: 'All weapons get one boss upgrade right now.',             icon: 'sword',       iconW: 18, max: 3 },
    },
  },

  boss: {
    steps: 120,
    // Stärke aller Bosse (nicht im Tutorial): hp = Leben mal, fire = Abstände zwischen Schüssen/Ringen/Beschwörungen mal (kleiner = häufiger),
    // speed = Lauftempo mal, dmg = Schaden am Spieler (Berührung, Bolzen, Laser, Schockwelle) mal.
    power: { hp: 1, fire: 1, speed: 1, dmg: 1 },                 // neutral; pro Karte in CFG.maps[].diff.boss (Karte 2: 1.6/0.8/1.1/1.25)
    octagon: { speed: 3.25, windup: 1.67, shootEvery: 1, radius: 22, hpBase: 34, hpPerStage: 5, hitStun: 0.5 },
    kite: { speed: 3.75, mortarEvery: 1.5, radius: 20, hpBase: 24, hpPerStage: 4.5, hitStun: 0.1 },
    // Beschwörer (neu): hält Abstand (keepDist), beschwört alle
    // summonEvery Sekunden summonCount Minions (höchstens maxMinions gleichzeitig, triangleChance = Anteil Dreiecke), unter rageBelow (Lebensanteil) schneller/mehr.
    summoner: { speed: 1.4, radius: 22, hpBase: 38, hpPerStage: 5, hitStun: 0.15, keepDist: 130,
                summonFirst: 2, summonEvery: 2, summonCount: 6, maxMinions: 30, triangleChance: 0.25, rageBelow: 0.5, rageEvery: 3, rageCount: 6,
                // Phase 2: Blasterschild (fängt alle Blaster-Schüsse im Radius ab, Nahkampf/Beam/Granate/Ultimate gehen durch)
                shieldRadius: 46,
                // Nekromant-Miniboss des Kampfes: hitsMul = Leben-Faktor, min/max/channel überschreiben CFG.patterns.necro (schnelleres Wiederbeleben)
                necro: { hitsMul: 4, min: 1.2, max: 3, channel: 0.8, range: 320 } },
    // Zu Kampfbeginn erscheint zusätzlich ein Nekromanten-Miniboss als Minion (einmal pro Kampf, er belebt gefallene Minions wieder).
    // Laser-Turm (neu): steht in der Mitte. Ruhe (verwundbar, schießt) -> tele Sekunden Vorwarnung -> fire Sekunden dreht sich der Laser (spin Grad/s,
    // len = Länge, width = halbe Breite). Anzahl Laser steigt alle 2 Zyklen bis maxLasers.
    turret: { speed: 0, radius: 24, hpBase: 42, hpPerStage: 5.5, hitStun: 0.1, restFirst: 2, rest: 3.5, tele: 1.3, fire: 4.5, spin: 60, len: 420, width: 7, boltEvery: 1, maxLasers: 4,
              // Einschlaege auf die Spielerposition: alle strikeEvery s, Vorwarnung strikeDelay s (Ring = Explosionsradius strikeRadius),
              // ab 1 Einschlag, pro strikeStep Laserrunden einer mehr (max maxStrikes, die weiteren landen strikeSpread neben dem Spieler)
              strikeFirst: 1.5, strikeEvery: 1.8, strikeDelay: 1.1, strikeRadius: 46, strikeStep: 2, maxStrikes: 3, strikeSpread: 70 },
    // Zwillinge (neu): zwei Körper (Oktagon-Körper schießt Bolzen, Kite-Körper wirft Mörser), heilen sich gegenseitig healRate Leben/s,
    // fällt einer, wird der andere schneller (enrageMul) und heilt nicht mehr. partnerSpeed = Tempo des Kite-Körpers.
    twin: { speed: 2.4, partnerSpeed: 3, radius: 20, hpBase: 24, hpPerStage: 3.2, hitStun: 0.2, shootEvery: 1.4, mortarEvery: 2.2, healRate: 1, enrageMul: 1.5 },
    // Arena-Boss (neu): jagt den Spieler und schießt Bolzen. Nach shrinkFirst, dann alle shrinkEvery Sekunden schrumpft die Karte um shrinkStep
    // (bis minScale, Faktor der Kartengröße), shrinkSpeed = Faktor pro Sekunde.
    arena: { speed: 2.4, radius: 22, hpBase: 38, hpPerStage: 5, hitStun: 0.4, shootEvery: 1.2, shrinkFirst: 8, shrinkEvery: 14, shrinkStep: 0.18, minScale: 0.45, shrinkSpeed: 0.06 },
    // Finaler Boss "Death" (neu): jagt den Spieler, schießt Bolzen, feuert alle ringEvery s einen Ring aus ringCount Bolzen, ruft Minions (wie der Beschwörer)
    // und lässt die Karte schrumpfen (wie der Arena-Boss). Kein Zeitlimit, kein Upgrade danach: Sieg = Ending. drawSize = Größe des Bildes in %.
    reaper: { speed: 2.7, radius: 26, hpBase: 170, hpPerStage: 0, hitStun: 0.05, shootEvery: 1.1, drawSize: 420,
              ringFirst: 4, ringEvery: 5.5, ringCount: 12, summonFirst: 6, summonEvery: 11, summonCount: 3, maxMinions: 6, triangleChance: 0.3, rageBelow: 0.4, rageEvery: 8, rageCount: 4,
              shrinkFirst: 20, shrinkEvery: 18, shrinkStep: 0.12, minScale: 0.6, shrinkSpeed: 0.05 },
    // Reihenfolge der Bosskämpfe: jeder Boss kommt pro Lauf genau einmal (Standardmodus), danach erscheint direkt der finale Boss (CFG.finalBoss.at).
    // Wann ein Kampf startet: alle `steps` Sekunden (120, 240, ..., 720). Nur der Endlos-Modus läuft die Liste immer wieder von vorn durch (order[n % Länge]).
    // Wird die Liste länger oder kürzer, CFG.finalBoss.at auf steps x (Anzahl Bosse + 1) anpassen.
    order: ['octagon', 'kite', 'summoner', 'turret', 'twin', 'arena'],
    // Kartenspezifische Bosse (nur Ember Foundry und Toxic Core, die Liste steht je Karte in CFG.maps als bossOrder). sprite/hue/drawSize = Aussehen (vorhandene Sprites umgefärbt).
    // Forge Warden: langsam, Bolzen + "Schlackenregen" (rainCount rote Einschlagkreise um den Spieler alle rainEvery s, wie die Einschläge des Laser-Turms).
    forge: { name: 'FORGE WARDEN', sprite: 'octagon', hue: 15, drawSize: 360, speed: 2.1, radius: 26, hpBase: 44, hpPerStage: 6, hitStun: 0.3, shootEvery: 1.4,
             rainFirst: 3, rainEvery: 5, rainCount: 3, rainSpread: 70 },
    // Slag Colossus: läuft, bleibt nach chargeEvery s mit Warnlinie stehen (tele), rast dann dashTime s mit dashSpeed (pro Bild) los und schlägt am Ende ein (Blast).
    colossus: { name: 'SLAG COLOSSUS', sprite: 'octagon', hue: -40, drawSize: 330, speed: 2.9, radius: 24, hpBase: 40, hpPerStage: 5.5, hitStun: 0.3, shootEvery: 2.2,
                chargeFirst: 4, chargeEvery: 5, tele: 0.9, dashTime: 0.55, dashSpeed: 11 },
    // Spore Mother: hält Abstand (wie der Beschwörer), schießt langsam, setzt alle cloudEvery s cloudCount Giftwolken um den Spieler und ruft alle spawnEvery s Sporen (Minions).
    spore: { name: 'SPORE MOTHER', sprite: 'summoner', hue: 100, drawSize: 320, speed: 1.6, radius: 22, hpBase: 42, hpPerStage: 5.5, hitStun: 0.2, shootEvery: 2.4, keepDist: 140,
             cloudFirst: 3, cloudEvery: 4.5, cloudCount: 3, cloudSpread: 75, spawnFirst: 5, spawnEvery: 9, spawnCount: 2, maxMinions: 6 },
    // Plague Drone: schnell, feuert 3er-Fächer (fanSpread Grad) und zieht Giftwolken hinter sich her (alle trailEvery s).
    plague: { name: 'PLAGUE DRONE', sprite: 'kite', hue: 100, drawSize: 290, speed: 3.6, radius: 19, hpBase: 30, hpPerStage: 4.5, hitStun: 0.1, shootEvery: 1.7, fanSpread: 24, trailEvery: 1.6 },
    // Kartenspezifische Bosse der Cryo Station (chill = alle Bolzen und die Berührung kühlen den Spieler, CFG.chill).
    // Frost Sentinel: kommt langsam näher, steht beim Spiralfeuer still (spiralTime s lang alle spiralRate s spiralArms Bolzen, Drehung spiralTurn Grad pro Salve) und
    // lädt alle novaEvery s einen Frostring (novaTele s Vorwarnung, dann novaCount Bolzen rundherum).
    frost: { name: 'FROST SENTINEL', sprite: 'octagon', hue: 185, drawSize: 350, speed: 1.9, radius: 25, hpBase: 42, hpPerStage: 5.5, hitStun: 0.25, shootEvery: 2.0, chill: true,
             spiralFirst: 4, spiralEvery: 8, spiralTime: 2.4, spiralRate: 0.16, spiralArms: 3, spiralTurn: 24, novaFirst: 7, novaEvery: 9, novaTele: 1.0, novaCount: 14 },
    // Frost Wraith: schnell, feuert gekühlte 3er-Fächer und springt alle blinkEvery s zu einer Stelle nahe dem Spieler (blinkTele s Vorwarnring, Abstand blinkDist min/max),
    // dort bricht beim Auftauchen ein Ring aus arrivalCount Bolzen los.
    wraith: { name: 'FROST WRAITH', sprite: 'kite', hue: 190, drawSize: 290, speed: 2.7, radius: 19, hpBase: 34, hpPerStage: 4.8, hitStun: 0.15, shootEvery: 1.7, fanSpread: 20, chill: true,
              blinkFirst: 4, blinkEvery: 6.5, blinkTele: 0.9, blinkDist: [70, 120], arrivalCount: 10 },
    // Konter aller Bosse (siehe Boss.updateCounters). Leben pro Boss oben: hpBase + hpPerStage x Stufe.
    // stunResist: so lange nach einer Betaeubung wirkt keine neue (Boss laeuft trotz Treffern weiter). Treffer machen weiter Schaden.
    // Schockwelle: nearTime Sekunden in nearDist -> Ring (Radius shockRadius), nach shockDelay s Schaden. Sog: farTime s weiter als farDist weg ->
    // nach pullDelay s zieht der Boss den Spieler pullTime s lang mit pullSpeed (pro Bild) heran. cd = Pause zwischen Konter, firstCd = Start-Pause.
    // Phase 2 unter phase2At (Lebensanteil): Tempo x phase2Speed, Schussabstand x phase2Fire, Konter-Pause x phase2Rate.
    counter: { stunResist: 1.2, nearDist: 80, nearTime: 1.5, shockRadius: 100, shockDelay: 0.9,
               farDist: 200, farTime: 2.2, pullDelay: 0.8, pullTime: 0.55, pullSpeed: 7,
               cd: 6, firstCd: 5, phase2At: 0.5, phase2Speed: 1.2, phase2Fire: 0.8, phase2Rate: 0.7 },
    bolt: { speed: 5.5, frames: 35, turn: 5, radius: 5 },
    mortar: { speed: 5.5, radius: 8 },
    anim: 3.5,                // Länge der Spawn-Animation
    timeout: 90,              // so lange muss man überleben, wenn man den Boss nicht besiegt
    ultDamage: 10,            // Schaden des Ultimates (und Bloodbursts) an einem Boss, einmal pro Einsatz (Boss-Leben vor Kartenfaktor: Oktagon ca. 22)
    killHeal: 50, killUlt: 10,
  },


  // ==========================================================================================
  //  [11] WELT: Karte, Kamera, Spawnpunkte
  // ==========================================================================================

  // Karte und Kamera (neu). Die Karte ist größer als der Bildschirm (480 x 360). Die Kamera bleibt stehen, solange der Spieler
  // im kleinen Mittelraum (deadW/deadH = halbe Breite/Höhe) ist, sonst läuft sie ihm nach. follow = wie schnell sie aufholt.
  // infinite = true: keine Kartenränder (Hintergrund wiederholt sich einfach), vielleicht später als eigener Spielmodus. false: Rand bei halfW/halfH (Mittelpunkt 0,0).
  map: { infinite: false, halfW: 482, halfH: 361 },     // 964 x 722 (vorher 680 x 510, Faktor 1.42 wie beim ersten Vergroessern gegenueber dem Bild 480 x 360)
  camera: { deadW: 70, deadH: 50, follow: 10 },

  // Effekte (js/juice.js): dezent halten! maxShake = staerkstes Wackeln, shakeDecay = wie schnell es abklingt, maxFlash = hoechste Deckkraft normaler
  // Bildschirmblitze, flashGap = Mindestpause zwischen zwei Blitzen (Sekunden, gegen Flackern), dashZoom = Zoom beim Dash (kleiner = weiter raus).
  // Im Spiel unter Settings > Effects: FULL / REDUCED (halb, ohne Blitze und Wackeln) / OFF.
  juice: { maxShake: 6, shakeDecay: 7, maxFlash: 0.28, flashGap: 0.35, maxParticles: 120, dashZoom: 0.93 },

  // Spawnpunkte der Gegner: feste Punkte in der Welt, genau am Rand des Bildausschnitts, den man beim Spielstart sieht
  // (Kamera bei 0,0, Bild +-240 x +-180). Sie bewegen sich nicht mit der Kamera.
  spawnPoints: [[240, 0], [170, 127], [0, 180], [-170, 127], [-240, 0], [-170, -127], [0, -180], [170, -127]],   // Ellipse (x 240, y 180), alle 45°


  // ==========================================================================================
  //  [12] SPIELENDE
  // ==========================================================================================
  // Finaler Boss: Ab Spielzeit `at` erscheint der Tod selbst (Boss 'reaper', Werte unter boss.reaper). Das Spiel endet NICHT nach einer festen Zeit,
  // sondern erst, wenn man ihn besiegt (dann läuft die Ending-Sequenz, siehe G.win). Die Zeit steht pro Lauf in G.finalAt: der geplante Endlos-Modus
  // soll sie vor dem Spielbeginn wählbar machen (oder null = kein finaler Boss).
  // Standardmodus: 6 Bosse (alle 120 s: 120 ... 720), der finale Boss folgt direkt danach bei steps x (6 + 1) = 840 s (14:00) Spielzeit. Die Uhr steht in Bosskämpfen,
  // ein Lauf dauert real also etwas länger (Bosskämpfe + Endkampf, ca. 15-16 Minuten auf der Spieluhr inkl. Endboss).
  finalBoss: { at: 840 },
  // Endlos-Modus (Hauptmenü > INFINITE MODE): unendliche Karte ohne Wände (CFG.map.infinite wird pro Lauf gesetzt), Spawnpunkte und Barrikaden folgen dem Spieler.
  // Vor dem Start wählbar: wann der finale Boss kommt (finalMinutes, null = nie, endlos). Cores nur zu coreFactor, die Bestzeit wird getrennt geführt (Save.data.bestInf).
  // Karten (Auswahl nach PLAY): Boden (Bild in img_new), Rahmenfarbe, Größe (halbe Breite/Höhe), Schwierigkeit (diff) und Freischaltung.
  // diff: hits = Gegner-Leben mal Faktor, rate = Spawn-Takt der Grundgegner mal (kleiner = mehr), allRate/capMul = Wartezeit/Obergrenze aller übrigen Gegner, boss = Bossstärke (hp/fire/speed/dmg, siehe CFG.boss.power). Karte 1 = alles 1 (Originalwerte, die "Härter-Runde" gilt nur ab Karte 2), speed = Gegnertempo, spawn = Spawn-Abstände (kleiner = mehr Gegner), damage = Schaden am Spieler, bossHp = Boss-Leben, cores = Belohnung.
  // Freischalten: unlockFrac x finaler-Boss-Zeit (CFG.finalBoss.at) auf der VORHERIGEN Karte erreichen (Bestzeit je Karte, nur normaler Modus), also die halbe Strecke.
  maps: [
    { id: 'void', fx: { kind: 'void' }, name: 'NEON VOID', desc: 'The classic arena.', ground: 'ground', frame: STYLE.pal.cyan, half: [520, 390], diff: { speed: 1, spawn: 1, damage: 1, bossHp: 1, cores: 1, hits: 1, rate: 1, allRate: 1, capMul: 1, boss: { hp: 1, fire: 1, speed: 1, dmg: 1 } }, level: 1 },
    { id: 'foundry', name: 'EMBER FOUNDRY', desc: 'Hotter, faster, meaner.', ground: 'ground2', frame: STYLE.pal.orange, half: [520, 390], diff: { speed: 1.08, spawn: 0.9, damage: 1.5, bossHp: 1.15, cores: 1.25, hits: 1.5, rate: 0.8125, allRate: 0.7, capMul: 1.4, boss: { hp: 1.6, fire: 0.8, speed: 1.1, dmg: 1.25 } }, level: 2, unlockFrac: 0.5,
      // Kartenspezifisch (nur Karte 2 und 3): bossOrder ersetzt CFG.boss.order (gleiche Länge, zwei Kämpfe sind durch Karten-Bosse ersetzt, die Dauer bleibt),
      // foes = zusätzliche Gegner-Varianten (CFG.variants), trim = Wartezeiten der normalen Gegner mal Faktor (größer = weniger davon, Schlüssel: c/t/r/s = Kreis/Dreieck/Raute/Quadrat, sonst Typname aus extraSpawn)
      bossOrder: ['octagon', 'forge', 'summoner', 'colossus', 'twin', 'arena'],       // Forge Warden ersetzt Kite, Slag Colossus ersetzt Laser-Turm
      // Umgebungsmechanik (js/mapenv.js, nur auf dieser Karte, im Bosskampf ruht sie): hazards = Anzeige in der Kartenauswahl.
      // vents (Lava-Schlote): idle = Sekunden Ruhe (min/max, pro Welle waveFaster kürzer, höchstens bis minIdleFactor), warn = Vorwarnung, erupt = Ausbruch,
      //   radius, dmg = Schadensfaktor am Spieler (ein Treffer pro Ausbruch), enemyHits = Treffer für Gegner im Radius, minGap = Mindestabstand zueinander.
      // belts (Schlackenbänder): len x width, push = Schub in Einheiten pro Bild (Spieler und Gegner), flip = Sekunden bis zur Richtungsumkehr (min/max), flipWarn = Stillstand davor.
      hazards: ['LAVA VENTS', 'SLAG BELTS'],
      env: {
        vents: { count: 5, radius: 32, idle: [5, 9], warn: 1.4, erupt: 1.0, dmg: 1.3, enemyHits: 2, minGap: 90, waveFaster: 0.08, minIdleFactor: 0.5 },
        belts: { count: 2, len: 150, width: 28, push: 1.7, flip: [10, 16], flipWarn: 1.0, minGap: 70 },
      },
      foes: [{ v: 'cinder', from: 60, min: 11, max: 15, maxAlive: 8 }, { v: 'welder', from: 150, min: 20, max: 28, maxAlive: 3 }, { v: 'smelter', from: 240, min: 28, max: 38, maxAlive: 2 }],
      trim: { c: 1.35, t: 1.25, bomber: 1.6, sniper: 1.4 },
      fx: { kind: 'foundry' } },
    { id: 'toxic', name: 'TOXIC CORE', desc: 'Tight arena, no mistakes.', ground: 'ground3', frame: STYLE.pal.green, half: [440, 330], diff: { speed: 1.15, spawn: 0.8, damage: 2, bossHp: 1.3, cores: 1.6, hits: 2, rate: 0.69, allRate: 0.55, capMul: 1.8, boss: { hp: 2, fire: 0.68, speed: 1.15, dmg: 1.45 } }, level: 3, unlockFrac: 0.5,
      bossOrder: ['octagon', 'plague', 'spore', 'turret', 'twin', 'arena'],           // Plague Drone ersetzt Kite, Spore Mother ersetzt den Beschwörer
      // Umgebungsmechanik (js/mapenv.js): pools (Säurepfützen): radius = Bereich (min/max), slow = Tempofaktor für den Spieler, enemySlow = für Gegner, dps = Leben pro Sekunde
      // für den Spieler (nicht mit Schildblase/Unverwundbarkeit), burp = Sekunden bis eine Pfütze eine Giftwolke ausstößt (min/max, Vorwarnung burpWarn, Wolke siehe CFG.cloud).
      hazards: ['ACID POOLS', 'TOXIC BURSTS'],
      env: {
        pools: { count: 4, radius: [26, 38], slow: 0.7, enemySlow: 0.75, dps: 0.6, burp: [9, 15], burpWarn: 1.2, minGap: 70 },
      },
      foes: [{ v: 'spore', from: 60, min: 11, max: 15, maxAlive: 8 }, { v: 'blighter', from: 170, min: 22, max: 30, maxAlive: 2 }, { v: 'hazmat', from: 300, min: 45, max: 60, maxAlive: 1 }],
      trim: { c: 1.35, s: 1.3, splitter: 1.5, leech: 1.4, tank: 1.5 },
      fx: { kind: 'toxic' } },
    { id: 'cryo', name: 'CRYO STATION', desc: 'Ice, blizzards, no grip.', ground: 'ground4', frame: STYLE.pal.ice, half: [440, 330], diff: { speed: 1.2, spawn: 0.72, damage: 2.75, bossHp: 1.45, cores: 2, hits: 2.5, rate: 0.6, allRate: 0.5, capMul: 2.1, boss: { hp: 2.4, fire: 0.6, speed: 1.2, dmg: 1.65 } }, level: 4, unlockFrac: 0.5,
      // Kryo-Station: Eisfelder (ice: Spieler rutscht, Tempo folgt der Eingabe nur langsam), Blizzard (blizzard: first = erster Sturm nach s, every = Pause (min/max), warn = Vorwarnung mit Richtungspfeil,
      // dur = Dauer, push = Schub in Einheiten pro Bild auf Spieler UND Gegner) und Kaelte (Treffer der Frost-Gegner bremsen den Spieler). Im Bosskampf ruhen Eis und Sturm.
      hazards: ['ICE SHEETS', 'BLIZZARDS', 'CHILL'],
      env: {
        ice: { count: 4, radius: [55, 85], minGap: 60 },
        blizzard: { first: 40, every: [30, 48], warn: 2.2, dur: 5, push: 1.15 },
      },
      bossOrder: ['octagon', 'kite', 'frost', 'wraith', 'twin', 'arena'],            // Frost Sentinel ersetzt den Beschwörer, Frost Wraith den Laser-Turm
      foes: [{ v: 'rime', from: 60, min: 11, max: 15, maxAlive: 8 }, { v: 'icicle', from: 150, min: 20, max: 28, maxAlive: 3 }, { v: 'frostbite', from: 220, min: 30, max: 40, maxAlive: 2 }],
      trim: { c: 1.35, t: 1.25, r: 1.4, sniper: 1.4, teleporter: 1.4 },
      fx: { kind: 'cryo' } },
  ],
  // Endlos-Modus: spawnRate = Faktor auf alle Spawn-Wartezeiten (0.6 = ca. 1.7x so viele Gegner, weil Weglaufen auf der freien Karte sonst zu leicht ist), capMul = Faktor auf die Obergrenzen
  // der Sondertypen. spawnPoints = Punkte relativ zur Kamera, ALLE ausserhalb des Bildes (Bild = +-240 x +-180, beim Rauszoomen etwas mehr), rundherum ein Rechteckring.
  infinite: { finalMinutes: [10, 15, 20, 30, 45, 60, null], defaultSel: 3, coreFactor: 0.5, spawnRate: 0.6, capMul: 1.3,
    spawnPoints: [[300, 0], [300, 130], [300, 240], [150, 255], [0, 255], [-150, 255], [-300, 240], [-300, 130], [-300, 0], [-300, -130], [-300, -240], [-150, -255], [0, -255], [150, -255], [300, -240], [300, -130]] },
  ending: { firstWinCores: 500, winCores: 100, victoryDelay: 2.2 },       // Belohnung zusätzlich zu den Cores der Spielzeit: beim ersten Sieg / bei jedem weiteren; victoryDelay = Sekunden Siegphase nach dem finalen Boss
};

// ---- Helden (Upgrades > HEROES, js/heroes.js) ----
// Vanguard (der bisherige Spieler) ist von Anfang an da. Die anderen drei braucht man den Meilenstein `milestone` (CFG.milestones, cat 'heroes') UND `cost` Cores.
// mod = Run-Modifier, gilt in jedem Lauf ausser im Tutorial: hp (+Leben), speed / atk (Angriffstempo) / ult (Ultimate-Ladung aus Kills) / dmgTaken (Schaden an dich) = Faktoren, startUlt (+Anfangsladung).
// artifact = Gegenstand auf eigener Taste (Input 'artifact', Standard F), jedes Artefakt hat Abklingzeit + Zahlen unten (fortress / rift / chrono).
// Die Helden nutzen die Spielerpalette, deshalb wirken alle Skins bei jedem Helden gleich (nur die Form unterscheidet sich).
CFG.heroes = {
  order: ['vanguard', 'bulwark', 'specter', 'archon', 'alchemist', 'harbinger'],
  vanguard: { name: 'VANGUARD', sprite: 'player', cost: 0, modText: 'NO MODIFIER', blurb: 'THE ORIGINAL. NO STRENGTHS, NO WEAKNESSES.', mod: {} },
  bulwark: {
    name: 'BULWARK', sprite: 'heroBulwark', cost: 350, milestone: 'hero_bulwark', modText: '+60 HP  -12% SPEED', blurb: 'ARMORED RING. SLOW, BUT HARD TO KILL.',
    mod: { hp: 60, speed: 0.88 },
    artifact: { id: 'fortress', name: 'FORTRESS SLAM', icon: 'fortressIcon', desc: 'SHOCKWAVE THAT KNOCKS BACK AND STUNS, THEN 60% LESS DAMAGE FOR 3S' },
  },
  specter: {
    name: 'SPECTER', sprite: 'heroSpecter', cost: 600, milestone: 'hero_specter', modText: '+20% SPEED  +12% ATTACK  -35 HP', blurb: 'COMET FRAME. FAST AND DEADLY, BUT FRAGILE.',
    mod: { hp: -35, speed: 1.2, atk: 1.12 },
    artifact: { id: 'rift', name: 'RIFT STEP', icon: 'riftIcon', desc: 'WARP FORWARD THROUGH ENEMIES AND HIT EVERYTHING ON THE WAY' },
  },
  archon: {
    name: 'ARCHON', sprite: 'heroArchon', cost: 1000, milestone: 'hero_archon', modText: '+50% ULT CHARGE  +30 START  +15% DMG TAKEN', blurb: 'SUN CROWN. ULTIMATES CONSTANTLY, PAYS FOR IT.',
    mod: { ult: 1.5, startUlt: 30, dmgTaken: 1.15 },
    artifact: { id: 'chrono', name: 'CHRONO LOCK', icon: 'chronoIcon', desc: 'FREEZES EVERY ENEMY ON SCREEN FOR 2.5S (BOSSES IGNORE IT)' },
  },
  // Alchemist: keine Vorgaben bei den Werten, nur kleine Extras; der Kern ist das Artefakt (Heilung + Betaeubung + Buffs auf einen Tastendruck)
  alchemist: {
    name: 'ALCHEMIST', sprite: 'heroAlchemist', cost: 700, milestone: 'hero_alchemist', modText: '+15 HP  +25% DROP CHANCE', blurb: 'FLASK FRAME. BREWS HIS OWN LUCK AND HIS OWN CURES.',
    mod: { hp: 15, luck: 1.25 },
    artifact: { id: 'catalyst', name: 'CATALYST', icon: 'catalystIcon', desc: 'HEALS 20 HP, STUNS NEARBY ENEMIES AND BREWS SPEED, RAPID FIRE AND REPAIR' },
  },
  // Harbinger: Run-Modifier. Die Welt wird haerter (mehr Gegner, zaeher, schneller, einzelne Typen veraendert), dafuer gibt es einen fetten Bonus.
  // world siehe heroes.js (HERO_WORLD_NEUTRAL). Kein Artefakt, dafuer: x2.5 Cores, x1.6 XP, +50% Drop-Chance, +10% Angriffstempo.
  harbinger: {
    name: 'HARBINGER', sprite: 'heroHarbinger', cost: 1500, milestone: 'hero_harbinger', modText: 'HARDER FOES  X2.5 CORES  X1.6 XP', blurb: 'HORNED FRAME. THE WORLD HUNTS YOU HARDER, THE LOOT IS HUGE.',
    mod: {
      atk: 1.1, dmgTaken: 1.1, cores: 2.5, xp: 1.6, luck: 1.5,
      world: {
        rate: 0.72, allRate: 0.75, cap: 1.3, hits: 1.2, speed: 1.08, bossHp: 1.25,              // ca. 40% mehr Grundgegner, ca. 33% mehr der uebrigen, 30% hoehere Obergrenzen
        types: {
          circle:   { speed: 1.15, wait: 0.85 },                // Kreise: schneller und noch mehr
          triangle: { hits: 1.5 },                            // Dreiecke: zaeher
          rhombus:  { speed: 1.15, wait: 0.8 },
          square:   { hits: 1.3, wait: 0.85 },
          guard:    { wait: 0.7 },                            // Schild-Gegner kommen oefter
          bomber:   { speed: 1.2, wait: 0.75 },
          sniper:   { wait: 0.8 },
          tank:     { hits: 1.3 },
          support:  { wait: 0.7 },
        },
      },
    },
  },
};
CFG.catalyst = { cooldown: 30, heal: 20, radius: 130, stun: 1.2, duration: 0.6, buffs: ['haste', 'rapid', 'regen'] };       // Alchemist: Heilung, Betaeubung im Radius, Buffs (CFG.drops.types)
CFG.fortress = { cooldown: 26, duration: 3, reduce: 0.6 };                                              // Bulwark: Schadensminderung nach dem Schlag (Druckwelle = CFG.pulse)
CFG.rift = { cooldown: 7, distance: 130, width: 14, hits: 2, bossDmg: 2, protect: 0.4 };                // Specter: Sprungweite, Breite der Schneise, Treffer pro Gegner, Schaden an Bossen, Unverwundbarkeit danach
CFG.chrono = { cooldown: 42, radius: 900, stun: 2.5, duration: 0.7 };                                   // Archon: Betaeubung aller Gegner (duration = Dauer der Ring-Animation)

// Death-Screens: [ab Sekunde, Bildname]
// Die Zeiten sind für einen 2000-s-Lauf geschrieben und werden unten auf CFG.finalBoss.at umgerechnet (der "OK I admit"-Screen death7 kommt so bei der halben Strecke,
// danach nur noch Spott bis zum finalen Boss).
// Neuer Screen = Bild in tools/gen_art.js (DEATH_NAMES), Tönung in style.js (deathTints), Text in deathtexts.js (DEATH_LINES) und hier eintragen.
const DEATH_SCREENS = [
  [0, 'death1'], [60, 'death8'], [120, 'death2'], [180, 'death9'], [240, 'death3'], [300, 'death10'], [360, 'death4'], [420, 'death11'],
  [480, 'death5'], [540, 'death12'], [600, 'death6'], [660, 'death13'], [780, 'death14'], [900, 'death15'], [1000, 'death7'],
  [1120, 'death16'], [1250, 'death17'], [1400, 'death18'], [1550, 'death19'], [1800, 'deathSecret2'],
];
for (const s of DEATH_SCREENS) s[0] = Math.round(s[0] * CFG.finalBoss.at / 2000);       // auf die tatsächliche Lauflänge skalieren
const DEATH_SECRET_AT = 666;                                                            // Geheimscreen (Teufelszahl, ein kleiner Joke): genau in Sekunde 666 sterben. Bleibt fest, auch wenn sich die Lauflänge ändert (muss unter CFG.finalBoss.at liegen)

// Cosmetics sortieren (Menue-Reihenfolge): Standard-Item zuerst, dann einfache Umfaerbungen, unten die speziellen Items (mit Effekt, Form oder Verhalten).
// Innerhalb der Gruppen nach Preis. Ein Item kann mit special: true von Hand zu den speziellen gezaehlt werden (z. B. Skin OBSIDIAN).
(function sortCosmetics() {
  const special = (it) => !!(it.special || it.fx || it.shape || it.anim || it.pack || it.theme || it.card || it.pose || it.bg || it.style === 'cycle' || it.style === 'glitch' || (it.style && it.style !== 'pick'));
  for (const id of Object.keys(CFG.cosmetics.items)) {
    const list = CFG.cosmetics.items[id], first = list[0];
    const rest = list.slice(1).map((it, i) => ({ it, i, sp: special(it) ? 1 : 0 }));
    rest.sort((a, b) => a.sp - b.sp || a.it.cost - b.it.cost || a.i - b.i);
    CFG.cosmetics.items[id] = [first].concat(rest.map((r) => r.it));
  }
})();

// Waffen-Perks (Nahkampf und Fernkampf): Bonus, solange die Waffe gerade ANGELEGT UND GEWAEHLT ist (Taste 1 / 2), also nur wenn man sie wirklich benutzt.
// Der Blaster hat bewusst keinen Perk (einfach, sicher), dafuer hat jede andere Waffe einen eigenen Grund, sie zu spielen.
// Werte: dropMul / ultMul / xpMul / dmgTaken = Faktor, coreChance = Chance auf +1 Core pro Kill, cdOnKill = Sekunden Abklingzeit-Abzug pro Kill, magnet = Zuschlag auf die Einsammelreichweite.
// Wirkung: js/xp.js (Objekt Perk), Haken in Enemy.die, Player.hit, pickupRange, Xp.drop.
CFG.items.perks = {
  sword:     { name: 'SCAVENGER',   text: 'Each kill has a 7% chance to give +1 core, and buffs drop 40% more often.', coreChance: 0.07, dropMul: 1.4 },
  whip:      { name: 'CHARGER',     text: 'Kills charge your ultimate 30% faster.', ultMul: 1.3 },
  katana:    { name: 'FLOW',        text: 'Every kill shortens all ability cooldowns by 0.25 s.', cdOnKill: 0.25 },
  hammer:    { name: 'BULWARK',     text: 'You take 12% less damage.', dmgTaken: 0.88 },
  lance:     { name: 'MENTOR',      text: 'Enemies drop 25% more XP.', xpMul: 1.25 },
  impulse:   { name: 'CUSHION',     text: 'You take 10% less damage.', dmgTaken: 0.9 },
  shotgun:   { name: 'BOUNTY',      text: 'Each kill has a 5% chance to give +1 core.', coreChance: 0.05 },
  boomerang: { name: 'MAGNETIC',    text: 'Pickup range +60% (drops, XP, health).', magnet: 0.6 },
  molotov:   { name: 'ARSONIST',    text: 'Kills charge your ultimate 25% faster.', ultMul: 1.25 },
  rocket:    { name: 'BATTLE DATA', text: 'Enemies drop 30% more XP.', xpMul: 1.3 },
  bounce:    { name: 'ANGLE PLAY',  text: 'Every kill shortens all ability cooldowns by 0.2 s.', cdOnKill: 0.2 },
};
for (const id of Object.keys(CFG.items.catalog)) {
  const I = CFG.items.catalog[id], P = CFG.items.perks[id];
  if (I.slot !== 'melee' && I.slot !== 'ranged') continue;
  I.desc += P ? ' PERK ' + P.name + ' (while selected): ' + P.text : ' No perk: the simple, reliable choice.';
}
