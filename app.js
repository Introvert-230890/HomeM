/* =========================================================
   УТИЛИТЫ
   ========================================================= */
const $ = id => document.getElementById(id);
const RUB = '\u20BD';
const __htmlCache = new Map();
function escapeHtml(s) {
  if (typeof s !== 'string') return String(s);
  if (__htmlCache.has(s)) return __htmlCache.get(s);
  const r = s.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  if (__htmlCache.size < 2000) __htmlCache.set(s, r);
  return r;
}
const fmt = n => (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ' + RUB;
const fmtShort = n => Math.abs(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const fmtDate = iso => new Date(iso).toLocaleDateString('ru-RU', { day:'numeric', month:'short', year:'numeric' });
const fmtMonth = ym => { const [y,m] = ym.split('-'); return new Date(y, m-1, 1).toLocaleDateString('ru-RU', { month:'long', year:'numeric' }); };
const fmtMonthShort = ym => { const [y,m] = ym.split('-'); return new Date(y, m-1, 1).toLocaleDateString('ru-RU', { month:'short' }); };
const todayISO = () => new Date().toISOString().slice(0,10);

/* =========================================================
   ЭКСПОРТ CSV
   ========================================================= */
function downloadFile(content, filename, mime) {
  const blob = new Blob(['\uFEFF' + content], { type: mime || 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
function toCSV(rows) {
  return rows.map(r => r.map(cell => {
    const s = cell === null || cell === undefined ? '' : String(cell);
    if (s.includes(';') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }).join(';')).join('\n');
}
function exportHistoryCSV() {
  if (!transactions.length) { alert('Нет операций для экспорта'); return; }
  const rows = [['Дата','Тип','Сумма','Категория','Подкатегория','Счёт','Магазин','Заметка','Проект']];
  const typeLabel = { income:'Доход', expense:'Расход', save_in:'Пополнение сбережений', save_out:'Снятие из сбережений', interest:'Проценты', project_expense:'Трата проекта' };
  const sorted = transactions.slice().sort((a,b) => a.date.localeCompare(b.date));
  sorted.forEach(t => {
    const cat = t.category ? findCat(t.type, t.category).name : '';
    const acc = findAcc(t.accountId || t.fromAccountId).name;
    const proj = t.projectId ? (findProject(t.projectId)?.name || '') : '';
    rows.push([t.date, typeLabel[t.type] || t.type, String(t.amount).replace('.', ','), cat, t.subcategory || '', acc, t.shop || '', t.note || '', proj]);
  });
  downloadFile(toCSV(rows), 'operations_' + todayISO() + '.csv');
}
function exportReportCSV() {
  const { from, to } = getReportPeriodRange();
  let items = transactions.filter(t => t.type === 'income' || t.type === 'expense');
  if (from && to) items = items.filter(t => t.date >= from && t.date <= to);
  if (state.reportType !== 'all') items = items.filter(t => t.type === state.reportType);
  if (!items.length) { alert('Нет данных за выбранный период'); return; }
  const byCat = {};
  items.forEach(t => {
    const cid = t.category;
    const sub = t.subcategory || 'Без подкатегории';
    if (!byCat[cid]) byCat[cid] = { sum: 0, count: 0, subs: {}, type: t.type };
    byCat[cid].sum += t.amount; byCat[cid].count += 1;
    if (!byCat[cid].subs[sub]) byCat[cid].subs[sub] = { sum: 0, count: 0 };
    byCat[cid].subs[sub].sum += t.amount; byCat[cid].subs[sub].count += 1;
  });
  const total = Object.values(byCat).reduce((s,v) => s + v.sum, 0);
  const rows = [['Статья','Подстатья','Сумма','Доля, %','Количество','Средний чек']];
  Object.keys(byCat).sort((a,b) => byCat[b].sum - byCat[a].sum).forEach(cid => {
    const c = byCat[cid];
    const catMeta = findCat(c.type, cid);
    rows.push([catMeta.name, '', String(c.sum).replace('.', ','), (c.sum/total*100).toFixed(1), c.count, String(c.sum/c.count).replace('.', ',')]);
    Object.keys(c.subs).sort((a,b) => c.subs[b].sum - c.subs[a].sum).forEach(sub => {
      const s = c.subs[sub];
      rows.push(['', sub, String(s.sum).replace('.', ','), (s.sum/c.sum*100).toFixed(1), s.count, String(s.sum/s.count).replace('.', ',')]);
    });
  });
  rows.push(['ИТОГО','',String(total).replace('.', ','),'100',items.length,'']);
  downloadFile(toCSV(rows), 'report_' + todayISO() + '.csv');
}
function exportPortfolioCSV() {
  const assets = getAssets();
  if (!assets.length) { alert('Портфель пуст'); return; }
  const rows = [['Название','Тикер','ISIN','Тип','Количество','Ср. цена','Тек. цена','Стоимость','Вложено','P&L','P&L %']];
  assets.forEach(a => {
    const qty = Number(a.quantity) || 0;
    const avgRub = assetAvgPriceRub(a);
    const curRub = assetPriceRub(a);
    const value = qty * curRub;
    const invested = qty * avgRub;
    const pl = value - invested;
    const plPct = invested > 0 ? (pl / invested * 100) : 0;
    const at = ASSET_TYPES[a.type] || ASSET_TYPES.other;
    rows.push([a.name, a.ticker || '', a.isin || '', at.name, String(qty),
      String(avgRub.toFixed(2)).replace('.', ','), String(curRub.toFixed(2)).replace('.', ','),
      String(value.toFixed(2)).replace('.', ','), String(invested.toFixed(2)).replace('.', ','),
      String(pl.toFixed(2)).replace('.', ','), plPct.toFixed(1)]);
  });
  downloadFile(toCSV(rows), 'portfolio_' + todayISO() + '.csv');
}
/* =========================================================
   РЕЗЕРВНАЯ КОПИЯ
   ========================================================= */
function exportBackup() {
  const backup = {};
  const keys = [
    'home-accounting-tx-v2',
    'home-accounting-acc-v2',
    'home-accounting-portfolios-v1',
    'home-accounting-active-pf-v1',
    'home-accounting-assets-v1',
    'home-accounting-inv-cash-v1',
    'home-finance-projects-v1',
    'home-finance-budgets-v1',
    'home-finance-user-categories-v1',
    'home-finance-payout-cache-v1',
    'home-finance-payout-cache-time',
    'home-finance-dark',
    'home-finance-auth',
  ];
  keys.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) backup[k] = v;
  });
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'home-finance',
    data: backup,
  };
  const json = JSON.stringify(data, null, 2);
  const date = todayISO();
  downloadFile(json, 'home-finance-backup-' + date + '.json', 'application/json;charset=utf-8;');
}

async function importBackup() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) { resolve(false); return; }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed || parsed.app !== 'home-finance' || !parsed.data) {
          alert('⚠️ Это не файл резервной копии «Личные финансы».');
          resolve(false); return;
        }
        const keysCount = Object.keys(parsed.data).length;
        const exported = parsed.exportedAt
          ? new Date(parsed.exportedAt).toLocaleString('ru-RU')
          : 'неизвестно';
        const ok = confirm(
          'Найден бэкап от ' + exported + '\n' +
          'Содержит записей: ' + keysCount + '\n\n' +
          '⚠️ ВНИМАНИЕ: все текущие данные будут ЗАМЕНЕНЫ.\n' +
          'Продолжить?'
        );
        if (!ok) { resolve(false); return; }
        Object.entries(parsed.data).forEach(([k, v]) => {
          localStorage.setItem(k, v);
        });
        alert('✅ Данные восстановлены. Страница будет перезагружена.');
        location.reload();
        resolve(true);
      } catch (e) {
        console.error('Import error:', e);
        alert('❌ Ошибка чтения файла: ' + e.message);
        resolve(false);
      }
    });
    input.click();
  });
}

async function openBackupDialog() {
  const res = await modal.open({
    title: 'Резервная копия',
    subtitle: 'Экспорт или импорт всех данных',
    info: '<b>Что сохраняется:</b><br>' +
      '• Операции и счета<br>' +
      '• Портфели и активы<br>' +
      '• Проекты, сбережения<br>' +
      '• Бюджеты, категории, темы<br><br>' +
      'Файл можно хранить в облаке или на флешке.',
    fields: [
      { name: 'action', label: 'Выберите действие', type: 'select', options: [
        { value: 'export', label: '📤 Экспорт — сохранить файл' },
        { value: 'import', label: '📥 Импорт — загрузить из файла' },
      ]},
    ],
    confirmText: 'Продолжить',
  });
  if (!res) return;
  if (res.action === 'export') exportBackup();
  else if (res.action === 'import') importBackup();
}

/* =========================================================
   МОДАЛКИ
   ========================================================= */
const modal = {
  overlay: null, window: null, resolve: null,
  init() {
    this.overlay = $('modalOverlay'); this.window = $('modalWindow');
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(null); });
    document.addEventListener('keydown', e => {
      if (!this.overlay.classList.contains('show')) return;
      if (e.key === 'Escape') this.close(null);
    });
  },
  open(config) {
    return new Promise(resolve => {
      this.resolve = resolve;
      const fieldsHtml = (config.fields || []).map(f => {
        const id = 'modal_' + f.name;
        let inputHtml = '';
        if (f.type === 'select') {
          inputHtml = '<select id="' + id + '" data-field="' + f.name + '">' + f.options.map(o => '<option value="' + escapeHtml(o.value) + '"' + (o.value == f.value ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>').join('') + '</select>';
        } else if (f.type === 'date') {
          inputHtml = '<input type="date" id="' + id + '" data-field="' + f.name + '" value="' + (f.value || todayISO()) + '">';
        } else if (f.type === 'number') {
          inputHtml = '<input type="number" id="' + id + '" data-field="' + f.name + '" step="' + (f.step || '0.01') + '"' + (f.min !== undefined ? ' min="' + f.min + '"' : '') + ' value="' + (f.value !== undefined ? f.value : '') + '" placeholder="' + (f.placeholder || '') + '">';
        } else if (f.type === 'text') {
          inputHtml = '<input type="text" id="' + id + '" data-field="' + f.name + '" value="' + escapeHtml(f.value || '') + '" placeholder="' + escapeHtml(f.placeholder || '') + '" maxlength="' + (f.maxlength || '100') + '">';
        }
        return '<div><label for="' + id + '">' + escapeHtml(f.label) + '</label>' + inputHtml + (f.hint ? '<div class="form-hint">' + escapeHtml(f.hint) + '</div>' : '') + '</div>';
      }).join('');
      this.window.innerHTML =
        '<div class="modal-header"><div><div class="modal-title">' + escapeHtml(config.title) + '</div>' +
        (config.subtitle ? '<div class="modal-sub">' + escapeHtml(config.subtitle) + '</div>' : '') + '</div>' +
        '<button class="modal-close" data-modal-close>&times;</button></div>' +
        '<div class="modal-body">' +
        (config.info ? '<div class="modal-info">' + config.info + '</div>' : '') +
        (config.warning ? '<div class="modal-warning">' + config.warning + '</div>' : '') +
        fieldsHtml + '</div>' +
        '<div class="modal-actions">' +
        '<button class="submit-btn ghost" data-modal-close>Отмена</button>' +
        '<button class="submit-btn" data-modal-confirm>' + escapeHtml(config.confirmText || 'ОК') + '</button></div>';
      this.overlay.classList.add('show');
      const firstInput = this.window.querySelector('input, select');
      if (firstInput) setTimeout(() => firstInput.focus(), 50);
      const confirmBtn = this.window.querySelector('[data-modal-confirm]');
      confirmBtn.addEventListener('click', () => {
        const data = {};
        this.window.querySelectorAll('[data-field]').forEach(el => {
          data[el.dataset.field] = el.type === 'number' ? parseFloat(el.value) : el.value;
        });
        this.close(data);
      });
      this.window.querySelectorAll('[data-modal-close]').forEach(b => {
        b.addEventListener('click', () => this.close(null));
      });
      this.window.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') confirmBtn.click();
      });
    });
  },
  close(data) {
    this.overlay.classList.remove('show');
    this.window.innerHTML = '';
    if (this.resolve) { const r = this.resolve; this.resolve = null; r(data); }
  },
};

/* =========================================================
   СЕЗОН + ТЁМНАЯ ТЕМА
   ========================================================= */
const DARK_KEY = 'home-finance-dark';
function isDark() { return localStorage.getItem(DARK_KEY) === '1'; }
function setDark(v) { localStorage.setItem(DARK_KEY, v ? '1' : '0'); applyDark(); }
function applyDark() {
  const on = isDark();
  document.body.classList.add('no-transitions');
  document.body.classList.toggle('dark', on);
  if ($('themeIcon')) $('themeIcon').textContent = on ? '\u2600\uFE0F' : '\u{1F319}';
  if ($('themeText')) $('themeText').textContent = on ? 'Светлая тема' : 'Тёмная тема';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove('no-transitions');
      if (typeof state !== 'undefined' && state && state.activeTab === 'investments') {
        requestAnimationFrame(() => { drawGrowthChart(); drawPayoutChart(); });
      }
    });
  });
}
function getSeason() {
  const m = new Date().getMonth() + 1;
  if (m === 12 || m <= 2) return 'winter';
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  return 'autumn';
}
const SEASON_ICONS = { winter: '\u2744', spring: '\u{1F338}', summer: '\u{1F33B}', autumn: '\u{1F341}' };
const SEASON_DECOR = {
  winter: ['\u2744','\u26C4','\u{1F3BF}','\u2745','\u26F7','\u{1F328}'],
  spring: ['\u{1F338}','\u{1F337}','\u{1F33C}','\u{1F41D}','\u{1F98B}','\u{1F33F}'],
  summer: ['\u2600\uFE0F','\u{1F33B}','\u{1F349}','\u{1F334}','\u{1F3D6}','\u{1F366}'],
  autumn: ['\u{1F341}','\u{1F342}','\u{1F330}','\u{1F344}','\u{1F994}','\u{1F33E}'],
};
function applySeasonTheme() {
  const s = getSeason();
  document.body.classList.remove('season-winter','season-spring','season-summer','season-autumn');
  document.body.classList.add('season-' + s);
  const icon = SEASON_ICONS[s];
  if ($('logoSeasonIcon')) $('logoSeasonIcon').textContent = icon;
  if ($('authSeasonIcon')) $('authSeasonIcon').textContent = icon;
  const decor = SEASON_DECOR[s] || [];
  if ($('bgDecor')) $('bgDecor').innerHTML = decor.map(e => '<span>' + e + '</span>').join('');
}

/* =========================================================
   АВТОРИЗАЦИЯ
   ========================================================= */
const AUTH_LOGIN = 'Евгений';
const AUTH_PASSWORD = '23081990';
const AUTH_KEY = 'home-finance-auth';
const isAuthed = () => localStorage.getItem(AUTH_KEY) === '1';
const setAuthed = v => { if (v) localStorage.setItem(AUTH_KEY, '1'); else localStorage.removeItem(AUTH_KEY); };
const showAuth = () => { $('authScreen').style.display = 'flex'; $('sidebar').style.display = 'none'; $('mainContent').style.display = 'none'; };
const showApp = () => { $('authScreen').style.display = 'none'; $('sidebar').style.display = ''; $('mainContent').style.display = ''; };

/* =========================================================
   СПРАВОЧНИКИ
   ========================================================= */
