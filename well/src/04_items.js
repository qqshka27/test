// ===== Предметы: создание, названия, опознание =====

function setupAppearances(g) {
  const rng = g.rng;
  const looks = rng.shuffle(POTION_LOOKS.map((_, i) => i));
  g.looks = { potion: {}, scroll: {}, wand: {} };
  Object.keys(POTIONS).forEach((k, i) => { g.looks.potion[k] = looks[i]; });
  const usedNames = new Set();
  for (const k of Object.keys(SCROLLS)) {
    let name;
    do {
      const n = rng.int(2, 3);
      const parts = [];
      for (let i = 0; i < n; i++) parts.push(rng.pick(SCROLL_SYLLABLES));
      name = parts.join('').toUpperCase();
      if (rng.chance(0.5)) name += ' ' + rng.pick(SCROLL_SYLLABLES).toUpperCase() + rng.pick(SCROLL_SYLLABLES).toUpperCase();
    } while (usedNames.has(name));
    usedNames.add(name);
    g.looks.scroll[k] = name;
  }
  const mats = rng.shuffle(WAND_LOOKS.slice());
  Object.keys(WANDS).forEach((k, i) => { g.looks.wand[k] = mats[i]; });
  g.known = { potion: {}, scroll: {}, wand: {} };
}

let ITEM_ID = 1;
function makeItem(kind, type, extra = {}) {
  const it = { id: ITEM_ID++, kind, type, qty: 1, ench: 0, ...extra };
  if (kind === 'wand' && it.charges === undefined) it.charges = 0;
  return it;
}

const STACKABLE = new Set(['potion', 'scroll', 'food', 'knife']);

function isKnown(g, it) {
  if (it.price) return true; // торговец честно подписывает товар
  if (it.kind === 'potion' || it.kind === 'scroll' || it.kind === 'wand') return !!g.known[it.kind][it.type];
  return true;
}

function itemName(g, it) {
  const q = it.qty > 1 ? ` ×${it.qty}` : '';
  const e = it.ench ? (it.ench > 0 ? ` +${it.ench}` : ` ${it.ench}`) : '';
  switch (it.kind) {
    case 'weapon': return WEAPONS[it.type].name + e;
    case 'armor': return ARMORS[it.type].name + e;
    case 'potion': {
      if (isKnown(g, it)) return 'зелье ' + POTIONS[it.type].name + q;
      return `${POTION_LOOKS[g.looks.potion[it.type]][0]} зелье` + q;
    }
    case 'scroll': {
      if (isKnown(g, it)) return 'свиток ' + SCROLLS[it.type].name + q;
      return `свиток «${g.looks.scroll[it.type]}»` + q;
    }
    case 'wand': {
      if (isKnown(g, it)) return `палочка ${WANDS[it.type].name} [${it.charges}]`;
      return `${g.looks.wand[it.type]} палочка`;
    }
    case 'food': return FOODS[it.type].name + q;
    case 'knife': return 'метательный нож' + q;
    case 'gold': return `${it.qty} ${plural(it.qty, 'монета', 'монеты', 'монет')}`;
    case 'chest': return 'сундук';
    default: return '???';
  }
}

function itemSprite(g, it) {
  switch (it.kind) {
    case 'weapon': return WEAPONS[it.type].sprite;
    case 'armor': return ARMORS[it.type].sprite;
    case 'potion': return 'potion';
    case 'scroll': return 'scroll';
    case 'wand': return 'wand';
    case 'food': return FOODS[it.type].sprite;
    case 'knife': return 'knife';
    case 'gold': return 'gold';
    case 'chest': return 'chest';
  }
  return 'potion';
}

// Цвет предмета (для зелий — цвет жидкости)
function itemTint(g, it) {
  if (it.kind === 'potion') return POTION_LOOKS[g.looks.potion[it.type]][1];
  return null;
}

