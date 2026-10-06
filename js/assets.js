// Lädt Bilder und Sounds und zeichnet Sprites so, wie Scratch es tut:
// Position = Drehpunkt des Bildes, Richtung, Größe in Prozent.

const IMG = {};

// Drehpunkte der Bilder stehen in js/art_manifest.js (ART_RC, erzeugt von tools/gen_art.js)

function imageList() {
  const names = [
    'startscreen', 'keysettings', 'ground', 'ground2', 'ground3', 'ground4', 'pulseIcon', 'blinkIcon', 'lanceIcon', 'impulseIcon', 'frostIcon', 'fieldIcon',
    'beamIcon', 'grenadeIcon', 'fireIcon', 'armorIcon', 'regenIcon', 'phoenixIcon', 'damageIcon',
    'whipIcon', 'katanaIcon', 'hammerIcon', 'shotgunIcon', 'boomerangIcon', 'molotovIcon', 'chainIcon', 'blackholeIcon',
    'shockstepIcon', 'adrenalineIcon', 'droneIcon', 'overchargeIcon', 'stormIcon', 'berserkIcon', 'nanoIcon', 'buffHaste', 'buffRapid', 'buffGuard', 'buffCharge', 'buffPower', 'buffMagnet', 'buffRegen', 'buffVampire', 'buffChrono', 'buffCoolant', 'buffNova', 'rocketIcon', 'bladesIcon', 'hackIcon', 'necroIcon', 'stimIcon',
    'thrustersIcon', 'scannerIcon', 'barrierIcon', 'capacitorIcon', 'overclockIcon', 'aegisIcon',
    'surgeIcon', 'decoyIcon', 'bombardIcon', 'bounceIcon', 'thornsIcon', 'vampireIcon', 'luckyIcon',
    'deathSecret1', 'deathSecret2', 'deathSecret3', 'deathSecret4',
    'heroBulwark', 'heroSpecter', 'heroArchon', 'heroAlchemist', 'heroHarbinger', 'fortressIcon', 'riftIcon', 'chronoIcon', 'catalystIcon',
    'player', 'sword', 'bubble', 'shot', 'dash1', 'dash2',
    'beamLoad1', 'beamLoad2', 'beam1', 'beam2',
    'ult1', 'ult2', 'ult3', 'ult4', 'ultFlash', 'blood1', 'blood2', 'blood3',
    'support', 'summoner', 'summonerHit', 'turret', 'turretHit',
    'bomber', 'splitter', 'sniper', 'miner', 'leech', 'necro', 'teleporter', 'tank', 'square', 'square1hp', 'rhombus', 'rhombus1hp', 'circle', 'triangle', 'guardPlate', 'guardMirror',
    'spawner', 'spawnerHit', 'spawnPoint', 'octagon', 'octagonHit', 'kite', 'kiteHit',
    'enemyShot', 'missile', 'wave1', 'wave2', 'wave3', 'wave4',
    'heal', 'damageOverlay',
    'dmg1', 'dmg8', 'dmg9', 'dmg10', 'dmg20', 'dmgHeal', 'dmgCore',
  ];
  for (let i = 1; i <= 19; i++) names.push('death' + i);
  for (let i = 0; i <= 17; i++) names.push('hp' + i);
  for (let i = 0; i <= 6; i++) names.push('bosshp' + i);
  for (let i = 0; i <= 30; i++) names.push('clock' + i);
  for (let i = 1; i <= 14; i++) names.push('bossAnim' + i);
  return names;
}

function loadAssets(onDone) {
  const names = imageList();
  let pending = names.length;
  const finish = () => { if (--pending === 0) onDone(); };
  for (const name of names) {
    const img = new Image();
    const entry = { img, ok: false, res: 2, w: 0, h: 0, rcx: 0, rcy: 0 };   // alle Bilder sind mit doppelter Auflösung gezeichnet
    IMG[name] = entry;
    img.onload = () => {
      entry.ok = true;
      entry.w = img.naturalWidth;
      entry.h = img.naturalHeight;
      const rc = ART_RC[name];
      entry.rcx = rc ? rc[0] : entry.w / 2;
      entry.rcy = rc ? rc[1] : entry.h / 2;
      finish();
    };
    img.onerror = () => { console.warn('Missing image: ' + name); finish(); };
    img.src = 'assets/img_new/' + name + '.png';
  }
  if (document.fonts) document.fonts.load('20px "Pixelify Sans"').catch(() => {});
  setMusicVolume(Save.data.musicVol);
}

function setMusicVolume(v) {
  Save.data.musicVol = clamp(v, 0, 1);
  Music.setVolume(Save.data.musicVol);
}

// Zeichnet ein Bild. x,y in Bühnenkoordinaten (Scratch). dir/size wie in Scratch.
// opts: alpha (0-1), hue (Grad), brightness (1 = normal)
function drawSprite(ctx, name, x, y, dir = 90, size = 100, opts) {
  const im = IMG[name];
  if (!im || !im.ok) return;
  ctx.save();
  ctx.translate(STAGE_W / 2 + x, STAGE_H / 2 - y);
  ctx.rotate((dir - 90) * DEG);
  const s = size / 100;
  ctx.scale(s, s);
  let src = im.img;
  if (opts) {
    if (opts.alpha !== undefined) ctx.globalAlpha = clamp(opts.alpha, 0, 1);
    let filter = '';
    if (opts.hue) filter += 'hue-rotate(' + opts.hue + 'deg) ';
    if (opts.brightness) filter += 'brightness(' + opts.brightness + ') ';
    if (filter) { if ('filter' in ctx) ctx.filter = filter; else src = IMG[Cos.tinted(name, filter.trim())].img; }       // Safari kennt ctx.filter nicht
  }
  ctx.drawImage(opts && opts.gray ? grayImage(im) : src, -im.rcx / im.res, -im.rcy / im.res, im.w / im.res, im.h / im.res);
  ctx.restore();
}

// Graustufen-Kopie eines Bildes (einmal berechnet und gemerkt); ohne Canvas-Unterstützung das Original
function grayImage(im) {
  if (im.gray) return im.gray;
  try {
    const c = document.createElement('canvas'); c.width = im.img.naturalWidth || im.img.width; c.height = im.img.naturalHeight || im.img.height;
    const g = c.getContext('2d'); g.drawImage(im.img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const l = Math.round(p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11); p[i] = p[i + 1] = p[i + 2] = l; }
    g.putImageData(d, 0, 0);
    return (im.gray = c);
  } catch (e) { return (im.gray = im.img); }
}

// Musik (js/music.js): genau eine Spur läuft, je nach Spielzustand. Pause hält an und läuft an derselben Stelle weiter.
function pauseMusic() { Music.pause(); }
function resumeMusic() { Music.resume(); }
function playMusic(name) { Music.play(name); }
