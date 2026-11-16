import type { Dict } from "../i18n";
import { MAX_BPM, MIN_BPM, clampBpm } from "../lib/tempo";

export type TempoSource = "chart" | "style" | "custom";

export interface PlayerBarProps {
  t: Dict;
  playing: boolean;
  onToggle: () => void;
  bpm: number;
  tempoSource: TempoSource;
  onBpm: (n: number) => void;
  onResetBpm: () => void;
  countIn: boolean;
  onCountIn: (v: boolean) => void;
  /** 預備拍進行中：目前第幾拍（1–4），否則 null */
  countNum: number | null;
  loop: boolean;
  onLoop: (v: boolean) => void;
  click: boolean;
  onClick: (v: boolean) => void;
  comp: boolean;
  onComp: (v: boolean) => void;
  bass: boolean;
  onBass: (v: boolean) => void;
  volume: number;
  onVolume: (v: number) => void;
}

export default function PlayerBar(p: PlayerBarProps) {
  const { t } = p;
  const note = p.tempoSource === "chart" ? t.tempoChart : p.tempoSource === "style" ? t.tempoStyle : t.tempoCustom;
  return (
    <div className="player" role="group" aria-label={t.play}>
      <button type="button" className={`play-btn${p.playing ? " on" : ""}`} onClick={p.onToggle} aria-pressed={p.playing}>
        <span aria-hidden="true">{p.playing ? "❚❚" : "▶"}</span>
        {p.playing ? t.pause : t.play}
      </button>
      {p.countNum != null && (
        <span className="count-badge" aria-live="polite">
          {t.countIn} {p.countNum}
        </span>
      )}

      <div className="tempo">
        <button type="button" onClick={() => p.onBpm(p.bpm - 1)} aria-label="−1 BPM">
          −
        </button>
        <input
          type="number"
          min={MIN_BPM}
          max={MAX_BPM}
          value={p.bpm}
          onChange={(e) => e.target.value !== "" && p.onBpm(Number(e.target.value))}
          onBlur={(e) => p.onBpm(clampBpm(Number(e.target.value) || p.bpm))}
          aria-label={t.bpmAria}
        />
        <button type="button" onClick={() => p.onBpm(p.bpm + 1)} aria-label="+1 BPM">
          +
        </button>
        <span className="bpm-unit">{t.bpmUnit}</span>
        <input
          className="bpm-slider"
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          value={p.bpm}
          onChange={(e) => p.onBpm(Number(e.target.value))}
          aria-label={t.bpmAria}
        />
        <span className={`tempo-note tempo-${p.tempoSource}`}>{note}</span>
        {p.tempoSource === "custom" && (
          <button type="button" className="ghost" onClick={p.onResetBpm}>
            {t.tempoReset}
          </button>
        )}
      </div>

      <div className="toggles">
        <label className={p.countIn ? "on" : ""}>
          <input type="checkbox" checked={p.countIn} onChange={(e) => p.onCountIn(e.target.checked)} />
          {t.countIn}
        </label>
        <label className={p.loop ? "on" : ""}>
          <input type="checkbox" checked={p.loop} onChange={(e) => p.onLoop(e.target.checked)} />
          {t.loop}
        </label>
        <label className={p.comp ? "on" : ""}>
          <input type="checkbox" checked={p.comp} onChange={(e) => p.onComp(e.target.checked)} />
          {t.soundComp}
        </label>
        <label className={p.bass ? "on" : ""}>
          <input type="checkbox" checked={p.bass} onChange={(e) => p.onBass(e.target.checked)} />
          {t.soundBass}
        </label>
        <label className={p.click ? "on" : ""}>
          <input type="checkbox" checked={p.click} onChange={(e) => p.onClick(e.target.checked)} />
          {t.soundClick}
        </label>
        <label className="vol">
          {t.volume}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={p.volume}
            onChange={(e) => p.onVolume(Number(e.target.value))}
            aria-label={t.volume}
          />
        </label>
      </div>
    </div>
  );
}
