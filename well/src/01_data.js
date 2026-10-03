// ===== Данные: монстры, предметы, темы уровней =====

// acc — меткость, eva — уворот, arm — броня, speed — 100 = как у героя
const MONSTERS = {
  rat: {
    name: 'крыса', acc: 'крысу', sprite: 'rat', hp: 5, dmg: [1, 3], accu: 8, eva: 3, arm: 0,
    speed: 100, xp: 2, depth: [1, 3], weight: 10, ai: 'melee', verb: 'кусает',
    desc: 'Подвальная крыса. Наглая и вечно голодная.',
  },
  bat: {
    name: 'летучая мышь', acc: 'летучую мышь', sprite: 'bat', hp: 4, dmg: [1, 3], accu: 9, eva: 7, arm: 0,
    speed: 200, xp: 3, depth: [1, 4], weight: 7, ai: 'erratic', verb: 'кусает',
    desc: 'Мечется туда-сюда. Попасть по ней непросто.',
  },
  slime: {
    name: 'слизь', acc: 'слизь', sprite: 'slime', hp: 12, dmg: [1, 4], accu: 7, eva: 0, arm: 0,
    speed: 50, xp: 4, depth: [2, 5], weight: 6, ai: 'melee', verb: 'обволакивает', splits: true,
    desc: 'Медленная и липкая. От удара делится надвое.', death: 'растекается лужей',
  },
  goblin: {
    name: 'гоблин-воришка', acc: 'гоблина-воришку', sprite: 'goblin', hp: 9, dmg: [2, 4], accu: 9, eva: 5, arm: 0,
    speed: 120, xp: 6, depth: [2, 6], weight: 6, ai: 'thief', verb: 'бьёт',
    desc: 'Мечтает о ваших монетах. Схватит и сбежит.',
  },
  kobold: {
    name: 'кобольд', acc: 'кобольда', sprite: 'kobold', hp: 10, dmg: [2, 5], accu: 9, eva: 3, arm: 1,
    speed: 100, xp: 5, depth: [2, 5], weight: 8, ai: 'melee', verb: 'колет копьём',
    desc: 'Мелкий, злобный, с копьём наперевес.',
  },
  skeleton: {
    name: 'скелет', acc: 'скелета', sprite: 'skeleton', hp: 16, dmg: [3, 6], accu: 10, eva: 3, arm: 2,
    speed: 100, xp: 9, depth: [3, 8], weight: 8, ai: 'melee', verb: 'рубит', death: 'рассыпается грудой костей',
    desc: 'Гремит костями. Не устаёт и не боится.', undead: true,
  },
  archer: {
    name: 'скелет-лучник', acc: 'скелета-лучника', sprite: 'archer', hp: 12, dmg: [2, 5], accu: 10, eva: 4, arm: 1,
    speed: 100, xp: 10, depth: [4, 8], weight: 5, ai: 'ranged', range: 6, verb: 'стреляет в', death: 'рассыпается грудой костей',
    desc: 'Держится на расстоянии и стреляет из лука.', undead: true,
  },
  spider: {
    name: 'паук', acc: 'паука', sprite: 'spider', hp: 14, dmg: [2, 5], accu: 11, eva: 5, arm: 1,
    speed: 120, xp: 11, depth: [5, 9], weight: 6, ai: 'melee', verb: 'кусает', poison: 0.35,
    desc: 'Ядовитый укус. Лучше не затягивать бой.',
  },
  mimic: {
    name: 'мимик', acc: 'мимика', sprite: 'mimic', hp: 25, dmg: [4, 8], accu: 12, eva: 2, arm: 3,
    speed: 100, xp: 15, depth: [4, 10], weight: 0, ai: 'mimic', verb: 'кусает',
    desc: 'Сундук с зубами. Классика.',
  },
  ghost: {
    name: 'призрак', acc: 'призрака', sprite: 'ghost', hp: 15, dmg: [3, 6], accu: 11, eva: 10, arm: 0,
    speed: 100, xp: 13, depth: [5, 10], weight: 5, ai: 'ghost', verb: 'касается', phase: true,
    desc: 'Проходит сквозь стены. Холодное прикосновение.', death: 'развеивается', undead: true,
  },
  ogre: {
    name: 'огр', acc: 'огра', sprite: 'ogre', hp: 34, dmg: [5, 11], accu: 11, eva: 1, arm: 2,
    speed: 80, xp: 20, depth: [6, 10], weight: 5, ai: 'melee', verb: 'бьёт дубиной',
    desc: 'Огромный и неторопливый. Бьёт очень больно.',
  },
  shade: {
    name: 'тень', acc: 'тень', sprite: 'shade', hp: 22, dmg: [4, 9], accu: 13, eva: 8, arm: 0,
    speed: 110, xp: 22, depth: [8, 10], weight: 4, ai: 'melee', verb: 'режет', stealth: true,
    desc: 'Видна только вблизи. Не стойте в темноте.', death: 'рассеивается',
  },
  necro: {
    name: 'некромант', acc: 'некроманта', sprite: 'necro', hp: 20, dmg: [2, 4], accu: 9, eva: 4, arm: 1,
    speed: 100, xp: 25, depth: [7, 10], weight: 3, ai: 'caster', verb: 'бьёт посохом',
    desc: 'Поднимает скелетов. Убейте его первым.',
  },
  puppy: {
    name: 'щенок', acc: 'щенка', sprite: 'puppy', hp: 6, dmg: [1, 3], accu: 9, eva: 5, arm: 0,
    speed: 150, xp: 2, depth: [99, 99], weight: 0, ai: 'melee', verb: 'кусает за пятку', dog: true,
    desc: 'Тяв! Маленький, но зубастый.', death: 'убегает, поджав хвост',
  },
  dog: {
    name: 'Древний Пёс', acc: 'Древнего Пса', sprite: 'dog', hp: 170, dmg: [7, 13], accu: 15, eva: 4, arm: 3,
    speed: 100, xp: 0, depth: [99, 99], weight: 0, ai: 'boss', verb: 'кусает', boss: true, dog: true,
    desc: 'Сторож Барсика. Огромный, лохматый, очень обиженный на всех котов.',
  },
  merchant: {
    name: 'торговец', acc: 'торговца', sprite: 'merchant', hp: 999, dmg: [0, 0], accu: 0, eva: 0, arm: 0,
    speed: 100, xp: 0, depth: [99, 99], weight: 0, ai: 'merchant', verb: '', peaceful: true,
    desc: 'Продаёт всякое. Как он сюда попал, лучше не спрашивать.',
  },
  cat: {
    name: 'Барсик', acc: 'Барсика', sprite: 'cat', hp: 999, dmg: [0, 0], accu: 0, eva: 0, arm: 0,
    speed: 100, xp: 0, depth: [99, 99], weight: 0, ai: 'cat', verb: '', peaceful: true,
    desc: 'Ваш кот. Рыжий, толстый и совершенно не раскаивается.',
  },
};