const CATEGORIES = {
  expense: [
    { id:'housing',   name:'Жильё',               emoji:'\u{1F3E0}', color:'#22c55e', sub:['Ипотека','Мебель','Электроника','Бытовая химия','Бытовая утварь'] },
    { id:'utilities', name:'Коммунальные услуги', emoji:'\u{1F4A1}', color:'#0ea5e9', sub:['Услуги УК','Электроэнергия','Водоснабжение','Вывоз мусора','Отопление','Капремонт','Домофон'] },
    { id:'food',      name:'Питание',             emoji:'\u{1F374}', color:'#ef4444', sub:['Продукты','Обед на работе','Кафе и рестораны','Доставка'] },
    { id:'pet',       name:'Домашний питомец',    emoji:'\u{1F415}', color:'#a855f7', sub:['Корм','Средства гигиены','Ветеринар','Кинолог','Игрушки'] },
    { id:'sport',     name:'Спорт',               emoji:'\u{1F3C3}', color:'#eab308', sub:['Абонемент / тренировки','Личный тренер','Спортивное питание'] },
    { id:'services',  name:'Услуги',              emoji:'\u{1F4BC}', color:'#6366f1', sub:['Интернет','Сотовая связь','Подписки','Образование','Химчистка','Парикмахерская'] },
    { id:'personal',  name:'Личные нужды',        emoji:'\u{1F464}', color:'#8b5cf6', sub:['Книги','Канцелярия','Хобби','Разное'] },
    { id:'clothes',   name:'Одежда и обувь',      emoji:'\u{1F455}', color:'#3b82f6', sub:['Одежда','Обувь','Аксессуары'] },
    { id:'health',    name:'Здоровье',            emoji:'\u{1F48A}', color:'#06b6d4', sub:['Лекарства','Косметология / косметика','Приём доктора','Анализы','Средства личной гигиены'] },
    { id:'transport', name:'Проезд',              emoji:'\u{1F697}', color:'#f97316', sub:['Метро','Автобус','Поезд','Такси'] },
    { id:'gifts',     name:'Подарки',             emoji:'\u{1F381}', color:'#ec4899', sub:['Работа','Друзья','Семья'] },
    { id:'fun',       name:'Развлечения',         emoji:'\u{1F3AC}', color:'#14b8a6', sub:['Кино','Выездные стратсессии','QUIZ','Сборы'] },
    { id:'kids',      name:'Дети',                emoji:'\u{1F476}', color:'#f472b6', sub:['Садик / школа','Одежда','Игрушки','Питание','Медицина','Развитие'] },
    { id:'other_e',   name:'Прочее',              emoji:'\u{1F4E6}', color:'#94a3b8', sub:['Разное'] },
  ],
  income: [
    { id:'salary',  name:'Зарплата',  emoji:'\u{1F4B0}', color:'#10b981', sub:['Основная','Аванс'] },
    { id:'bonus',   name:'Премия',    emoji:'\u{1F31F}', color:'#f59e0b', sub:['Квартальная','Годовая'] },
    { id:'cashback',name:'Кэшбэк',    emoji:'\u{1F4B3}', color:'#06b6d4', sub:['Банк','Магазин'] },
    { id:'other_i', name:'Прочее',    emoji:'\u{2728}',  color:'#94a3b8', sub:['Разное'] },
  ]
};
const ACCOUNT_TYPES = {
  bank: { name:'Банковский счёт', color:'#6366f1' },
  cash: { name:'Наличные',        color:'#10b981' },
  card: { name:'Карта',           color:'#f59e0b' },
};
const DEPOSIT_TYPES = {
  deposit: { name:'Вклад',              color:'#8b5cf6', emoji:'\u{1F4C8}' },
  savings: { name:'Накопительный счёт', color:'#06b6d4', emoji:'\u{1F4B0}' },
  piggy:   { name:'Копилка',            color:'#f59e0b', emoji:'\u{1F437}' },
};
const ASSET_TYPES = {
  stock:  { name:'Акция',        color:'#ef4444', emoji:'\u{1F4C8}', risk: 75 },
  bond:   { name:'Облигация',    color:'#0ea5e9', emoji:'\u{1F4C3}', risk: 25 },
  etf:    { name:'ETF / фонд',   color:'#8b5cf6', emoji:'\u{1F4CA}', risk: 50 },
  crypto: { name:'Криптовалюта', color:'#f59e0b', emoji:'\u{1FA99}', risk: 95 },
  realty: { name:'Недвижимость', color:'#10b981', emoji:'\u{1F3E2}', risk: 20 },
  other:  { name:'Другое',       color:'#94a3b8', emoji:'\u{1F4E6}', risk: 60 },
};

/* Пользовательские категории */
const STORAGE_USER_CATS = 'home-finance-user-categories-v1';
let userCategories = JSON.parse(localStorage.getItem(STORAGE_USER_CATS) || 'null') || { expense: [], income: [] };
if (!userCategories.expense) userCategories.expense = [];
if (!userCategories.income) userCategories.income = [];
const saveUserCategories = () => localStorage.setItem(STORAGE_USER_CATS, JSON.stringify(userCategories));

function getAllCategories(type) {
  return [...(CATEGORIES[type] || []), ...(userCategories[type] || [])];
}
const findCat = (type, id) => {
  const base = (CATEGORIES[type] || []).find(c => c.id === id);
  if (base) return base;
  const user = (userCategories[type] || []).find(c => c.id === id);
  return user || { name:id, emoji:'\u2753', color:'#94a3b8' };
};
const findAcc = id => accounts.find(a => a.id === id) || { name:'Удалён', emoji:'\u2753', color:'#94a3b8', type:'cash' };
const findProject = id => projects.find(p => p.id === id);

/* =========================================================
   ХРАНИЛИЩЕ
   ========================================================= */
const STORAGE_TX = 'home-accounting-tx-v2';
const STORAGE_ACC = 'home-accounting-acc-v2';
const STORAGE_PORTFOLIOS = 'home-accounting-portfolios-v1';
const STORAGE_ACTIVE_PF = 'home-accounting-active-pf-v1';
const STORAGE_OLD_ASSETS = 'home-accounting-assets-v1';
const STORAGE_OLD_CASH = 'home-accounting-inv-cash-v1';
const STORAGE_PROJECTS = 'home-finance-projects-v1';
const STORAGE_BUDGETS = 'home-finance-budgets-v1';
const STORAGE_PAYOUT_CACHE = 'home-finance-payout-cache-v1';
const STORAGE_PAYOUT_CACHE_TIME = 'home-finance-payout-cache-time';
const PAYOUT_TTL_MS = 12 * 60 * 60 * 1000;

let transactions = JSON.parse(localStorage.getItem(STORAGE_TX) || '[]');
let accounts = JSON.parse(localStorage.getItem(STORAGE_ACC) || 'null') || [
  { id:'cash', name:'Наличные', type:'cash', emoji:'\u{1F4B5}', initial:0 },
  { id:'sber', name:'Сбербанк', type:'bank', emoji:'\u{1F7E2}', initial:0 },
  { id:'tink', name:'Тинькофф', type:'bank', emoji:'\u{1F7E1}', initial:0 },
];
let portfolios = JSON.parse(localStorage.getItem(STORAGE_PORTFOLIOS) || 'null');
if (!portfolios || !Array.isArray(portfolios) || !portfolios.length) {
  const oldAssets = JSON.parse(localStorage.getItem(STORAGE_OLD_ASSETS) || '[]');
  const oldCash = Number(localStorage.getItem(STORAGE_OLD_CASH)) || 0;
  portfolios = [{ id: 'pf_' + Date.now(), name: 'Основной', assets: Array.isArray(oldAssets) ? oldAssets : [], cash: oldCash, createdAt: todayISO() }];
  localStorage.setItem(STORAGE_PORTFOLIOS, JSON.stringify(portfolios));
}
let activePortfolioId = localStorage.getItem(STORAGE_ACTIVE_PF) || portfolios[0].id;
if (!portfolios.find(p => p.id === activePortfolioId)) activePortfolioId = portfolios[0].id;
let projects = JSON.parse(localStorage.getItem(STORAGE_PROJECTS) || '[]');
if (!Array.isArray(projects)) projects = [];
let budgets = JSON.parse(localStorage.getItem(STORAGE_BUDGETS) || '{}');
if (!budgets || typeof budgets !== 'object' || Array.isArray(budgets)) budgets = {};
let payoutCache = JSON.parse(localStorage.getItem(STORAGE_PAYOUT_CACHE) || '{}');

const getActivePortfolio = () => portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
const getAssets = () => getActivePortfolio().assets;
const getCash = () => getActivePortfolio().cash;
const regularAccounts = () => accounts.filter(a => ['bank','cash','card'].includes(a.type));
const savingsAccounts = () => accounts.filter(a => ['deposit','savings','piggy'].includes(a.type));

const saveTx = () => { localStorage.setItem(STORAGE_TX, JSON.stringify(transactions)); __reportCacheKey = ''; };
const saveAcc = () => localStorage.setItem(STORAGE_ACC, JSON.stringify(accounts));
const savePortfolios = () => { localStorage.setItem(STORAGE_PORTFOLIOS, JSON.stringify(portfolios)); __payoutEventsCacheKey = ''; };
const saveActivePf = () => localStorage.setItem(STORAGE_ACTIVE_PF, activePortfolioId);
const saveProjects = () => localStorage.setItem(STORAGE_PROJECTS, JSON.stringify(projects));
const saveBudgets = () => localStorage.setItem(STORAGE_BUDGETS, JSON.stringify(budgets));
const savePayoutCache = () => localStorage.setItem(STORAGE_PAYOUT_CACHE, JSON.stringify(payoutCache));

/* =========================================================
   КЭШ БАЛАНСОВ + ПРОВЕРКА СРЕДСТВ
   ========================================================= */
let __balanceCache = null;
function invalidateBalanceCache() { __balanceCache = null; }
function rebuildBalanceCache() {
  __balanceCache = {};
  accounts.forEach(acc => { __balanceCache[acc.id] = Number(acc.initial) || 0; });
  transactions.forEach(t => {
    if (t.type === 'income'  && t.accountId)      __balanceCache[t.accountId]      = (__balanceCache[t.accountId] || 0) + t.amount;
    if (t.type === 'expense' && t.accountId)      __balanceCache[t.accountId]      = (__balanceCache[t.accountId] || 0) - t.amount;
    if (t.type === 'save_in'  && t.fromAccountId) __balanceCache[t.fromAccountId] = (__balanceCache[t.fromAccountId] || 0) - t.amount;
    if (t.type === 'save_in'  && t.toAccountId)   __balanceCache[t.toAccountId]   = (__balanceCache[t.toAccountId] || 0) + t.amount;
    if (t.type === 'save_out' && t.fromAccountId) __balanceCache[t.fromAccountId] = (__balanceCache[t.fromAccountId] || 0) - t.amount;
    if (t.type === 'save_out' && t.toAccountId)   __balanceCache[t.toAccountId]   = (__balanceCache[t.toAccountId] || 0) + t.amount;
    if (t.type === 'interest' && t.toAccountId)   __balanceCache[t.toAccountId]   = (__balanceCache[t.toAccountId] || 0) + t.amount;
    if (t.type === 'project_expense' && t.fromAccountId) __balanceCache[t.fromAccountId] = (__balanceCache[t.fromAccountId] || 0) - t.amount;
  });
}
function getAccountBalance(accId) {
  if (!__balanceCache) rebuildBalanceCache();
  return __balanceCache[accId] || 0;
}
function checkSufficientFunds(accId, amount) {
  const acc = findAcc(accId);
  const balance = getAccountBalance(accId);
  if (amount > balance) {
    alert('⚠️ Недостаточно средств на счёте «' + acc.name + '».\n\nДоступно: ' + fmt(balance) + '\nТребуется: ' + fmt(amount) + '\n\nОперация отменена.');
    return false;
  }
  return true;
}

/* =========================================================
   ХЕЛПЕРЫ ЦЕН
   ========================================================= */
function bondPriceRub(p, nom) { return (Number(p) / 100) * (Number(nom) || 1000); }
function assetPriceRub(a) { const p = Number(a.currentPrice) || Number(a.avgPrice) || 0; return a.type === 'bond' ? bondPriceRub(p, a.nominal) : p; }
function assetAvgPriceRub(a) { const p = Number(a.avgPrice) || 0; return a.type === 'bond' ? bondPriceRub(p, a.nominal) : p; }
function rubCost(asset, price, qty) { return asset.type === 'bond' ? qty * bondPriceRub(price, asset.nominal) : qty * Number(price); }
function getInvestTotals() {
  let invested = 0, value = 0;
  getAssets().forEach(a => {
    const qty = Number(a.quantity) || 0;
    invested += qty * assetAvgPriceRub(a);
    value += qty * assetPriceRub(a);
  });
  return { invested, value, pl: value - invested };
}
function getAllShops() {
  const set = new Set();
  transactions.forEach(t => { if (t.shop) set.add(t.shop); });
  return Array.from(set).sort((a,b) => a.localeCompare(b, 'ru'));
}
function refreshShopDatalists() {
  const options = getAllShops().map(s => '<option value="' + escapeHtml(s) + '">').join('');
  $('shopList').innerHTML = options;
  $('shopListFilter').innerHTML = options;
}

/* =========================================================
   РИСК-ПРОФИЛЬ
   ========================================================= */
function calcRiskProfile() {
  const assets = getAssets();
  if (!assets.length) return { risk: 0, profile: '—', sharpe: 0, expectedReturn: 0, volatility: 0, color: '#94a3b8' };
  const totalValue = assets.reduce((s, a) => s + (Number(a.quantity) || 0) * assetPriceRub(a), 0);
  if (totalValue <= 0) return { risk: 0, profile: '—', sharpe: 0, expectedReturn: 0, volatility: 0, color: '#94a3b8' };
  let risk = 0, expectedReturn = 0, volatility = 0;
  const returnMap = { bond: 16, stock: 22, etf: 18, crypto: 35, realty: 12, other: 15 };
  const volMap = { bond: 5, stock: 28, etf: 18, crypto: 65, realty: 10, other: 20 };
  assets.forEach(a => {
    const value = (Number(a.quantity) || 0) * assetPriceRub(a);
    const w = value / totalValue;
    risk += w * ((ASSET_TYPES[a.type] || ASSET_TYPES.other).risk || 60);
    expectedReturn += w * (returnMap[a.type] || 15);
    volatility += w * (volMap[a.type] || 20);
  });
  const sharpe = volatility > 0 ? (expectedReturn - 16) / volatility : 0;
  let profile, color;
  if (risk < 30) { profile = '\u{1F6E1} Консервативный'; color = '#10b981'; }
  else if (risk < 55) { profile = '\u2696 Умеренный'; color = '#eab308'; }
  else if (risk < 75) { profile = '\u{1F680} Агрессивный'; color = '#f97316'; }
  else { profile = '\u{1F525} Очень агрессивный'; color = '#ef4444'; }
  return { risk, profile, sharpe, expectedReturn, volatility, color };
}
function renderRiskLevelBlock(r) {
  const numberEl = $('riskLevelNumber');
  const descEl = $('riskLevelDesc');
  const fillEl = $('riskLevelBarFill');
  if (!numberEl) return;
  if (!getAssets().length) {
    numberEl.textContent = '—'; numberEl.style.color = 'var(--muted)';
    descEl.textContent = 'Добавьте активы для оценки';
    fillEl.style.width = '0%'; return;
  }
  numberEl.textContent = r.risk.toFixed(0);
  numberEl.style.color = r.color;
  fillEl.style.width = Math.min(100, Math.max(0, r.risk)) + '%';
  fillEl.style.background = r.color;
  let desc = '';
  if (r.risk < 30)      desc = 'Низкий риск. Возможные просадки портфеля — до 15–20% в плохие годы.';
  else if (r.risk < 55) desc = 'Средний риск. Возможные просадки — 20–30%. Баланс роста и стабильности.';
  else if (r.risk < 75) desc = 'Высокий риск. Возможные просадки — 30–45%. Ставка на долгосрочный рост.';
  else                  desc = 'Очень высокий риск. Возможны просадки более 50%. Только для долгого горизонта.';
  descEl.textContent = desc;
}
function renderRiskProfile() {
  const r = calcRiskProfile();
  renderRiskLevelBlock(r);
  $('riskProfileLabel').textContent = r.profile;
  $('riskProfileLabel').style.color = r.color;
  document.querySelectorAll('.risk-profile-card').forEach(c => c.classList.remove('active'));
  let level = null;
  if (r.risk < 30)      level = 'conservative';
  else if (r.risk < 55) level = 'moderate';
  else if (r.risk < 75) level = 'aggressive';
  else                  level = 'very-aggressive';
  if (level && getAssets().length) {
    const card = document.querySelector('.risk-profile-card[data-level="' + level + '"]');
    if (card) card.classList.add('active');
  }
  const marker = $('riskMarker');
  if (!getAssets().length) marker.innerHTML = '';
  else marker.innerHTML = '<div class="risk-current-dot" style="left:' + Math.min(100, Math.max(0, r.risk)) + '%;">' + r.risk.toFixed(0) + '</div>';
  const statsEl = $('riskStats');
  if (!getAssets().length) {
    statsEl.innerHTML = '<div class="empty" style="padding:16px 0;grid-column:1/-1;">Добавьте активы, чтобы увидеть риск-профиль</div>';
    return;
  }
  statsEl.innerHTML =
    '<div class="risk-stat"><div class="lbl">Уровень риска</div><div class="val" style="color:' + r.color + ';">' + r.risk.toFixed(0) + ' / 100</div></div>' +
    '<div class="risk-stat"><div class="lbl">Ожидаемая доходность</div><div class="val" style="color:var(--green);">' + r.expectedReturn.toFixed(1) + '%</div></div>' +
    '<div class="risk-stat"><div class="lbl">Коэф. Шарпа</div><div class="val" style="color:' + (r.sharpe >= 1 ? 'var(--green)' : r.sharpe >= 0.5 ? 'var(--yellow)' : 'var(--red)') + ';">' + r.sharpe.toFixed(2) + '</div></div>';
}

/* =========================================================
   БЮДЖЕТЫ
   ========================================================= */