function itemDesc(g, it) {
  switch (it.kind) {
    case 'weapon': {
      const w = WEAPONS[it.type];
      return `Урон ${w.dmg[0] + it.ench}–${w.dmg[1] + it.ench}, меткость ${w.accu + it.ench >= 0 ? '+' : ''}${w.accu + it.ench}.`;
    }
    case 'armor': {
      const a = ARMORS[it.type];
      return `Броня ${a.arm + it.ench}${a.eva ? `, уворот ${a.eva}` : ''}.`;
    }
    case 'potion': return isKnown(g, it) ? potionDesc(it.type) : 'Неизвестное зелье. Выпейте, чтобы узнать. Или бросьте во врага.';
    case 'scroll': return isKnown(g, it) ? scrollDesc(it.type) : 'Неизвестный свиток. Прочтите, чтобы узнать.';
    case 'wand': return isKnown(g, it) ? wandDesc(it.type) + ` Зарядов: ${it.charges}.` : 'Неизвестная палочка. Взмахните ею, чтобы узнать.';
    case 'food': return it.type === 'sausage'
      ? `Восстанавливает ${FOODS[it.type].heal} здоровья. Собаки от неё без ума.`
      : `Восстанавливает ${FOODS[it.type].heal} здоровья. Бабушкин рецепт.`;
    case 'knife': return 'Бросьте во врага: урон 2–6.';
    default: return '';
  }
}

function potionDesc(t) {
  return {
    heal: 'Лечит раны и снимает отравление.',
    strength: 'Навсегда прибавляет силы.',
    vision: 'Показывает всех существ и предметы на уровне.',
    haste: 'Вы двигаетесь вдвое быстрее.',
    regen: 'Раны затягиваются прямо на глазах.',
    exp: 'Мгновенно даёт новый уровень.',
    poison: 'Яд. Лучше бросить во врага.',
    confuse: 'Путает мысли. Лучше бросить во врага.',
  }[t];
}
function scrollDesc(t) {
  return {
    teleport: 'Переносит в случайное место уровня.',
    mapping: 'Открывает карту уровня и ловушки.',
    enchant: 'Улучшает оружие или броню на +1.',
    identify: 'Раскрывает свойства предмета.',
    fear: 'Враги в поле зрения в ужасе бегут.',
    fire: 'Огненный взрыв вокруг вас. Вас не задевает.',
    summon: 'Призывает монстров. Зачем такое писать?',
  }[t];
}
function wandDesc(t) {
  return {
    bolt: 'Молния прошивает всех на линии.',
    sleep: 'Усыпляет цель.',
    slow: 'Замедляет цель.',
    dig: 'Прорубает проход сквозь стены.',
    blink: 'Мгновенно переносит вас в выбранном направлении.',
  }[t];
}

// Случайный предмет для глубины
function randomItem(g, depth) {
  const rng = g.rng;
  const kind = rng.weighted([
    ['potion', 30], ['scroll', 24], ['weapon', 8], ['armor', 7], ['wand', 6], ['food', 10], ['knife', 6],
  ]);
  switch (kind) {
    case 'potion': return makeItem('potion', rng.weighted(Object.entries(POTIONS).map(([k, v]) => [k, v.weight])));
    case 'scroll': return makeItem('scroll', rng.weighted(Object.entries(SCROLLS).map(([k, v]) => [k, v.weight])));
    case 'wand': {
      const t = rng.weighted(Object.entries(WANDS).map(([k, v]) => [k, v.weight]));
      return makeItem('wand', t, { charges: rng.int(...WANDS[t].charges) });
    }
    case 'food': return makeItem('food', rng.chance(0.55) ? 'pie' : 'sausage');
    case 'knife': return makeItem('knife', 'knife', { qty: rng.int(3, 6) });
    case 'weapon':
    case 'armor': {
      const table = kind === 'weapon' ? WEAPONS : ARMORS;
      const opts = Object.entries(table).filter(([, v]) => v.depth <= depth + 1).map(([k, v]) => [k, 1 + v.depth]);
      const t = rng.weighted(opts);
      let ench = 0;
      if (depth >= 3 && rng.chance(0.25)) ench = 1;
      if (depth >= 6 && rng.chance(0.2)) ench++;
      return makeItem(kind, t, { ench });
    }
  }
}

function itemPrice(g, it) {
  let base = 20;
  switch (it.kind) {
    case 'weapon': base = WEAPONS[it.type].price + it.ench * 40; break;
    case 'armor': base = ARMORS[it.type].price + it.ench * 40; break;
    case 'potion': base = POTIONS[it.type].price; break;
    case 'scroll': base = SCROLLS[it.type].price; break;
    case 'wand': base = WANDS[it.type].price; break;
    case 'food': base = FOODS[it.type].price; break;
    case 'knife': base = 6 * it.qty; break;
  }
  return Math.round(base * (1 + g.depth * 0.06));
}