const WEAPONS = {
  dagger:  { name: 'кинжал', sprite: 'dagger', dmg: [2, 4], accu: 2, depth: 1, price: 20 },
  sword:   { name: 'короткий меч', sprite: 'sword', dmg: [3, 6], accu: 1, depth: 2, price: 45 },
  axe:     { name: 'топор', sprite: 'axe', dmg: [4, 8], accu: -1, depth: 3, price: 70 },
  mace:    { name: 'булава', sprite: 'mace', dmg: [5, 9], accu: 0, depth: 5, price: 100 },
  longsword: { name: 'длинный меч', sprite: 'longsword', dmg: [6, 11], accu: 1, depth: 6, price: 140 },
  hammer:  { name: 'боевой молот', sprite: 'hammer', dmg: [7, 14], accu: -2, depth: 8, price: 180 },
  // Стартовое оружие героев, в подземелье не встречается
  rollingpin: { name: 'скалка', sprite: 'rollingpin', dmg: [2, 5], accu: 1, depth: 99, price: 15 },
  broom:   { name: 'метла', sprite: 'broom', dmg: [1, 4], accu: 2, depth: 99, price: 15, sweep: true },
};

const ARMORS = {
  leather: { name: 'кожаная куртка', sprite: 'leather', arm: 1, eva: 0, depth: 1, price: 20 },
  studded: { name: 'клёпаная куртка', sprite: 'studded', arm: 2, eva: 0, depth: 2, price: 45 },
  chain:   { name: 'кольчуга', sprite: 'chain', arm: 3, eva: -1, depth: 4, price: 80 },
  scale:   { name: 'чешуйчатый доспех', sprite: 'scale', arm: 4, eva: -1, depth: 6, price: 120 },
  plate:   { name: 'латы', sprite: 'plate', arm: 6, eva: -3, depth: 8, price: 170 },
  shawl:   { name: 'пуховый платок', sprite: 'shawl', arm: 1, eva: 1, depth: 99, price: 20 },
  quilted: { name: 'телогрейка', sprite: 'quilted', arm: 2, eva: 0, depth: 99, price: 30 },
};