function getBudgetForecast(spent, ym) {
  const [y, m] = ym.split('-').map(Number);
  const now = new Date();
  if (now.getFullYear() !== y || now.getMonth() !== m - 1) return null;
  const daysInMonth = new Date(y, m, 0).getDate();
  const dayOfMonth = now.getDate();
  if (dayOfMonth <= 0) return null;
  return (spent / dayOfMonth) * daysInMonth;
}
function getBudgetStatus(pct) {
  if (pct < 70)  return { cls: 'ok',     text: '' };
  if (pct < 90)  return { cls: 'warn',   text: 'Приближаетесь к лимиту' };
  if (pct < 100) return { cls: 'danger', text: 'Почти исчерпано' };
  return { cls: 'over', text: 'Превышен лимит' };
}
function renderBudgets() {
  const month = state.month;
  $('budgetPeriod').textContent = fmtMonth(month);
  const monthTx = transactions.filter(t => t.type === 'expense' && t.date.slice(0,7) === month);
  const spentByCat = {};
  monthTx.forEach(t => { spentByCat[t.category] = (spentByCat[t.category] || 0) + t.amount; });
  const budgetIds = Object.keys(budgets).filter(cid => budgets[cid] && budgets[cid].amount > 0);
  let totalLimit = 0, totalSpent = 0;
  budgetIds.forEach(cid => {
    totalLimit += budgets[cid].amount || 0;
    totalSpent += spentByCat[cid] || 0;
  });
  $('budgetTotalLimit').textContent = fmt(totalLimit);
  $('budgetTotalSpent').textContent = fmt(totalSpent);
  const totalLeft = Math.max(0, totalLimit - totalSpent);
  const totalLeftEl = $('budgetTotalLeft');
  totalLeftEl.textContent = fmt(totalLeft);
  totalLeftEl.className = 'value ' + (totalSpent > totalLimit ? 'expense' : '');
  const totalPct = totalLimit > 0 ? (totalSpent / totalLimit * 100) : 0;
  const totalFill = $('budgetTotalFill');
  totalFill.style.width = Math.min(100, totalPct) + '%';
  totalFill.className = 'budget-progress-fill ' + getBudgetStatus(totalPct).cls;
  const totalForecast = getBudgetForecast(totalSpent, month);
  const forecastEl = $('budgetTotalForecast');
  const statusEl = $('budgetTotalStatus');
  if (totalForecast !== null && totalLimit > 0) {
    forecastEl.textContent = fmt(totalForecast);
    if (totalForecast > totalLimit) {
      statusEl.innerHTML = '<span style="color:var(--red);font-weight:600;">Прогноз превышает лимит на ' + fmt(totalForecast - totalLimit) + '</span>';
    } else {
      statusEl.innerHTML = '<span style="color:var(--green);">Укладываетесь в лимит</span>';
    }
  } else {
    forecastEl.textContent = '—'; statusEl.textContent = '';
  }
  const list = $('budgetsList');
  if (!budgetIds.length) {
    list.innerHTML = '<div class="card budget-empty-hint">Бюджеты пока не настроены.<br>Нажмите «⚙️ Настроить бюджеты», чтобы задать лимиты по категориям.</div>';
    return;
  }
  const items = budgetIds.map(cid => {
    const cat = findCat('expense', cid);
    const limit = budgets[cid].amount;
    const spent = spentByCat[cid] || 0;
    const pct = limit > 0 ? (spent / limit * 100) : 0;
    const forecast = getBudgetForecast(spent, month);
    const left = limit - spent;
    return { cid, cat, limit, spent, pct, forecast, left };
  }).sort((a, b) => b.pct - a.pct);
  list.innerHTML = items.map(it => {
    const st = getBudgetStatus(it.pct);
    const fcHTML = (() => {
      if (it.forecast === null) return '';
      if (it.forecast > it.limit) {
        return '<div class="budget-forecast danger">⚠️ Прогноз до конца месяца: <b>' + fmt(it.forecast) + '</b> — превысит лимит на <b>' + fmt(it.forecast - it.limit) + '</b></div>';
      }
      return '<div class="budget-forecast">Прогноз до конца месяца: <b>' + fmt(it.forecast) + '</b></div>';
    })();
    return '<div class="budget-card">' +
      '<div class="budget-card-header"><div class="budget-cat-name">' + it.cat.emoji + ' ' + escapeHtml(it.cat.name) + '</div>' +
      '<div class="budget-cat-limit">' + fmt(it.spent) + ' / <b>' + fmt(it.limit) + '</b></div></div>' +
      '<div class="budget-progress-bar"><div class="budget-progress-fill ' + st.cls + '" style="width:' + Math.min(100, it.pct) + '%"></div></div>' +
      '<div class="budget-meta"><span>' + it.pct.toFixed(0) + '% использовано</span>' +
      '<span>' + (it.left >= 0 ? 'Осталось: <b>' + fmt(it.left) + '</b>' : 'Перерасход: <b style="color:var(--red)">' + fmt(-it.left) + '</b>') + '</span></div>' +
      fcHTML + '</div>';
  }).join('');
}
async function openBudgetSettings() {
  const expenseCategories = getAllCategories('expense');
  const fields = expenseCategories.map(c => ({
    name: 'b_' + c.id,
    label: c.emoji + ' ' + c.name,
    type: 'number',
    value: budgets[c.id]?.amount ? String(budgets[c.id].amount) : '',
    step: '0.01', min: 0,
    placeholder: '0 или пусто — без лимита',
  }));
  const res = await modal.open({
    title: 'Настроить бюджеты',
    subtitle: 'Лимиты действуют на каждый месяц. Оставьте пустым, чтобы убрать лимит.',
    fields, confirmText: 'Сохранить',
  });
  if (!res) return;
  expenseCategories.forEach(c => {
    const key = 'b_' + c.id;
    const val = parseFloat(res[key]);
    if (val && val > 0) budgets[c.id] = { amount: val };
    else delete budgets[c.id];
  });
  saveBudgets();
  renderBudgets();
}

/* =========================================================
   УПРАВЛЕНИЕ КАТЕГОРИЯМИ
   ========================================================= */
async function openCategoryManager() {
  const type = state.formType === 'save' ? 'expense' : state.formType;
  const typeLabel = type === 'expense' ? 'Расходы' : 'Доходы';
  const userCats = userCategories[type] || [];

  const listHtml = userCats.length
    ? userCats.map(c => '• ' + c.emoji + ' ' + escapeHtml(c.name) + (c.sub && c.sub.length ? ' (' + c.sub.map(escapeHtml).join(', ') + ')' : '')).join('<br>')
    : '— пока нет';

  const res = await modal.open({
    title: 'Категории: ' + typeLabel,
    subtitle: 'Добавить свою категорию с подкатегориями',
    info: '<b>Уже добавлены:</b><br>' + listHtml,
    fields: [
      { name: 'newName', label: 'Название категории', type: 'text', placeholder: 'Например, Хобби', maxlength: 40 },
      { name: 'newEmoji', label: 'Эмодзи', type: 'text', placeholder: '⭐', maxlength: 4, value: '⭐' },
      { name: 'newSubs', label: 'Подкатегории (через запятую)', type: 'text', placeholder: 'Книги, Игры, Спорт', maxlength: 200 },
    ],
    confirmText: 'Добавить',
  });
  if (!res) return;

  if (res.newName && res.newName.trim()) {
    const id = 'ucat_' + Date.now();
    const emoji = (res.newEmoji || '⭐').trim() || '⭐';
    const subs = (res.newSubs || '').split(',').map(s => s.trim()).filter(s => s);
    const colors = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#94a3b8'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    userCategories[type].push({ id, name: res.newName.trim(), emoji, color, sub: subs });
    saveUserCategories();
    renderFormCategories();
    renderFilterCategories();
    alert('Категория «' + res.newName.trim() + '» добавлена!');
  }
}

async function openCategoryDelete() {
  const type = state.formType === 'save' ? 'expense' : state.formType;
  const typeLabel = type === 'expense' ? 'Расходы' : 'Доходы';
  const userCats = userCategories[type] || [];
  if (!userCats.length) { alert('Нет пользовательских категорий для удаления'); return; }

  const listHtml = userCats.map((c, i) => (i + 1) + '. ' + c.emoji + ' ' + escapeHtml(c.name)).join('<br>');
  const res = await modal.open({
    title: 'Удалить категорию: ' + typeLabel,
    info: listHtml,
    fields: [{ name: 'num', label: 'Номер категории для удаления', type: 'number', min: 1, placeholder: '1' }],
    confirmText: 'Удалить',
  });
  if (!res || !res.num) return;
  const idx = Number(res.num) - 1;
  if (idx < 0 || idx >= userCats.length) { alert('Неверный номер'); return; }
  const removed = userCats.splice(idx, 1)[0];
  saveUserCategories();
  renderFormCategories();
  renderFilterCategories();
  alert('Категория «' + removed.name + '» удалена.');
}

/* =========================================================
   MOEX API
   ========================================================= */
async function searchMoexSecurities(query) {
  if (!query || query.length < 2) return [];
  const url = 'https://iss.moex.com/iss/securities.json?q=' + encodeURIComponent(query) + '&iss.meta=off&iss.only=securities';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const cols = data.securities.columns;
    const rows = data.securities.data;
    const idxTicker = cols.indexOf('secid');
    const idxName = cols.indexOf('shortname');
    const idxIsin = cols.indexOf('isin');
    const idxType = cols.indexOf('type');
    const out = [];
    for (const r of rows) {
      if (!r[idxTicker] || !r[idxName]) continue;
      out.push({ ticker: r[idxTicker], name: r[idxName], isin: r[idxIsin] || '', type: r[idxType] || '' });
    }
    return out;
  } catch (e) { console.error('MOEX search error:', e); return []; }
}
async function fetchMoexPrice(ticker, isBond) {
  const market = isBond ? 'bonds' : 'shares';
  const url = 'https://iss.moex.com/iss/engines/stock/markets/' + market + '/securities/' + encodeURIComponent(ticker) + '.json?iss.meta=off&iss.only=marketdata';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const cols = data.marketdata.columns;
    const rows = data.marketdata.data;
    const idxLast = cols.indexOf('LAST');
    const idxPrev = cols.indexOf('PREVPRICE');
    if (!rows.length) return null;
    let price = null;
    if (idxLast !== -1) { for (const r of rows) { if (r[idxLast] > 0) { price = r[idxLast]; break; } } }
    if (price === null && idxPrev !== -1) { for (const r of rows) { if (r[idxPrev] > 0) { price = r[idxPrev]; break; } } }
    return price;
  } catch (e) { console.error('MOEX price error:', e); return null; }
}
async function fetchBondCoupons(ticker) {
  const today = todayISO();
  const url = 'https://iss.moex.com/iss/statistics/engines/stock/markets/bonds/bondization/' + encodeURIComponent(ticker) + '.json?from=' + today + '&iss.only=coupons,amortizations&iss.meta=off';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const couponsCols = data.coupons.columns;
    const couponsRows = data.coupons.data || [];
    const amortCols = data.amortizations.columns;
    const amortRows = data.amortizations.data || [];
    const idxCouponDate = couponsCols.indexOf('coupondate');
    const idxCouponValue = couponsCols.indexOf('value');
    const idxAmortDate = amortCols.indexOf('amortdate');
    const idxAmortValue = amortCols.indexOf('value');
    const events = [];
    couponsRows.forEach(r => {
      const d = r[idxCouponDate]; const v = r[idxCouponValue];
      if (d && v > 0) events.push({ type: 'coupon', date: d, value: v });
    });
    amortRows.forEach(r => {
      const d = r[idxAmortDate]; const v = r[idxAmortValue];
      if (d && v > 0) events.push({ type: 'amortization', date: d, value: v });
    });
    return events;
  } catch (e) { console.error('MOEX coupon error for ' + ticker + ':', e); return []; }
}
async function fetchStockDividends(ticker) {
  const url = 'https://iss.moex.com/iss/securities/' + encodeURIComponent(ticker) + '/dividends.json?iss.meta=off';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const cols = data.dividends.columns;
    const rows = data.dividends.data || [];
    const idxDate = cols.indexOf('registryclosedate');
    const idxValue = cols.indexOf('value');
    const events = [];
    rows.forEach(r => {
      const d = r[idxDate]; const v = r[idxValue];
      if (d && v > 0) events.push({ type: 'dividend', date: d, value: v });
    });
    return events;
  } catch (e) { console.error('MOEX dividend error for ' + ticker + ':', e); return []; }
}
async function refreshPayoutCache(silent) {
  const statusEl = $('newsStatus');
  if (!silent && statusEl) statusEl.textContent = 'обновление...';
  const assetsWithTicker = [];
  portfolios.forEach(pf => { (pf.assets || []).forEach(a => { if (a.ticker) assetsWithTicker.push(a); }); });
  if (!assetsWithTicker.length) { if (statusEl) statusEl.textContent = 'нет активов с тикером'; return; }
  let updated = 0;
  for (const a of assetsWithTicker) {
    let events = [];
    if (a.type === 'bond') events = await fetchBondCoupons(a.ticker);
    else if (a.type === 'stock') events = await fetchStockDividends(a.ticker);
    payoutCache[a.ticker] = { events, updatedAt: new Date().toISOString(), name: a.name };
    if (events.length) updated++;
    await new Promise(r => setTimeout(r, 200));
  }
  savePayoutCache();
  localStorage.setItem(STORAGE_PAYOUT_CACHE_TIME, String(Date.now()));
  __payoutEventsCacheKey = '';
  if (statusEl) statusEl.textContent = 'обновлено ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  renderNews(); drawPayoutChart();
}
let __payoutEventsCache = null;
let __payoutEventsCacheKey = '';
function collectAllPayoutEvents() {
  const key = JSON.stringify(portfolios.map(p => (p.assets || []).map(a => a.ticker + ':' + a.quantity + ':' + a.nominal))) + ':' + (localStorage.getItem(STORAGE_PAYOUT_CACHE_TIME) || '');
  if (__payoutEventsCache && __payoutEventsCacheKey === key) return __payoutEventsCache;
  const events = [];
  const today = new Date();
  const yearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  getAssets().forEach(a => {
    const cache = payoutCache[a.ticker];
    if (!cache || !cache.events) return;
    const qty = Number(a.quantity) || 0;
    if (qty <= 0) return;
    cache.events.forEach(ev => {
      const evDate = new Date(ev.date);
      if (evDate < yearAgo) return;
      const rubValue = Number(ev.value) || 0;
      events.push({ ticker: a.ticker, name: a.name, assetType: a.type, qty, type: ev.type, date: ev.date, perUnit: rubValue, total: rubValue * qty });
    });
  });
  events.sort((a,b) => a.date.localeCompare(b.date));
  __payoutEventsCache = events;
  __payoutEventsCacheKey = key;
  return events;
}

/* =========================================================
   ГРАФИКИ
   ========================================================= */
