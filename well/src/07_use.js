// ===== Использование предметов =====

// Что можно сделать с предметом (для меню инвентаря)
function itemActions(g, it) {
  const p = g.player;
  const acts = [];
  switch (it.kind) {
    case 'weapon': acts.push(p.weapon === it ? ['unequip', 'Снять'] : ['equip', 'Взять в руку']); break;
    case 'armor': acts.push(p.armor === it ? ['unequip', 'Снять'] : ['equip', 'Надеть']); break;
    case 'potion': acts.push(['use', 'Выпить'], ['throw', 'Бросить']); break;
    case 'scroll': acts.push(['use', 'Прочесть']); break;
    case 'food': acts.push(['use', 'Съесть'], ['throw', 'Бросить']); break;
    case 'wand': acts.push(['zap', 'Взмахнуть']); break;
    case 'knife': acts.push(['throw', 'Метнуть']); break;
  }
  acts.push(['drop', 'Выбросить']);
  return acts;
}

function identify(g, kind, type, silent) {
  if (!g.known[kind] || g.known[kind][type]) return;
  g.known[kind][type] = true;
  if (!silent) {
    const names = { potion: 'Это было зелье ' + (POTIONS[type] || {}).name, scroll: 'Это был свиток ' + (SCROLLS[type] || {}).name, wand: 'Это палочка ' + (WANDS[type] || {}).name };
    msg(g, names[kind] + '.', 'ident');
  }
}

function equipItem(g, it) {
  const p = g.player;
  if (it.kind === 'weapon') { p.weapon = it; msg(g, `Вы берёте в руку: ${itemName(g, it)}.`, 'info'); }
  else if (it.kind === 'armor') { p.armor = it; msg(g, `Вы надеваете: ${itemName(g, it)}.`, 'info'); }
  fx(g, { type: 'sound', name: 'equip' });
  return endTurn(g);
}

function unequipItem(g, it) {
  const p = g.player;
  if (p.weapon === it) p.weapon = null;
  if (p.armor === it) p.armor = null;
  msg(g, `Вы снимаете: ${itemName(g, it)}.`, 'info');
  return endTurn(g);
}

function dropFromInv(g, it) {
  const p = g.player;
  const wasEq = p.weapon === it || p.armor === it;
  p.inv = p.inv.filter((o) => o !== it);
  if (p.weapon === it) p.weapon = null;
  if (p.armor === it) p.armor = null;
  it.dropped = true; // чтобы не подбирать обратно на автомате
  dropItem(g, it, p.x, p.y);
  msg(g, `Вы выбрасываете: ${itemName(g, it)}${wasEq ? ' (было экипировано)' : ''}.`, 'info');
  return endTurn(g);
}

// Выпить/прочесть/съесть. Для свитков, требующих выбора, вернёт {select: фильтр}
function useItem(g, it, chosen) {
  if (g.over) return false;
  const p = g.player;
  if (it.kind === 'potion') {
    removeOne(g, it);
    g.stats.potions++;
    drinkPotion(g, it.type);
    return endTurn(g);
  }
  if (it.kind === 'food') {
    removeOne(g, it);
    const f = FOODS[it.type];
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + (g.hero === 'granny' && it.type === 'pie' ? f.heal * 2 : f.heal));
    msg(g, it.type === 'pie' ? `Вы съедаете пирожок. Как у бабушки! (+${p.hp - before})` : `Вы съедаете сосиску. Вкусно, хоть и холодная. (+${p.hp - before})`, 'good');
    fx(g, { type: 'float', x: p.x, y: p.y, text: `+${p.hp - before}`, color: '#7cd36a' });
    fx(g, { type: 'sound', name: 'eat' });
    return endTurn(g);
  }
  if (it.kind === 'scroll') {
    const def = SCROLLS[it.type];
    if (p.status.confused) {
      msg(g, 'Буквы пляшут перед глазами. Не получается прочесть.', 'info');
      return false;
    }
    if (def.needsItem && isKnown(g, it) && !chosen) {
      return { select: def.needsItem };
    }
    removeOne(g, it);
    g.stats.scrolls++;
    readScroll(g, it.type, chosen);
    return endTurn(g);
  }
  return false;
}