// Герои на выбор
const HEROES = {
  vasya: {
    name: 'Вася', sprite: 'player', hp: 24,
    about: 'Внук. Кинжал и кожаная куртка. Молодой, учится на четверть быстрее.',
    intro: 'Бабушка послала Васю за Барсиком. Опять.',
  },
  granny: {
    name: 'Бабушка', sprite: 'granny', hp: 20,
    about: 'Скалка и платок. Пирожки лечат вдвое лучше, раны заживают быстрее.',
    intro: 'Барсик — мой кот. Мне за ним и лезть, — сказала бабушка и взяла скалку.',
  },
  janitor: {
    name: 'Дворник', sprite: 'janitor', hp: 28,
    about: 'Метла бьёт всех врагов вокруг. Телогрейка и связка ножей.',
    intro: 'Кто ж ещё полезет в колодец, кроме дворника, — вздохнул Михалыч.',
  },
};

// Зелья и свитки выглядят по-разному в каждой игре, пока их не опознаешь
const POTIONS = {
  heal:     { name: 'лечения', weight: 24, good: true, price: 30 },
  strength: { name: 'силы', weight: 6, good: true, price: 90 },
  vision:   { name: 'ясновидения', weight: 10, good: true, price: 35 },
  haste:    { name: 'ускорения', weight: 10, good: true, price: 40 },
  regen:    { name: 'регенерации', weight: 10, good: true, price: 40 },
  exp:      { name: 'опыта', weight: 4, good: true, price: 100 },
  poison:   { name: 'яда', weight: 10, good: false, price: 15 },
  confuse:  { name: 'помутнения', weight: 9, good: false, price: 15 },
};
const POTION_LOOKS = [
  ['мутное', '#8a8f6a'], ['алое', '#d8433c'], ['лазурное', '#3f8fe0'], ['изумрудное', '#3fbf6a'],
  ['янтарное', '#e0a43a'], ['фиолетовое', '#9a5ad6'], ['чёрное', '#3b3442'], ['розовое', '#f07fb4'],
  ['искрящееся', '#e8e8f8'], ['бурое', '#8a5a34'],
];

const SCROLLS = {
  teleport: { name: 'телепортации', weight: 12, price: 30 },
  mapping:  { name: 'карты', weight: 12, price: 35 },
  enchant:  { name: 'улучшения', weight: 14, price: 60, needsItem: 'equip' },
  identify: { name: 'опознания', weight: 14, price: 25, needsItem: 'unknown' },
  fear:     { name: 'ужаса', weight: 8, price: 35 },
  fire:     { name: 'огня', weight: 8, price: 40 },
  summon:   { name: 'призыва', weight: 6, price: 10 },
};
const SCROLL_SYLLABLES = ['зур', 'бал', 'ок', 'тиш', 'мра', 'вел', 'кон', 'дым', 'ыр', 'хаш', 'пло', 'нэк', 'ра', 'жул', 'фен', 'ус', 'гро', 'ми'];