function drawGrowthChart() {
  const canvas = $('growthChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width, H = rect.height;
  ctx.clearRect(0, 0, W, H);
  const assets = getAssets();
  if (!assets.length) {
    ctx.fillStyle = isDark() ? '#9198a8' : '#8b7355';
    ctx.font = '14px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Нет данных для отображения', W/2, H/2);
    return;
  }
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(d.toISOString().slice(0, 7)); }
  const currentValue = assets.reduce((s, a) => s + (Number(a.quantity) || 0) * assetPriceRub(a), 0);
  const pf = getActivePortfolio();
  const created = pf.createdAt ? new Date(pf.createdAt) : now;
  const monthsSince = Math.max(1, (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth()) + 1);
  const values = months.map(m => {
    const [y, mo] = m.split('-').map(Number);
    const mDate = new Date(y, mo - 1, 1);
    if (mDate < new Date(created.getFullYear(), created.getMonth(), 1)) return 0;
    const progress = Math.min(1, ((mDate.getFullYear() - created.getFullYear()) * 12 + (mDate.getMonth() - created.getMonth())) / monthsSince);
    return currentValue * Math.max(0.05, progress);
  });
  const maxV = Math.max(...values, currentValue, 1);
  const padL = 60, padR = 20, padT = 20, padB = 40;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  ctx.strokeStyle = isDark() ? '#31353f' : '#ecdec7'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i / 4);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    const v = maxV * (1 - i / 4);
    ctx.fillStyle = isDark() ? '#9198a8' : '#8b7355';
    ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((v / 1000).toFixed(0) + 'К', padL - 6, y + 3);
  }
  ctx.strokeStyle = isDark() ? '#a78bfa' : '#ea580c'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = padL + (plotW * i / (values.length - 1));
    const y = padT + plotH - (v / maxV) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = isDark() ? '#a78bfa' : '#ea580c';
  values.forEach((v, i) => {
    const x = padL + (plotW * i / (values.length - 1));
    const y = padT + plotH - (v / maxV) * plotH;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 2 * Math.PI); ctx.fill();
  });
  ctx.fillStyle = isDark() ? '#9198a8' : '#8b7355';
  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  months.forEach((m, i) => { const x = padL + (plotW * i / (months.length - 1)); ctx.fillText(fmtMonthShort(m), x, H - padB + 16); });
  ctx.fillStyle = isDark() ? '#e6e8ee' : '#3d2c1e';
  ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'right';
  ctx.fillText(fmt(currentValue), W - padR, padT + 12);
}
function drawPayoutChart() {
  const canvas = $('payoutChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width, H = rect.height;
  ctx.clearRect(0, 0, W, H);
  const events = collectAllPayoutEvents();
  if (!events.length) {
    ctx.fillStyle = isDark() ? '#9198a8' : '#8b7355';
    ctx.font = '14px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Нет данных. Нажмите «Обновить события» на странице Новости.', W/2, H/2);
    return;
  }
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() + i, 1); months.push(d.toISOString().slice(0, 7)); }
  const byMonth = {};
  months.forEach(m => { byMonth[m] = { coupon: 0, dividend: 0, amortization: 0, other: 0, total: 0 }; });
  events.forEach(ev => {
    const m = ev.date.slice(0, 7);
    if (!byMonth[m]) return;
    if (ev.type === 'coupon') byMonth[m].coupon += ev.total;
    else if (ev.type === 'dividend') byMonth[m].dividend += ev.total;
    else if (ev.type === 'amortization') byMonth[m].amortization += ev.total;
    else byMonth[m].other += ev.total;
    byMonth[m].total += ev.total;
  });
  const totalsByMonth = months.map(m => byMonth[m].total);
  const maxV = Math.max(...totalsByMonth, 1);
  const step = Math.pow(10, Math.floor(Math.log10(maxV)));
  const niceMax = Math.ceil(maxV / step) * step || 1;
  const padL = 70, padR = 24, padT = 40, padB = 44;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  ctx.strokeStyle = isDark() ? '#31353f' : '#ecdec7'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i / 4);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    const v = niceMax * (1 - i / 4);
    ctx.fillStyle = isDark() ? '#9198a8' : '#8b7355';
    ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((v >= 1000 ? (v/1000).toFixed(0) + 'К' : v.toFixed(0)) + ' ₽', padL - 8, y + 3);
  }
  ctx.strokeStyle = isDark() ? '#4b5563' : '#a89a80';
  ctx.beginPath(); ctx.moveTo(padL, padT + plotH); ctx.lineTo(W - padR, padT + plotH); ctx.stroke();
  const barWidth = Math.min(48, plotW / months.length * 0.6);
  const colors = { coupon: '#0ea5e9', dividend: '#16a34a', amortization: '#9333ea', other: '#94a3b8' };
  const stackOrder = ['amortization', 'dividend', 'coupon', 'other'];
  months.forEach((m, i) => {
    const cx = padL + (plotW * (i + 0.5) / months.length);
    const data = byMonth[m];
    let yBottom = padT + plotH;
    stackOrder.forEach(key => {
      const v = data[key];
      if (v <= 0) return;
      const h = (v / niceMax) * plotH;
      ctx.fillStyle = colors[key];
      ctx.fillRect(cx - barWidth / 2, yBottom - h, barWidth, h);
      yBottom -= h;
    });
    if (data.total > 0) {
      ctx.fillStyle = isDark() ? '#e6e8ee' : '#3d2c1e';
      ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      const totalY = padT + plotH - (data.total / niceMax) * plotH - 6;
      const label = data.total >= 1000 ? (data.total/1000).toFixed(1) + 'К' : Math.round(data.total) + '';
      ctx.fillText(label, cx, totalY);
    }
    ctx.fillStyle = isDark() ? '#9198a8' : '#8b7355';
    ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(fmtMonthShort(m), cx, H - padB + 18);
    const [yy] = m.split('-');
    ctx.fillStyle = isDark() ? '#6b7280' : '#b8a888';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(yy, cx, H - padB + 30);
  });
  const legendItems = [
    { label: 'Купоны', color: colors.coupon },
    { label: 'Дивиденды', color: colors.dividend },
    { label: 'Амортизация', color: colors.amortization },
  ];
  ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
  let lx = padL; const ly = 18;
  legendItems.forEach(item => {
    ctx.fillStyle = item.color;
    ctx.beginPath(); ctx.arc(lx + 5, ly, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isDark() ? '#e6e8ee' : '#3d2c1e';
    ctx.fillText(item.label, lx + 14, ly + 4);
    lx += ctx.measureText(item.label).width + 34;
  });
  const yearTotal = totalsByMonth.reduce((s,v) => s + v, 0);
  ctx.fillStyle = isDark() ? '#e6e8ee' : '#3d2c1e';
  ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('За год: ' + fmt(yearTotal), W - padR, ly + 4);
}

/* =========================================================
   НОВОСТИ
   ========================================================= */
function renderNews() {
  const list = $('newsList');
  if (!list) return;
  const events = collectAllPayoutEvents();
  if (!events.length) { list.innerHTML = '<div class="empty">Пока нет событий. Добавьте активы с тикерами и нажмите «Обновить события».</div>'; return; }
  const today = new Date(); today.setHours(0,0,0,0);
  const upcoming = [], recent = [];
  events.forEach(ev => {
    const evDate = new Date(ev.date); evDate.setHours(0,0,0,0);
    const diffDays = Math.round((evDate - today) / 86400000);
    if (diffDays >= 0 && diffDays <= 30) upcoming.push({ ...ev, diffDays });
    else if (diffDays < 0 && diffDays >= -30) recent.push({ ...ev, diffDays });
  });
  const reminders = upcoming.filter(e => e.diffDays <= 3);
  let html = '';
  if (reminders.length) {
    html += '<div class="card" style="margin-bottom:16px;border-left:4px solid var(--orange);"><div style="font-weight:700;margin-bottom:10px;">&#x23F0; Ближайшие выплаты (в течение 3 дней)</div>';
    reminders.forEach(ev => { html += newsItemHTML(ev, true); });
    html += '</div>';
  }
  if (upcoming.length) {
    html += '<div class="card" style="margin-bottom:16px;"><div style="font-weight:700;margin-bottom:10px;">&#x1F4C5; Предстоящие выплаты (30 дней)</div>';
    upcoming.forEach(ev => {
      if (reminders.find(r => r.ticker === ev.ticker && r.date === ev.date && r.type === ev.type)) return;
      html += newsItemHTML(ev, true);
    });
    html += '</div>';
  }
  if (recent.length) {
    html += '<div class="card"><div style="font-weight:700;margin-bottom:10px;">&#x2714; Недавние выплаты</div>';
    recent.forEach(ev => { html += newsItemHTML(ev, false); });
    html += '</div>';
  }
  if (!html) html = '<div class="empty">Нет событий за последние 30 дней и ближайшие 30 дней.</div>';
  list.innerHTML = html;
}
function newsItemHTML(ev, isUpcoming) {
  const typeLabels = {
    coupon: { icon: '\u{1F4B5}', label: 'Купон' },
    dividend: { icon: '\u{1F4B0}', label: 'Дивиденд' },
    amortization: { icon: '\u{1F3E6}', label: 'Амортизация' },
    other: { icon: '\u{1F4E6}', label: 'Выплата' },
  };
  const t = typeLabels[ev.type] || typeLabels.other;
  const cls = isUpcoming ? 'upcoming' : 'past';
  const badge = isUpcoming ? '<span class="news-badge upcoming">Скоро</span>' : '<span class="news-badge past">Выплачено</span>';
  const dateStr = fmtDate(ev.date);
  const diffStr = isUpcoming ? ('через ' + ev.diffDays + ' дн.') : (Math.abs(ev.diffDays) + ' дн. назад');
  return '<div class="news-item ' + cls + '" style="margin-bottom:10px;">' +
    '<div class="news-icon">' + t.icon + '</div>' +
    '<div class="news-body"><div class="news-title">' + t.label + ' · ' + escapeHtml(ev.name) + ' (' + escapeHtml(ev.ticker) + ')' + badge + '</div>' +
    '<div class="news-desc">' + ev.qty + ' шт. × ' + fmt(ev.perUnit) + ' = <b>' + fmt(ev.total) + '</b> · ' + diffStr + '</div></div>' +
    '<div class="news-date">' + dateStr + '</div></div>';
}

/* =========================================================
   СОСТОЯНИЕ
   ========================================================= */
const state = {
  formType: 'expense',
  month: new Date().toISOString().slice(0,7),
  accountFilter: 'all',
  activeTab: 'main',
  reportType: 'expense',
  reportPeriod: 'month',
  reportMonth: new Date().toISOString().slice(0,7),
  expandedCats: new Set(),
  projectType: 'savings',
  projectSubsDraft: [],
};
function getMonthTransactions() {
  return transactions.filter(t => {
    if (t.date.slice(0,7) !== state.month) return false;
    if (state.accountFilter !== 'all') {
      if (t.accountId !== state.accountFilter && t.fromAccountId !== state.accountFilter && t.toAccountId !== state.accountFilter) return false;
    }
    return true;
  });
}

/* =========================================================
   ПРОЕКТЫ
   ========================================================= */
