import { ApiError } from "./api";

export type Lang = "en" | "zh";

const en = {
  htmlLang: "en",
  colon: ": ",
  appTitle: "Improv Fretboard",
  searchPlaceholder: "Type a song title, e.g. Autumn Leaves",
  searchAria: "Song title",
  search: "Search",
  loadingBtn: "Loading…",
  loadingMsg:
    "Fetching the chart from the iReal Pro forum… (the first search downloads the whole Jazz 1460 list, a few seconds)",
  language: "Language",

  originalKey: "Original key",
  nowKey: "Now",

  instrument: "Instrument",
  instruments: { guitar: "Guitar · 6 strings", bass: "Bass · 4 strings" },

  labelMode: "Fretboard labels",
  degrees: "Degrees",
  notes: "Note names",
  transpose: "Transpose",
  down: "Down a semitone",
  up: "Up a semitone",
  targetKey: "Target key",
  reset: "Reset",
  orig: "orig",
  tuning: "Tuning",
  spacing: "Fret spacing",
  spacingReal: "Realistic",
  spacingEqual: "Equal",

  fretRange: "Fret range",
  fretRangeAll: "All frets",
  fretRangeText: (lo: number, hi: number) => (lo === hi ? `Fret ${lo}` : `Frets ${lo}–${hi}`),
  rangeFrom: "From fret",
  rangeTo: "To fret",

  play: "Play",
  pause: "Pause",
  tempo: "Tempo",
  bpmUnit: "BPM",
  bpmAria: "Tempo in beats per minute",
  tempoChart: "from chart",
  tempoStyle: "no tempo in chart — default for this style",
  tempoCustom: "custom",
  tempoReset: "Reset tempo",
  loop: "Loop",
  soundClick: "Click",
  soundComp: "Piano",
  soundBass: "Double bass",
  volume: "Volume",
  playHint: "Space = play / pause. Playback follows the chart bar by bar (chords in a bar share its beats equally). Sounds are a built-in synth imitating a grand piano (comping) and an upright double bass (walking line).",
  pickChord: "Pick a chord below",
  legend: "Legend",
  root: "Root",
  outside: "Outside key",
  inKey: "In key",
  chordTone: "Chord tone",
  hint: "Tip: use the ← → keys to step through chords. Bars are shown in playing order (repeats and endings are expanded).",
  fretboardAria: (strings: number, frets: number) => `${strings}-string, ${frets}-fret fretboard`,

  tunings: {
    standard: "Standard",
    dropD: "Drop D",
    dadgad: "DADGAD",
    halfDown: "Half-step down",
  },

  errors: {
    empty: "Please enter a song title.",
    notFoundSuggest: (q: string) => `Couldn't find “${q}”. Did you mean:`,
    notFoundOnly: (q: string) => `Couldn't find “${q}”. Only the forum's Jazz 1460 list is searched.`,
    ambiguous: (q: string) => `“${q}” matches several songs — pick one:`,
    upstream: (detail: string) => `Couldn't load the chart: ${detail}`,
    network: "Network error — is the dev server running?",
  },
};

export type Dict = typeof en;

const zh: Dict = {
  htmlLang: "zh-Hant",
  colon: "：",
  appTitle: "Improv Fretboard",
  searchPlaceholder: "輸入歌名，例如 Autumn Leaves",
  searchAria: "歌名",
  search: "搜尋",
  loadingBtn: "載入中…",
  loadingMsg: "正在從 iReal Pro 論壇取得譜…（第一次需下載整份 Jazz 1460 清單，約數秒）",
  language: "語言",

  originalKey: "原調",
  nowKey: "現在",

  instrument: "樂器",
  instruments: { guitar: "吉他 · 6 弦", bass: "Bass · 4 弦" },

  labelMode: "指板標示",
  degrees: "級數",
  notes: "音名",
  transpose: "轉調",
  down: "降半音",
  up: "升半音",
  targetKey: "轉到的調",
  reset: "還原",
  orig: "原調",
  tuning: "調弦",
  spacing: "琴格間距",
  spacingReal: "真實比例",
  spacingEqual: "等寬",

  fretRange: "品位範圍",
  fretRangeAll: "全部品位",
  fretRangeText: (lo, hi) => (lo === hi ? `第 ${lo} 品` : `第 ${lo}–${hi} 品`),
  rangeFrom: "起始品位",
  rangeTo: "結束品位",

  play: "播放",
  pause: "暫停",
  tempo: "速度",
  bpmUnit: "BPM",
  bpmAria: "速度（每分鐘拍數）",
  tempoChart: "依譜上速度",
  tempoStyle: "譜上沒有速度，依風格預設",
  tempoCustom: "自訂",
  tempoReset: "還原速度",
  loop: "循環",
  soundClick: "節拍器",
  soundComp: "鋼琴",
  soundBass: "低音提琴",
  volume: "音量",
  playHint: "空白鍵 = 播放／暫停。依譜逐小節自動前進（同一小節內的和弦平均分配拍數）；聲音是內建合成器，模擬鋼琴（伴奏）與低音提琴（走路低音）。",
  pickChord: "點選下方的和弦",
  legend: "圖例",
  root: "根音",
  outside: "調外音",
  inKey: "調內音",
  chordTone: "和弦音",
  hint: "提示：用鍵盤 ← → 可逐個切換和弦。小節依實際演奏順序展開（反覆與結尾已展開）。",
  fretboardAria: (strings, frets) => `${strings} 弦 ${frets} 品吉他指板`,

  tunings: {
    standard: "標準調弦",
    dropD: "Drop D",
    dadgad: "DADGAD",
    halfDown: "降半音",
  },

  errors: {
    empty: "請輸入歌名。",
    notFoundSuggest: (q) => `找不到「${q}」，你是不是要找：`,
    notFoundOnly: (q) => `找不到「${q}」。目前只收錄論壇的 Jazz 1460 清單。`,
    ambiguous: (q) => `「${q}」符合多首歌，請選一首：`,
    upstream: (detail) => `無法取得譜：${detail}`,
    network: "網路錯誤：開發伺服器有在執行嗎？",
  },
};

export const DICT: Record<Lang, Dict> = { en, zh };

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "zh") return saved;
  } catch {
    /* ignore */
  }
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function errorText(t: Dict, e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "empty":
        return t.errors.empty;
      case "ambiguous":
        return t.errors.ambiguous(e.query);
      case "not_found":
        return e.suggestions.length ? t.errors.notFoundSuggest(e.query) : t.errors.notFoundOnly(e.query);
      case "network":
        return t.errors.network;
      default:
        return t.errors.upstream(e.detail);
    }
  }
  return t.errors.upstream((e as Error)?.message ?? String(e));
}
