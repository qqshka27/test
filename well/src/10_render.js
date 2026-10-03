// ===== Отрисовка на canvas =====

const R = {
  canvas: null, ctx: null, dpr: 1, ts: 32, w: 0, h: 0,
  cam: { x: 0, y: 0, init: false },
  anim: new Map(), // id -> {x, y, bx, by, flash}
  floats: [], particles: [], bolts: [], projectiles: [], deaths: [], rings: [],
  shake: 0, fadeIn: 0, bossPulse: 0,
  mapCanvas: null, mapKey: '', mini: null,
  hover: null, target: null, targetPath: null,
  time: 0,
};

function initRenderer(canvas, mini) {
  R.canvas = canvas;
  R.ctx = canvas.getContext('2d');
  R.mini = mini;
  R.mapCanvas = document.createElement('canvas');
  R.mapCanvas.width = MAP_W * 8;
  R.mapCanvas.height = MAP_H * 8;
  resizeRenderer();
}

function resizeRenderer() {
  const c = R.canvas;
  const rect = c.parentElement.getBoundingClientRect();
  R.dpr = Math.min(window.devicePixelRatio || 1, 3);
  R.w = Math.max(100, rect.width);
  R.h = Math.max(100, rect.height);
  c.width = Math.round(R.w * R.dpr);
  c.height = Math.round(R.h * R.dpr);
  c.style.width = R.w + 'px';
  c.style.height = R.h + 'px';
  // На телефоне видно ~13 клеток в ширину, на компьютере больше
  const want = R.w < 520 ? 12.5 : R.w < 900 ? 17 : 23;
  R.ts = clamp(Math.floor(R.w / want / 2) * 2, 24, 56);
  if (R.h / R.ts < 9) R.ts = Math.max(20, Math.floor(R.h / 9 / 2) * 2);
}

// Детерминированный шум по координатам — чтобы стены не «мигали»
function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(Math.round(r * f), 0, 255); g = clamp(Math.round(g * f), 0, 255); b = clamp(Math.round(b * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

// Перерисовываем пиксельную карту уровня только при изменении тайлов
function rebuildMap(g) {
  const lv = g.level;
  let key = g.depth + ':' + g.seed + ':';
  // Быстрый хэш тайлов
  let h = 0;
  for (let i = 0; i < lv.tiles.length; i++) h = (Math.imul(h, 31) + lv.tiles[i] + 1) | 0;
  key += h;
  if (key === R.mapKey) return;
  R.mapKey = key;
  const ctx = R.mapCanvas.getContext('2d');
  const th = THEMES[lv.theme];
  ctx.fillStyle = th.fog;
  ctx.fillRect(0, 0, R.mapCanvas.width, R.mapCanvas.height);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) drawTilePixels(ctx, lv, th, x, y);
  }
}

function px(ctx, color, x, y, w = 1, h = 1) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }

function drawFloorPixels(ctx, th, X, Y, x, y) {
  px(ctx, th.floor, X, Y, 8, 8);
  const r = hash2(x, y);
  if (r < 0.5) px(ctx, th.floorDot, X + Math.floor(hash2(x, y, 1) * 7), Y + Math.floor(hash2(x, y, 2) * 7), 1, 1);
  if (r < 0.2) px(ctx, th.floorDot, X + Math.floor(hash2(x, y, 3) * 6), Y + Math.floor(hash2(x, y, 4) * 6), 2, 1);
  // тонкие швы плитки
  px(ctx, shade(th.floor, 0.85), X, Y + 7, 8, 1);
  px(ctx, shade(th.floor, 0.85), X + 7, Y, 1, 8);
}