function getProjectProgress(project) {
  if (project.type === 'savings') return { value: getAccountBalance(project.accountId), label: 'Накоплено' };
  const spent = transactions.filter(t => t.type === 'project_expense' && t.projectId === project.id).reduce((s,t) => s + t.amount, 0);
  return { value: spent, label: 'Потрачено' };
}
function getProjectSpentBySub(projectId, subId) {
  return transactions.filter(t => t.type === 'project_expense' && t.projectId === projectId && t.subcategoryId === subId).reduce((s,t) => s + t.amount, 0);
}
function getProjectSpentByMonth(projectId) {
  const byMonth = {};
  transactions.filter(t => t.type === 'project_expense' && t.projectId === projectId).forEach(t => {
    const m = t.date.slice(0,7);
    byMonth[m] = (byMonth[m] || 0) + t.amount;
  });
  return byMonth;
}
function renderProjectsList() {
  const list = $('projectsList');
  if (!projects.length) { list.innerHTML = '<div class="empty" style="grid-column:1/-1;">Проектов пока нет. Создайте первый!</div>'; return; }
  list.innerHTML = projects.map(p => {
    const acc = findAcc(p.accountId);
    const prog = getProjectProgress(p);
    const pct = p.budget > 0 ? Math.min(100, (prog.value / p.budget) * 100) : 0;
    const typeLabel = p.type === 'savings' ? '\u{1F4B0} Накопительный' : '\u{1F4B8} Затратный';
    const progressColor = p.type === 'savings' ? 'var(--purple)' : 'var(--orange)';
    const budgetStr = p.budget ? fmt(p.budget) : 'без бюджета';
    return '<div class="project-card"><div class="project-card-header"><div class="project-name">' + escapeHtml(p.name) + '</div>' +
      '<div class="project-type ' + p.type + '">' + typeLabel + '</div></div>' +
      '<div class="project-account">' + acc.emoji + ' ' + escapeHtml(acc.name) + '</div>' +
      '<div class="project-progress"><div class="project-progress-bar"><div class="project-progress-fill" style="width:' + pct + '%;background:' + progressColor + ';"></div></div>' +
      '<div class="project-progress-text"><span>' + prog.label + ': <b>' + fmt(prog.value) + '</b></span><span>' + budgetStr + '</span></div></div>' +
      '<div class="project-actions"><button class="mini-btn" data-project-open="' + p.id + '">Открыть</button>' +
      '<button class="mini-btn red" data-project-delete="' + p.id + '">Удалить</button></div></div>';
  }).join('');
}
let currentProjectId = null;
function openProject(id) { currentProjectId = id; renderProjectDetail(); }
function closeProject() { currentProjectId = null; $('projectDetailView').style.display = 'none'; $('projectsListView').style.display = 'block'; renderProjectsList(); }
async function changeProjectType(id) {
  const p = findProject(id);
  if (!p) return;
  const newType = p.type === 'savings' ? 'expense' : 'savings';
  const typeName = newType === 'savings' ? 'Накопительный' : 'Затратный';
  const warn = newType === 'expense'
    ? 'Проект станет затратным. Прогресс будет считаться по тратам из подстатей.<br><br>Накопленные на счёте деньги останутся на месте.'
    : 'Проект станет накопительным. Прогресс будет равен балансу счёта.<br><br>Уже сделанные проектные траты останутся в истории, но перестанут учитываться в прогрессе.';
  const res = await modal.open({ title: 'Изменить тип проекта?', subtitle: '«' + p.name + '» → ' + typeName, warning: warn, confirmText: 'Изменить' });
  if (!res) return;
  p.type = newType;
  saveProjects(); renderProjectDetail(); renderProjectsList(); renderSavingsTree('savingsTree');
}
function renderProjectDetail() {
  const p = findProject(currentProjectId);
  if (!p) { closeProject(); return; }
  const view = $('projectDetailView');
  view.style.display = 'block'; $('projectsListView').style.display = 'none';
  const acc = findAcc(p.accountId);
  const prog = getProjectProgress(p);
  const pct = p.budget > 0 ? Math.min(100, (prog.value / p.budget) * 100) : 0;
  const typeLabel = p.type === 'savings' ? '\u{1F4B0} Накопительный' : '\u{1F4B8} Затратный';
  const progressColor = p.type === 'savings' ? 'var(--purple)' : 'var(--orange)';
  let html = '<div class="project-detail-header">' +
    '<button class="mini-btn" id="backToProjectsBtn">← К списку</button>' +
    '<h1 class="page-title">' + escapeHtml(p.name) + '</h1>' +
    '<div class="project-detail-type ' + p.type + '">' + typeLabel + '</div>' +
    '<button class="mini-btn orange" id="changeTypeBtn">\u{1F504} Изменить тип</button></div>';
  html += '<p class="page-sub">Счёт: ' + acc.emoji + ' ' + escapeHtml(acc.name) +
    (p.deadline ? ' · Срок: ' + new Date(p.deadline).toLocaleDateString('ru-RU') : '') + '</p>';
  const remainLabel = p.type === 'savings' ? 'Осталось накопить' : 'Осталось потратить';
  html += '<div class="summary" style="grid-template-columns:1fr 1fr 1fr;">' +
    '<div class="card"><div class="label">' + prog.label + '</div><div class="value ' + (p.type === 'savings' ? 'savings' : 'invest') + '">' + fmt(prog.value) + '</div></div>' +
    '<div class="card"><div class="label">Бюджет</div><div class="value">' + (p.budget ? fmt(p.budget) : '—') + '</div></div>' +
    '<div class="card"><div class="label">' + remainLabel + '</div><div class="value">' + (p.budget ? fmt(Math.max(0, p.budget - prog.value)) : '—') + '</div></div></div>';
  if (p.budget) {
    html += '<div class="card" style="margin-bottom:20px;"><div class="chart-title">Прогресс <span class="sub">' + pct.toFixed(1) + '%</span></div>' +
      '<div class="project-progress-bar" style="height:24px;"><div class="project-progress-fill" style="width:' + pct + '%;background:' + progressColor + ';"></div></div></div>';
  }
  if (p.type === 'savings') {
    html += '<div class="card" style="margin-bottom:20px;"><h3 style="font-size:15px;margin-bottom:12px;">Пополнить проект</h3>' +
      '<button class="submit-btn purple" id="pfDepositBtn" style="margin:0;">\u{1F4B0} Пополнить</button></div>';
    const projOps = transactions.filter(t => t.projectId === p.id && t.toAccountId === p.accountId).sort((a,b) => b.date.localeCompare(a.date) || b.id - a.id);
    html += '<div class="card" style="margin-bottom:20px;"><div class="chart-title">История пополнений <span class="sub">' + projOps.length + '</span></div>' +
      (projOps.length ? '<div style="display:flex;flex-direction:column;gap:6px;">' + projOps.map(t => {
        const fromAcc = findAcc(t.fromAccountId);
        const sign = t.type === 'save_in' ? '+' : t.type === 'save_out' ? '−' : '+';
        const color = t.type === 'save_in' ? 'var(--purple)' : t.type === 'save_out' ? 'var(--accent)' : 'var(--green)';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;gap:8px;flex-wrap:wrap;">' +
          '<span>' + new Date(t.date).toLocaleDateString('ru-RU') + ' · ' + fromAcc.emoji + ' ' + escapeHtml(fromAcc.name) + (t.note ? ' · ' + escapeHtml(t.note) : '') + '</span>' +
          '<span style="font-weight:600;color:' + color + ';font-variant-numeric:tabular-nums;">' + sign + ' ' + fmt(t.amount) + '</span></div>';
      }).join('') + '</div>' : '<div class="empty">Пока нет пополнений</div>') + '</div>';
  } else {
    const subsCount = (p.subcategories || []).length;
    html += '<div class="card" style="margin-bottom:20px;"><h3 style="font-size:15px;margin-bottom:12px;">Добавить трату</h3>' +
      (subsCount ? '<button class="submit-btn orange" id="pfExpenseBtn" style="margin:0;">\u{1F4B8} Добавить трату</button>' : '<div class="empty" style="padding:12px;">Сначала добавьте подстатьи</div>') +
      '<div class="form-hint" id="pfBalanceHint"></div></div>';
  }
  if ((p.subcategories || []).length) {
    html += '<div class="card" style="margin-bottom:20px;"><div class="chart-title">Подстатьи</div><div class="project-subs">';
    p.subcategories.forEach(sub => {
      const spent = p.type === 'expense' ? getProjectSpentBySub(p.id, sub.id) : 0;
      const subPct = sub.budget > 0 ? Math.min(100, (spent / sub.budget) * 100) : 0;
      const meta = p.type === 'expense' ? 'Потрачено: ' + fmt(spent) + (sub.budget ? ' из ' + fmt(sub.budget) : '') : 'Бюджет: ' + (sub.budget ? fmt(sub.budget) : '—');
      html += '<div class="project-sub-row"><div class="project-sub-info"><span class="project-sub-name">' + escapeHtml(sub.name) + '</span><span class="project-sub-meta">' + meta + '</span></div>' +
        (p.type === 'expense' && sub.budget ? '<div class="project-sub-bar"><div class="project-sub-fill" style="width:' + subPct + '%;"></div></div>' : '') + '</div>';
    });
    html += '</div></div>';
  }
  if (p.type === 'expense') {
    const byMonth = getProjectSpentByMonth(p.id);
    const months = Object.keys(byMonth).sort().reverse();
    html += '<div class="card"><div class="chart-title">Аналитика по месяцам</div>' +
      (months.length ? '<table class="month-table"><thead><tr><th>Месяц</th><th style="text-align:right;">Потрачено</th></tr></thead><tbody>' +
        months.map(m => '<tr><td>' + fmtMonth(m) + '</td><td class="num">' + fmt(byMonth[m]) + '</td></tr>').join('') +
        '<tr style="font-weight:700;"><td>Итого</td><td class="num">' + fmt(months.reduce((s,m) => s + byMonth[m], 0)) + '</td></tr></tbody></table>'
        : '<div class="empty">Пока нет трат</div>') + '</div>';
  }
  view.innerHTML = html;
  $('backToProjectsBtn').addEventListener('click', closeProject);
  $('changeTypeBtn').addEventListener('click', () => changeProjectType(p.id));
  if (p.type === 'savings') {
    $('pfDepositBtn').addEventListener('click', async () => {
      const regular = regularAccounts();
      if (!regular.length) { alert('Добавьте обычный счёт'); return; }
      const res = await modal.open({
        title: 'Пополнить проект', subtitle: p.name,
        fields: [
          { name: 'from', label: 'Откуда', type: 'select', options: regular.map(a => ({ value: a.id, label: a.emoji + ' ' + a.name })) },
          { name: 'amount', label: 'Сумма', type: 'number', min: 0.01, placeholder: '0.00' },
          { name: 'date', label: 'Дата', type: 'date', value: todayISO() },
        ], confirmText: 'Пополнить',
      });
      if (!res || !res.amount || res.amount <= 0) return;
      if (!checkSufficientFunds(res.from, res.amount)) return;
      transactions.push({ id: Date.now(), type: 'save_in', amount: res.amount, fromAccountId: res.from, toAccountId: p.accountId, projectId: p.id, date: res.date, note: 'Пополнение проекта: ' + p.name });
      saveTx(); invalidateBalanceCache(); renderProjectDetail();
    });
  } else {
    const balance = getAccountBalance(p.accountId);
    const balHint = $('pfBalanceHint');
    if (balHint) balHint.textContent = 'Доступно на счёте: ' + fmt(balance);
    if ($('pfExpenseBtn')) {
      $('pfExpenseBtn').addEventListener('click', async () => {
        const subs = (p.subcategories || []);
        const res = await modal.open({
          title: 'Добавить трату', subtitle: p.name,
          info: 'Доступно на счёте: <b>' + fmt(balance) + '</b>',
          fields: [
            { name: 'sub', label: 'Подстатья', type: 'select', options: subs.map(s => ({ value: s.id, label: s.name })) },
            { name: 'amount', label: 'Сумма', type: 'number', min: 0.01, placeholder: '0.00' },
            { name: 'date', label: 'Дата', type: 'date', value: todayISO() },
            { name: 'note', label: 'Заметка', type: 'text', placeholder: 'Комментарий', maxlength: 80 },
          ], confirmText: 'Добавить',
        });
        if (!res || !res.amount || res.amount <= 0) return;
        if (!checkSufficientFunds(p.accountId, res.amount)) return;
        transactions.push({ id: Date.now(), type: 'project_expense', projectId: p.id, subcategoryId: res.sub, fromAccountId: p.accountId, amount: res.amount, date: res.date, note: res.note || '' });
        saveTx(); invalidateBalanceCache(); renderProjectDetail();
      });
    }
  }
}
function renderProjectSubsDraft() {
  const wrap = $('projSubsList');
  if (!state.projectSubsDraft.length) { wrap.innerHTML = '<div class="form-hint">Подстатей нет. Нажмите «+ Добавить подстатью».</div>'; return; }
  wrap.innerHTML = state.projectSubsDraft.map((s, i) =>
    '<div class="sub-edit-row"><input type="text" data-sub-idx="' + i + '" data-sub-field="name" value="' + escapeHtml(s.name) + '" placeholder="Название">' +
    '<input type="number" data-sub-idx="' + i + '" data-sub-field="budget" value="' + (s.budget || '') + '" placeholder="Бюджет" step="0.01" min="0">' +
    '<button type="button" class="mini-btn red" data-sub-del="' + i + '">×</button></div>').join('');
}
function openProjectForm() {
  state.projectType = 'savings';
  state.projectSubsDraft = [];
  $('projName').value = ''; $('projAccountMode').value = 'new'; $('projAccName').value = ''; $('projAccBank').value = '';
  $('projBudget').value = ''; $('projDeadline').value = '';
  document.querySelectorAll('#projectForm [data-ptype]').forEach(b => b.classList.toggle('active', b.dataset.ptype === 'savings'));
  $('projNewAccountFields').style.display = 'block'; $('projExistingAccountFields').style.display = 'none';
  renderProjectSubsDraft(); renderProjAccSelect();
  $('projectFormWrap').style.display = 'block'; $('projectsListView').style.display = 'block'; $('projectDetailView').style.display = 'none';
  currentProjectId = null;
}
function closeProjectForm() { $('projectFormWrap').style.display = 'none'; }
function renderProjAccSelect() {
  const savings = savingsAccounts();
  $('projAccSelect').innerHTML = savings.length ? savings.map(a => '<option value="' + a.id + '">' + a.emoji + ' ' + escapeHtml(a.name) + '</option>').join('') : '<option value="">— нет счетов —</option>';
}
function projectFormSubmit(e) {
  e.preventDefault();
  const name = $('projName').value.trim();
  if (!name) return;
  const type = state.projectType;
  const mode = $('projAccountMode').value;
  let accountId;
  if (mode === 'new') {
    const accName = $('projAccName').value.trim() || name;
    const bank = $('projAccBank').value.trim();
    accountId = 'dep_' + Date.now();
    accounts.push({ id: accountId, name: accName, type: 'deposit', bank, rate: 0, initial: 0, emoji: '\u{1F4B0}' });
    saveAcc();
  } else {
    accountId = $('projAccSelect').value;
    if (!accountId) { alert('Выберите счёт'); return; }
  }
  const budget = parseFloat($('projBudget').value) || 0;
  const deadline = $('projDeadline').value || '';
  const id = 'proj_' + Date.now();
  const subs = state.projectSubsDraft.filter(s => s.name && s.name.trim()).map((s, i) => ({ id: 'sub_' + Date.now() + '_' + i, name: s.name.trim(), budget: Number(s.budget) || 0 }));
  projects.push({ id, name, type, accountId, budget, deadline, subcategories: subs, createdAt: todayISO() });
  saveProjects(); invalidateBalanceCache();
  closeProjectForm(); renderProjectsList(); renderSavingsSummary(); renderSavingsTree('savingsTree');
}
/* =========================================================
   ОСНОВНЫЕ РЕНДЕРЫ
   ========================================================= */
