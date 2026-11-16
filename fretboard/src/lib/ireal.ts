/**
 * iReal Pro 連結的解碼與小節解析（與前面的 ireal_scraper.py 同一套演算法）。
 * 這個檔案前後端共用：後端用來解 playlist，前端只需要它的型別。
 */

export const CHORD_PREFIX = "1r34LbKcu7";

// ---------------------------------------------------------------- 解混淆 --

function obfusc50(block: string): string {
  const r = block.split("");
  for (let i = 0; i < 5; i++) {
    r[i] = block[49 - i];
    r[49 - i] = block[i];
  }
  for (let i = 10; i < 24; i++) {
    r[i] = block[49 - i];
    r[49 - i] = block[i];
  }
  return r.join("");
}

/** 每 50 字元一塊做固定對調（此運算是自己的反運算，編碼/解碼共用） */
export function unscramble(s: string): string {
  let out = "";
  while (s.length > 50) {
    const block = s.slice(0, 50);
    s = s.slice(50);
    out += s.length < 2 ? block : obfusc50(block);
  }
  return out + s;
}
export const scramble = unscramble;

/** 容錯版 decodeURIComponent：遇到格式錯誤的 %xx 就保留原樣 */
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s.replace(/(?:%[0-9A-Fa-f]{2})+/g, (m) => {
      try {
        return decodeURIComponent(m);
      } catch {
        return m;
      }
    });
  }
}

/** iReal 內部縮寫 → 較易讀的符號 */
export function normalizeRaw(raw: string): string {
  return raw
    .replaceAll("Kcl", "| x") // 重複上一小節
    .replaceAll("LZ", " |") // 小節線
    .replaceAll("XyQ", " ") // 空白格
    .replaceAll("K", "|");
}

// ---------------------------------------------------------------- 小節 --

export interface Measure {
  chords: string[];
  /** 段落標記（A、B、C、i…），只出現在段落第一小節 */
  section: string;
  /** 1、2 結尾（0 = 無） */
  ending: number;
  repeatStart: boolean;
  repeatEnd: boolean;
}

const CHORD_RE = /[A-G][b#]?[^A-G/\s]*(?:\/[A-G][b#]?)?/g;
const SPECIAL = new Set(["x", "r", "n", "p", "W"]);

function parseText(p: string) {
  let t = p;
  t = t.replace(/<(.*?)>/g, "");
  const sec = t.match(/\*([A-Za-z])/);
  t = t.replace(/\*[A-Za-z]/g, "");
  t = t.replace(/T\d\d/g, ""); // 拍號
  const end = t.match(/N(\d)/);
  t = t.replace(/N\d/g, "");
  t = t.replace(/[QSUY]/g, "");
  t = t.replace(/\([^)]*\)/g, ""); // 括號內是備選和弦
  t = t.replaceAll("f", ""); // 延長記號
  t = t.replace(/(?<!a)l(?!t)/g, ""); // 大字（保留 alt）
  t = t.replace(/(?<!su)s(?!us)/g, ""); // 小字（保留 sus）
  const tokens = t.replaceAll(",", " ").split(/\s+/).filter(Boolean);
  const chords: string[] = [];
  for (const tok of tokens) {
    if (SPECIAL.has(tok)) chords.push(tok);
    else chords.push(...(tok.match(CHORD_RE) ?? []));
  }
  return { chords, section: sec ? sec[1] : "", ending: end ? Number(end[1]) : 0 };
}