function drinkPotion(g, type) {
  const p = g.player;
  identify(g, 'potion', type, true);
  fx(g, { type: 'sound', name: 'drink' });
  switch (type) {
    case 'heal': {
      const amount = Math.max(12, Math.round(p.maxHp * 0.6));
      const before = p.hp;
      if (p.hp >= p.maxHp) { p.maxHp += 2; }
      p.hp = Math.min(p.maxHp, p.hp + amount);
      p.status.poison = 0; p.status.confused = 0;
      msg(g, `Зелье лечения. Тепло разливается по телу. (+${p.hp - before})`, 'good');
      fx(g, { type: 'particles', x: p.x, y: p.y, color: '#ff8fa3', n: 14 });
      break;
    }
    case 'strength':
      p.str++;
      msg(g, 'Зелье силы! Мышцы наливаются мощью. Сила +1.', 'good');
      fx(g, { type: 'particles', x: p.x, y: p.y, color: '#ffb347', n: 14 });
      break;
    case 'vision':
      g.level.detect = true;
      for (const it of g.items) g.level.seen[idx(it.x, it.y)] = 1;
      msg(g, 'Зелье ясновидения. Вы чувствуете всех на этом уровне.', 'good');
      break;
    case 'haste':
      p.status.haste = 15;
      msg(g, 'Зелье ускорения! Мир вокруг замедлился.', 'good');
      break;
    case 'regen':
      p.status.regen = 25;
      msg(g, 'Зелье регенерации. Раны начинают затягиваться.', 'good');
      break;
    case 'exp':
      msg(g, 'Зелье опыта! В голове проясняется.', 'good');
      gainXP(g, xpToNext(p.level) - p.xp);
      break;
    case 'poison':
      p.status.poison = (p.status.poison || 0) + 7;
      msg(g, 'Фу! Это был яд.', 'bad');
      break;
    case 'confuse':
      p.status.confused = (p.status.confused || 0) + 7;
      msg(g, 'Зелье помутнения. Стены почему-то шатаются.', 'bad');
      break;
  }
}

function readScroll(g, type, chosen) {
  const p = g.player;
  identify(g, 'scroll', type, true);
  fx(g, { type: 'sound', name: 'scroll' });
  switch (type) {
    case 'teleport':
      msg(g, 'Свиток телепортации.', 'ident');
      teleportPlayer(g);
      break;
    case 'mapping': {
      const lv = g.level;
      for (let i = 0; i < lv.tiles.length; i++) {
        if (lv.tiles[i] !== T.WALL) lv.seen[i] = 1;
        else {
          const x = i % MAP_W, y = (i / MAP_W) | 0;
          for (const [dx, dy] of DIRS8) {
            if (inBounds(x + dx, y + dy) && lv.tiles[idx(x + dx, y + dy)] !== T.WALL) { lv.seen[i] = 1; break; }
          }
        }
      }
      for (const t of g.traps) t.hidden = false;
      msg(g, 'Свиток карты. Перед глазами встаёт весь уровень.', 'good');
      break;
    }
    case 'enchant': {
      let target = chosen;
      if (!target) target = p.weapon && (!p.armor || p.weapon.ench <= p.armor.ench) ? p.weapon : p.armor;
      if (!target) { msg(g, 'Свиток улучшения светится и гаснет: улучшать нечего.', 'info'); break; }
      target.ench++;
      msg(g, `Свиток улучшения! ${capitalize(itemName(g, target))} мягко светится.`, 'good');
      fx(g, { type: 'particles', x: p.x, y: p.y, color: '#8fd3ff', n: 16 });
      break;
    }
    case 'identify': {
      let target = chosen;
      if (!target) target = p.inv.find((o) => !isKnown(g, o));
      if (!target) { msg(g, 'Свиток опознания. Но вы и так всё знаете.', 'info'); break; }
      identify(g, target.kind, target.type, true);
      msg(g, `Свиток опознания: это ${itemName(g, target)}.`, 'ident');
      break;
    }
    case 'fear': {
      let n = 0;
      for (const a of g.actors) {
        if (MONSTERS[a.type].peaceful || !canSee(g, a.x, a.y)) continue;
        a.status.fear = MONSTERS[a.type].boss ? 4 : 12;
        a.awake = true; n++;
      }
      msg(g, n ? 'Свиток ужаса. Враги в панике разбегаются!' : 'Свиток ужаса. Бояться тут некому.', 'good');
      fx(g, { type: 'shake', power: 2 });
      break;
    }
    case 'fire': {
      msg(g, 'Свиток огня! Вокруг вас взрывается пламя.', 'good');
      fx(g, { type: 'explosion', x: p.x, y: p.y, r: 2 });
      fx(g, { type: 'sound', name: 'boom' });
      fx(g, { type: 'shake', power: 5 });
      for (const a of g.actors.slice()) {
        if (MONSTERS[a.type].peaceful) continue;
        if (dist(a, p) <= 2) {
          wake(g, a);
          damage(g, a, g.rng.int(6, 12) + g.depth, g.player);
        }
      }
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = p.x + dx, y = p.y + dy;
        if (inBounds(x, y) && g.level.tiles[idx(x, y)] === T.GRASS) g.level.tiles[idx(x, y)] = T.FLOOR;
      }
      break;
    }
    case 'summon': {
      msg(g, 'Свиток призыва. Ой. Вокруг вас появляются монстры!', 'bad');
      const n = g.rng.int(2, 3);
      let made = 0;
      for (const [dx, dy] of g.rng.shuffle(DIRS8.slice())) {
        const x = p.x + dx, y = p.y + dy;
        if (made < n && g.level.tiles[idx(x, y)] === T.FLOOR && !occupied(g, x, y)) {
          spawnMonster(g, pickMonsterType(g, Math.min(g.depth, MAX_DEPTH - 1)), x, y, { awake: true });
          fx(g, { type: 'particles', x, y, color: '#ff6b5e', n: 10 });
          made++;
        }
      }
      break;
    }
  }
}