function renderSummary() {
  const tx = getMonthTransactions();
  const inc = tx.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const exp = tx.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
  const bal = inc - exp;
  $('incomeTotal').textContent = fmt(inc);
  $('expenseTotal').textContent = fmt(exp);
  const el = $('balance');
  el.textContent = fmt(bal);
  el.className = 'value' + (bal > 0 ? ' income' : bal < 0 ? ' expense' : '');
}
function renderRatio() {
  const tx = getMonthTransactions();
  const inc = tx.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const exp = tx.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
  const max = Math.max(inc, exp, 1);
  const incBar = $('ratioIncome');
  const expBar = $('ratioExpense');
  incBar.style.width = (inc / max * 100) + '%';
  expBar.style.width = (exp / max * 100) + '%';
  incBar.textContent = inc > 0 ? fmt(inc) : '';
  expBar.textContent = exp > 0 ? fmt(exp) : '';
  $('ratioPeriod').textContent = fmtMonth(state.month);
  const diff = inc - exp;
  if (inc === 0 && exp === 0) $('ratioDiff').innerHTML = 'За этот месяц операций нет';
  else if (diff > 0) $('ratioDiff').innerHTML = 'Профицит: <b style="color:var(--green)">+' + fmt(diff) + '</b>';
  else if (diff < 0) $('ratioDiff').innerHTML = 'Дефицит: <b style="color:var(--red)">' + fmt(diff) + '</b>';
  else $('ratioDiff').innerHTML = 'Баланс сведён к нулю';
}
function renderDonut(type, donutId, centerId, legendId) {
  const tx = getMonthTransactions().filter(t => t.type === type);
  const donut = $(donutId); const legend = $(legendId); const center = $(centerId);
  if (!tx.length) {
    donut.style.background = 'conic-gradient(var(--border) 0% 100%)';
    center.textContent = '0 ' + RUB;
    legend.innerHTML = '<div class="empty" style="padding:10px 0;">Пока нет данных</div>';
    return;
  }
  const byCat = {};
  tx.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const total = Object.values(byCat).reduce((s,v) => s + v, 0);
  const entries = Object.entries(byCat).map(([id,sum]) => ({ id, sum, ...findCat(type, id) })).sort((a,b) => b.sum - a.sum);
  let acc = 0;
  const segs = entries.map(e => { const start = acc; acc += (e.sum/total) * 100; return e.color + ' ' + start + '% ' + acc + '%'; });
  donut.style.background = 'conic-gradient(' + segs.join(', ') + ')';
  center.textContent = fmt(total);
  legend.innerHTML = entries.slice(0,6).map(e => {
    const pct = Math.round(e.sum / total * 100);
    return '<div class="legend-item"><span class="legend-dot" style="background:' + e.color + '"></span><span class="legend-name">' + e.emoji + ' ' + escapeHtml(e.name) + '</span><span class="legend-value">' + pct + '%</span></div>';
  }).join('');
}
function txItemHTML(t) {
  let cat, acc, sign, amountClass, title, metaParts = [];
  if (t.type === 'income' || t.type === 'expense') {
    cat = findCat(t.type, t.category); acc = findAcc(t.accountId);
    sign = t.type === 'income' ? '+' : '−'; amountClass = t.type;
    title = cat.emoji + ' ' + escapeHtml(cat.name);
    metaParts.push(acc.emoji + ' ' + escapeHtml(acc.name));
    if (t.subcategory) metaParts.push(escapeHtml(t.subcategory));
  } else if (t.type === 'save_in') {
    cat = { emoji:'\u{1F4B0}' };
    const to = findAcc(t.toAccountId);
    sign = '→'; amountClass = 'save_in'; title = '→ В сбережения';
    metaParts.push('из ' + findAcc(t.fromAccountId).name);
    metaParts.push('в ' + to.emoji + ' ' + escapeHtml(to.name));
  } else if (t.type === 'save_out') {
    cat = { emoji:'\u{1F4B8}' };
    const from = findAcc(t.fromAccountId);
    sign = '←'; amountClass = 'save_out'; title = '← Из сбережений';
    metaParts.push('из ' + from.emoji + ' ' + escapeHtml(from.name));
    metaParts.push('на ' + findAcc(t.toAccountId).name);
  } else if (t.type === 'interest') {
    cat = { emoji:'\u{1F4C8}' };
    sign = '+'; amountClass = 'interest'; title = '\u{1F4C8} Проценты по вкладу';
    metaParts.push('на ' + findAcc(t.toAccountId).name);
  } else if (t.type === 'project_expense') {
    const proj = findProject(t.projectId);
    const sub = proj ? (proj.subcategories || []).find(s => s.id === t.subcategoryId) : null;
    cat = { emoji: '\u{1F3AF}' }; acc = findAcc(t.fromAccountId);
    sign = '−'; amountClass = 'project_expense';
    title = '\u{1F3AF} ' + (proj ? escapeHtml(proj.name) : 'Проект') + (sub ? ' · ' + escapeHtml(sub.name) : '');
    metaParts.push('из ' + acc.emoji + ' ' + escapeHtml(acc.name));
  }
  const shopHtml = t.shop ? '<span class="tx-shop">\u{1F3EA} ' + escapeHtml(t.shop) + '</span>' : '';
  const noteHtml = t.note ? '<span>' + escapeHtml(t.note) + '</span>' : '';
  const metaInner = metaParts.map(p => '<span>' + p + '</span>').join('<span class="dot">•</span>');
  return '<div class="tx-item"><div class="tx-emoji">' + cat.emoji + '</div>' +
    '<div class="tx-info"><div class="tx-cat">' + title + '</div>' +
    '<div class="tx-meta">' + metaInner + (shopHtml ? '<span class="dot">•</span>' + shopHtml : '') + (noteHtml ? '<span class="dot">•</span>' + noteHtml : '') + '</div></div>' +
    '<div class="tx-amount ' + amountClass + '">' + sign + ' ' + fmt(t.amount) + '</div>' +
    '<button class="tx-delete" data-id="' + t.id + '" title="Удалить">×</button></div>';
}
function renderFormCategories() {
  const catSel = $('category');
  if (state.formType === 'save') return;
  catSel.innerHTML = getAllCategories(state.formType)
    .map(c => '<option value="' + c.id + '">' + c.emoji + ' ' + escapeHtml(c.name) + '</option>').join('');
  renderFormSubcategories();
}
function renderFormSubcategories() {
  if (state.formType === 'save') return;
  const cat = findCat(state.formType, $('category').value);
  const subs = cat.sub || [];
  $('subcategory').innerHTML = subs.length ? subs.map(s => '<option value="' + s + '">' + s + '</option>').join('') : '<option value="">—</option>';
}
function renderFormAccounts() {
  const regular = regularAccounts();
  const savings = savingsAccounts();
  $('account').innerHTML = regular.length ? regular.map(a => '<option value="' + a.id + '">' + a.emoji + ' ' + escapeHtml(a.name) + '</option>').join('') : '<option value="">— добавьте счёт —</option>';
  $('saveFrom').innerHTML = regular.length ? regular.map(a => '<option value="' + a.id + '">' + a.emoji + ' ' + escapeHtml(a.name) + '</option>').join('') : '<option value="">— нет —</option>';
  $('saveTo').innerHTML = savings.length ? savings.map(a => '<option value="' + a.id + '">' + a.emoji + ' ' + escapeHtml(a.name) + '</option>').join('') : '<option value="">— создайте депозит —</option>';
}
function updateAccountBalanceHint() {
  const hint = $('accountBalanceHint');
  if (!hint) return;
  if (state.formType === 'save') { hint.textContent = ''; return; }
  const accId = $('account').value;
  if (!accId) { hint.textContent = ''; return; }
  const bal = getAccountBalance(accId);
  hint.innerHTML = 'Баланс счёта: <b style="color:' + (bal < 0 ? 'var(--red)' : 'var(--text)') + '">' + fmt(bal) + '</b>';
}
function switchFormType(type) {
  state.formType = type;
  document.querySelectorAll('.type-toggle:not(#projectForm .type-toggle) button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  if (type === 'save') {
    $('fieldsStd').style.display = 'none';
    $('fieldsSave').style.display = 'block';
    $('submitBtn').textContent = 'Перевести в сбережения';
    $('submitBtn').classList.add('purple');
  } else {
    $('fieldsStd').style.display = 'block';
    $('fieldsSave').style.display = 'none';
    $('submitBtn').textContent = 'Добавить операцию';
    $('submitBtn').classList.remove('purple');
    renderFormCategories();
  }
  updateAccountBalanceHint();
}
function renderFilterCategories() {
  const all = [
    ...getAllCategories('expense').map(c => ({...c, type:'expense'})),
    ...getAllCategories('income').map(c => ({...c, type:'income'})),
  ];
  $('hCategory').innerHTML = '<option value="all">Все категории</option>' +
    all.map(c => '<option value="' + c.id + '">' + c.emoji + ' ' + escapeHtml(c.name) + '</option>').join('');
}
function renderFilterAccounts() {
  const opts = '<option value="all">Все счета</option>' + accounts.map(a => '<option value="' + a.id + '">' + a.emoji + ' ' + escapeHtml(a.name) + '</option>').join('');
  $('accountFilter').innerHTML = opts;
  $('hAccount').innerHTML = opts;
}
function renderHistory() {
  const month = $('hMonth').value;
  const type = $('hType').value;
  const cat = $('hCategory').value;
  const acc = $('hAccount').value;
  const shop = $('hShop').value.trim().toLowerCase();
  const search = $('hSearch').value.trim().toLowerCase();
  let items = transactions.slice();
  if (month) items = items.filter(t => t.date.slice(0,7) === month);
  if (type !== 'all') {
    if (type === 'save') items = items.filter(t => ['save_in','save_out','interest'].includes(t.type));
    else items = items.filter(t => t.type === type);
  }
  if (cat !== 'all') items = items.filter(t => t.category === cat);
  if (acc !== 'all') items = items.filter(t => t.accountId === acc || t.fromAccountId === acc || t.toAccountId === acc);
  if (shop) items = items.filter(t => (t.shop || '').toLowerCase().includes(shop));
  if (search) items = items.filter(t => (t.note || '').toLowerCase().includes(search));
  items.sort((a,b) => b.date.localeCompare(a.date) || b.id - a.id);
  $('historyCount').textContent = '· ' + items.length;
  const list = $('historyList');
  if (!items.length) { list.innerHTML = '<div class="empty">Операций по выбранным фильтрам нет</div>'; return; }
  const groups = {};
  items.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
  list.innerHTML = Object.keys(groups).sort().reverse().map(date => {
    const dayTx = groups[date];
    const dateLabel = new Date(date).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
    return '<div style="margin-top:8px;"><div style="font-size:12px;color:var(--muted);padding:8px 4px 4px;">' + dateLabel + '</div>' + dayTx.map(txItemHTML).join('') + '</div>';
  }).join('');
}
function renderAccounts() {
  const grid = $('accountsGrid');
  const regular = regularAccounts();
  if (!regular.length) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1;">Счетов пока нет.</div>'; return; }
  grid.innerHTML = regular.map(a => {
    const type = ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES.cash;
    const bal = getAccountBalance(a.id);
    const balClass = bal < 0 ? ' negative' : '';
    return '<div class="account-card"><div class="account-emoji" style="background:' + type.color + '">' + a.emoji + '</div>' +
      '<div class="account-info"><div class="account-name">' + escapeHtml(a.name) + '</div>' +
      '<div class="account-type">' + type.name + '</div>' +
      '<div class="account-balance' + balClass + '">' + fmt(bal) + '</div></div>' +
      '<button class="account-delete" data-id="' + a.id + '">×</button></div>';
  }).join('');
}
function renderSavingsTree(targetId) {
  const el = $(targetId);
  if (!el) return;
  const savings = savingsAccounts();
  if (!savings.length) { el.innerHTML = '<div class="empty" style="padding:20px 0;">Создайте первый депозит</div>'; return; }
  const groups = {};
  savings.forEach(a => {
    const bank = (a.bank || '').trim() || 'Без банка';
    (groups[bank] = groups[bank] || []).push(a);
  });
  const bankNames = Object.keys(groups).sort((a,b) => { if (a === 'Без банка') return 1; if (b === 'Без банка') return -1; return a.localeCompare(b, 'ru'); });
  el.innerHTML = bankNames.map(bank => {
    const deps = groups[bank].slice().sort((a,b) => getAccountBalance(b.id) - getAccountBalance(a.id));
    const bankTotal = deps.reduce((s,d) => s + getAccountBalance(d.id), 0);
    const noBankClass = bank === 'Без банка' ? ' no-bank' : '';
    return '<div class="bank-node' + noBankClass + '"><div class="bank-header"><span>\u{1F3E6} ' + escapeHtml(bank) + '</span><span class="bank-total">' + fmt(bankTotal) + '</span></div>' +
      deps.map(d => {
        const dt = DEPOSIT_TYPES[d.type] || DEPOSIT_TYPES.deposit;
        const bal = getAccountBalance(d.id);
        const linkedProjects = projects.filter(p => p.accountId === d.id);
        const rate = d.rate ? '<span>' + d.rate + '% годовых</span>' : '';
        const projTag = linkedProjects.length ? linkedProjects.map(p => '<span class="deposit-project-tag">\u{1F3AF} ' + escapeHtml(p.name) + '</span>').join(' ') : '';
        return '<div class="deposit-node"><div class="deposit-emoji">' + d.emoji + '</div>' +
          '<div class="deposit-info"><div class="deposit-name">' + escapeHtml(d.name) + ' ' + projTag + '</div>' +
          '<div class="deposit-meta"><span>' + dt.name + '</span>' + rate + '</div>' +
          '<div class="deposit-actions">' +
          '<button class="mini-btn" data-dep="' + d.id + '" data-act="save_in">Пополнить</button>' +
          '<button class="mini-btn" data-dep="' + d.id + '" data-act="save_out">Снять</button>' +
          '<button class="mini-btn" data-dep="' + d.id + '" data-act="interest">Проценты</button>' +
          '<button class="mini-btn" data-dep="' + d.id + '" data-act="edit">Изменить</button>' +
          '<button class="mini-btn" data-dep="' + d.id + '" data-act="delete" style="color:var(--red);">Удалить</button>' +
          '</div></div>' +
          '<div class="deposit-balance">' + fmt(bal) + '<small>' + dt.name + '</small></div></div>';
      }).join('') + '</div>';
  }).join('');
}
function renderSavingsSummary() {
  const savings = savingsAccounts();
  const total = savings.reduce((s,a) => s + getAccountBalance(a.id), 0);
  $('savingsTotal').textContent = fmt(total);
  $('savingsCount').textContent = savings.length;
}
function renderPortfolioSelector() {
  $('portfolioSelect').innerHTML = portfolios.map(p => '<option value="' + p.id + '"' + (p.id === activePortfolioId ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>').join('');
}
function renderInvestments() {
  const t = getInvestTotals();
  const cash = getCash();
  $('invInvested').textContent = fmt(t.invested);
  $('invValue').textContent = fmt(t.value);
  const plEl = $('invPL');
  const plPct = t.invested > 0 ? (t.pl / t.invested * 100) : 0;
  plEl.textContent = (t.pl >= 0 ? '+' : '') + fmt(t.pl) + (t.invested > 0 ? ' (' + plPct.toFixed(1) + '%)' : '');
  plEl.className = 'value ' + (t.pl > 0 ? 'income' : t.pl < 0 ? 'expense' : '');
  const cashEl = $('invCash');
  cashEl.textContent = fmt(cash);
  cashEl.className = 'value' + (cash < 0 ? ' margin' : '');
  $('cashHint').textContent = cash < 0 ? '(маржа)' : '';
  const totalAccount = t.value + cash;
  const totalEl = $('invTotalAccount');
  totalEl.textContent = fmt(totalAccount);
  totalEl.className = totalAccount < 0 ? 'neg' : '';
  const assets = getAssets();
  const tbody = $('investTable').querySelector('tbody');
  if (!assets.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:24px;">Портфель пуст.</td></tr>';
  } else {
    tbody.innerHTML = assets.map(a => {
      const qty = Number(a.quantity) || 0;
      const avgRub = assetAvgPriceRub(a);
      const curRub = assetPriceRub(a);
      const value = qty * curRub;
      const invested = qty * avgRub;
      const pl = value - invested;
      const plPct = invested > 0 ? (pl / invested * 100) : 0;
      const at = ASSET_TYPES[a.type] || ASSET_TYPES.other;
      const plClass = pl > 0 ? 'pl-positive' : pl < 0 ? 'pl-negative' : '';
      const plStr = (pl >= 0 ? '+' : '−') + fmtShort(Math.abs(pl)) + ' ' + RUB + (invested > 0 ? ' (' + (pl >= 0 ? '+' : '−') + Math.abs(plPct).toFixed(1) + '%)' : '');
      let avgDisplay, curDisplay;
      if (a.type === 'bond') {
        avgDisplay = fmtShort(a.avgPrice) + '% <span class="price-pct">(' + fmtShort(avgRub) + ' ₽)</span>';
        curDisplay = fmtShort(a.currentPrice) + '% <span class="price-pct">(' + fmtShort(curRub) + ' ₽)</span>';
      } else {
        avgDisplay = fmtShort(a.avgPrice);
        curDisplay = fmtShort(a.currentPrice);
      }
      const tickerLine = a.ticker ? escapeHtml(a.ticker) + (a.isin ? ' · ' + escapeHtml(a.isin) : '') : (a.isin ? escapeHtml(a.isin) : '');
      const riskVal = (at.risk || 60);
      let riskClass, riskLabel;
      if (riskVal < 35)      { riskClass = 'low';       riskLabel = 'Низкий'; }
      else if (riskVal < 60) { riskClass = 'medium';    riskLabel = 'Средний'; }
      else if (riskVal < 85) { riskClass = 'high';      riskLabel = 'Высокий'; }
      else                   { riskClass = 'very-high'; riskLabel = 'Очень высокий'; }
      return '<tr><td><div class="asset-name">' + at.emoji + ' ' + escapeHtml(a.name) + '</div>' + (tickerLine ? '<div class="asset-ticker">' + tickerLine + '</div>' : '') + '</td>' +
        '<td><span class="type-badge" style="background:' + at.color + '22;color:' + at.color + ';">' + at.name + '</span></td>' +
        '<td><span class="asset-risk-badge ' + riskClass + '">' + riskLabel + '</span></td>' +
        '<td class="num">' + qty + '</td><td class="num">' + avgDisplay + '</td><td class="num">' + curDisplay + '</td>' +
        '<td class="num"><b>' + fmtShort(value) + ' ' + RUB + '</b></td>' +
        '<td class="num ' + plClass + '">' + plStr + '</td>' +
        '<td><div class="asset-actions">' +
        '<button class="mini-btn orange" data-asset="' + a.id + '" data-act="buy">Купить</button>' +
        '<button class="mini-btn orange" data-asset="' + a.id + '" data-act="sell">Продать</button>' +
        '<button class="mini-btn orange" data-asset="' + a.id + '" data-act="price">Цена</button>' +
        '<button class="mini-btn" data-asset="' + a.id + '" data-act="delete" style="color:var(--red);">×</button>' +
        '</div></td></tr>';
    }).join('');
  }
  const donut = $('donutInvest');
  const legend = $('legendInvest');
  const center = $('donutInvestCenter');
  if (!assets.length) {
    donut.style.background = 'conic-gradient(var(--border) 0% 100%)';
    center.textContent = '0 ' + RUB;
    legend.innerHTML = '<div class="empty" style="padding:10px 0;">Пока нет активов</div>';
  } else {
    const byType = {};
    assets.forEach(a => { const v = (Number(a.quantity) || 0) * assetPriceRub(a); if (v > 0) byType[a.type] = (byType[a.type] || 0) + v; });
    const total = Object.values(byType).reduce((s,v) => s + v, 0);
    if (total <= 0) {
      donut.style.background = 'conic-gradient(var(--border) 0% 100%)';
      center.textContent = '0 ' + RUB;
      legend.innerHTML = '<div class="empty" style="padding:10px 0;">Стоимость нулевая</div>';
    } else {
      const entries = Object.entries(byType).map(([id,sum]) => ({ id, sum, ...(ASSET_TYPES[id] || ASSET_TYPES.other) })).sort((a,b) => b.sum - a.sum);
      let acc = 0;
      const segs = entries.map(e => { const start = acc; acc += (e.sum/total) * 100; return e.color + ' ' + start + '% ' + acc + '%'; });
      donut.style.background = 'conic-gradient(' + segs.join(', ') + ')';
      center.textContent = fmt(total);
      legend.innerHTML = entries.map(e => {
        const pct = Math.round(e.sum / total * 100);
        return '<div class="legend-item"><span class="legend-dot" style="background:' + e.color + '"></span><span class="legend-name">' + e.emoji + ' ' + escapeHtml(e.name) + '</span><span class="legend-value">' + pct + '%</span></div>';
      }).join('');
    }
  }
  renderRiskProfile();
  requestAnimationFrame(() => { drawGrowthChart(); drawPayoutChart(); });
}
let __reportCacheKey = '';
function getReportPeriodRange() {
  const period = state.reportPeriod;
  const m = state.reportMonth;
  if (period === 'all') return { from: '', to: '' };
  const [y, mo] = m.split('-').map(Number);
  if (period === 'month') return { from: m + '-01', to: m + '-31' };
  if (period === 'quarter') {
    const q = Math.floor((mo - 1) / 3);
    const startM = q * 3 + 1;
    const endM = startM + 2;
    const from = y + '-' + String(startM).padStart(2,'0') + '-01';
    const lastDay = new Date(y, endM, 0).getDate();
    const to = y + '-' + String(endM).padStart(2,'0') + '-' + String(lastDay).padStart(2,'0');
    return { from, to };
  }
  if (period === 'year') return { from: y + '-01-01', to: y + '-12-31' };
  return { from: '', to: '' };
}
function getPrevPeriodRange() {
  const period = state.reportPeriod;
  const m = state.reportMonth;
  if (period === 'all') return null;
  const [y, mo] = m.split('-').map(Number);
  if (period === 'month') {
    const d = new Date(y, mo - 2, 1);
    const yy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2,'0');
    return { from: yy + '-' + mm + '-01', to: yy + '-' + mm + '-31' };
  }
  if (period === 'quarter') {
    const q = Math.floor((mo - 1) / 3);
    const prevStartM = q === 0 ? 10 : (q - 1) * 3 + 1;
    const prevYear = q === 0 ? y - 1 : y;
    const prevEndM = prevStartM + 2;
    const from = prevYear + '-' + String(prevStartM).padStart(2,'0') + '-01';
    const lastDay = new Date(prevYear, prevEndM, 0).getDate();
    const to = prevYear + '-' + String(prevEndM).padStart(2,'0') + '-' + String(lastDay).padStart(2,'0');
    return { from, to };
  }
  if (period === 'year') return { from: (y - 1) + '-01-01', to: (y - 1) + '-12-31' };
  return null;
}
function renderReport() {
  const { from, to } = getReportPeriodRange();
  const prev = getPrevPeriodRange();
  let items = transactions.filter(t => t.type === 'income' || t.type === 'expense');
  if (from && to) items = items.filter(t => t.date >= from && t.date <= to);
  if (state.reportType !== 'all') items = items.filter(t => t.type === state.reportType);
  const byCat = {};
  items.forEach(t => {
    const cid = t.category;
    const sub = t.subcategory || 'Без подкатегории';
    if (!byCat[cid]) byCat[cid] = { sum: 0, count: 0, subs: {}, type: t.type };
    byCat[cid].sum += t.amount; byCat[cid].count += 1;
    if (!byCat[cid].subs[sub]) byCat[cid].subs[sub] = { sum: 0, count: 0 };
    byCat[cid].subs[sub].sum += t.amount; byCat[cid].subs[sub].count += 1;
  });
  let prevItems = transactions.filter(t => t.type === 'income' || t.type === 'expense');
  if (prev && prev.from && prev.to) prevItems = prevItems.filter(t => t.date >= prev.from && t.date <= prev.to);
  else prevItems = [];
  if (state.reportType !== 'all') prevItems = prevItems.filter(t => t.type === state.reportType);
  const prevByCat = {};
  prevItems.forEach(t => { prevByCat[t.category] = (prevByCat[t.category] || 0) + t.amount; });
  const total = Object.values(byCat).reduce((s,v) => s + v.sum, 0);
  const catOrder = Object.keys(byCat).sort((a,b) => byCat[b].sum - byCat[a].sum);
  const tbody = $('reportTable').querySelector('tbody');
  if (!catOrder.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:40px;">Данных нет</td></tr>'; return; }
  let html = '';
  catOrder.forEach(cid => {
    const catData = byCat[cid];
    const catMeta = findCat(catData.type, cid);
    const pct = total > 0 ? (catData.sum / total * 100) : 0;
    const avg = catData.count > 0 ? catData.sum / catData.count : 0;
    const isExpanded = state.expandedCats.has(cid);
    let diffHtml = '';
    const prevSum = prevByCat[cid] || 0;
    if (prev && prev.from && prevSum > 0) {
      const diff = ((catData.sum - prevSum) / prevSum) * 100;
      if (diff > 0.5) diffHtml = '<span class="diff-up">↑ ' + diff.toFixed(0) + '%</span>';
      else if (diff < -0.5) diffHtml = '<span class="diff-down">↓ ' + Math.abs(diff).toFixed(0) + '%</span>';
      else diffHtml = '<span class="diff-neutral">≈</span>';
    }
    html += '<tr class="cat-row" data-cat="' + cid + '"><td><span class="expand-arrow' + (isExpanded ? ' open' : '') + '">▶</span> ' + catMeta.emoji + ' ' + escapeHtml(catMeta.name) + '</td><td class="num"><b>' + fmt(catData.sum) + '</b></td><td class="num">' + pct.toFixed(1) + '%</td><td class="num">' + catData.count + '</td><td class="num">' + fmt(avg) + '</td><td class="num">' + diffHtml + '</td></tr>';
    if (isExpanded) {
      Object.keys(catData.subs).sort((a,b) => catData.subs[b].sum - catData.subs[a].sum).forEach(subName => {
        const s = catData.subs[subName];
        html += '<tr class="sub-row"><td>' + escapeHtml(subName) + '</td><td class="num">' + fmt(s.sum) + '</td><td class="num">' + (catData.sum > 0 ? (s.sum / catData.sum * 100).toFixed(1) : 0) + '%</td><td class="num">' + s.count + '</td><td class="num">' + fmt(s.count > 0 ? s.sum / s.count : 0) + '</td><td class="num">—</td></tr>';
      });
    }
  });
  html += '<tr class="total-row"><td>Итого</td><td class="num">' + fmt(total) + '</td><td class="num">100%</td><td class="num">' + items.length + '</td><td class="num">—</td><td class="num">—</td></tr>';
  tbody.innerHTML = html;
  tbody.querySelectorAll('tr.cat-row').forEach(row => {
    row.addEventListener('click', () => {
      const cid = row.dataset.cat;
      if (state.expandedCats.has(cid)) state.expandedCats.delete(cid); else state.expandedCats.add(cid);
      renderReport();
    });
  });
}
function renderAnalytics() {
  const byMonth = {};
  transactions.forEach(t => {
    if (t.type !== 'income' && t.type !== 'expense') return;
    const m = t.date.slice(0,7);
    byMonth[m] = byMonth[m] || { inc:0, exp:0 };
    if (t.type === 'income') byMonth[m].inc += t.amount; else byMonth[m].exp += t.amount;
  });
  const months = Object.keys(byMonth).sort().reverse().slice(0, 12);
  const tbody = $('monthTable').querySelector('tbody');
  if (!months.length) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px;">Пока нет данных</td></tr>';
  else tbody.innerHTML = months.map(m => {
    const { inc, exp } = byMonth[m];
    const bal = inc - exp;
    const balColor = bal > 0 ? 'var(--green)' : bal < 0 ? 'var(--red)' : 'var(--muted)';
    return '<tr><td>' + fmtMonth(m) + '</td><td class="num income">' + (inc ? '+' + fmt(inc) : '—') + '</td><td class="num expense">' + (exp ? '−' + fmt(exp) : '—') + '</td><td class="num balance" style="color:' + balColor + '">' + fmt(bal) + '</td></tr>';
  }).join('');
  renderTopList('topExpenseLegend', 'expense');
  renderTopList('topIncomeLegend', 'income');
  renderTopShops();
  const m = $('aMonth').value || state.month;
  $('movementPeriod').textContent = fmtMonth(m);
  const mTx = transactions.filter(t => t.date.slice(0,7) === m);
  const savIn = mTx.filter(t => t.type === 'save_in').reduce((s,t) => s + t.amount, 0);
  const savOut = mTx.filter(t => t.type === 'save_out').reduce((s,t) => s + t.amount, 0);
  const interest = mTx.filter(t => t.type === 'interest').reduce((s,t) => s + t.amount, 0);
  const net = savIn + interest - savOut;
  $('movSavIn').textContent = '+' + fmt(savIn);
  $('movInterest').textContent = '+' + fmt(interest);
  $('movSavOut').textContent = '−' + fmt(savOut);
  const netEl = $('movNet');
  netEl.textContent = (net >= 0 ? '+' : '') + fmt(net);
  netEl.className = 'value ' + (net > 0 ? 'purple' : net < 0 ? 'red' : '');
  const regularTotal = regularAccounts().reduce((s,a) => s + getAccountBalance(a.id), 0);
  const savingsTotal = savingsAccounts().reduce((s,a) => s + getAccountBalance(a.id), 0);
  let investTotal = 0;
  portfolios.forEach(pf => {
    const pfValue = (pf.assets || []).reduce((s, a) => s + (Number(a.quantity) || 0) * assetPriceRub(a), 0);
    investTotal += pfValue + (pf.cash || 0);
  });
  const capital = regularTotal + savingsTotal + investTotal;
  const investRow = investTotal < 0 ? '<span class="val red">' + fmt(investTotal) + '</span>' : '<span class="val orange">' + fmt(investTotal) + '</span>';
  $('capitalBlock').innerHTML =
    '<div class="capital-row"><span class="lbl">Обычные счета</span><span class="val green">' + fmt(regularTotal) + '</span></div>' +
    '<div class="capital-row"><span class="lbl">Сбережения</span><span class="val purple">' + fmt(savingsTotal) + '</span></div>' +
    '<div class="capital-row"><span class="lbl">Инвестиции</span>' + investRow + '</div>' +
    '<div class="capital-row total"><span class="lbl">Итого капитал</span><span class="val">' + fmt(capital) + '</span></div>';
}
function renderTopList(elId, type) {
  const byCat = {};
  transactions.filter(t => t.type === type).forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const entries = Object.entries(byCat).map(([id,sum]) => ({ id, sum, ...findCat(type, id) })).sort((a,b) => b.sum - a.sum);
  const total = entries.reduce((s,e) => s + e.sum, 0);
  const el = $(elId);
  if (!entries.length) { el.innerHTML = '<div class="empty" style="padding:20px 0;">Пока нет данных</div>'; return; }
  el.innerHTML = entries.map((e,i) => {
    const pct = Math.round(e.sum / total * 100);
    return '<div style="padding:8px 0;border-bottom:1px solid var(--border);"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;"><span>' + (i+1) + '. ' + e.emoji + ' ' + escapeHtml(e.name) + '</span><span style="color:var(--muted);font-variant-numeric:tabular-nums;">' + fmt(e.sum) + ' · ' + pct + '%</span></div><div style="height:6px;background:var(--bg2);border-radius:3px;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:' + e.color + ';border-radius:3px;"></div></div></div>';
  }).join('');
}
function renderTopShops() {
  const byShop = {};
  transactions.filter(t => t.type === 'expense' && t.shop).forEach(t => { byShop[t.shop] = (byShop[t.shop] || 0) + t.amount; });
  const entries = Object.entries(byShop).map(([name, sum]) => ({ name, sum })).sort((a,b) => b.sum - a.sum);
  const total = entries.reduce((s,e) => s + e.sum, 0);
  const el = $('topShopsLegend');
  if (!entries.length) { el.innerHTML = '<div class="empty" style="padding:20px 0;">Пока нет данных</div>'; return; }
  el.innerHTML = entries.slice(0, 12).map((e,i) => {
    const pct = Math.round(e.sum / total * 100);
    return '<div style="padding:8px 0;border-bottom:1px solid var(--border);"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;"><span>' + (i+1) + '. \u{1F3EA} ' + escapeHtml(e.name) + '</span><span style="color:var(--muted);font-variant-numeric:tabular-nums;">' + fmt(e.sum) + ' · ' + pct + '%</span></div><div style="height:6px;background:var(--bg2);border-radius:3px;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:var(--accent);border-radius:3px;"></div></div></div>';
  }).join('');
}
function renderMain() {
  renderSummary(); renderRatio();
  renderDonut('expense', 'donutExpense', 'donutExpenseCenter', 'legendExpense');
  renderDonut('income', 'donutIncome', 'donutIncomeCenter', 'legendIncome');
}
function renderActiveTab() {
  switch (state.activeTab) {
    case 'history':     renderHistory(); break;
    case 'accounts':    renderAccounts(); break;
    case 'savings':     renderSavingsTree('savingsTree'); break;
    case 'investments': renderInvestments(); break;
    case 'projects':    renderProjectsList(); if (currentProjectId) renderProjectDetail(); break;
    case 'analytics':   renderAnalytics(); break;
    case 'report':      renderReport(); break;
    case 'news':        renderNews(); break;
    case 'budgets':     renderBudgets(); break;
  }
}
function renderEverything() {
  invalidateBalanceCache();
  refreshShopDatalists();
  renderPortfolioSelector();
  renderMain();
  renderSavingsSummary();
  renderActiveTab();
  updateAccountBalanceHint();
}
async function autoRefreshPrices() {
  const assets = getAssets();
  if (!assets.length) return;
  const toUpdate = assets.filter(a => a.ticker);
  if (!toUpdate.length) return;
  $('priceStatus').innerHTML = '<span class="price-loading">&#x23F3;</span> обновление...';
  let updated = 0, failed = 0;
  for (const asset of toUpdate) {
    const price = await fetchMoexPrice(asset.ticker, asset.type === 'bond');
    if (price !== null && price > 0) { asset.currentPrice = price; updated++; } else failed++;
    await new Promise(r => setTimeout(r, 200));
  }
  savePortfolios();
  if (state.activeTab === 'investments') renderInvestments();
  if (state.activeTab === 'analytics') renderAnalytics();
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  $('priceStatus').textContent = updated > 0 ? 'обновлено в ' + time + (failed ? ', ошибок: ' + failed : '') : 'не удалось обновить';
}

/* =========================================================
   ДЕЙСТВИЯ
   ========================================================= */
async function handleDepositAction(btn) {
  const depId = btn.dataset.dep;
  const act = btn.dataset.act;
  const dep = accounts.find(a => a.id === depId);
  if (!dep) return;
  const linkedProjs = projects.filter(p => p.accountId === depId);
  if (act === 'delete') {
    if (linkedProjs.length) { alert('Этот счёт привязан к проектам: ' + linkedProjs.map(p => '«' + p.name + '»').join(', ') + '. Сначала удалите их.'); return; }
    const used = transactions.some(t => t.fromAccountId === depId || t.toAccountId === depId);
    const res = await modal.open({ title: 'Удалить депозит?', subtitle: dep.emoji + ' ' + dep.name,
      warning: used ? 'По депозиту есть операции. Они сохранятся, но счёт будет помечен как «Удалён».' : null, confirmText: 'Удалить' });
    if (!res) return;
    accounts = accounts.filter(a => a.id !== depId);
    saveAcc(); invalidateBalanceCache(); renderEverything();
    return;
  }
  if (act === 'edit') {
    const res = await modal.open({
      title: 'Редактировать депозит',
      fields: [
        { name: 'name', label: 'Название', type: 'text', value: dep.name, maxlength: 40 },
        { name: 'bank', label: 'Банк / где лежит', type: 'text', value: dep.bank || '', maxlength: 30 },
        { name: 'rate', label: 'Ставка, % годовых', type: 'number', value: dep.rate || 0, step: '0.01', min: 0 },
      ], confirmText: 'Сохранить',
    });
    if (!res) return;
    dep.name = res.name.trim() || dep.name;
    dep.bank = (res.bank || '').trim();
    dep.rate = parseFloat(res.rate) || 0;
    saveAcc(); invalidateBalanceCache(); renderEverything();
    return;
  }
  const regular = regularAccounts();
  if (!regular.length) { alert('Сначала добавьте обычный счёт'); return; }
  if (act === 'save_in') {
    const res = await modal.open({ title: 'Пополнить депозит', subtitle: dep.emoji + ' ' + dep.name,
      fields: [
        { name: 'from', label: 'Откуда', type: 'select', options: regular.map(a => ({ value: a.id, label: a.emoji + ' ' + a.name })) },
        { name: 'amount', label: 'Сумма', type: 'number', min: 0.01, placeholder: '0.00' },
        { name: 'date', label: 'Дата', type: 'date', value: todayISO() },
      ], confirmText: 'Пополнить' });
    if (!res || !res.amount || res.amount <= 0) return;
    if (!checkSufficientFunds(res.from, res.amount)) return;
    transactions.push({ id: Date.now(), type: 'save_in', amount: res.amount, fromAccountId: res.from, toAccountId: depId, date: res.date, note: '' });
    saveTx(); invalidateBalanceCache(); renderEverything();
    return;
  }
  if (act === 'save_out') {
    const res = await modal.open({ title: 'Снять с депозита', subtitle: dep.emoji + ' ' + dep.name,
      fields: [
        { name: 'to', label: 'Куда', type: 'select', options: regular.map(a => ({ value: a.id, label: a.emoji + ' ' + a.name })) },
        { name: 'amount', label: 'Сумма', type: 'number', min: 0.01, placeholder: '0.00' },
        { name: 'date', label: 'Дата', type: 'date', value: todayISO() },
      ], confirmText: 'Снять' });
    if (!res || !res.amount || res.amount <= 0) return;
    if (!checkSufficientFunds(depId, res.amount)) return;
    transactions.push({ id: Date.now(), type: 'save_out', amount: res.amount, fromAccountId: depId, toAccountId: res.to, date: res.date, note: '' });
    saveTx(); invalidateBalanceCache(); renderEverything();
    return;
  }
  if (act === 'interest') {
    const res = await modal.open({ title: 'Начислить проценты', subtitle: dep.emoji + ' ' + dep.name,
      fields: [
        { name: 'amount', label: 'Сумма процентов', type: 'number', min: 0.01, placeholder: '0.00' },
        { name: 'date', label: 'Дата', type: 'date', value: todayISO() },
      ], confirmText: 'Начислить' });
    if (!res || !res.amount || res.amount <= 0) return;
    transactions.push({ id: Date.now(), type: 'interest', amount: res.amount, toAccountId: depId, date: res.date, note: '' });
    saveTx(); invalidateBalanceCache(); renderEverything();
    return;
  }
}
async function handleAssetAction(btn) {
  const astId = btn.dataset.asset;
  const act = btn.dataset.act;
  const ast = getAssets().find(a => a.id === astId);
  if (!ast) return;
  const isBond = ast.type === 'bond';
  const priceUnit = isBond ? '% от номинала' : '₽';
  if (act === 'delete') {
    const res = await modal.open({ title: 'Удалить актив?', subtitle: ast.name, confirmText: 'Удалить' });
    if (!res) return;
    getActivePortfolio().assets = getAssets().filter(a => a.id !== astId);
    savePortfolios(); invalidateBalanceCache(); renderInvestments(); renderAnalytics();
    return;
  }
  if (act === 'price') {
    const res = await modal.open({ title: 'Обновить цену', subtitle: ast.name,
      fields: [{ name: 'price', label: 'Текущая цена (' + priceUnit + ')', type: 'number', value: ast.currentPrice || ast.avgPrice || 0, step: '0.01', min: 0 }],
      confirmText: 'Сохранить' });
    if (!res || isNaN(res.price) || res.price < 0) return;
    ast.currentPrice = res.price; savePortfolios(); renderInvestments(); renderAnalytics();
    return;
  }
  if (act === 'buy') {
    const res = await modal.open({ title: 'Купить актив', subtitle: ast.name,
      fields: [
        { name: 'qty', label: 'Количество', type: 'number', step: '0.0001', min: 0.0001, placeholder: '0' },
        { name: 'price', label: 'Цена покупки за единицу (' + priceUnit + ')', type: 'number', value: ast.currentPrice || ast.avgPrice || 0, step: '0.01', min: 0 },
      ], confirmText: 'Купить' });
    if (!res || !res.qty || res.qty <= 0 || !res.price || res.price <= 0) return;
    const cost = rubCost(ast, res.price, res.qty);
    const pf = getActivePortfolio();
    const newCash = pf.cash - cost;
    const oldQty = Number(ast.quantity) || 0;
    const oldAvg = Number(ast.avgPrice) || 0;
    const newQty = oldQty + res.qty;
    const newAvg = newQty > 0 ? ((oldQty * oldAvg) + (res.qty * res.price)) / newQty : 0;
    ast.quantity = newQty; ast.avgPrice = newAvg; ast.currentPrice = res.price;
    pf.cash = newCash;
    savePortfolios(); renderInvestments(); renderAnalytics();
    if (newCash < 0) setTimeout(() => alert('⚠️ Свободные деньги ушли в минус: ' + fmt(newCash) + ' (маржа)'), 100);
    return;
  }
  if (act === 'sell') {
    const oldQty = Number(ast.quantity) || 0;
    if (oldQty <= 0) { alert('Нечего продавать'); return; }
    const res = await modal.open({ title: 'Продать актив', subtitle: ast.name,
      info: 'В наличии: <b>' + oldQty + '</b> шт.',
      fields: [
        { name: 'qty', label: 'Количество', type: 'number', step: '0.0001', min: 0.0001, placeholder: '0' },
        { name: 'price', label: 'Цена продажи за единицу (' + priceUnit + ')', type: 'number', value: ast.currentPrice || ast.avgPrice || 0, step: '0.01', min: 0 },
      ], confirmText: 'Продать' });
    if (!res || !res.qty || res.qty <= 0 || !res.price || res.price <= 0) return;
    if (res.qty > oldQty + 1e-6) { alert('Больше, чем есть в наличии'); return; }
    const proceeds = rubCost(ast, res.price, res.qty);
    const pf = getActivePortfolio();
    ast.quantity = Math.max(0, oldQty - res.qty); ast.currentPrice = res.price;
    pf.cash += proceeds;
    savePortfolios(); renderInvestments(); renderAnalytics();
    return;
  }
}
document.addEventListener('click', e => {
  const delBtn = e.target.closest('.tx-delete');
  if (delBtn) {
    const id = Number(delBtn.dataset.id);
    if (!confirm('Удалить эту операцию?')) return;
    transactions = transactions.filter(t => t.id !== id);
    saveTx(); invalidateBalanceCache(); renderEverything();
    return;
  }
  const btn = e.target.closest('.mini-btn');
  if (btn && btn.dataset.dep !== undefined) { handleDepositAction(btn); return; }
  if (btn && btn.dataset.asset !== undefined) { handleAssetAction(btn); return; }
});

/* =========================================================
   АВТОРИЗАЦИЯ + ТЕМА
   ========================================================= */
$('authBtn').addEventListener('click', () => {
  const login = $('authLogin').value.trim();
  const pass = $('authPassword').value;
  if (login === AUTH_LOGIN && pass === AUTH_PASSWORD) { setAuthed(true); showApp(); initApp(); }
  else $('authError').textContent = 'Неверный логин или пароль';
});
$('authPassword').addEventListener('keydown', e => { if (e.key === 'Enter') $('authBtn').click(); });
$('authLogin').addEventListener('keydown', e => { if (e.key === 'Enter') $('authPassword').focus(); });
$('logoutBtn').addEventListener('click', () => {
  if (!confirm('Выйти из аккаунта?')) return;
  setAuthed(false); $('authLogin').value = ''; $('authPassword').value = ''; $('authError').textContent = ''; showAuth();
});
$('themeBtn').addEventListener('click', () => setDark(!isDark()));
$('backupBtn').addEventListener('click', openBackupDialog);

/* =========================================================
   НАВИГАЦИЯ
   ========================================================= */
document.querySelectorAll('.sidebar-nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    state.activeTab = tab;
    document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
    renderActiveTab();
    if (window.innerWidth <= 768) setTimeout(() => $('sidebar').classList.remove('open'), 100);
  });
});
$('sidebar').addEventListener('click', e => {
  if (window.innerWidth > 768) return;
  if (e.target.closest('button[data-tab]') || e.target.closest('#logoutBtn') || e.target.closest('#themeBtn')) return;
  $('sidebar').classList.toggle('open');
});

