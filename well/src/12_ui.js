// ===== Интерфейс: HUD, окна, управление =====

let G = null;
const UI = { hero: 'vasya', auto: null, targeting: null, modal: null, endTimer: null, saveTurn: 0, longPress: null, lastLog: null };
const SAVE_KEY = 'well-save-v1';
const REC_KEY = 'well-records-v1';
const SET_KEY = 'well-settings-v1';
const ACH_KEY = 'well-achievements-v1';

function loadAch() { try { return JSON.parse(load(ACH_KEY) || '{}'); } catch (e) { return {}; } }

function onAchievement(id) {
  if (!G || G._demo || !ACHIEVEMENTS[id]) return;
  const got = loadAch();
  if (got[id]) return;
  got[id] = Date.now();
  store(ACH_KEY, JSON.stringify(got));
  toast(`Достижение: ${ACHIEVEMENTS[id][0]}`, ACHIEVEMENTS[id][1]);
  playSound('chest');
}

function toast(title, text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<b>${esc(title)}</b><span>${esc(text)}</span>`;
  $('stage').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3800);
}

function showAchievements() {
  const got = loadAch();
  const n = Object.keys(ACHIEVEMENTS).filter((k) => got[k]).length;
  openModal(`<div class="sheet" role="dialog" aria-label="Достижения">
    <header><h2>Достижения</h2><span style="color:var(--dim);font:13px var(--font-display)">${n}/${Object.keys(ACHIEVEMENTS).length}</span><button class="close" aria-label="Закрыть">×</button></header>
    <div class="body"><ul class="ach">${Object.entries(ACHIEVEMENTS).map(([k, [t, d]]) => `<li class="${got[k] ? 'got' : ''}"><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ul></div></div>`);
}

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function store(key, val) { try { if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch (e) { /* хранилище недоступно */ } }
function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

// ---------- Запуск ----------

function boot(hot) {
  initRenderer($('view'), $('mini'));
  const settings = JSON.parse(load(SET_KEY) || '{}');
  AUDIO.on = settings.sound !== false;
  if (HEROES[settings.hero]) UI.hero = settings.hero;
  if (settings.mini === false) $('mini').hidden = true;
  syncSoundBtn();
  bindInput();
  let restored = null;
  if (hot && hot.save) { try { restored = deserializeGame(hot.save); } catch (e) { restored = null; } }
  if (restored) { G = restored; afterAction(true); }
  else {
    // Под титулом виден живой уровень: это демо, оно не сохраняется
    showTitle();
    G = newGame(Date.now() % 100000);
    G._demo = true;
    afterAction(true);
  }
  window.addEventListener('resize', () => { resizeRenderer(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  window.addEventListener('pagehide', saveNow);
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    window.claude.hot.snapshot(() => ({ save: G && !G.over && !G._demo && $('title').hidden ? serializeGame(G) : null }));
  }
  let last = performance.now();
  const frame = (t) => {
    const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
    last = t;
    if (G) {
      consumeFx(G);
      renderFrame(G, dt);
      if ($('title').hidden && !G.over) ambientTick(G.level.theme, t);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function startNewGame(seed) {
  stopAuto();
  cancelTargeting();
  clearTimeout(UI.endTimer);
  G = newGame(seed, UI.hero);
  UI.lastLog = null;
  R.mapKey = '';
  hideTitle();
  closeModal();
  afterAction(true);
  saveNow();
}

function saveNow() {
  if (!G) return;
  if (G._demo) return; // фоновая игра под титулом не сохраняется
  if (G.over) { store(SAVE_KEY, null); return; }
  store(SAVE_KEY, serializeGame(G));
}

// ---------- Действия ----------

function act(fn) {
  if (!G || G.over || !$('modal').hidden || !$('title').hidden) return false;
  audioInit();
  const r = fn();
  afterAction();
  return r;
}

function afterAction(force) {
  if (!G) return;
  renderHUD();
  renderLog();
  if (G.turn - UI.saveTurn >= 15 || force) { UI.saveTurn = G.turn; if ($('title').hidden) saveNow(); }
  if (G.over && !UI.endTimer && !G._demo) {
    stopAuto();
    cancelTargeting();
    store(SAVE_KEY, null);
    addRecord();
    UI.endTimer = setTimeout(() => { UI.endTimer = null; showEnd(); }, G.over.won ? 1800 : 1400);
  }
}

function move(dx, dy) {
  stopAuto();
  if (UI.targeting) { moveTarget(dx, dy); return; }
  if (dx === 0 && dy === 0) { act(() => playerWait(G)); return; }
  act(() => playerMove(G, dx, dy));
}

function doPickup() { stopAuto(); act(() => playerPickup(G)); }
function doDescend() {
  stopAuto();
  const p = G.player;
  if (G.level.stairs && G.level.tiles[idx(p.x, p.y)] !== T.STAIRS && G.level.seen[idx(G.level.stairs.x, G.level.stairs.y)]) {
    startAuto('travel', G.level.stairs, true);
    return;
  }
  act(() => playerDescend(G));
  R.mapKey = '';
  saveNow();
}

// ---------- Автоходьба ----------

function startAuto(kind, target, descendAtEnd) {
  stopAuto();
  if (!G || G.over) return;
  audioInit();
  const seen = new Set(visibleEnemies(G).map((m) => m.id));
  if (kind === 'explore' && visibleEnemies(G).some((m) => m.awake || dist(m, G.player) <= 2)) { msg(G, 'Рядом враг — сначала разберитесь с ним.', 'hint'); renderLog(); return; }
  UI.auto = { kind, target, descendAtEnd, hp: G.player.hp, seen, msgLen: G.messages.length, steps: 0 };
  UI.auto.timer = setInterval(autoTick, 55);
  renderHUD();
}

function stopAuto(text) {
  if (!UI.auto) return;
  clearInterval(UI.auto.timer);
  UI.auto = null;
  if (text && G) { msg(G, text, 'hint'); renderLog(); }
  renderHUD();
}

function autoTick() {
  const a = UI.auto;
  if (!a || !G || G.over || !$('modal').hidden) return stopAuto();
  const enemies = visibleEnemies(G);
  if (enemies.some((m) => !a.seen.has(m.id))) {
    const m = enemies.find((e) => !a.seen.has(e.id));
    return stopAuto(`Впереди: ${MONSTERS[m.type].name}.`);
  }
  if (G.player.hp < a.hp) return stopAuto();
  if (++a.steps > 400) return stopAuto();
  const p = G.player;
  if (a.kind === 'explore') {
    const r = exploreStep(G);
    if (r === 'danger') { afterAction(); return stopAuto('Рядом враг.'); }
    if (r === 'done') {
      const st = G.level.stairs;
      if (st && G.level.seen[idx(st.x, st.y)] && !(p.x === st.x && p.y === st.y)) {
        stopAuto();
        msg(G, 'Здесь всё исследовано. Идём к лестнице.', 'hint');
        startAuto('travel', st);
        return;
      }
      afterAction();
      return stopAuto(st && p.x === st.x && p.y === st.y ? 'Всё исследовано. Вы у лестницы.' : 'Больше исследовать нечего.');
    }
    if (r === 'stuck') { afterAction(); return stopAuto('Дальше не пройти.'); }
  } else {
    const step = travelStep(G, a.target.x, a.target.y);
    if (!step) {
      const there = p.x === a.target.x && p.y === a.target.y;
      const desc = a.descendAtEnd && there;
      stopAuto(there ? null : 'Туда не пройти.');
      if (desc) doDescend();
      return;
    }
    playerMove(G, step[0], step[1]);
  }
  afterAction();
  const fresh = G.messages.slice(a.msgLen);
  a.msgLen = G.messages.length;
  if (fresh.some((m) => ['bad', 'boss', 'shop', 'story'].includes(m.cls))) stopAuto();
}

// ---------- Прицеливание ----------

function startTargeting(item, mode) {
  stopAuto();
  closeModal();
  const t = nearestEnemy(G);
  UI.targeting = { item, mode };
  const p = G.player;
  R.target = t ? { x: t.x, y: t.y } : { x: p.x + 1, y: p.y };
  updateTargetPath();
  renderBanner();
}

function cancelTargeting() {
  UI.targeting = null;
  R.target = null;
  R.targetPath = null;
  renderBanner();
}

function moveTarget(dx, dy) {
  R.target = { x: clamp(R.target.x + dx, 0, MAP_W - 1), y: clamp(R.target.y + dy, 0, MAP_H - 1) };
  updateTargetPath();
  renderBanner();
}

function cycleTarget() {
  const list = G.actors.filter((a) => !MONSTERS[a.type].peaceful && monsterVisible(G, a) && canSee(G, a.x, a.y))
    .sort((a, b) => dist(a, G.player) - dist(b, G.player));
  if (!list.length) return;
  const cur = list.findIndex((a) => a.x === R.target.x && a.y === R.target.y);
  const n = list[(cur + 1) % list.length];
  R.target = { x: n.x, y: n.y };
  updateTargetPath();
  renderBanner();
}

function updateTargetPath() {
  if (!UI.targeting) return;
  const range = UI.targeting.mode === 'zap' ? 9 : 8;
  const stop = !(UI.targeting.mode === 'zap' && UI.targeting.item.type === 'bolt' && isKnown(G, UI.targeting.item));
  R.targetPath = projectilePath(G, R.target.x, R.target.y, range, stop);
}

function fireTarget() {
  const tg = UI.targeting;
  if (!tg) return;
  const { x, y } = R.target;
  if (x === G.player.x && y === G.player.y) { msg(G, 'Нельзя целиться в себя.', 'hint'); renderLog(); return; }
  cancelTargeting();
  if (tg.mode === 'zap') act(() => zapWand(G, tg.item, x, y));
  else act(() => throwItem(G, tg.item, x, y));
}

function quickFire() {
  if (UI.targeting) { fireTarget(); return; }
  const p = G.player;
  const knife = p.inv.find((o) => o.kind === 'knife');
  if (knife) { startTargeting(knife, 'throw'); return; }
  openInventory('throw');
}

// ---------- HUD и журнал ----------

function renderHUD() {
  if (!G) return;
  const p = G.player, th = THEMES[G.level.theme];
  $('depth').innerHTML = `${esc(th.name)} · <b>${G.depth}</b>`;
  $('hpfill').style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
  $('hptext').textContent = `${p.hp} / ${p.maxHp}`;
  $('xpfill').style.width = `${Math.min(100, (p.xp / xpToNext(p.level)) * 100)}%`;
  $('lvl').textContent = p.level;
  const d = playerDamage(G);
  $('dmg').textContent = `${d[0]}–${d[1]}`;
  $('arm').textContent = playerArmor(G);
  $('gold').textContent = p.gold;
  // Статусы
  const s = p.status, chips = [];
  if (s.poison) chips.push(['Отравление ' + s.poison, '#7fd36a']);
  if (s.confused) chips.push(['Помутнение ' + s.confused, '#7fe0b0']);
  if (s.haste) chips.push(['Ускорение ' + s.haste, '#9fe2ff']);
  if (s.regen) chips.push(['Регенерация ' + s.regen, '#ff8fa3']);
  if (G.level.detect) chips.push(['Ясновидение', '#c9b3ff']);
  if (p.str) chips.push(['Сила +' + p.str, '#ffb347']);
  if (G.stats.yarn) chips.push(['Клубки ' + G.stats.yarn + '/9', '#f07fb4']);
  const boss = G.actors.find((a) => a.type === 'dog' && a.awake);
  if (boss) chips.push([`Древний Пёс ${boss.hp}/${boss.maxHp}`, '#ff9ab0']);
  if (UI.auto) chips.push([UI.auto.kind === 'explore' ? 'Исследую…' : 'Иду…', '#ffb347']);
  $('chips').innerHTML = chips.map(([t, c]) => `<span class="chip" style="color:${c}">${esc(t)}</span>`).join('');
  // Кнопки
  const onStairs = G.level.tiles[idx(p.x, p.y)] === T.STAIRS;
  $('act-down').classList.toggle('hot', onStairs);
  const here = itemAt(G, p.x, p.y);
  $('act-pick').classList.toggle('hot', !!here && here.kind !== 'chest');
  $('act-pick').firstChild.textContent = here && here.price ? 'Купить' : 'Взять';
  $('act-explore').classList.toggle('hot', !!UI.auto);
  $('act-explore').firstChild.textContent = UI.auto ? 'Стоп' : 'Разведка';
  const knives = p.inv.find((o) => o.kind === 'knife');
  $('act-fire').firstChild.textContent = UI.targeting ? 'Огонь!' : knives ? `Ножи ×${knives.qty}` : 'Метнуть';
  $('act-fire').classList.toggle('hot', !!UI.targeting);
}

function renderLog() {
  if (!G) return;
  const last = G.messages.slice(-4);
  const newest = G.messages.length;
  const box = $('log');
  const lastTurn = G.messages.length ? G.messages[G.messages.length - 1].turn : 0;
  box.innerHTML = last.map((m) => {
    const fresh = m.turn >= lastTurn - 0;
    return `<p class="${esc(m.cls)} ${fresh ? 'new' : 'old'}">${esc(m.text)}${m.count > 1 ? ` <span style="opacity:.6">×${m.count}</span>` : ''}</p>`;
  }).join('');
  UI.lastLog = newest;
}

function renderBanner() {
  const b = $('banner');
  if (!UI.targeting) { b.hidden = true; return; }
  const a = actorAt(G, R.target.x, R.target.y);
  const what = a && a !== G.player && monsterVisible(G, a) ? MONSTERS[a.type].name : 'клетка';
  const verb = UI.targeting.mode === 'zap' ? 'Взмахнуть' : 'Бросить';
  b.hidden = false;
  b.innerHTML = `${esc(capitalize(itemName(G, UI.targeting.item)))} → ${esc(what)}
    <button id="b-fire">${verb}</button><button class="ghost" id="b-cancel">Отмена</button>`;
  $('b-fire').onclick = fireTarget;
  $('b-cancel').onclick = cancelTargeting;
}

// ---------- Описание клетки ----------

function describeTile(x, y) {
  if (!G || !inBounds(x, y)) return;
  const lv = G.level;
  if (!lv.seen[idx(x, y)]) { msg(G, 'Туда вы ещё не заглядывали.', 'hint'); renderLog(); return; }
  const a = actorAt(G, x, y);
  if (a === G.player) msg(G, `Это вы. Здоровье ${G.player.hp} из ${G.player.maxHp}.`, 'hint');
  else if (a && monsterVisible(G, a)) {
    const d = MONSTERS[a.type];
    if (a.disguised) msg(G, 'Сундук. Выглядит вполне обычно.', 'hint');
    else msg(G, `${capitalize(d.name)}${d.peaceful ? '' : ` (${a.hp}/${a.maxHp})`}${!a.awake && !d.peaceful ? ', спит' : ''}. ${d.desc}`, 'hint');
  } else {
    const it = itemAt(G, x, y);
    const tr = trapAt(G, x, y);
    if (it) msg(G, `${capitalize(itemName(G, it))}${it.price ? ` — ${it.price} мон.` : ''}. ${itemDesc(G, it)}`, 'hint');
    else if (tr && !tr.hidden) msg(G, `Ловушка: ${trapName(tr.type)}.`, 'hint');
    else {
      const names = { [T.WALL]: 'Стена.', [T.FLOOR]: 'Пол.', [T.DOOR]: 'Закрытая дверь.', [T.ODOOR]: 'Открытая дверь.', [T.STAIRS]: 'Лестница вниз.', [T.UPSTAIRS]: 'Сюда вы спустились. Назад пути нет.', [T.WATER]: 'Неглубокая вода.', [T.GRASS]: 'Высокая трава. За ней ничего не видно.', [T.BARS]: 'Решётка клетки.', [T.FOUNTAIN]: 'Фонтан. Можно попить, если не боитесь.', [T.DRY]: 'Высохший фонтан.', [T.ALTAR]: `Алтарь со свечами. За ${altarCost(G)} монет даёт благословение.`, [T.ALTAR_OFF]: 'Погасший алтарь.' };
      msg(G, names[lv.tiles[idx(x, y)]] || 'Что-то непонятное.', 'hint');
    }
  }
  renderLog();
}

// ---------- Окна ----------

function openModal(html, onReady) {
  const m = $('modal');
  m.innerHTML = html;
  m.hidden = false;
  stopAuto();
  const c = m.querySelector('.close');
  if (c) c.onclick = closeModal;
  if (onReady) onReady(m);
}
function closeModal() {
  $('modal').hidden = true;
  $('modal').innerHTML = '';
  UI.modal = null;
}

function spriteURL(name) {
  const c = document.createElement('canvas');
  c.width = 40; c.height = 40;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(getSprite(name), 0, 0, 40, 40);
  return c.toDataURL();
}

const _iconCache = new Map();
function iconURL(g, it) {
  const sprite = itemSprite(g, it), tint = itemTint(g, it);
  const key = sprite + '|' + tint;
  if (_iconCache.has(key)) return _iconCache.get(key);
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(getSprite(sprite, tint), 0, 0, 32, 32);
  const url = c.toDataURL();
  _iconCache.set(key, url);
  return url;
}

// mode: undefined — обычный рюкзак; 'throw' — что бросить; {select, scroll} — выбор цели для свитка
function openInventory(mode, selected) {
  if (!G) return;
  const p = G.player;
  let items = p.inv;
  let title = 'Рюкзак';
  let hint = '';
  if (mode === 'throw') {
    items = p.inv.filter((o) => ['knife', 'potion', 'food', 'wand'].includes(o.kind));
    title = 'Что бросить?';
    hint = items.length ? '' : 'Бросать нечего. Метательные ножи, зелья и сосиски можно найти в подземелье.';
  } else if (mode && mode.select) {
    items = mode.select === 'equip'
      ? p.inv.filter((o) => o.kind === 'weapon' || o.kind === 'armor')
      : p.inv.filter((o) => !isKnown(G, o) && o !== mode.scroll);
    title = mode.select === 'equip' ? 'Что улучшить?' : 'Что опознать?';
    hint = items.length ? '' : 'Подходящих предметов нет.';
  }
  const eq = (it) => (p.weapon === it ? 'в руке' : p.armor === it ? 'надето' : '');
  const list = items.map((it, i) => `
    <li><button data-i="${p.inv.indexOf(it)}" class="${selected === it ? 'sel' : ''}">
      <span class="key">${String.fromCharCode(97 + i)}</span>
      <img src="${iconURL(G, it)}" alt="">
      <span class="nm">${esc(capitalize(itemName(G, it)))}</span>
      <span class="tag">${eq(it)}</span>
    </button></li>`).join('');
  const W = p.weapon ? capitalize(itemName(G, p.weapon)) : 'кулаки';
  const A = p.armor ? capitalize(itemName(G, p.armor)) : 'ничего';
  let detail = '';
  if (selected && !mode) {
    const acts = itemActions(G, selected);
    detail = `<div class="detail"><h3>${esc(capitalize(itemName(G, selected)))}</h3><p>${esc(itemDesc(G, selected))}</p>
      <div class="row">${acts.map(([k, label], i) => `<button class="btn ${i ? 'ghost' : ''}" data-act="${k}">${esc(label)}<small style="opacity:.6"> ${i + 1}</small></button>`).join('')}</div></div>`;
  }
  openModal(`<div class="sheet" role="dialog" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2><span style="color:var(--dim);font:13px var(--font-display)">${p.inv.length}/${INV_SIZE}</span><button class="close" aria-label="Закрыть">×</button></header>
    <div class="body">
      ${!mode ? `<div class="equip-row"><div><small>Оружие</small><b>${esc(W)}</b></div><div><small>Броня</small><b>${esc(A)}</b></div></div>` : ''}
      ${hint ? `<p class="empty">${esc(hint)}</p>` : ''}
      ${items.length ? `<ul class="inv">${list}</ul>` : !hint ? '<p class="empty">Рюкзак пуст.</p>' : ''}
      ${detail}
    </div></div>`, (m) => {
    UI.modal = { kind: 'inv', mode, items, selected };
    m.querySelectorAll('.inv button').forEach((b) => {
      b.onclick = () => pickInvItem(p.inv[Number(b.dataset.i)]);
    });
    m.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => doItemAction(selected, b.dataset.act); });
    const d = m.querySelector('.detail');
    if (d) d.scrollIntoView({ block: 'nearest' });
  });
}

function pickInvItem(it) {
  const mode = UI.modal && UI.modal.mode;
  if (mode === 'throw') {
    if (it.kind === 'wand') startTargeting(it, 'zap');
    else startTargeting(it, 'throw');
    return;
  }
  if (mode && mode.select) {
    const scroll = mode.scroll;
    closeModal();
    act(() => useItem(G, scroll, it));
    return;
  }
  openInventory(undefined, it);
}

function doItemAction(it, action) {
  playSound('click');
  switch (action) {
    case 'equip': closeModal(); act(() => equipItem(G, it)); break;
    case 'unequip': closeModal(); act(() => unequipItem(G, it)); break;
    case 'drop': closeModal(); act(() => dropFromInv(G, it)); break;
    case 'throw': startTargeting(it, 'throw'); break;
    case 'zap': startTargeting(it, 'zap'); break;
    case 'use': {
      closeModal();
      const r = act(() => useItem(G, it));
      if (r && r.select) openInventory({ select: r.select, scroll: it });
      break;
    }
  }
}

function showHelp() {
  openModal(`<div class="sheet help" role="dialog" aria-label="Как играть">
    <header><h2>Как играть</h2><button class="close" aria-label="Закрыть">×</button></header>
    <div class="body">
      <p>Барсик провалился в колодец. На дне, на десятой глубине, его стережёт Древний Пёс. Спускайтесь, собирайте добычу, становитесь сильнее и верните кота домой.</p>
      <dl>
        <dt>Стрелки, WASD, HJKL</dt><dd>Ходить. Идти в монстра — атаковать. Диагонали: Q E Z C или Y U B N.</dd>
        <dt>Тап по клетке</dt><dd>Идти туда. Тап по соседнему врагу — удар. Долгий тап или правый клик — осмотреть.</dd>
        <dt>X</dt><dd>Исследовать уровень автоматически. Остановится, если появится враг.</dd>
        <dt>Пробел или точка</dt><dd>Ждать ход. Заодно ищет ловушки рядом.</dd>
        <dt>G</dt><dd>Взять или купить предмет под ногами.</dd>
        <dt>&gt;</dt><dd>Спуститься по лестнице. Если лестница уже найдена, герой сам к ней дойдёт.</dd>
        <dt>I</dt><dd>Рюкзак. Буквы выбирают предмет, цифры — действие.</dd>
        <dt>F</dt><dd>Метнуть нож. В режиме прицела: Tab — следующая цель, Enter — огонь.</dd>
        <dt>M</dt><dd>Мини-карта.</dd>
      </dl>
      <p>Зелья, свитки и палочки в каждой игре выглядят по-новому. Узнать, что это, можно только попробовав или с помощью свитка опознания. Плохие зелья лучше бросать во врагов.</p>
      <p>Сосиски не только едят. Собаки к ним неравнодушны.</p>
      <p>Игра сохраняется сама. Можно закрыть страницу и вернуться позже.</p>
    </div></div>`);
}

function showMenu() {
  openModal(`<div class="sheet" role="dialog" aria-label="Меню">
    <header><h2>Пауза</h2><button class="close" aria-label="Закрыть">×</button></header>
    <div class="body" style="display:grid;gap:8px;padding-top:14px">
      <button class="btn" id="m-cont">Продолжить</button>
      <button class="btn ghost" id="m-help">Как играть</button>
      <button class="btn ghost" id="m-new">Новая игра</button>
      <p id="m-confirm" hidden style="margin:4px 0 0;color:var(--dim)">Текущий забег пропадёт. Точно? <button class="btn" id="m-yes" style="margin-left:6px">Да, заново</button></p>
      <button class="btn ghost" id="m-title">Главный экран</button>
      <p style="color:var(--dim);font-size:13px;margin:6px 0 0">Сид этого забега: <b style="font-family:var(--font-display);color:var(--ink)">${G ? G.seed : '—'}</b>. Тот же сид — те же уровни.</p>
    </div></div>`, () => {
    $('m-cont').onclick = closeModal;
    $('m-help').onclick = showHelp;
    $('m-new').onclick = () => { $('m-confirm').hidden = false; };
    $('m-yes').onclick = () => startNewGame();
    $('m-title').onclick = () => { saveNow(); closeModal(); showTitle(); };
  });
}

function showEnd() {
  if (!G || !G.over) return;
  const o = G.over, p = G.player;
  const won = o.won;
  const lines = won
    ? ['Барсик спасён!', `Вы выбрались из колодца с котом на руках за ${G.turn} ${plural(G.turn, 'ход', 'хода', 'ходов')}. Барсик делает вид, что так и было задумано.`]
    : ['Конец пути', `Глубина ${o.depth}. Вас одолел: ${o.cause}. Барсик всё ещё ждёт внизу.`];
  openModal(`<div class="sheet" role="dialog" aria-label="${esc(lines[0])}">
    <header><img src="${spriteURL(won ? 'cat' : 'dog')}" alt="" width="40" height="40" style="image-rendering:pixelated"><h2>${esc(lines[0])}</h2></header>
    <div class="body">
      <p style="margin-top:8px">${esc(lines[1])}</p>
      <div class="end-stats">
        <div><small>Очки</small><b style="color:var(--gold)">${o.score}</b></div>
        <div><small>Глубина</small><b>${G.stats.deepest}</b></div>
        <div><small>Уровень героя</small><b>${p.level}</b></div>
        <div><small>Побеждено врагов</small><b>${G.stats.kills}</b></div>
        <div><small>Монеты</small><b>${p.gold}</b></div>
        <div><small>Ходов</small><b>${G.turn}</b></div>
        <div><small>Зелий и свитков</small><b>${(G.stats.potions || 0) + (G.stats.scrolls || 0)}</b></div>
        <div><small>Клубков для Барсика</small><b style="color:#f07fb4">${G.stats.yarn || 0} / 9</b></div>
      </div>
      ${chronicleHTML()}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" id="e-again">Ещё раз</button>
        <button class="btn ghost" id="e-seed">Тот же сид (${G.seed})</button>
        <button class="btn ghost" id="e-title">Главный экран</button>
      </div>
    </div></div>`, () => {
    $('e-again').onclick = () => startNewGame();
    $('e-seed').onclick = () => startNewGame(G.seed);
    $('e-title').onclick = () => { closeModal(); showTitle(); };
  });
}

function showHistory() {
  const items = G.messages.slice(-80).map((m) => `<p class="${esc(m.cls)}" style="margin:0 0 3px">${esc(m.text)}${m.count > 1 ? ` ×${m.count}` : ''}</p>`).join('');
  openModal(`<div class="sheet" role="dialog" aria-label="Журнал">
    <header><h2>Журнал</h2><button class="close" aria-label="Закрыть">×</button></header>
    <div class="body log-full">${items}</div></div>`, (m) => {
    const b = m.querySelector('.body');
    b.scrollTop = b.scrollHeight;
  });
}

function chronicleHTML() {
  const c = (G.chronicle || []).slice(-9);
  if (!c.length) return '';
  return `<h3 style="font:600 14px var(--font-display);color:var(--dim);text-transform:uppercase;letter-spacing:.08em;margin:14px 0 6px">Летопись</h3>
    <ol class="chron">${c.map((e) => `<li><span>гл. ${e.depth}</span>${esc(e.text)}</li>`).join('')}</ol>`;
}

function addRecord() {
  const recs = JSON.parse(load(REC_KEY) || '[]');
  const o = G.over;
  recs.push({ hero: G.hero, score: o.score, won: o.won, depth: G.stats.deepest, cause: o.cause, level: G.player.level, seed: G.seed, date: Date.now() });
  recs.sort((a, b) => b.score - a.score);
  store(REC_KEY, JSON.stringify(recs.slice(0, 8)));
}

// ---------- Титульный экран ----------

function showTitle() {
  stopAuto();
  const t = $('title');
  const save = load(SAVE_KEY);
  const recs = JSON.parse(load(REC_KEY) || '[]');
  t.innerHTML = `
    <canvas id="t-cat" width="40" height="40" aria-hidden="true"></canvas>
    <h1>Кот в колодце</h1>
    <p class="sub">Барсик опять провалился в старый колодец. Внизу десять глубин: подвал, катакомбы, пещеры и логово Древнего Пса. Пошаговый рогалик: каждый спуск новый.</p>
    <div class="heroes" role="radiogroup" aria-label="Герой">
      ${Object.entries(HEROES).map(([id, h]) => `<button role="radio" aria-checked="${UI.hero === id}" data-hero="${id}">
        <img src="${spriteURL(h.sprite)}" alt="" width="40" height="40"><b>${esc(h.name)}</b><small>${esc(h.about)}</small></button>`).join('')}
    </div>
    <p class="hero-about" id="t-about">${esc(HEROES[UI.hero].about)}</p>
    <div class="menu">
      ${save ? '<button class="btn" id="t-cont">Продолжить забег</button>' : ''}
      <button class="btn ${save ? 'ghost' : ''}" id="t-new">Новая игра</button>
      <button class="btn ghost" id="t-daily">Забег дня · ${esc(todayLabel())}</button>
      <button class="btn ghost" id="t-help">Как играть</button>
      <button class="btn ghost" id="t-ach">Достижения · ${Object.keys(loadAch()).filter((k) => ACHIEVEMENTS[k]).length}/${Object.keys(ACHIEVEMENTS).length}</button>
    </div>
    <div class="seed"><label for="t-seed">Сид (необязательно):</label><input id="t-seed" inputmode="numeric" placeholder="случайный"></div>
    ${recs.length ? `<div class="records"><h3>Лучшие забеги</h3><ol>${recs.map((r) => `<li><b>${r.score}</b><span>${r.won ? 'Барсик спасён' : `глубина ${r.depth}, ${esc(r.cause || '')}`}</span><span style="flex:none">${esc((HEROES[r.hero] || HEROES.vasya).name)}, ур ${r.level}</span></li>`).join('')}</ol></div>` : ''}`;
  t.hidden = false;
  if ($('t-cont')) $('t-cont').onclick = () => {
    try { G = deserializeGame(save); R.mapKey = ''; R.anim.clear(); R.cam.init = false; hideTitle(); afterAction(true); }
    catch (e) { store(SAVE_KEY, null); startNewGame(); }
  };
  $('t-new').onclick = () => {
    audioInit();
    const v = $('t-seed').value.trim();
    startNewGame(v && /^\d+$/.test(v) ? Number(v) : undefined);
  };
  $('t-help').onclick = () => showHelp();
  $('t-ach').onclick = () => showAchievements();
  t.querySelectorAll('[data-hero]').forEach((b) => {
    b.onclick = () => {
      UI.hero = b.dataset.hero;
      saveSettings();
      playSound('click');
      t.querySelectorAll('[data-hero]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      $('t-about').textContent = HEROES[UI.hero].about;
    };
  });
  $('t-daily').onclick = () => { audioInit(); startNewGame(dailySeed()); };
  animateTitleCat();
}

// Сид дня одинаков у всех, кто играет в этот день
function dailySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
function todayLabel() {
  const m = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const d = new Date();
  return `${d.getDate()} ${m[d.getMonth()]}`;
}

function hideTitle() { $('title').hidden = true; }

function animateTitleCat() {
  const c = $('t-cat');
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const draw = (t) => {
    if (!document.body.contains(c) || $('title').hidden) return;
    ctx.clearRect(0, 0, 40, 40);
    // Колодец: тёмный круг и каменный обод
    ctx.fillStyle = '#05040a';
    ctx.beginPath(); ctx.ellipse(20, 26, 17, 9, 0, 0, Math.PI * 2); ctx.fill();
    const bob = Math.round(Math.sin(t / 400) * 1.5);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 40, 27); ctx.clip();
    ctx.drawImage(getSprite('cat'), 12, 12 + bob, 16, 16);
    ctx.restore();
    for (let i = 0; i < 12; i++) {
      const a = Math.PI + (i / 11) * Math.PI;
      const x = 20 + Math.cos(a) * 18, y = 26 + Math.sin(a) * 9;
      ctx.fillStyle = i % 2 ? '#6b4a3a' : '#8a6450';
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 1, 4, 3);
    }
    ctx.fillStyle = '#6b4a3a'; ctx.fillRect(2, 26, 36, 4);
    ctx.fillStyle = '#8a6450'; ctx.fillRect(2, 26, 36, 1);
    for (let x = 4; x < 38; x += 6) { ctx.fillStyle = '#4a3026'; ctx.fillRect(x, 27, 1, 3); }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

// ---------- Ввод ----------

const KEYMAP = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0], y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1],
  8: [0, -1], 2: [0, 1], 4: [-1, 0], 6: [1, 0], 7: [-1, -1], 9: [1, -1], 1: [-1, 1], 3: [1, 1],
  Home: [-1, -1], PageUp: [1, -1], End: [-1, 1], PageDown: [1, 1],
};

function onKey(e) {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // Окна
  if (!$('title').hidden) {
    if (e.key === 'Enter' && $('modal').hidden) { const b = $('t-cont') || $('t-new'); if (b) { b.click(); e.preventDefault(); } }
    if (e.key === 'Escape' && !$('modal').hidden) closeModal();
    return;
  }
  if (!$('modal').hidden) {
    if (e.key === 'Escape') { if (UI.modal && UI.modal.selected) openInventory(); else closeModal(); e.preventDefault(); return; }
    if (UI.modal && UI.modal.kind === 'inv') {
      if (/^[a-r]$/.test(key) && !UI.modal.selected) {
        const it = UI.modal.items[key.charCodeAt(0) - 97];
        if (it) pickInvItem(it);
        e.preventDefault();
      } else if (/^[1-9]$/.test(key) && UI.modal.selected) {
        const acts = itemActions(G, UI.modal.selected);
        const a = acts[Number(key) - 1];
        if (a) doItemAction(UI.modal.selected, a[0]);
        e.preventDefault();
      } else if (key === 'i') closeModal();
    }
    return;
  }
  if (UI.targeting) {
    if (e.key === 'Escape') { cancelTargeting(); e.preventDefault(); return; }
    if (e.key === 'Enter' || key === 'f' || key === 't') { fireTarget(); e.preventDefault(); return; }
    if (e.key === 'Tab') { cycleTarget(); e.preventDefault(); return; }
  }
  if (KEYMAP[key] && !(e.shiftKey && key.length === 1 && !/[a-z]/.test(key))) {
    e.preventDefault();
    const [dx, dy] = KEYMAP[key];
    move(dx, dy);
    return;
  }
  switch (key) {
    case ' ': case '.': case '5': case 'Clear': e.preventDefault(); move(0, 0); break;
    case 'g': case ',': doPickup(); break;
    case '>': case 'Enter': doDescend(); break;
    case 'i': stopAuto(); openInventory(); break;
    case 'x': if (UI.auto) stopAuto(); else startAuto('explore'); break;
    case 'f': case 't': quickFire(); break;
    case 'm': toggleMini(); break;
    case '?': case '/': showHelp(); break;
    case 'Escape': if (UI.auto) stopAuto(); else showMenu(); break;
  }
}

function toggleMini() {
  $('mini').hidden = !$('mini').hidden;
  saveSettings();
}

function saveSettings() { store(SET_KEY, JSON.stringify({ sound: AUDIO.on, mini: !$('mini').hidden, hero: UI.hero })); }
function syncSoundBtn() { $('btn-sound').setAttribute('aria-pressed', String(AUDIO.on)); }

function onTapTile(tx, ty) {
  if (!G || G.over) return;
  if (UI.targeting) {
    if (R.target && R.target.x === tx && R.target.y === ty) fireTarget();
    else { R.target = { x: tx, y: ty }; updateTargetPath(); renderBanner(); }
    return;
  }
  const p = G.player;
  const dx = tx - p.x, dy = ty - p.y;
  if (dx === 0 && dy === 0) {
    const it = itemAt(G, p.x, p.y);
    if (it && it.kind !== 'chest') doPickup();
    else if (G.level.tiles[idx(p.x, p.y)] === T.STAIRS) doDescend();
    else move(0, 0);
    return;
  }
  if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) { move(dx, dy); return; }
  if (!inBounds(tx, ty) || !G.level.seen[idx(tx, ty)]) return;
  if (!isPassableTile(G.level.tiles[idx(tx, ty)]) && !actorAt(G, tx, ty) && G.level.tiles[idx(tx, ty)] !== T.FOUNTAIN && G.level.tiles[idx(tx, ty)] !== T.ALTAR) {
    // Тап по стене — идём к ближайшей проходимой клетке рядом
    return;
  }
  startAuto('travel', { x: tx, y: ty });
}

function bindInput() {
  window.addEventListener('keydown', onKey);
  const view = $('view');
  let down = null;
  view.addEventListener('pointerdown', (e) => {
    audioInit();
    down = { x: e.clientX, y: e.clientY, t: performance.now(), long: false };
    clearTimeout(UI.longPress);
    if (e.pointerType !== 'mouse') {
      UI.longPress = setTimeout(() => {
        if (!down) return;
        down.long = true;
        const t = screenToTile(down.x, down.y);
        describeTile(t.x, t.y);
        if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) { /* нет вибрации */ }
      }, 450);
    }
  });
  view.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') R.hover = screenToTile(e.clientX, e.clientY);
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { clearTimeout(UI.longPress); }
  });
  view.addEventListener('pointerleave', () => { R.hover = null; });
  view.addEventListener('pointerup', (e) => {
    clearTimeout(UI.longPress);
    if (!down) return;
    const wasLong = down.long;
    down = null;
    if (wasLong || e.button === 2) return;
    if (!$('modal').hidden || !$('title').hidden) return;
    const t = screenToTile(e.clientX, e.clientY);
    if (UI.auto) { stopAuto(); return; }
    onTapTile(t.x, t.y);
  });
  view.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const t = screenToTile(e.clientX, e.clientY);
    describeTile(t.x, t.y);
  });
  // D-pad с автоповтором при удержании
  document.querySelectorAll('#dpad button').forEach((b) => {
    let rep = null;
    const [dx, dy] = b.dataset.d.split(',').map(Number);
    const fire = () => move(dx, dy);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      audioInit();
      fire();
      clearInterval(rep);
      rep = setTimeout(() => { rep = setInterval(fire, 120); }, 320);
    });
    const stop = () => { clearTimeout(rep); clearInterval(rep); rep = null; };
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointerleave', stop);
    b.addEventListener('pointercancel', stop);
  });
  $('act-explore').onclick = () => { if (UI.auto) stopAuto(); else startAuto('explore'); };
  $('act-pick').onclick = doPickup;
  $('act-down').onclick = doDescend;
  $('act-inv').onclick = () => { stopAuto(); openInventory(); };
  $('act-fire').onclick = quickFire;
  $('act-wait').onclick = () => move(0, 0);
  $('btn-sound').onclick = () => { AUDIO.on = !AUDIO.on; audioInit(); syncSoundBtn(); saveSettings(); };
  $('btn-help').onclick = showHelp;
  $('btn-menu').onclick = showMenu;
  $('mini').onclick = toggleMini;
  $('log').onclick = () => { if (G && $('title').hidden) showHistory(); };
  $('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal') && (!G || !G.over)) closeModal(); });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => resizeRenderer()).observe($('stage'));
}