function drawTilePixels(ctx, lv, th, x, y) {
  const X = x * 8, Y = y * 8;
  const t = lv.tiles[idx(x, y)];
  const below = y + 1 < MAP_H ? lv.tiles[idx(x, y + 1)] : T.WALL;
  switch (t) {
    case T.WALL: {
      if (below !== T.WALL) {
        // Лицевая сторона стены: кирпичи
        px(ctx, th.wall, X, Y, 8, 8);
        px(ctx, th.wallHi, X, Y, 8, 1);
        const off = (y % 2) * 4;
        px(ctx, th.wallLo, X, Y + 3, 8, 1);
        px(ctx, th.wallLo, X, Y + 7, 8, 1);
        px(ctx, th.wallLo, X + ((1 + off) % 8), Y + 1, 1, 2);
        px(ctx, th.wallLo, X + ((5 + off) % 8), Y + 4, 1, 3);
        if (hash2(x, y, 7) < 0.25) px(ctx, th.wallHi, X + 2 + Math.floor(hash2(x, y, 8) * 4), Y + 5, 2, 1);
      } else {
        // Верх стены
        px(ctx, th.wallLo, X, Y, 8, 8);
        if (hash2(x, y, 5) < 0.3) px(ctx, shade(th.wallLo, 1.15), X + Math.floor(hash2(x, y, 6) * 6), Y + Math.floor(hash2(x, y, 9) * 6), 2, 2);
      }
      break;
    }
    case T.FLOOR: drawFloorPixels(ctx, th, X, Y, x, y); break;
    case T.DOOR:
      drawFloorPixels(ctx, th, X, Y, x, y);
      px(ctx, '#3a2418', X, Y, 8, 8);
      px(ctx, '#7a4a2a', X + 1, Y + 1, 6, 7);
      px(ctx, '#5a341c', X + 3, Y + 1, 1, 7);
      px(ctx, '#5a341c', X + 1, Y + 3, 6, 1);
      px(ctx, '#ffd34e', X + 5, Y + 5, 1, 1);
      break;
    case T.ODOOR:
      drawFloorPixels(ctx, th, X, Y, x, y);
      px(ctx, '#3a2418', X, Y, 1, 8);
      px(ctx, '#3a2418', X + 7, Y, 1, 8);
      px(ctx, '#7a4a2a', X + 1, Y, 1, 8);
      break;
    case T.STAIRS:
      drawFloorPixels(ctx, th, X, Y, x, y);
      for (let i = 0; i < 4; i++) {
        px(ctx, shade(th.floor, 0.25 + i * 0.12), X + 1, Y + 1 + i * 2, 6, 2);
        px(ctx, shade(th.wallHi, 0.9 - i * 0.15), X + 1, Y + 1 + i * 2, 6, 1);
      }
      break;
    case T.UPSTAIRS:
      drawFloorPixels(ctx, th, X, Y, x, y);
      for (let i = 0; i < 4; i++) px(ctx, shade(th.wallHi, 0.6 + i * 0.15), X + 1, Y + 6 - i * 2, 6, 1);
      px(ctx, '#e6d9a8', X + 3, Y, 2, 1);
      break;
    case T.WATER:
      px(ctx, th.water, X, Y, 8, 8);
      px(ctx, shade(th.water, 1.3), X + (hash2(x, y) * 4 | 0), Y + 2, 3, 1);
      px(ctx, shade(th.water, 1.2), X + 3 + (hash2(x, y, 2) * 4 | 0), Y + 5, 3, 1);
      break;
    case T.GRASS:
      drawFloorPixels(ctx, th, X, Y, x, y);
      for (let i = 0; i < 5; i++) {
        const gx = X + Math.floor(hash2(x, y, 10 + i) * 7), gy = Y + 2 + Math.floor(hash2(x, y, 20 + i) * 4);
        px(ctx, th.grass, gx, gy, 1, 3);
        px(ctx, shade(th.grass, 1.35), gx, gy, 1, 1);
      }
      break;
    case T.FOUNTAIN:
    case T.DRY: {
      drawFloorPixels(ctx, th, X, Y, x, y);
      px(ctx, '#7a7f8e', X + 1, Y + 3, 6, 4);
      px(ctx, '#a0a5b4', X + 1, Y + 3, 6, 1);
      px(ctx, '#5a5f6e', X + 1, Y + 6, 6, 1);
      px(ctx, '#8a8f9e', X + 3, Y + 1, 2, 2);
      px(ctx, t === T.FOUNTAIN ? '#4f9fe0' : '#4a3a2a', X + 2, Y + 4, 4, 2);
      if (t === T.FOUNTAIN) px(ctx, '#bfe6ff', X + 3, Y + 4, 1, 1);
      break;
    }
    case T.ALTAR:
    case T.ALTAR_OFF:
      drawFloorPixels(ctx, th, X, Y, x, y);
      px(ctx, '#6a6478', X + 1, Y + 3, 6, 5);
      px(ctx, '#8f88a0', X, Y + 3, 8, 1);
      px(ctx, '#4a4458', X + 1, Y + 7, 6, 1);
      px(ctx, '#e8dcc0', X + 2, Y + 1, 1, 2);
      px(ctx, '#e8dcc0', X + 5, Y + 1, 1, 2);
      px(ctx, '#c9a227', X + 3, Y + 5, 2, 1);
      break;
    case T.BARS:
      drawFloorPixels(ctx, th, X, Y, x, y);
      for (let i = 0; i < 4; i++) px(ctx, '#8a8f9e', X + 1 + i * 2, Y, 1, 8);
      px(ctx, '#5a5f6e', X, Y + 1, 8, 1);
      px(ctx, '#5a5f6e', X, Y + 6, 8, 1);
      break;
    default:
      px(ctx, th.fog, X, Y, 8, 8);
  }
}