/* =========================================================
   ГЛАВНАЯ ФОРМА
   ========================================================= */
document.querySelectorAll('.type-toggle:not(#projectForm .type-toggle) button').forEach(btn => {
  btn.addEventListener('click', () => switchFormType(btn.dataset.type));
});
$('category').addEventListener('change', renderFormSubcategories);
$('account').addEventListener('change', updateAccountBalanceHint);
$('txForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = parseFloat($('amount').value);
  if (!amount || amount <= 0) return;
  const date = $('date').value;
  const note = $('note').value.trim();
  const shop = $('shop').value.trim();
  if (state.formType === 'save') {
    const from = $('saveFrom').value;
    const to = $('saveTo').value;
    if (!from) { alert('Добавьте счёт'); return; }
    if (!to) { alert('Создайте депозит'); return; }
    if (from === to) { alert('Счета не должны совпадать'); return; }
    if (!checkSufficientFunds(from, amount)) return;
    transactions.push({ id:Date.now(), type:'save_in', amount, fromAccountId:from, toAccountId:to, date, note });
  } else {
    if (!$('account').value) { alert('Добавьте счёт'); return; }
    if (state.formType === 'expense') {
      if (!checkSufficientFunds($('account').value, amount)) return;
    }
    transactions.push({ id: Date.now(), type: state.formType, amount, category: $('category').value, subcategory: $('subcategory').value, accountId: $('account').value, shop, date, note });
  }
  saveTx();
  $('amount').value = ''; $('note').value = ''; $('shop').value = '';
  $('amount').focus();
  const txMonth = date.slice(0,7);
  if (txMonth !== state.month) { state.month = txMonth; $('monthPicker').value = txMonth; }
  invalidateBalanceCache();
  renderEverything();
});
$('monthPicker').addEventListener('change', () => { state.month = $('monthPicker').value; renderMain(); if (state.activeTab === 'budgets') renderBudgets(); });
$('accountFilter').addEventListener('change', () => { state.accountFilter = $('accountFilter').value; renderMain(); });
$('repType').addEventListener('change', () => { state.reportType = $('repType').value; state.expandedCats.clear(); renderReport(); });
$('repPeriod').addEventListener('change', () => { state.reportPeriod = $('repPeriod').value; renderReport(); });
$('repMonth').addEventListener('change', () => { state.reportMonth = $('repMonth').value; renderReport(); });
$('repExpandAll').addEventListener('click', () => {
  const { from, to } = getReportPeriodRange();
  let items = transactions.filter(t => t.type === 'income' || t.type === 'expense');
  if (from && to) items = items.filter(t => t.date >= from && t.date <= to);
  if (state.reportType !== 'all') items = items.filter(t => t.type === state.reportType);
  state.expandedCats = new Set(items.map(t => t.category));
  renderReport();
});
$('repCollapseAll').addEventListener('click', () => { state.expandedCats.clear(); renderReport(); });
['hMonth','hType','hCategory','hAccount'].forEach(id => $(id).addEventListener('change', renderHistory));
$('hShop').addEventListener('input', renderHistory);
$('hSearch').addEventListener('input', renderHistory);
$('expHistoryBtn').addEventListener('click', exportHistoryCSV);
$('expReportBtn').addEventListener('click', exportReportCSV);
$('expPortfolioBtn').addEventListener('click', exportPortfolioCSV);
$('openBudgetSettings').addEventListener('click', openBudgetSettings);