// Траектория броска/луча: клетки от героя к цели до первого препятствия
function projectilePath(g, tx, ty, range, stopAtActor = true) {
  const p = g.player;
  if (tx === p.x && ty === p.y) return [];
  // Продлеваем линию за цель до дальности
  const dx = tx - p.x, dy = ty - p.y;
  const len = Math.max(Math.abs(dx), Math.abs(dy));
  const ex = p.x + Math.round(dx * range / len), ey = p.y + Math.round(dy * range / len);
  const pts = lineBetween(p.x, p.y, ex, ey).slice(1);
  const out = [];
  for (const [x, y] of pts) {
    if (!inBounds(x, y)) break;
    const t = g.level.tiles[idx(x, y)];
    if (t === T.WALL || t === T.DOOR || t === T.BARS) break;
    out.push([x, y]);
    if (out.length >= range) break;
    if (stopAtActor) {
      const a = actorAt(g, x, y);
      if (a && a !== p && !MONSTERS[a.type].peaceful) break;
    }
  }
  return out;
}

function throwItem(g, it, tx, ty) {
  if (g.over) return false;
  const one = removeOne(g, it);
  const path = projectilePath(g, tx, ty, 8);
  if (!path.length) {
    if (one !== it) it.qty++; else addToInventory(g, one);
    msg(g, 'Туда не бросить: мешает стена.', 'info');
    return false;
  }
  const [lx, ly] = path[path.length - 1];
  const target = actorAt(g, lx, ly);
  fx(g, { type: 'projectile', pts: path, sprite: itemSprite(g, one), tint: itemTint(g, one) });
  const hitMonster = target && target !== g.player && !MONSTERS[target.type].peaceful ? target : null;
  if (one.kind === 'knife') {
    if (hitMonster) {
      if (hitMonster.disguised) revealMimic(g, hitMonster);
      attack(g, g.player, hitMonster, { ranged: true, dmg: [2 + g.player.str, 6 + g.player.str] });
    }
    // Нож падает рядом, его можно подобрать снова
    if (g.rng.chance(0.8)) dropItem(g, one, lx, ly);
    else msg(g, 'Нож ломается.', 'info');
  } else if (one.kind === 'potion') {
    msg(g, 'Склянка разбивается!', 'info');
    fx(g, { type: 'particles', x: lx, y: ly, color: itemTint(g, one), n: 16 });
    fx(g, { type: 'sound', name: 'glass' });
    if (hitMonster) {
      const name = MONSTERS[hitMonster.type].name;
      wake(g, hitMonster);
      if (one.type === 'poison') { hitMonster.status.poison = 8; msg(g, `Яд обжигает ${MONSTERS[hitMonster.type].acc}!`, 'good'); identify(g, 'potion', 'poison'); }
      else if (one.type === 'confuse') { hitMonster.status.confused = 8; msg(g, `${capitalize(name)} растерянно озирается.`, 'good'); identify(g, 'potion', 'confuse'); }
      else if (one.type === 'heal') { hitMonster.hp = hitMonster.maxHp; msg(g, `${capitalize(name)} выглядит отдохнувшим. Зря.`, 'bad'); identify(g, 'potion', 'heal'); }
      else if (one.type === 'haste') { hitMonster.status.haste = 10; msg(g, `${capitalize(name)} ускоряется!`, 'bad'); identify(g, 'potion', 'haste'); }
    }
  } else if (one.kind === 'food') {
    if (hitMonster && MONSTERS[hitMonster.type].dog && one.type === 'sausage') {
      if (hitMonster.type === 'puppy') {
        g.actors = g.actors.filter((a) => a !== hitMonster);
        msg(g, 'Щенок хватает сосиску и радостно убегает. Минус один.', 'good');
      } else {
        hitMonster.status.distracted = 5;
        achieve(g, 'sausage');
        msg(g, 'Древний Пёс забывает обо всём и жуёт сосиску!', 'good');
      }
      fx(g, { type: 'particles', x: lx, y: ly, color: '#e07a5f', n: 10 });
    } else {
      dropItem(g, one, lx, ly);
      if (hitMonster) msg(g, `${capitalize(MONSTERS[hitMonster.type].name)} не обращает внимания на еду.`, 'info');
    }
  } else {
    dropItem(g, one, lx, ly);
  }
  fx(g, { type: 'sound', name: 'throw' });
  return endTurn(g);
}