const WANDS = {
  bolt:  { name: 'молнии', weight: 10, price: 80, charges: [3, 6] },
  sleep: { name: 'сна', weight: 8, price: 60, charges: [3, 5] },
  slow:  { name: 'замедления', weight: 7, price: 50, charges: [3, 6] },
  dig:   { name: 'копания', weight: 5, price: 50, charges: [4, 8] },
  blink: { name: 'скачка', weight: 6, price: 60, charges: [3, 5] },
};
const WAND_LOOKS = ['дубовая', 'костяная', 'медная', 'ивовая', 'хрустальная', 'железная', 'кедровая'];

const FOODS = {
  pie:     { name: 'пирожок с капустой', sprite: 'pie', heal: 7, price: 10 },
  sausage: { name: 'сосиска', sprite: 'sausage', heal: 4, price: 12 },
};

// Темы глубин
const THEMES = {
  cellar: {
    name: 'Подвал', wall: '#6b4a3a', wallHi: '#8a6450', wallLo: '#4a3026', floor: '#2a2320', floorDot: '#352c28',
    water: '#2c4a63', grass: '#3d5a2e', fog: '#0d0a09', ambient: 'Сыро. Пахнет картошкой и мышами.',
  },
  crypt: {
    name: 'Катакомбы', wall: '#545a6e', wallHi: '#70778e', wallLo: '#383c4c', floor: '#1f2129', floorDot: '#292c37',
    water: '#28405e', grass: '#3a4a3a', fog: '#08090c', ambient: 'Тихо. Только где-то капает вода.',
  },
  caves: {
    name: 'Пещеры', wall: '#3f5e55', wallHi: '#56806f', wallLo: '#2a3f39', floor: '#1b2220', floorDot: '#243029',
    water: '#1f4d5c', grass: '#3f6b35', fog: '#070a09', ambient: 'Своды теряются во тьме. Шуршит мох.',
  },
  lair: {
    name: 'Логово Пса', wall: '#6e3f4f', wallHi: '#8f5466', wallLo: '#4a2733', floor: '#241a1e', floorDot: '#30232a',
    water: '#4a2a3a', grass: '#5a3a2a', fog: '#0c0708', ambient: 'Пахнет мокрой псиной. Где-то жалобно мяукают.',
  },
};

function themeFor(depth) {
  if (depth >= MAX_DEPTH) return 'lair';
  if (depth >= 7) return 'caves';
  if (depth >= 4) return 'crypt';
  return 'cellar';
}

// Достижения (хранятся между играми в браузере)
const ACHIEVEMENTS = {
  first_blood: ['Первая кровь', 'Победить первого врага.'],
  depth5:      ['На полпути', 'Спуститься на пятую глубину.'],
  rescue:      ['Барсик дома', 'Спасти Барсика.'],
  granny_win:  ['Бабушкина скалка', 'Спасти Барсика, играя за бабушку.'],
  janitor_win: ['Чисто вымел', 'Спасти Барсика, играя за дворника.'],
  fast:        ['Быстрые лапы', 'Спасти Барсика меньше чем за 2500 ходов.'],
  sausage:     ['Хороший мальчик', 'Отвлечь Древнего Пса сосиской.'],
  mimic:       ['Не всё то сундук', 'Победить мимика.'],
  necro:       ['Покойся с миром', 'Победить некроманта.'],
  fountain:    ['Водохлёб', 'Выпить из фонтана.'],
  shopper:     ['Постоянный клиент', 'Купить три вещи за один забег.'],
  rich:        ['Богач', 'Накопить 500 монет.'],
  veteran:     ['Ветеран', 'Достичь 8 уровня.'],
  mole:        ['Крот', 'Прорыть стену палочкой копания.'],
};

// Фразы на входе в уровень: следы Барсика
const CAT_HINTS = [
  'На полу клок рыжей шерсти. Барсик был здесь.',
  'Издалека доносится обиженное «мяу».',
  'На стене свежие следы когтей. Кошачьих.',
  'Кто-то опрокинул миску. Ну конечно.',
  'Пахнет валерьянкой. Барсик точно где-то внизу.',
  'В пыли цепочка маленьких следов уходит вниз.',
  'Вы слышите, как где-то внизу лает собака. Огромная.',
  'Между камней застряла мышь. Неподвижная. Подарок?',
  'Где-то внизу лай и мяуканье. Скорее!',
];