$('manageCatsBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  const action = confirm('OK — добавить новую категорию.\nОтмена — удалить существующую.');
  if (action) await openCategoryManager();
  else await openCategoryDelete();
});

/* Счета */
$('accountForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('accName').value.trim();
  if (!name) return;
  const id = 'acc_' + Date.now();
  accounts.push({ id, name, type: $('accType').value, emoji: $('accEmoji').value.trim() || '\u{1F3E6}', initial: parseFloat($('accInitial').value) || 0 });
  saveAcc();
  $('accName').value = ''; $('accInitial').value = '0'; $('accEmoji').value = '\u{1F3E6}';
  invalidateBalanceCache(); renderEverything();
});
$('accountsGrid').addEventListener('click', e => {
  const btn = e.target.closest('.account-delete');
  if (!btn) return;
  const id = btn.dataset.id;
  const used = transactions.some(t => t.accountId === id || t.fromAccountId === id || t.toAccountId === id);
  if (used) { if (!confirm('По счёту есть операции. Удалить?')) return; }
  else if (!confirm('Удалить счёт?')) return;
  accounts = accounts.filter(a => a.id !== id);
  saveAcc(); invalidateBalanceCache(); renderEverything();
});
$('depositForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('depName').value.trim();
  if (!name) return;
  const id = 'dep_' + Date.now();
  accounts.push({ id, name, type: $('depType').value, bank: $('depBank').value.trim(), rate: parseFloat($('depRate').value) || 0, initial: parseFloat($('depInitial').value) || 0, emoji: $('depEmoji').value.trim() || '\u{1F4B0}' });
  saveAcc();
  $('depName').value = ''; $('depBank').value = ''; $('depRate').value = ''; $('depInitial').value = '0'; $('depEmoji').value = '\u{1F4B0}';
  invalidateBalanceCache(); renderEverything();
});

/* Проекты */
$('newProjectBtn').addEventListener('click', openProjectForm);
$('cancelProjBtn').addEventListener('click', closeProjectForm);
document.querySelectorAll('#projectForm [data-ptype]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.projectType = btn.dataset.ptype;
    document.querySelectorAll('#projectForm [data-ptype]').forEach(b => b.classList.toggle('active', b === btn));
  });
});
$('projAccountMode').addEventListener('change', function() {
  if (this.value === 'new') { $('projNewAccountFields').style.display = 'block'; $('projExistingAccountFields').style.display = 'none'; }
  else { $('projNewAccountFields').style.display = 'none'; $('projExistingAccountFields').style.display = 'block'; renderProjAccSelect(); }
});
$('addSubBtn').addEventListener('click', () => { state.projectSubsDraft.push({ name: '', budget: 0 }); renderProjectSubsDraft(); });
$('projSubsList').addEventListener('input', e => {
  const idx = Number(e.target.dataset.subIdx);
  const field = e.target.dataset.subField;
  if (isNaN(idx) || !field) return;
  if (field === 'budget') state.projectSubsDraft[idx].budget = parseFloat(e.target.value) || 0;
  else state.projectSubsDraft[idx][field] = e.target.value;
});
$('projSubsList').addEventListener('click', e => {
  const del = e.target.closest('[data-sub-del]');
  if (!del) return;
  state.projectSubsDraft.splice(Number(del.dataset.subDel), 1);
  renderProjectSubsDraft();
});
$('projectForm').addEventListener('submit', projectFormSubmit);
$('projectsList').addEventListener('click', e => {
  const openBtn = e.target.closest('[data-project-open]');
  const delBtn = e.target.closest('[data-project-delete]');
  if (openBtn) { openProject(openBtn.dataset.projectOpen); return; }
  if (delBtn) {
    const id = delBtn.dataset.projectDelete;
    const p = findProject(id);
    if (!p) return;
    if (!confirm('Удалить проект «' + p.name + '»? Операции и депозит останутся.')) return;
    projects = projects.filter(pp => pp.id !== id);
    saveProjects(); renderProjectsList(); renderSavingsTree('savingsTree');
    return;
  }
});

/* Инвестиции */
$('portfolioSelect').addEventListener('change', () => { activePortfolioId = $('portfolioSelect').value; saveActivePf(); renderInvestments(); });
$('newPortfolioBtn').addEventListener('click', async () => {
  const res = await modal.open({ title: 'Новый портфель',
    fields: [{ name: 'name', label: 'Название', type: 'text', value: 'Портфель ' + (portfolios.length + 1), maxlength: 40 }],
    confirmText: 'Создать' });
  if (!res || !res.name || !res.name.trim()) return;
  const id = 'pf_' + Date.now();
  portfolios.push({ id, name: res.name.trim(), assets: [], cash: 0, createdAt: todayISO() });
  activePortfolioId = id; savePortfolios(); saveActivePf();
  renderPortfolioSelector(); renderInvestments(); renderAnalytics();
});
$('deletePortfolioBtn').addEventListener('click', async () => {
  if (portfolios.length <= 1) { alert('Нельзя удалить последний портфель'); return; }
  const pf = getActivePortfolio();
  const res = await modal.open({ title: 'Удалить портфель?', subtitle: pf.name, warning: 'Все активы портфеля будут удалены безвозвратно.', confirmText: 'Удалить' });
  if (!res) return;
  portfolios = portfolios.filter(p => p.id !== pf.id);
  activePortfolioId = portfolios[0].id;
  savePortfolios(); saveActivePf();
  renderPortfolioSelector(); renderInvestments(); renderAnalytics();
});
$('cashDepositBtn').addEventListener('click', async () => {
  const res = await modal.open({ title: 'Внести деньги', fields: [{ name: 'amount', label: 'Сумма', type: 'number', min: 0.01, placeholder: '0.00' }], confirmText: 'Внести' });
  if (!res || !res.amount || res.amount <= 0) return;
  getActivePortfolio().cash += res.amount; savePortfolios(); renderInvestments(); renderAnalytics();
});
$('cashWithdrawBtn').addEventListener('click', async () => {
  const res = await modal.open({ title: 'Вывести деньги', fields: [{ name: 'amount', label: 'Сумма', type: 'number', min: 0.01, placeholder: '0.00' }], confirmText: 'Вывести' });
  if (!res || !res.amount || res.amount <= 0) return;
  getActivePortfolio().cash -= res.amount; savePortfolios(); renderInvestments(); renderAnalytics();
});
$('astType').addEventListener('change', function() {
  const isBond = this.value === 'bond';
  $('astNominalWrap').style.display = isBond ? 'block' : 'none';
  $('priceLabel').textContent = isBond ? 'Средняя цена покупки, % от номинала' : 'Средняя цена покупки';
});
let searchTimeout = null;
$('astName').addEventListener('input', function() {
  const query = this.value.trim();
  clearTimeout(searchTimeout);
  if (query.length < 2) { $('securitiesList').innerHTML = ''; $('searchHint').textContent = 'Введите 2+ символа'; return; }
  $('searchHint').textContent = 'Идёт поиск...';
  searchTimeout = setTimeout(async () => {
    const results = await searchMoexSecurities(query);
    if (!results.length) { $('securitiesList').innerHTML = ''; $('searchHint').textContent = 'Ничего не найдено'; return; }
    $('securitiesList').innerHTML = results.slice(0, 20).map(s => '<option value="' + escapeHtml(s.name) + '" data-ticker="' + escapeHtml(s.ticker) + '" data-isin="' + escapeHtml(s.isin) + '">' + escapeHtml(s.ticker) + '</option>').join('');
    $('searchHint').textContent = 'Найдено: ' + results.length;
  }, 500);
});
$('astName').addEventListener('change', function() {
  const option = Array.from($('securitiesList').options).find(o => o.value === this.value);
  if (option) {
    $('astTicker').value = option.dataset.ticker || '';
    $('astIsin').value = option.dataset.isin || '';
    $('searchHint').textContent = 'Подставлено с MOEX. Цена подтянется автоматически.';
  }
});
$('assetForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('astName').value.trim();
  if (!name) return;
  const id = 'ast_' + Date.now();
  const qty = parseFloat($('astQty').value) || 0;
  const avg = parseFloat($('astPrice').value) || 0;
  const newAsset = { id, name, type: $('astType').value,
    ticker: $('astTicker').value.trim().toUpperCase(),
    isin: $('astIsin').value.trim().toUpperCase(),
    nominal: $('astType').value === 'bond' ? (parseFloat($('astNominal').value) || 1000) : 0,
    quantity: qty, avgPrice: avg, currentPrice: avg };
  if ($('astFromCash').checked) getActivePortfolio().cash -= rubCost(newAsset, avg, qty);
  getAssets().push(newAsset);
  savePortfolios();
  $('astName').value = ''; $('astTicker').value = ''; $('astIsin').value = '';
  $('astQty').value = ''; $('astPrice').value = ''; $('astFromCash').checked = false;
  $('searchHint').textContent = 'Введите 2+ символа';
  renderInvestments(); renderAnalytics();
});
$('refreshPricesBtn').addEventListener('click', async function() {
  if (!getAssets().length) { alert('Портфель пуст'); return; }
  this.disabled = true;
  const orig = this.innerHTML;
  this.innerHTML = '<span class="price-loading">&#x23F3;</span> Обновление...';
  await autoRefreshPrices();
  this.disabled = false; this.innerHTML = orig;
});
$('refreshNewsBtn').addEventListener('click', async function() {
  this.disabled = true;
  const orig = this.innerHTML;
  this.innerHTML = '<span class="price-loading">&#x23F3;</span> Обновление...';
  await refreshPayoutCache(false);
  this.disabled = false; this.innerHTML = orig;
});
$('aMonth').addEventListener('change', renderAnalytics);
window.addEventListener('resize', () => {
  if (state.activeTab === 'investments') requestAnimationFrame(() => { drawGrowthChart(); drawPayoutChart(); });
});

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================= */
function initApp() {
  $('date').value = todayISO();
  $('monthPicker').value = state.month;
  $('hMonth').value = state.month;
  $('aMonth').value = state.month;
  $('repMonth').value = state.reportMonth;
  renderFormCategories();
  renderFormAccounts();
  renderFilterCategories();
  renderFilterAccounts();
  updateAccountBalanceHint();
  renderEverything();
  setTimeout(() => autoRefreshPrices(), 500);
  setTimeout(() => {
    const lastUpdate = Number(localStorage.getItem(STORAGE_PAYOUT_CACHE_TIME) || 0);
    if (!lastUpdate || Date.now() - lastUpdate > PAYOUT_TTL_MS) refreshPayoutCache(true);
    else { renderNews(); drawPayoutChart(); }
  }, 1500);
}
function init() {
  applySeasonTheme();
  applyDark();
  if (isAuthed()) { showApp(); initApp(); }
  else { showAuth(); $('authLogin').focus(); }
}
modal.init();
init();
/* =========================================================
   SERVICE WORKER (PWA)
   ========================================================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('✅ Service Worker зарегистрирован'))
      .catch(err => console.warn('⚠️ Service Worker не зарегистрирован:', err));
  });
}