// ---------- События игры → анимации ----------

function consumeFx(g) {
  const p = g.player;
  for (const e of g.fx) {
    switch (e.type) {
      case 'float': R.floats.push({ x: e.x, y: e.y, text: e.text, color: e.color, t: 0, big: e.big, dx: (Math.random() - 0.5) * 0.3 }); break;
      case 'bump': {
        const a = R.anim.get(e.id);
        if (a) { const dx = sign(e.tx - e.x), dy = sign(e.ty - e.y); a.bx = dx * 0.35; a.by = dy * 0.35; }
        break;
      }
      case 'shot': R.projectiles.push({ pts: lineBetween(e.x, e.y, e.tx, e.ty).slice(1), t: 0, color: e.color || '#fff', arrow: true }); break;
      case 'flash': { const a = R.anim.get(e.id); if (a) a.flash = 1; break; }
      case 'shake': R.shake = Math.max(R.shake, e.power); break;
      case 'particles': burst(e.x, e.y, e.color, e.n); break;
      case 'death': R.deaths.push({ x: e.x, y: e.y, sprite: e.sprite, t: 0, big: e.big }); burst(e.x, e.y, '#d8d0c0', 10); break;
      case 'bolt': R.bolts.push({ pts: e.pts, color: e.color, t: 0, thin: e.thin }); break;
      case 'projectile': R.projectiles.push({ pts: e.pts, t: 0, sprite: e.sprite, tint: e.tint }); break;
      case 'explosion': R.rings.push({ x: e.x, y: e.y, r: e.r, t: 0, color: '#ff9a3c', fill: true }); burst(e.x, e.y, '#ffb347', 30, 2.5); break;
      case 'bark': R.rings.push({ x: e.x, y: e.y, r: 5, t: 0, color: '#ffe0a0' }); break;
      case 'levelup': R.rings.push({ x: e.x, y: e.y, r: 1.5, t: 0, color: '#ffd34e' }); burst(e.x, e.y, '#ffd34e', 20, 1.2, -1); break;
      case 'teleport': { const a = R.anim.get(e.id); if (a) { a.x = p.x; a.y = p.y; } break; }
      case 'levelin': R.fadeIn = 1; R.anim.clear(); R.cam.init = false; R.floats = []; R.particles = []; R.deaths = []; break;
      case 'boss': R.bossPulse = 1; break;
      case 'sound': playSound(e.name); break;
      case 'ach': if (typeof onAchievement === 'function') onAchievement(e.id); break;
    }
  }
  g.fx.length = 0;
}

function burst(x, y, color, n, speed = 1.5, up = 0) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random()) * speed;
    R.particles.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s + up, life: 1, color, size: Math.random() < 0.3 ? 2 : 1 });
  }
}

// ---------- Кадр ----------