export function parseMeasures(raw: string): Measure[] {
  const s = normalizeRaw(raw);
  const pieces = s.split(/([[\]{}|Z])/);
  const ms: Measure[] = [];
  let pend = { section: "", repeatStart: false, ending: 0 };

  for (const p of pieces) {
    if (p === "{") pend.repeatStart = true;
    else if (p === "}") {
      if (ms.length) ms[ms.length - 1].repeatEnd = true;
    } else if (["[", "]", "|", "Z", ""].includes(p)) {
      continue;
    } else {
      const d = parseText(p);
      if (d.section) pend.section = d.section;
      if (d.ending) pend.ending = d.ending;
      if (d.chords.length) {
        ms.push({
          chords: d.chords,
          section: pend.section,
          repeatStart: pend.repeatStart,
          repeatEnd: false,
          ending: pend.ending,
        });
        pend = { section: "", repeatStart: false, ending: 0 };
      }
    }
  }

  // x（重複一小節）/ r（重複兩小節）
  ms.forEach((m, i) => {
    if (m.chords.length === 1 && m.chords[0] === "x" && i > 0) {
      m.chords = [...ms[i - 1].chords];
    } else if (m.chords.length === 1 && m.chords[0] === "r" && i >= 2) {
      m.chords = [...ms[i - 2].chords];
      const next = ms[i + 1];
      if (next && (next.chords.length === 0 || (next.chords.length === 1 && next.chords[0] === "x"))) {
        next.chords = [...ms[i - 1].chords];
      }
    }
  });

  // p（斜線＝沿用前一個和弦）、n（無和弦）、W（隱形）
  let last: string | null = null;
  for (const m of ms) {
    const out: string[] = [];
    for (const c of m.chords) {
      if (c === "p") {
        if (last) out.push(last);
      } else if (c === "n") {
        out.push("N.C.");
      } else if (c === "W") {
        continue;
      } else {
        out.push(c);
        last = c;
      }
    }
    m.chords = out;
  }

  // 結尾編號（N1/N2）延伸到該結尾結束
  let cur = 0;
  for (const m of ms) {
    if (m.ending) cur = m.ending;
    else if (m.section || m.repeatStart) cur = 0;
    else if (cur) m.ending = cur;
    if (m.repeatEnd) cur = 0;
  }
  return ms;
}

/** 依反覆記號與 1/2 結尾展開成實際演奏順序 */
export function expandMeasures(ms: Measure[]): Measure[] {
  const out: Measure[] = [];
  let i = 0;
  let start = 0;
  let pass = 1;
  let endIdx = -1;
  let guard = 0;
  while (i < ms.length && guard++ < 10000) {
    const m = ms[i];
    if (m.repeatStart) start = i;
    if (pass > 1 && i > endIdx && m.ending === 0) {
      pass = 1;
      start = i;
    }
    if (m.ending && m.ending !== pass) {
      i++;
      continue;
    }
    out.push(m);
    if (m.repeatEnd && pass === 1) {
      pass = 2;
      endIdx = i;
      i = start;
      continue;
    }
    i++;
  }
  return out;
}

// ------------------------------------------------------------------ 歌曲 --

export interface Song {
  title: string;
  composer: string;
  style: string;
  key: string;
  bpm: string;
  timeSignature: string;
  /** 展開反覆後的實際演奏順序 */
  bars: Measure[];
}

/** 把整條（可能是整個 playlist 的）irealb:// 連結切成單首 */
export function splitSongs(url: string): string[] {
  const body = safeDecode(url.trim()).replace(/^irealb(?:ook)?:\/\//, "");
  return body.split("===").filter(Boolean);
}

export function songTitle(songStr: string): string {
  return songStr.split(/=+/)[0];
}

/** 是不是一首歌（playlist 結尾那個「播放清單名稱」不是） */
export function looksLikeSong(songStr: string): boolean {
  const parts = songStr.split(/=+/);
  return parts.length >= 5 && parts.some((p) => p.startsWith(CHORD_PREFIX));
}

/** 譜末尾的欄位裡找速度（0 = 沒給）；只接受合理範圍，避免把反覆次數當成速度 */
function pickBpm(extra: string[]): string {
  for (const v of extra.slice(0, 2)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 30 && n <= 400) return String(Math.round(n));
  }
  return "";
}

export function parseSong(songStr: string): Song {
  const parts = songStr.split(/=+/);
  if (parts.length < 5) throw new Error("欄位不足（可能是 playlist 名稱）");
  const idx = parts.findIndex((p) => p.startsWith(CHORD_PREFIX));
  let raw: string;
  let extra: string[];
  if (idx >= 0) {
    raw = unscramble(parts[idx].slice(CHORD_PREFIX.length));
    extra = parts.slice(idx + 1);
  } else {
    raw = parts[5] ?? ""; // irealbook://（未混淆）
    extra = parts.slice(6);
  }
  const ts = raw.match(/T(\d)(\d)/);
  const measures = parseMeasures(raw);
  return {
    title: parts[0],
    composer: parts[1],
    style: parts[2],
    key: parts[3],
    bpm: pickBpm(extra),
    timeSignature: ts ? `${ts[1]}/${ts[2]}` : "4/4",
    bars: expandMeasures(measures),
  };
}
