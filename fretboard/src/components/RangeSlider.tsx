export interface RangeSliderProps {
  min: number;
  max: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  lowLabel: string;
  highLabel: string;
}

/** 雙把手滑桿：兩個重疊的 <input type="range">，低 ≤ 高 */
export default function RangeSlider({ min, max, low, high, onChange, lowLabel, highLabel }: RangeSliderProps) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  // 兩把手重疊時，讓「還能往內拖」的那一個在上層
  const lowOnTop = low > min + (max - min) / 2;
  return (
    <div className="range">
      <div className="range-track">
        <div className="range-fill" style={{ left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%` }} />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={low}
        aria-label={lowLabel}
        style={{ zIndex: lowOnTop ? 4 : 3 }}
        onChange={(e) => onChange(Math.min(Number(e.target.value), high), high)}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={high}
        aria-label={highLabel}
        style={{ zIndex: lowOnTop ? 3 : 4 }}
        onChange={(e) => onChange(low, Math.max(Number(e.target.value), low))}
      />
    </div>
  );
}