function renderFrame(g, dt) {
  const ctx = R.ctx;
  R.time += dt;
  rebuildMap(g);
  const lv = g.level, p = g.player, th = THEMES[lv.theme];
  const ts = R.ts;

  // Анимационные позиции актёров
  const all = [p, ...g.actors];
  const k = 1 - Math.pow(0.0001, dt); // плавное догоняние
  for (const a of all) {
    let an = R.anim.get(a.id);
    if (!an) { an = { x: a.x, y: a.y, bx: 0, by: 0, flash: 0 }; R.anim.set(a.id, an); }
    if (Math.abs(an.x - a.x) > 3 || Math.abs(an.y - a.y) > 3) { an.x = a.x; an.y = a.y; }
    an.x += (a.x - an.x) * Math.min(1, k * 1.6);
    an.y += (a.y - an.y) * Math.min(1, k * 1.6);
    an.bx *= Math.pow(0.002, dt); an.by *= Math.pow(0.002, dt);
    an.flash = Math.max(0, an.flash - dt * 6);
  }
  for (const id of R.anim.keys()) if (id !== 0 && !g.actors.some((a) => a.id === id)) R.anim.delete(id);

  // Камера
  const pa = R.anim.get(0);
  const viewW = R.w / ts, viewH = R.h / ts;
  let cx = pa.x + 0.5 - viewW / 2, cy = pa.y + 0.5 - viewH / 2;
  // Не показываем пустоту за краями карты, если карта больше экрана
  if (MAP_W > viewW) cx = clamp(cx, -0.5, MAP_W - viewW + 0.5); else cx = (MAP_W - viewW) / 2;
  if (MAP_H > viewH) cy = clamp(cy, -0.5, MAP_H - viewH + 0.5); else cy = (MAP_H - viewH) / 2;
  if (!R.cam.init) { R.cam.x = cx; R.cam.y = cy; R.cam.init = true; }
  R.cam.x += (cx - R.cam.x) * Math.min(1, k * 1.2);
  R.cam.y += (cy - R.cam.y) * Math.min(1, k * 1.2);
  let sx = 0, sy = 0;
  if (R.shake > 0) {
    sx = (Math.random() - 0.5) * R.shake * 2; sy = (Math.random() - 0.5) * R.shake * 2;
    R.shake = Math.max(0, R.shake - dt * 25);
  }

  ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = th.fog;
  ctx.fillRect(0, 0, R.w, R.h);
  const ox = Math.round(-R.cam.x * ts + sx), oy = Math.round(-R.cam.y * ts + sy);
  const toX = (x) => ox + x * ts, toY = (y) => oy + y * ts;

  const x0 = Math.max(0, Math.floor(R.cam.x) - 1), y0 = Math.max(0, Math.floor(R.cam.y) - 1);
  const x1 = Math.min(MAP_W - 1, Math.ceil(R.cam.x + viewW) + 1), y1 = Math.min(MAP_H - 1, Math.ceil(R.cam.y + viewH) + 1);

  // Тайлы: рисуем одну большую картинку, затем затемняем
  ctx.drawImage(R.mapCanvas, 0, 0, MAP_W * 8, MAP_H * 8, ox, oy, MAP_W * ts, MAP_H * ts);

  // Анимация воды
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (lv.tiles[idx(x, y)] === T.WATER && lv.visible[idx(x, y)]) {
      const ph = R.time * 1.6 + x * 0.7 + y * 0.4;
      ctx.fillStyle = 'rgba(180,220,255,0.10)';
      const wy = (Math.sin(ph) * 0.5 + 0.5) * ts * 0.7;
      ctx.fillRect(toX(x) + ts * 0.15, toY(y) + wy, ts * 0.5, Math.max(1, ts / 8));
    }
  }

  // Брызги фонтанов
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (lv.tiles[idx(x, y)] === T.FOUNTAIN && lv.visible[idx(x, y)]) {
      for (let k2 = 0; k2 < 3; k2++) {
        const ph = (R.time * 1.4 + k2 / 3 + x * 0.1) % 1;
        ctx.fillStyle = `rgba(190,230,255,${(1 - ph) * 0.8})`;
        const s2 = Math.max(2, ts / 12);
        ctx.fillRect(toX(x) + ts * (0.5 + (k2 - 1) * 0.18 * ph) - s2 / 2, toY(y) + ts * (0.2 - Math.sin(ph * Math.PI) * 0.15 + ph * 0.25), s2, s2);
      }
    }
  }

  // Огоньки свечей на алтарях
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (lv.tiles[idx(x, y)] === T.ALTAR && lv.visible[idx(x, y)]) {
      const fl = Math.sin(R.time * 9 + x) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255,${190 + fl * 40 | 0},90,${0.75 + fl * 0.25})`;
      const s2 = Math.max(2, ts / 8);
      ctx.fillRect(toX(x) + ts * 2 / 8, toY(y) + ts * 0.02 - fl * s2 * 0.3, s2, s2);
      ctx.fillRect(toX(x) + ts * 5 / 8, toY(y) + ts * 0.02 - (1 - fl) * s2 * 0.3, s2, s2);
    }
  }

  // Ловушки
  for (const t of g.traps) {
    if (t.hidden || !lv.seen[idx(t.x, t.y)]) continue;
    drawSprite(ctx, 'trap', toX(t.x), toY(t.y), ts, 1);
  }
  // Предметы
  for (const it of g.items) {
    if (!lv.seen[idx(it.x, it.y)] && !lv.detect) continue;
    const bob = lv.visible[idx(it.x, it.y)] ? Math.sin(R.time * 3 + it.id) * ts * 0.03 : 0;
    drawSprite(ctx, itemSprite(g, it), toX(it.x) + ts * 0.1, toY(it.y) + ts * 0.1 + bob, ts * 0.8, 1, itemTint(g, it));
    if (it.price && lv.visible[idx(it.x, it.y)]) {
      ctx.font = `${Math.max(9, ts * 0.3)}px "Tiny5", monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000a';
      ctx.fillText(it.price, toX(it.x) + ts / 2 + 1, toY(it.y) + ts + 1);
      ctx.fillStyle = '#ffd34e';
      ctx.fillText(it.price, toX(it.x) + ts / 2, toY(it.y) + ts);
    }
  }

  // Затемнение: память и расстояние
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = idx(x, y);
      if (!lv.seen[i]) { ctx.fillStyle = th.fog; ctx.fillRect(toX(x), toY(y), ts, ts); continue; }
      if (!lv.visible[i]) { ctx.fillStyle = 'rgba(8,8,18,0.58)'; ctx.fillRect(toX(x), toY(y), ts, ts); continue; }
      const d = Math.hypot(x - p.x, y - p.y) / (FOV_RADIUS + 0.5);
      const a = clamp(d * d * 0.5, 0, 0.5);
      if (a > 0.02) { ctx.fillStyle = `rgba(6,4,10,${a.toFixed(3)})`; ctx.fillRect(toX(x), toY(y), ts, ts); }
    }
  }

  // Тёплый свет фонаря вокруг героя
  {
    const P = R.anim.get(0);
    const lx = toX(P.x) + ts / 2, ly = toY(P.y) + ts / 2;
    const flick = 1 + Math.sin(R.time * 7.3) * 0.015 + Math.sin(R.time * 13.1) * 0.01;
    const lg = ctx.createRadialGradient(lx, ly, ts * 0.3, lx, ly, ts * FOV_RADIUS * 0.75 * flick);
    lg.addColorStop(0, 'rgba(255,170,80,0.16)');
    lg.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = lg;
    ctx.fillRect(lx - ts * FOV_RADIUS, ly - ts * FOV_RADIUS, ts * FOV_RADIUS * 2, ts * FOV_RADIUS * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Трупики (исчезают)
  for (const d of R.deaths) {
    d.t += dt;
    const a = Math.max(0, 1 - d.t * 2.2);
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    const s = d.big ? ts * 1.6 : ts;
    drawSprite(ctx, d.sprite, toX(d.x) + (ts - s) / 2, toY(d.y) + (ts - s) / 2 - d.t * ts * 0.5, s, 1, null, '#ffffff');
    ctx.globalAlpha = 1;
  }
  R.deaths = R.deaths.filter((d) => d.t < 0.5);

  // Монстры
  const sorted = g.actors.slice().sort((a, b) => a.y - b.y);
  for (const m of sorted) {
    const def = MONSTERS[m.type];
    const vis = monsterVisible(g, m);
    if (!vis) continue;
    const an = R.anim.get(m.id);
    const dx = toX(an.x + an.bx), dy = toY(an.y + an.by);
    const inSight = canSee(g, m.x, m.y);
    if (!inSight) ctx.globalAlpha = 0.45;
    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(dx + ts / 2, dy + ts * 0.9, ts * (def.boss ? 0.7 : 0.32), ts * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    let sprite = def.sprite;
    if (m.disguised) sprite = 'chest';
    const breathe = !m.disguised && m.awake ? Math.sin(R.time * 4 + m.id) * ts * 0.03 : 0;
    if (def.boss) {
      const s = ts * 1.7;
      drawSprite(ctx, sprite, dx + (ts - s) / 2, dy + ts - s + breathe, s, 1, null, an.flash > 0.5 ? '#ffffff' : null);
    } else {
      if (m.type === 'ghost' || m.type === 'shade') ctx.globalAlpha *= 0.55 + Math.sin(R.time * 2.5 + m.id) * 0.2;
      drawSprite(ctx, sprite, dx + ts * 0.06, dy + ts * 0.04 + breathe, ts * 0.88, 1, null, an.flash > 0.5 ? '#ffffff' : null);
    }
    ctx.globalAlpha = 1;
    // Полоска здоровья
    if (!def.peaceful && !m.disguised && m.hp < m.maxHp && inSight) {
      const w = def.boss ? ts * 1.6 : ts * 0.8, bx = dx + (ts - w) / 2, by = def.boss ? dy - ts * 0.8 : dy - ts * 0.08;
      ctx.fillStyle = '#000c'; ctx.fillRect(bx - 1, by - 1, w + 2, Math.max(3, ts / 10) + 2);
      ctx.fillStyle = m.hp / m.maxHp > 0.5 ? '#5fbf5a' : m.hp / m.maxHp > 0.25 ? '#e0a43a' : '#d8433c';
      ctx.fillRect(bx, by, w * Math.max(0, m.hp / m.maxHp), Math.max(3, ts / 10));
    }
    // Статусы
    if (inSight && (!m.awake || m.status.sleep) && !m.disguised && !def.peaceful) {
      const zz = (R.time * 0.6 + m.id * 0.37) % 1;
      ctx.font = `${Math.max(10, ts * (0.28 + zz * 0.14))}px "Tiny5", monospace`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = 1 - zz;
      ctx.fillStyle = '#c9d6ff';
      ctx.fillText('z', dx + ts * (0.75 + zz * 0.15), dy + ts * (0.1 - zz * 0.35));
      ctx.globalAlpha = 1;
    }
    if (inSight && (m.status.confused || m.status.fear || m.status.distracted)) {
      ctx.font = `${Math.max(10, ts * 0.38)}px "Tiny5", monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = m.status.fear ? '#c9b3ff' : m.status.distracted ? '#ffb070' : '#7fe0b0';
      ctx.fillText(m.status.fear ? '!' : m.status.distracted ? '♥' : '?', dx + ts * 0.85, dy + ts * 0.1);
    }
  }

  // Игрок
  {
    const an = R.anim.get(0);
    const dx = toX(an.x + an.bx), dy = toY(an.y + an.by);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(dx + ts / 2, dy + ts * 0.9, ts * 0.3, ts * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    if (g.over && !g.over.won) ctx.globalAlpha = 0.4;
    drawSprite(ctx, (HEROES[g.hero] || HEROES.vasya).sprite, dx + ts * 0.06, dy + ts * 0.04, ts * 0.88, 1, null, an.flash > 0.5 ? '#ff6b5e' : null);
    ctx.globalAlpha = 1;
    if (p.status.haste) { ctx.fillStyle = 'rgba(159,226,255,0.5)'; ctx.fillRect(dx - ts * 0.12, dy + ts * 0.4, ts * 0.12, 2); ctx.fillRect(dx - ts * 0.2, dy + ts * 0.6, ts * 0.16, 2); }
  }

  // Молнии и лучи
  for (const b of R.bolts) {
    b.t += dt;
    const a = Math.max(0, 1 - b.t * 3);
    if (!b.pts.length) continue;
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = a;
    ctx.lineWidth = b.thin ? Math.max(2, ts / 10) : Math.max(3, ts / 6);
    ctx.beginPath();
    const P = R.anim.get(0);
    ctx.moveTo(toX(P.x) + ts / 2, toY(P.y) + ts / 2);
    for (const [x, y] of b.pts) {
      const j = b.thin ? 0 : (Math.random() - 0.5) * ts * 0.4;
      ctx.lineTo(toX(x) + ts / 2 + j, toY(y) + ts / 2 + j);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  R.bolts = R.bolts.filter((b) => b.t < 0.34);

  // Снаряды
  for (const pr of R.projectiles) {
    pr.t += dt;
    const n = pr.pts.length;
    if (!n) continue;
    const pos = Math.min(n - 1, pr.t * 28);
    const i = Math.floor(pos), f = pos - i;
    const [ax, ay] = pr.pts[i], [bx2, by2] = pr.pts[Math.min(n - 1, i + 1)];
    const x = ax + (bx2 - ax) * f, y = ay + (by2 - ay) * f;
    if (pr.sprite) drawSprite(ctx, pr.sprite, toX(x) + ts * 0.25, toY(y) + ts * 0.25, ts * 0.5, 1, pr.tint);
    else { ctx.fillStyle = pr.color; ctx.fillRect(toX(x) + ts * 0.35, toY(y) + ts * 0.45, ts * 0.3, Math.max(2, ts / 12)); }
  }
  R.projectiles = R.projectiles.filter((pr) => pr.t * 28 < pr.pts.length + 1);

  // Кольца (взрывы, лай)
  for (const r of R.rings) {
    r.t += dt;
    const k2 = Math.min(1, r.t * 2.5);
    ctx.globalAlpha = 1 - k2;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = Math.max(2, ts / 8);
    ctx.beginPath();
    ctx.arc(toX(r.x) + ts / 2, toY(r.y) + ts / 2, (r.r + 0.5) * ts * k2, 0, Math.PI * 2);
    if (r.fill) { ctx.fillStyle = r.color; ctx.globalAlpha = (1 - k2) * 0.35; ctx.fill(); ctx.globalAlpha = 1 - k2; }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  R.rings = R.rings.filter((r) => r.t < 0.4);

  // Частицы
  for (const q of R.particles) {
    q.x += q.vx * dt * 2; q.y += q.vy * dt * 2;
    q.vy += dt * 2.5; q.vx *= 0.96;
    q.life -= dt * 1.6;
    if (q.life <= 0) continue;
    ctx.globalAlpha = Math.min(1, q.life * 1.5);
    ctx.fillStyle = q.color;
    const s = Math.max(2, ts / 10) * q.size;
    ctx.fillRect(toX(q.x) - s / 2, toY(q.y) - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  R.particles = R.particles.filter((q) => q.life > 0);

  // Цифры урона
  ctx.textAlign = 'center';
  for (const f of R.floats) {
    f.t += dt;
    const a = Math.max(0, 1 - f.t * 1.1);
    const size = Math.max(11, ts * (f.big ? 0.62 : 0.45));
    ctx.font = `${size}px "Tiny5", monospace`;
    const fx2 = toX(f.x + 0.5 + f.dx * f.t), fy = toY(f.y) - f.t * ts * 0.9 + ts * 0.2;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#000';
    ctx.fillText(f.text, fx2 + 1, fy + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, fx2, fy);
  }
  ctx.globalAlpha = 1;
  R.floats = R.floats.filter((f) => f.t < 0.95);

  // Прицел
  if (R.target) {
    if (R.targetPath) {
      ctx.fillStyle = 'rgba(255,211,78,0.35)';
      for (const [x, y] of R.targetPath) ctx.fillRect(toX(x) + ts * 0.4, toY(y) + ts * 0.4, ts * 0.2, ts * 0.2);
    }
    const pulse = 0.6 + Math.sin(R.time * 8) * 0.4;
    ctx.strokeStyle = `rgba(255,211,78,${pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(toX(R.target.x) + 1, toY(R.target.y) + 1, ts - 2, ts - 2);
  } else if (R.hover && lv.seen[idx(R.hover.x, R.hover.y)]) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(toX(R.hover.x) + 0.5, toY(R.hover.y) + 0.5, ts - 1, ts - 1);
  }

  // Виньетка и эффекты экрана
  const grad = ctx.createRadialGradient(R.w / 2, R.h / 2, Math.min(R.w, R.h) * 0.35, R.w / 2, R.h / 2, Math.max(R.w, R.h) * 0.75);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, R.w, R.h);
  if (p.hp < p.maxHp * 0.3 && !g.over) {
    const a = 0.12 + Math.sin(R.time * 5) * 0.08;
    ctx.fillStyle = `rgba(200,30,30,${a})`;
    ctx.fillRect(0, 0, R.w, R.h);
  }
  if (R.bossPulse > 0) {
    ctx.fillStyle = `rgba(160,20,40,${R.bossPulse * 0.4})`;
    ctx.fillRect(0, 0, R.w, R.h);
    R.bossPulse = Math.max(0, R.bossPulse - dt * 0.8);
  }
  if (R.fadeIn > 0) {
    ctx.fillStyle = `rgba(0,0,0,${R.fadeIn})`;
    ctx.fillRect(0, 0, R.w, R.h);
    R.fadeIn = Math.max(0, R.fadeIn - dt * 1.8);
  }
  renderMinimap(g);
}

function drawSprite(ctx, name, x, y, size, alpha = 1, tint, override) {
  const s = getSprite(name, tint, override);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(s, Math.round(x), Math.round(y), Math.round(size), Math.round(size));
  if (alpha !== 1) ctx.globalAlpha /= alpha;
}

// Экранные координаты → клетка карты
function screenToTile(clientX, clientY) {
  const rect = R.canvas.getBoundingClientRect();
  const x = (clientX - rect.left) / R.ts + R.cam.x;
  const y = (clientY - rect.top) / R.ts + R.cam.y;
  return { x: Math.floor(x), y: Math.floor(y) };
}

let _miniFrame = 0;
function renderMinimap(g) {
  if (!R.mini || R.mini.hidden) return;
  if (++_miniFrame % 6) return;
  const c = R.mini, ctx = c.getContext('2d');
  const s = 3;
  if (c.width !== MAP_W * s) { c.width = MAP_W * s; c.height = MAP_H * s; }
  const lv = g.level, th = THEMES[lv.theme];
  ctx.clearRect(0, 0, c.width, c.height);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const i = idx(x, y);
    if (!lv.seen[i]) continue;
    const t = lv.tiles[i];
    let col = null;
    if (t === T.WALL) col = th.wall;
    else if (t === T.STAIRS) col = '#ffd34e';
    else if (t === T.WATER) col = th.water;
    else if (t === T.DOOR || t === T.ODOOR) col = '#a0703a';
    else if (t === T.BARS) col = '#8a8f9e';
    else if (t === T.FOUNTAIN) col = '#4f9fe0';
    else if (t === T.ALTAR) col = '#fff3b0';
    else col = lv.visible[i] ? '#6a6070' : '#3a3440';
    ctx.fillStyle = col;
    ctx.fillRect(x * s, y * s, s, s);
  }
  for (const it of g.items) if (lv.seen[idx(it.x, it.y)]) { ctx.fillStyle = it.kind === 'gold' ? '#ffd34e' : it.kind === 'yarn' ? '#f07fb4' : '#8fd3ff'; ctx.fillRect(it.x * s, it.y * s, s, s); }
  for (const m of g.actors) if (monsterVisible(g, m)) { ctx.fillStyle = MONSTERS[m.type].peaceful ? '#7fe0b0' : '#ff5a4a'; ctx.fillRect(m.x * s, m.y * s, s, s); }
  ctx.fillStyle = '#fff';
  ctx.fillRect(g.player.x * s - 1, g.player.y * s - 1, s + 2, s + 2);
}
