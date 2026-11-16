import {
  MAJOR,
  NATURAL_MINOR,
  accSymbol,
  keyLetterIdx,
  keyPc,
  mod,
  noteName,
  type ChordAnalysis,
  type Key,
} from "./chord";

export type MarkKind = "root" | "outside" | "scale";

export interface PcMark {
  pc: number;
  /** 相對調中心的級數 */
  degree: string;
  /** 音名（已依轉調後的調拼寫） */
  note: string;
  /** root = 和弦根音（紅）；outside = 調外音（黃）；scale = 調內音 */
  kind: MarkKind;
  /** 是否為和弦本身的和弦音（指板上畫白框） */
  chordTone: boolean;
}

/**
 * 某個和弦在指板上「可以彈」的音（以音高類別 pc 為鍵）：
 *  1. 調內音階的七個音；
 *  2. 加上這個和弦自己的調外音（黃色）；
 *  3. 和弦裡有調外音時，同一級數的調內音視為衝突而移除
 *     （例如和弦有 b7，就不標記 7；有 b6，就不標記 6）；
 *  4. 和弦根音標紅色（優先於黃色）。
 */
export function marksForChord(a: ChordAnalysis, key: Key): Map<number, PcMark> {
  const marks = new Map<number, PcMark>();
  const scale = key.minor ? NATURAL_MINOR : MAJOR;
  const conflicting = new Set(a.tones.filter((t) => !t.inKey).map((t) => t.degreeNum));

  scale.forEach((semis, i) => {
    const d = i + 1;
    if (conflicting.has(d)) return;
    const pc = mod(keyPc(key) + semis, 12);
    marks.set(pc, {
      pc,
      degree: accSymbol(semis - MAJOR[i]) + d,
      note: noteName(keyLetterIdx(key) + i, pc),
      kind: "scale",
      chordTone: false,
    });
  });

  for (const t of a.tones) {
    if (!t.inKey) {
      marks.set(t.pc, { pc: t.pc, degree: t.degree, note: t.note, kind: "outside", chordTone: false });
    } else if (!marks.has(t.pc)) {
      marks.set(t.pc, { pc: t.pc, degree: t.degree, note: t.note, kind: "scale", chordTone: false });
    }
  }

  marks.set(a.rootPc, {
    pc: a.rootPc,
    degree: a.rootDegree,
    note: a.rootNote,
    kind: "root",
    chordTone: true,
  });

  for (const t of a.tones) {
    const m = marks.get(t.pc);
    if (m) m.chordTone = true;
  }
  return marks;
}