function zapWand(g, it, tx, ty) {
  if (g.over) return false;
  const p = g.player;
  if (it.charges <= 0) {
    msg(g, 'Палочка трещит, но ничего не происходит. Заряды кончились.', 'info');
    identify(g, 'wand', it.type, true);
    return endTurn(g);
  }
  it.charges--;
  const wasKnown = isKnown(g, it);
  identify(g, 'wand', it.type, true);
  fx(g, { type: 'sound', name: 'zap' });
  switch (it.type) {
    case 'bolt': {
      const path = projectilePath(g, tx, ty, 9, false);
      fx(g, { type: 'bolt', pts: path, color: '#9fe2ff' });
      msg(g, 'С палочки срывается молния!', wasKnown ? 'info' : 'ident');
      for (const [x, y] of path) {
        const a = actorAt(g, x, y);
        if (a && a !== p && !MONSTERS[a.type].peaceful) {
          if (a.disguised) revealMimic(g, a);
          wake(g, a);
          damage(g, a, g.rng.int(6, 13) + Math.floor(g.depth / 2), p);
        }
      }
      break;
    }
    case 'sleep':
    case 'slow': {
      const path = projectilePath(g, tx, ty, 9);
      fx(g, { type: 'bolt', pts: path, color: it.type === 'sleep' ? '#c9b3ff' : '#7fe0b0', thin: true });
      const last = path[path.length - 1];
      const a = last && actorAt(g, last[0], last[1]);
      if (a && a !== p && !MONSTERS[a.type].peaceful) {
        const name = capitalize(MONSTERS[a.type].name);
        if (it.type === 'sleep') {
          a.status.sleep = MONSTERS[a.type].boss ? 3 : 12;
          msg(g, `${name} засыпает.`, 'good');
        } else {
          a.status.slow = MONSTERS[a.type].boss ? 6 : 20;
          msg(g, `${name} заметно замедляется.`, 'good');
        }
      } else msg(g, 'Луч уходит в пустоту.', 'info');
      if (!wasKnown) msg(g, `Это палочка ${WANDS[it.type].name}.`, 'ident');
      break;
    }
    case 'dig': {
      const len = Math.max(Math.abs(tx - p.x), Math.abs(ty - p.y)) || 1;
      const pts = lineBetween(p.x, p.y, p.x + Math.round((tx - p.x) * 8 / len), p.y + Math.round((ty - p.y) * 8 / len)).slice(1);
      let dug = 0;
      for (const [x, y] of pts) {
        if (x <= 0 || y <= 0 || x >= MAP_W - 1 || y >= MAP_H - 1) break;
        const t = g.level.tiles[idx(x, y)];
        if (t === T.BARS) break;
        if (t === T.WALL || t === T.DOOR) { g.level.tiles[idx(x, y)] = T.FLOOR; dug++; }
      }
      fx(g, { type: 'bolt', pts, color: '#d9a066', thin: true });
      fx(g, { type: 'shake', power: 3 });
      if (dug) achieve(g, 'mole');
      msg(g, dug ? 'Камень рассыпается в пыль, открывая проход.' : 'Луч копания ничего не задевает.', wasKnown ? 'info' : 'ident');
      if (!wasKnown) msg(g, 'Это палочка копания.', 'ident');
      break;
    }
    case 'blink': {
      const path = projectilePath(g, tx, ty, 7);
      let dest = null;
      for (const [x, y] of path) {
        if (occupied(g, x, y)) break;
        dest = [x, y];
      }
      if (dest) {
        fx(g, { type: 'particles', x: p.x, y: p.y, color: '#a98bff', n: 12 });
        p.x = dest[0]; p.y = dest[1];
        fx(g, { type: 'teleport', id: 0 });
        fx(g, { type: 'particles', x: p.x, y: p.y, color: '#a98bff', n: 12 });
        msg(g, 'Вы мгновенно переноситесь вперёд!', wasKnown ? 'info' : 'ident');
        const trap = trapAt(g, p.x, p.y);
        if (trap) triggerTrap(g, trap);
      } else msg(g, 'Некуда перенестись.', 'info');
      if (!wasKnown) msg(g, 'Это палочка скачка.', 'ident');
      break;
    }
  }
  return endTurn(g);
}

// Ближайший видимый враг (для автоприцела)
function nearestEnemy(g) {
  let best = null, bd = 99;
  for (const a of g.actors) {
    if (MONSTERS[a.type].peaceful || !monsterVisible(g, a) || !canSee(g, a.x, a.y)) continue;
    const d = dist(a, g.player);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
