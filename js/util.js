// Kleine Hilfsfunktionen (Mathe, Richtungen, Kollisionen).
// Richtungen sind wie in Scratch: 0 = oben, 90 = rechts, im Uhrzeigersinn. y zeigt nach oben.

function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Wie viele "Scratch-Bilder" sind seit dem letzten Frame vergangen? (dt in Sekunden)
function framesOf(dt) { return dt * FPS; }

function fwdX(dir) { return Math.sin(dir * DEG); }
function fwdY(dir) { return Math.cos(dir * DEG); }

// Richtung von (x1,y1) nach (x2,y2) als Scratch-Richtung
function dirTo(x1, y1, x2, y2) { return Math.atan2(x2 - x1, y2 - y1) / DEG; }

// Kürzester Drehwinkel von current nach target, Ergebnis zwischen -180 und 180
function angleDiff(target, current) { return ((target - current + 540) % 360 + 360) % 360 - 180; }

function moveForward(o, steps) {
  o.x += fwdX(o.dir) * steps;
  o.y += fwdY(o.dir) * steps;
}

// Lenkt o.dir höchstens maxTurn Grad Richtung Ziel (für Raketen)
function steerTowards(o, tx, ty, maxTurn) {
  const diff = angleDiff(dirTo(o.x, o.y, tx, ty), o.dir);
  o.dir += clamp(diff, -maxTurn, maxTurn);
}

function dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; }

function circlesOverlap(x1, y1, r1, x2, y2, r2) {
  const r = r1 + r2;
  return dist2(x1, y1, x2, y2) < r * r;
}

// Abstand² von Punkt zu Strecke
function segDist2(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const len2 = abx * abx + aby * aby;
  let t = len2 === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / len2;
  t = clamp(t, 0, 1);
  return dist2(px, py, ax + abx * t, ay + aby * t);
}

// Trifft ein Kreis (cx,cy,r) eine Strecke mit Halbbreite pad?
function segHitsCircle(ax, ay, bx, by, pad, cx, cy, r) {
  const rr = r + pad;
  return segDist2(cx, cy, ax, ay, bx, by) < rr * rr;
}

// Lokale Koordinaten (lx nach vorn, ly nach links, in Einheiten bei 100 %) -> Welt
function toWorld(x, y, dir, scale, lx, ly) {
  const fx = fwdX(dir), fy = fwdY(dir);
  return [x + (fx * lx - fy * ly) * scale, y + (fy * lx + fx * ly) * scale];
}

// Bild-Pixel (px,py) relativ zum Drehpunkt -> lokale Einheiten (Bilder haben 2 px pro Einheit)
function pxToLocal(px, py, rcx, rcy, res) {
  return [(px - rcx) / res, -(py - rcy) / res];
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polyHitsCircle(poly, cx, cy, r) {
  if (pointInPoly(cx, cy, poly)) return true;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    if (segHitsCircle(poly[j], poly[j + 1], poly[i], poly[i + 1], 0, cx, cy, r)) return true;
  }
  return false;
}

// Zeitgeber: zählt runter und meldet true, wenn er abgelaufen ist
class Timer {
  constructor(seconds) { this.left = seconds; }
  tick(dt) { this.left -= dt; return this.left <= 0; }
}
