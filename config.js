// JSONBin.io の設定（あとで埋める）
const CONFIG = {
  JSONBIN_SECRET: '$2a$10$zHObxj8vSp43oZfN.krCMOdzrpYJCQuWpuaKUzWyCB4G8RMFkfEdG',
  JSONBIN_BIN_ID: '69ec888d36566621a8ed6946',
  PARENT_PIN: '2631', // 親ページのPIN（変更してください）
};

// お小遣い設定
const ALLOWANCE = {
  BASE: 500,
  HOMEWORK:  { full: 150, half: 100 }, // ○/△（割り算しない）
  STUDY:     { full: 100, half: 50  },
  NOTEBOOK:  { full: 100, half: 50  },
  DECLARATION: { full: 50 },
  TEST:        { full: 50 },
};

// ○△×の判定（週6回ベース）
function getGrade(days) {
  if (days >= 5) return 'full';
  if (days === 4) return 'half';
  return 'zero';
}

function calcBonus(record) {
  const hw    = ALLOWANCE.HOMEWORK[getGrade(record.homework)] ?? 0;
  const st    = ALLOWANCE.STUDY[getGrade(record.study)] ?? 0;
  const nb    = ALLOWANCE.NOTEBOOK[getGrade(record.notebook)] ?? 0;
  const decl  = record.declarationDone ? ALLOWANCE.DECLARATION.full : 0;
  const test1 = record.test1 ? ALLOWANCE.TEST.full : 0;
  const test2 = record.test2 ? ALLOWANCE.TEST.full : 0;
  return hw + st + nb + decl + test1 + test2;
}

function calcTotal(record) {
  return ALLOWANCE.BASE + calcBonus(record);
}

// JSONBin API
const CACHE_KEY = 'allowance_data';

const API = {
  BASE: `https://api.jsonbin.io/v3/b/${CONFIG.JSONBIN_BIN_ID}`,
  READ_HEADERS: {
    'X-Access-Key': CONFIG.JSONBIN_SECRET,
  },
  WRITE_HEADERS: {
    'Content-Type': 'application/json',
    'X-Access-Key': CONFIG.JSONBIN_SECRET,
  },

  // キャッシュから即返す、バックグラウンドでAPIを更新
  async load() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      this._syncFromAPI().catch(() => {});  // バックグラウンドで更新
      return JSON.parse(cached);
    }
    return await this._fetchFromAPI();
  },

  // 強制的にAPIから取得（親ページ用）
  async loadFresh() {
    return await this._fetchFromAPI();
  },

  async _fetchFromAPI() {
    const res = await fetch(this.BASE + '/latest', { headers: this.READ_HEADERS });
    const json = await res.json();
    const data = json.record ?? { weeks: [] };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    return data;
  },

  async _syncFromAPI() {
    await this._fetchFromAPI();
  },

  async save(data) {
    // localStorageに即保存（次回起動時に反映）
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    // APIにも同期
    await fetch(this.BASE, {
      method: 'PUT',
      headers: this.WRITE_HEADERS,
      body: JSON.stringify(data),
    });
  },
};

// ローカル時刻でYYYY-MM-DD文字列を返す（toISOString()はUTCになるので使わない）
function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// 今週のIDを返す（月曜起点）
function getWeekId(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return toLocalDateStr(d);
}

function getTodayStr() {
  return toLocalDateStr(new Date());
}

function getOrCreateWeek(data, weekId) {
  let week = data.weeks.find(w => w.id === weekId);
  if (!week) {
    week = {
      id: weekId,
      daily: {},       // { "2025-04-28": { homework, study, notebook } }
      declaration: '',
      declarationDone: null,
      test1: null,
      test2: null,
      confirmed: false,
      amount: null,
    };
    data.weeks.push(week);
  }
  return week;
}

// 週の集計（達成日数を計算）
function summarizeWeek(week) {
  const days = Object.values(week.daily);
  return {
    homework:  days.filter(d => d.homework).length,
    study:     days.filter(d => d.study).length,
    notebook:  days.filter(d => d.notebook).length,
    declarationDone: week.declarationDone,
    test1: week.test1,
    test2: week.test2,
  };
}
