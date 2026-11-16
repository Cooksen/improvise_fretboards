/**
 * 和弦符號 → 和弦音 → 相對調中心的級數；以及轉調。
 * 慣例：調中心 = 1（Eb 調：Eb=1, F=2, G=3, Ab=4, Bb=5, C=6, D=7）。
 * 所有音都用「字母拼寫」換算，所以 Eb 調的 Db7#11 是 Db=b7, F=2, Ab=4, Cb=b6, G=3。
 */

export const LETTERS = "CDEFGAB";
export const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

export const mod = (n: number, m: number) => ((n % m) + m) % m;
export const accToInt = (a: string) => (a.match(/#/g)?.length ?? 0) - (a.match(/b/g)?.length ?? 0);
export const accSymbol = (n: number) => (n > 0 ? "#".repeat(n) : "b".repeat(-n));

/** letterIdx（0–6 對應 C–B）與音高類別 → 音名，例如 (1, 1) → "Db" */
export function noteName(letterIdx: number, pc: number): string {
  const letter = LETTERS[mod(letterIdx, 7)];
  const diff = mod(pc - LETTER_PC[letter] + 6, 12) - 6;
  return letter + accSymbol(diff);
}

// -------------------------------------------------------------------- 調 --

export interface Key {
  letter: string;
  acc: number;
  minor: boolean;
}

export const keyPc = (k: Key) => mod(LETTER_PC[k.letter] + k.acc, 12);
export const keyLetterIdx = (k: Key) => LETTERS.indexOf(k.letter);
export const keyTonic = (k: Key) => k.letter + accSymbol(k.acc);
export const keyLabel = (k: Key) => `${keyTonic(k)}${k.minor ? "m" : ""}`;

/** iReal 的調寫法：'Eb'、'C'、'D-'、'F#-' */
export function parseKey(s: string): Key {
  const m = s.trim().match(/^([A-G])([b#]*)(-|m)?$/);
  if (!m) return { letter: "C", acc: 0, minor: false };
  return { letter: m[1], acc: accToInt(m[2]), minor: !!m[3] };
}

const MAJOR_TONICS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MINOR_TONICS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/** 12 個可轉到的調（依半音 0..11 從原調往上）；原調保留原本拼寫 */
export function transposeTargets(orig: Key): Key[] {
  const table = orig.minor ? MINOR_TONICS : MAJOR_TONICS;
  const base = keyPc(orig);
  return Array.from({ length: 12 }, (_, semis) => {
    if (semis === 0) return orig;
    const k = parseKey(table[mod(base + semis, 12)]);
    return { ...k, minor: orig.minor };
  });
}

// ------------------------------------------------------------ 和弦符號 --

export interface ParsedSymbol {
  rootLetter: string;
  rootAcc: number;
  quality: string;
  bassLetter?: string;
  bassAcc?: number;
}

export function parseSymbol(sym: string): ParsedSymbol | null {
  const m = sym.match(/^([A-G])([b#]*)([^/]*)(?:\/([A-G])([b#]*))?$/);
  if (!m) return null;
  return {
    rootLetter: m[1],
    rootAcc: accToInt(m[2]),
    quality: m[3],
    bassLetter: m[4],
    bassAcc: m[4] ? accToInt(m[5]) : undefined,
  };
}

/** 依 iReal 品質字串回傳和弦音 [(音程數, 相對大音階的變化)]，音程數可為 1..13 */
export function chordToneSpecs(q: string): { specs: [number, number][]; minorLike: boolean } {
  const tones = new Map<number, number>([[1, 0]]);
  let minorLike = false;

  if (q.startsWith("h")) {
    tones.set(3, -1).set(5, -1).set(7, -1);
    minorLike = true;
  } else if (q.startsWith("o")) {
    tones.set(3, -1).set(5, -1);
    minorLike = true;
    if (q.includes("7")) tones.set(7, -2);
  } else if (q.startsWith("+")) {
    tones.set(3, 0).set(5, 1);
  } else if (q.startsWith("-")) {
    tones.set(3, -1).set(5, 0);
    minorLike = true;
  } else {
    tones.set(3, 0).set(5, 0);
  }

  const body = q.replace(/^[hmo+-]+/, "");
  const isMaj = body.startsWith("^") || body.toLowerCase().includes("maj");

  const stripped = body.replace(/(add|sus)\d*/g, "");
  const n = stripped.match(/(?<![b#])(69|13|11|9|7|6|5)/)?.[1] ?? "";
  if (n === "6") {
    tones.set(6, 0);
  } else if (n === "69") {
    tones.set(6, 0).set(9, 0);
  } else if (["7", "9", "11", "13"].includes(n)) {
    if (!tones.has(7)) tones.set(7, isMaj ? 0 : -1);
    if (["9", "11", "13"].includes(n)) tones.set(9, 0);
    if (n === "11") tones.set(11, 0);
    if (n === "13") tones.set(13, 0);
  } else if (isMaj && !tones.has(7)) {
    tones.set(7, 0); // 單純的 "^" 視為 maj7
  }
  if (q.startsWith("o") && q.includes("7")) tones.set(7, -2);
  if (n === "5") tones.delete(3); // 強力和弦

  if (body.includes("sus2")) {
    tones.delete(3);
    tones.set(2, 0);
  } else if (body.includes("sus")) {
    tones.delete(3);
    tones.set(4, 0);
  }
  for (const [, num] of body.matchAll(/add(\d+)/g)) tones.set(Number(num), 0);

  for (const [, acc, num] of body.matchAll(/([b#])(5|9|11|13)/g)) {
    const a = acc === "#" ? 1 : -1;
    const k = Number(num);
    tones.set(k, a);
    if (k >= 9 && !tones.has(7)) tones.set(7, isMaj ? 0 : -1);
  }
  const alt = body.includes("alt");
  if (alt) {
    tones.set(3, 0);
    if (!tones.has(7)) tones.set(7, -1);
    tones.set(9, -1).set(5, -1).set(13, -1);
  }

  const specs: [number, number][] = [...tones.entries()];
  if (alt) specs.push([9, 1]); // alt 同時有 b9 與 #9
  specs.sort((a, b) => {
    const ka = a[0] <= 7 ? a[0] : a[0] + 0.5;
    const kb = b[0] <= 7 ? b[0] : b[0] + 0.5;
    return ka - kb || a[1] - b[1];
  });
  return { specs, minorLike };
}

// ------------------------------------------------------------------ 分析 --

export interface Tone {
  /** 相對和弦根音：1 b3 5 b7 #11 … */
  chordFunction: string;
  /** 音名：Db F Ab Cb G */
  note: string;
  /** 相對調中心的級數：b7 2 4 b6 3 */
  degree: string;
  /** 級數的數字部分（1–7），用來判斷與調內音的衝突 */
  degreeNum: number;
  pc: number;
  inKey: boolean;
}

export interface ChordAnalysis {
  symbol: string;
  roman: string;
  rootDegree: string;
  rootNote: string;
  rootPc: number;
  tones: Tone[];
  /** 調外音的級數（去重，依出現順序） */
  outside: string[];
}

function degreeOf(letterIdx: number, pc: number, key: Key) {
  const deg = mod(letterIdx - keyLetterIdx(key), 7) + 1;
  const interval = mod(pc - keyPc(key), 12);
  const acc = mod(interval - MAJOR[deg - 1] + 6, 12) - 6;
  const scale = key.minor ? NATURAL_MINOR : MAJOR;
  return { label: accSymbol(acc) + deg, deg, acc, inKey: scale.includes(interval) };
}

export function analyzeChord(symbol: string, key: Key): ChordAnalysis | null {
  const p = parseSymbol(symbol);
  if (!p) return null;
  const rootLetterIdx = LETTERS.indexOf(p.rootLetter);
  const rootPc = mod(LETTER_PC[p.rootLetter] + p.rootAcc, 12);
  const { specs, minorLike } = chordToneSpecs(p.quality);

  const tones: Tone[] = [];
  const outside: string[] = [];
  for (const [step, acc] of specs) {
    const diat = ((step - 1) % 7) + 1;
    const pc = mod(rootPc + MAJOR[diat - 1] + acc, 12);
    const lidx = mod(rootLetterIdx + diat - 1, 7);
    const d = degreeOf(lidx, pc, key);
    tones.push({
      chordFunction: accSymbol(acc) + step,
      note: noteName(lidx, pc),
      degree: d.label,
      degreeNum: d.deg,
      pc,
      inKey: d.inKey,
    });
    if (!d.inKey && !outside.includes(d.label)) outside.push(d.label);
  }

  const r = degreeOf(rootLetterIdx, rootPc, key);
  const suffix = p.quality.replace(/^-/, "").replaceAll("^", "maj").replaceAll("h", "ø").replaceAll("o", "°");
  let roman = accSymbol(r.acc) + (minorLike ? ROMAN[r.deg - 1].toLowerCase() : ROMAN[r.deg - 1]) + suffix;
  if (p.bassLetter) {
    const bassPc = mod(LETTER_PC[p.bassLetter] + (p.bassAcc ?? 0), 12);
    roman += "/" + degreeOf(LETTERS.indexOf(p.bassLetter), bassPc, key).label;
  }
  return {
    symbol,
    roman,
    rootDegree: r.label,
    rootNote: noteName(rootLetterIdx, rootPc),
    rootPc,
    tones,
    outside,
  };
}

// ------------------------------------------------------------------ 轉調 --

/**
 * 把和弦從 from 調轉到 to 調。以「級數」重新拼寫，
 * 例如 Eb 調的 Db（b7）轉到 F 調會寫成 Eb，而不是 D#。
 */
export function transposeSymbol(sym: string, from: Key, to: Key): string {
  const p = parseSymbol(sym);
  if (!p) return sym;
  const delta = mod(keyPc(to) - keyPc(from), 12);
  const respell = (letter: string, acc: number) => {
    const pc = mod(LETTER_PC[letter] + acc, 12);
    const deg0 = mod(LETTERS.indexOf(letter) - keyLetterIdx(from), 7);
    return noteName(keyLetterIdx(to) + deg0, mod(pc + delta, 12));
  };
  const root = respell(p.rootLetter, p.rootAcc);
  const bass = p.bassLetter ? "/" + respell(p.bassLetter, p.bassAcc ?? 0) : "";
  return root + p.quality + bass;
}

/** 顯示用：^→Δ、h→ø、o→°，升降號用 ♯ ♭ */
export function prettySymbol(sym: string): string {
  const p = parseSymbol(sym);
  if (!p) return sym;
  const fancy = (s: string) => s.replaceAll("b", "♭").replaceAll("#", "♯");
  const q = fancy(p.quality.replaceAll("^", "Δ").replaceAll("h", "ø").replaceAll("o", "°"));
  const bass = p.bassLetter ? "/" + p.bassLetter + fancy(accSymbol(p.bassAcc ?? 0)) : "";
  return p.rootLetter + fancy(accSymbol(p.rootAcc)) + q + bass;
}
