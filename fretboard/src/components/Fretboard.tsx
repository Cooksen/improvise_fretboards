import { FRET_COUNT, STANDARD_TUNING, noteAt, type Accidental } from "../lib/music";
import type { MarkKind } from "../lib/marks";

export type FretSpacing = "realistic" | "equal";
export type Instrument = "guitar" | "bass";

export const cellKey = (stringIndex: number, fret: number) => `${stringIndex}-${fret}`;

export interface FretMark {
  /** 圓圈裡顯示的文字（級數或音名） */
  label: string;
  kind: MarkKind;
  /** 和弦音：畫白色外框 */
  chordTone: boolean;
}

export interface FretboardProps {
  /** 每條弦空弦的 MIDI 音高，index 0 = 最高音弦（畫在最上面） */
  tuning?: readonly number[];
  /** 指板總格數，預設 24 */
  frets?: number;
  /** 只用在左側空弦音名的升降號寫法 */
  accidental?: Accidental;
  /** realistic：依律制逐格變窄；equal：等寬 */
  spacing?: FretSpacing;
  /** 以 cellKey(string, fret) 為鍵的標記 */
  marks?: Readonly<Record<string, FretMark>>;
  /**
   * 要看的品位範圍（含頭尾）。只畫範圍內的品，並放大到填滿整個指板；
   * min 為 0 時才會顯示空弦與琴枕。預設全部。
   */
  range?: { min: number; max: number };
  /** bass 的弦較粗、弦距較寬 */
  instrument?: Instrument;
  ariaLabel?: string;
}

// ---- 版面常數（SVG 座標）----
const BOARD_WIDTH = 1500; // 可見品位範圍固定拉伸到這個寬度
const NUT_X = 84; // 指板左緣；左邊留給空弦音名與空弦記號
const GUITAR_GAP = 36;
const BASS_GAP = 46;
const TOP = 34;
const BOARD_PAD = 16;
const RIGHT_PAD = 24;
const OPEN_DOT_X = NUT_X - 30; // 空弦記號
const NAME_X = 14; // 空弦音名

const SINGLE_INLAYS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_INLAYS = new Set([12, 24]);
const GUITAR_WIDTHS = [1.2, 1.7, 2.3, 3, 3.8, 4.6];
const BASS_WIDTHS = [2.6, 3.4, 4.4, 5.4];

export default function Fretboard({
  tuning = STANDARD_TUNING,
  frets = FRET_COUNT,
  accidental = "sharp",
  spacing = "realistic",
  marks = {},
  range,
  instrument = "guitar",
  ariaLabel,
}: FretboardProps) {
  const stringCount = tuning.length;
  const STRING_GAP = instrument === "bass" ? BASS_GAP : GUITAR_GAP;
  const widths = instrument === "bass" ? BASS_WIDTHS : GUITAR_WIDTHS;

  // 可見的品：first..last（至少一品）。0 品（空弦）只在 min = 0 時顯示。
  const showOpen = (range?.min ?? 0) === 0;
  const first = Math.min(Math.max(range?.min ?? 1, 1), frets);
  const last = Math.min(Math.max(range?.max ?? frets, first), frets);
  const edge = first - 1; // 可見區域左緣 = 第 first-1 條琴衍（0 = 琴枕）

  // 第 n 條琴衍（n = 0 為琴枕）離琴枕的相對位置；再把 edge..last 線性拉伸到 BOARD_WIDTH
  const ratio = (n: number) => (spacing === "equal" ? n : 1 - Math.pow(2, -n / 12));
  const fx = (n: number) => NUT_X + ((ratio(n) - ratio(edge)) / (ratio(last) - ratio(edge))) * BOARD_WIDTH;

  const visibleFrets = Array.from({ length: last - first + 1 }, (_, k) => first + k);

  const stringY = (i: number) => TOP + BOARD_PAD + i * STRING_GAP;
  const boardTop = TOP;
  const boardBottom = stringY(stringCount - 1) + BOARD_PAD;
  const boardMidY = (stringY(0) + stringY(stringCount - 1)) / 2;
  const numbersY = boardBottom + 26;
  const boardRight = fx(last);
  const width = boardRight + RIGHT_PAD;
  const height = numbersY + 14;

  const cellCenterX = (fret: number) => (fret === 0 ? OPEN_DOT_X : (fx(fret - 1) + fx(fret)) / 2);

  return (
    <svg
      className="fretboard"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? `${stringCount}-string, ${frets}-fret fretboard`}
    >
      <rect className="fb-wood" x={NUT_X} y={boardTop} width={boardRight - NUT_X} height={boardBottom - boardTop} rx={4} />

      {visibleFrets.map((f) => {
        const cx = cellCenterX(f);
        if (SINGLE_INLAYS.has(f)) return <circle key={`inlay-${f}`} className="fb-inlay" cx={cx} cy={boardMidY} r={8} />;
        if (DOUBLE_INLAYS.has(f)) {
          return (
            <g key={`inlay-${f}`}>
              <circle className="fb-inlay" cx={cx} cy={boardMidY - STRING_GAP} r={8} />
              <circle className="fb-inlay" cx={cx} cy={boardMidY + STRING_GAP} r={8} />
            </g>
          );
        }
        return null;
      })}

      {/* 琴衍：每個可見品的右邊界；左緣若不是琴枕也畫一條 */}
      {edge > 0 && <line className="fb-fret" x1={NUT_X} x2={NUT_X} y1={boardTop} y2={boardBottom} />}
      {visibleFrets.map((f) => (
        <line key={`fret-${f}`} className="fb-fret" x1={fx(f)} x2={fx(f)} y1={boardTop} y2={boardBottom} />
      ))}
      {edge === 0 && <rect className="fb-nut" x={NUT_X - 6} y={boardTop - 2} width={6} height={boardBottom - boardTop + 4} />}

      {tuning.map((_, i) => (
        <g key={`string-${i}`}>
          <line
            className={instrument === "bass" ? "fb-string fb-string-bass" : i >= 3 ? "fb-string fb-string-wound" : "fb-string"}
            x1={NUT_X}
            x2={boardRight}
            y1={stringY(i)}
            y2={stringY(i)}
            strokeWidth={widths[Math.min(i, widths.length - 1)]}
          />
          <text className="fb-open-name" x={NAME_X} y={stringY(i)} dominantBaseline="central" textAnchor="middle">
            {noteAt(tuning, i, 0, accidental).name}
          </text>
        </g>
      ))}

      {/* 品位編號 */}
      {visibleFrets.map((f) => (
        <text
          key={`num-${f}`}
          className={SINGLE_INLAYS.has(f) || DOUBLE_INLAYS.has(f) ? "fb-number fb-number-marked" : "fb-number"}
          x={cellCenterX(f)}
          y={numbersY}
          textAnchor="middle"
        >
          {f}
        </text>
      ))}
      {showOpen && (
        <text className="fb-number" x={OPEN_DOT_X} y={numbersY} textAnchor="middle">
          0
        </text>
      )}

      {/* 標記 */}
      {tuning.map((_, s) =>
        (showOpen ? [0, ...visibleFrets] : visibleFrets).map((f) => {
          const mark = marks[cellKey(s, f)];
          if (!mark) return null;
          const cx = cellCenterX(f);
          const cy = stringY(s);
          return (
            <g
              key={cellKey(s, f)}
              className={`fb-mark fb-mark-${mark.kind}${mark.chordTone ? " fb-mark-chord" : ""}`}
              data-string={s}
              data-fret={f}
            >
              <circle cx={cx} cy={cy} r={mark.chordTone ? 13 : 11} />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
                {mark.label}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}
