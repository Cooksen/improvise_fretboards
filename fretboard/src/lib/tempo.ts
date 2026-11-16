import type { ChordAnalysis } from "./chord";
import { mod } from "./chord";
import type { Measure } from "./ireal";

export const MIN_BPM = 40;
export const MAX_BPM = 320;

/** 譜沒給速度時，依風格給一個合理的預設 */
export function defaultBpm(style: string): number {
  const s = style.toLowerCase();
  const table: [RegExp, number][] = [
    [/ballad/, 66],
    [/bossa/, 140],
    [/samba/, 190],
    [/latin|afro|calypso/, 150],
    [/waltz/, 170],
    [/bebop|up tempo|fast/, 210],
    [/medium up/, 170],
    [/slow swing|slow/, 90],
    [/medium swing|swing/, 130],
    [/funk|rock|pop|soul/, 105],
    [/even/, 120],
  ];
  return table.find(([re]) => re.test(s))?.[1] ?? 120;
}

export function clampBpm(n: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(n)));
}

/** 一個小節有幾個四分音符拍（6/8 → 3、3/4 → 3、4/4 → 4） */
export function quarterBeatsPerBar(timeSignature: string): number {
  const m = timeSignature.match(/^(\d+)\/(\d+)$/);
  if (!m) return 4;
  const [num, den] = [Number(m[1]), Number(m[2])];
  return den > 0 && num > 0 ? (num * 4) / den : 4;
}

export interface PlayEvent {
  bar: number;
  pos: number;
  /** 這個和弦從小節第幾拍開始（四分音符為單位） */
  offset: number;
  /** 持續幾拍 */
  beats: number;
  /** 沒有和弦（N.C.）就是 null：只走時間、不發聲 */
  sound: ChordSound | null;
  /** 下一個有聲和弦的根音，用來做 bass 的接近音 */
  nextRootPc: number | null;
}

export interface ChordSound {
  rootPc: number;
  thirdPc: number;
  fifthPc: number;
  /** 和弦伴奏用的 MIDI 音高（由低到高） */
  voicing: number[];
}

function soundOf(a: ChordAnalysis): ChordSound {
  const fn = (re: RegExp) => a.tones.find((t) => re.test(t.chordFunction))?.pc;
  const rootPc = a.rootPc;
  const thirdPc = fn(/^[b#]*3$/) ?? fn(/^[b#]*(?:4|2)$/) ?? mod(rootPc + 4, 12);
  const fifthPc = fn(/^[b#]*5$/) ?? mod(rootPc + 7, 12);

  // 伴奏：音太多時省略 5 度（jazz comp 常見），並把各音放在 G3–G5 之間往上疊
  let pcs = [...new Set(a.tones.map((t) => t.pc))];
  if (pcs.length > 4) pcs = pcs.filter((pc) => pc !== fifthPc || pcs.length <= 3);
  const base = 53;
  const voicing: number[] = [];
  let prev = base - 1;
  const ordered = [...pcs].sort((x, y) => mod(x - rootPc, 12) - mod(y - rootPc, 12));
  // 根音不放進伴奏（bass 會彈），除非和弦只有它
  const upper = ordered.filter((pc) => pc !== rootPc);
  for (const pc of upper.length ? upper : ordered) {
    let m = pc + 12 * Math.ceil((prev + 1 - pc) / 12);
    if (m <= prev) m += 12;
    voicing.push(m);
    prev = m;
  }
  return { rootPc, thirdPc, fifthPc, voicing };
}

/** 依演奏順序把每個小節的和弦攤平成時間軸：小節內的和弦平均分配拍數 */
export function buildTimeline(
  bars: readonly Measure[],
  analyses: readonly (readonly (ChordAnalysis | null)[])[],
  timeSignature: string,
): PlayEvent[] {
  const barBeats = quarterBeatsPerBar(timeSignature);
  const events: PlayEvent[] = [];
  bars.forEach((bar, b) => {
    const n = Math.max(bar.chords.length, 1);
    for (let p = 0; p < n; p++) {
      const a = analyses[b]?.[p] ?? null;
      events.push({
        bar: b,
        pos: p,
        offset: (barBeats / n) * p,
        beats: barBeats / n,
        sound: a ? soundOf(a) : null,
        nextRootPc: null,
      });
    }
  });
  // 往後找下一個有聲和弦（最後一個接回開頭，因為預設會循環）
  for (let i = 0; i < events.length; i++) {
    for (let k = 1; k <= events.length; k++) {
      const nx = events[(i + k) % events.length].sound;
      if (nx) {
        events[i].nextRootPc = nx.rootPc;
        break;
      }
    }
  }
  return events;
}
