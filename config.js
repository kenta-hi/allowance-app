// JSONBin.io の設定（あとで埋める）
const CONFIG = {
  JSONBIN_SECRET: '$2a$10$zHObxj8vSp43oZfN.krCMOdzrpYJCQuWpuaKUzWyCB4G8RMFkfEdG',
  JSONBIN_BIN_ID: '69ec888d36566621a8ed6946',
  PARENT_PIN: '2631', // 親ページのPIN（変更してください）
};

// お小遣い設定
const ALLOWANCE = {
  BASE: 500,
  HOMEWORK:  { full: 200, half: 100 }, // 宿題 or 予習復習（7日: 7=○, 5-6=△）
  NOTEBOOK:  { full: 200, half: 100 }, // ノートチェック（比率: 90%=○, 70%=△）
  HABITS:    { full: 150, half: 50  }, // 爪+片付け（両方○の日: 6-7=○, 4-5=△）
  TEST:      { full: 100 },
};

// ○△×の判定（宿題 or 予習復習：7日中7=○, 5-6=△, 0-4=×）
function getGrade7(days) {
  if (days === 7) return 'full';
  if (days >= 5) return 'half';
  return 'zero';
}

// ノートチェック：授業日に対する比率（90%以上=○, 70%以上=△）
function getGradeNotebookRatio(checks, total) {
  if (total === 0) return 'zero';
  const ratio = checks / total;
  if (ratio >= 0.9) return 'full';
  if (ratio >= 0.6) return 'half'; // 4/6=0.667が含まれるよう0.7→0.6に調整
  return 'zero';
}

// ○△×（爪+片付け両方○の日：7日中 6-7=○, 4-5=△, 0-3=×）
function getGradeHabits(days) {
  if (days >= 6) return 'full';
  if (days >= 4) return 'half';
  return 'zero';
}

function calcBonus(record) {
  const hw    = ALLOWANCE.HOMEWORK[getGrade7(record.homework)] ?? 0;
  const nb    = ALLOWANCE.NOTEBOOK[getGradeNotebookRatio(record.notebook, record.notebookTotal)] ?? 0;
  const ht    = ALLOWANCE.HABITS[getGradeHabits(record.habits)] ?? 0;
  const test1 = record.test1 ? ALLOWANCE.TEST.full : 0;
  const test2 = record.test2 ? ALLOWANCE.TEST.full : 0;
  return hw + nb + ht + test1 + test2;
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
      daily: {},       // { "2025-04-28": { homework, notebook, nails } }
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
  const entries = Object.entries(week.daily);
  const days = entries.map(([, d]) => d);
  // ノートの分母：月〜土のログ日数（日曜除外）
  const notebookTotal = entries.filter(([dateStr]) =>
    new Date(dateStr + 'T00:00:00').getDay() !== 0
  ).length;
  return {
    homework:      days.filter(d => d.homework).length,
    notebook:      days.filter(d => d.notebook).length,
    notebookTotal,
    habits:        days.filter(d => d.nails && d.cleanup).length,
    test1: week.test1,
    test2: week.test2,
  };
}
