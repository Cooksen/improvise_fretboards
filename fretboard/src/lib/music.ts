export type Accidental = "sharp" | "flat";

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

/** 以 MIDI 音高表示每條空弦（由「最高音弦」排到「最低音弦」）。標準調弦：E4 B3 G3 D3 A2 E2 */
export const STANDARD_TUNING: readonly number[] = [64, 59, 55, 50, 45, 40];

export const FRET_COUNT = 24;

export interface NoteInfo {
  /** 0–11，C = 0 */
  pitchClass: number;
  /** 例如 "F#"、"Bb" */
  name: string;
  /** 科學音名八度，C4 = 中央 C */
  octave: number;
  midi: number;
}

export function noteAt(
  tuning: readonly number[],
  stringIndex: number,
  fret: number,
  accidental: Accidental = "sharp",
): NoteInfo {
  const midi = tuning[stringIndex] + fret;
  const pitchClass = ((midi % 12) + 12) % 12;
  const names = accidental === "sharp" ? SHARP_NAMES : FLAT_NAMES;
  return { pitchClass, name: names[pitchClass], octave: Math.floor(midi / 12) - 1, midi };
}

/** 空弦音名，用於指板左側的標示（例如 "E", "B", "G", "D", "A", "E"） */
export function openStringNames(tuning: readonly number[], accidental: Accidental = "sharp"): string[] {
  return tuning.map((_, i) => noteAt(tuning, i, 0, accidental).name);
}
