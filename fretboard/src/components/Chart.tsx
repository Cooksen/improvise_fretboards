import { prettySymbol, type ChordAnalysis } from "../lib/chord";
import type { Measure } from "../lib/ireal";

export interface ChartChord {
  /** 轉調後的和弦符號（iReal 寫法） */
  symbol: string;
  analysis: ChordAnalysis | null;
}

export interface ChartProps {
  bars: readonly Measure[];
  chords: readonly (readonly ChartChord[])[];
  selected: { bar: number; pos: number } | null;
  onSelect: (bar: number, pos: number, shift: boolean) => void;
  /** 這個和弦在「循環區間」的位置：none / start / mid / end / single */
  rangeState?: (bar: number, pos: number) => "none" | "start" | "mid" | "end" | "single";
  /** 正在挑區間（點開頭、再點結尾）時，游標提示 */
  picking?: boolean;
}

const BARS_PER_ROW = 4;

/** 依段落切行：新段落一定從新的一行開始，每行最多 4 小節 */
function toRows(bars: readonly Measure[]): number[][] {
  const rows: number[][] = [];
  let row: number[] = [];
  bars.forEach((b, i) => {
    if ((b.section && row.length) || row.length === BARS_PER_ROW) {
      rows.push(row);
      row = [];
    }
    row.push(i);
  });
  if (row.length) rows.push(row);
  return rows;
}

export default function Chart({ bars, chords, selected, onSelect, rangeState, picking }: ChartProps) {
  const rows = toRows(bars);
  return (
    <div className={`chart${picking ? " chart-picking" : ""}`} role="list">
      {rows.map((row) => {
        const section = bars[row[0]].section;
        return (
          <div className="chart-row" key={row[0]} role="listitem">
            <div className="chart-section">{section && <span>{section}</span>}</div>
            <div className="chart-bars" style={{ gridTemplateColumns: `repeat(${BARS_PER_ROW}, 1fr)` }}>
              {row.map((barIdx) => (
                <div className="bar" key={barIdx}>
                  <span className="bar-no">{barIdx + 1}</span>
                  {chords[barIdx].map((c, pos) => {
                    const isNC = c.analysis === null;
                    const active = selected?.bar === barIdx && selected.pos === pos;
                    const rs = rangeState?.(barIdx, pos) ?? "none";
                    return (
                      <button
                        key={pos}
                        type="button"
                        className={`chord${active ? " chord-active" : ""}${isNC ? " chord-nc" : ""}${rs !== "none" ? ` chord-range chord-range-${rs}` : ""}`}
                        disabled={isNC}
                        onClick={(e) => onSelect(barIdx, pos, e.shiftKey)}
                        aria-pressed={active}
                      >
                        <span className="chord-symbol">{isNC ? c.symbol : prettySymbol(c.symbol)}</span>
                        {c.analysis && <span className="chord-roman">{c.analysis.roman.replaceAll("b", "♭").replaceAll("#", "♯")}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
