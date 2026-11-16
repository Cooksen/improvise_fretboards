import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Chart, { type ChartChord } from "./components/Chart";
import Fretboard, { cellKey, type FretMark, type FretSpacing, type Instrument } from "./components/Fretboard";
import PlayerBar, { type TempoSource } from "./components/Player";
import RangeSlider from "./components/RangeSlider";
import { Player, type SoundOptions } from "./lib/audio";
import { buildTimeline, clampBpm, defaultBpm } from "./lib/tempo";
import { ApiError, fetchSong, fetchTitles } from "./api";
import { DICT, errorText, initialLang, type Lang } from "./i18n";
import {
  analyzeChord,
  keyLabel,
  mod,
  parseKey,
  prettySymbol,
  transposeSymbol,
  transposeTargets,
  type Key,
} from "./lib/chord";
import type { Song } from "./lib/ireal";
import { marksForChord } from "./lib/marks";
import { FRET_COUNT } from "./lib/music";

const DEFAULT_TITLE = "There Will Never Be Another You";

/** 每條弦空弦的 MIDI 音高，index 0 = 最高音弦 */
const TUNINGS: Record<Instrument, Record<string, { name: string; strings: string; midi: readonly number[] }>> = {
  guitar: {
    standard: { name: "standard", strings: "E A D G B E", midi: [64, 59, 55, 50, 45, 40] },
    dropD: { name: "dropD", strings: "D A D G B E", midi: [64, 59, 55, 50, 45, 38] },
    dadgad: { name: "dadgad", strings: "", midi: [62, 57, 55, 50, 45, 38] },
    halfDown: { name: "halfDown", strings: "Eb Ab Db Gb Bb Eb", midi: [63, 58, 54, 49, 44, 39] },
  },
  bass: {
    standard: { name: "standard", strings: "E A D G", midi: [43, 38, 33, 28] },
    dropD: { name: "dropD", strings: "D A D G", midi: [43, 38, 33, 26] },
    halfDown: { name: "halfDown", strings: "Eb Ab Db Gb", midi: [42, 37, 32, 27] },
  },
};

type LabelMode = "degree" | "note";
type Sel = { bar: number; pos: number };

const fancy = (s: string) => s.replaceAll("b", "♭").replaceAll("#", "♯");

export default function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = DICT[lang];
  useEffect(() => {
    document.documentElement.lang = t.htmlLang;
    try {
      localStorage.setItem("lang", lang);
    } catch {
      /* ignore */
    }
  }, [lang, t.htmlLang]);

  const [titles, setTitles] = useState<string[]>([]);
  const [query, setQuery] = useState(DEFAULT_TITLE);
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [labelMode, setLabelMode] = useState<LabelMode>("degree");
  const [semitones, setSemitones] = useState(0);
  const [selected, setSelected] = useState<Sel | null>(null);
  const selectedRef = useRef<Sel | null>(null);
  selectedRef.current = selected;
  const [instrument, setInstrument] = useState<Instrument>("guitar");
  const [tuningKeys, setTuningKeys] = useState<Record<Instrument, string>>({ guitar: "standard", bass: "standard" });
  const [spacing, setSpacing] = useState<FretSpacing>("realistic");
  const [range, setRange] = useState<[number, number]>([0, FRET_COUNT]);

  // ---- 播放 ----
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [tempoSource, setTempoSource] = useState<TempoSource>("style");
  const [loopOn, setLoopOn] = useState(true);
  const [countIn, setCountIn] = useState(true);
  const [countNum, setCountNum] = useState<number | null>(null);
  const [sound, setSound] = useState<SoundOptions>({ click: false, comp: true, bass: true, volume: 0.7 });

  const playerRef = useRef<Player | null>(null);

  // ---- 載入歌曲 ----
  const requestId = useRef(0);
  const loadSong = useCallback(async (title: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const s = await fetchSong(title);
      if (id !== requestId.current) return;
      const key = parseKey(s.key);
      setSong(s);
      setQuery(s.title);
      setSemitones(0);
      playerRef.current?.stop();
      const chartBpm = Number(s.bpm);
      if (chartBpm > 0) {
        setBpm(clampBpm(chartBpm));
        setTempoSource("chart");
      } else {
        setBpm(defaultBpm(s.style));
        setTempoSource("style");
      }
      const bar = s.bars.findIndex((b) => b.chords.some((c) => analyzeChord(c, key)));
      setSelected(bar >= 0 ? { bar, pos: s.bars[bar].chords.findIndex((c) => analyzeChord(c, key)) } : null);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSong(DEFAULT_TITLE);
    fetchTitles().then(setTitles).catch(() => undefined);
  }, [loadSong]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) void loadSong(query.trim());
  };

  // ---- 轉調 ----
  const origKey: Key | null = useMemo(() => (song ? parseKey(song.key) : null), [song]);
  const targets = useMemo(() => (origKey ? transposeTargets(origKey) : []), [origKey]);
  const targetKey = targets[semitones] ?? origKey;

  const chartChords: ChartChord[][] = useMemo(() => {
    if (!song || !origKey || !targetKey) return [];
    return song.bars.map((bar) =>
      bar.chords.map((sym) => {
        const tr = transposeSymbol(sym, origKey, targetKey);
        return { symbol: tr, analysis: analyzeChord(tr, targetKey) };
      }),
    );
  }, [song, origKey, targetKey]);

  // ---- 播放：時間軸與播放器 ----
  const timeline = useMemo(
    () => (song ? buildTimeline(song.bars, chartChords.map((bar) => bar.map((c) => c.analysis)), song.timeSignature) : []),
    [song, chartChords],
  );
  const live = useRef({ bpm, sound, loopOn, timeline, countIn });
  live.current = { bpm, sound, loopOn, timeline, countIn };

  useEffect(() => {
    const player = new Player({
      getBpm: () => live.current.bpm,
      getTimeline: () => live.current.timeline,
      getOptions: () => live.current.sound,
      getLoop: () => live.current.loopOn,
      onCount: setCountNum,
      onStep: (ev) => setSelected({ bar: ev.bar, pos: ev.pos }),
      onStop: () => setPlaying(false),
    });
    playerRef.current = player;
    return () => {
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => playerRef.current?.setVolume(sound.volume), [sound.volume]);

  const eventIndex = useCallback(
    (bar: number, pos: number) => live.current.timeline.findIndex((e) => e.bar === bar && e.pos === pos),
    [],
  );

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isRunning) {
      player.stop();
      return;
    }
    const sel = selectedRef.current;
    const i = sel ? eventIndex(sel.bar, sel.pos) : 0;
    setPlaying(true);
    player.start(Math.max(0, i), live.current.countIn ? 4 : 0);
  }, [eventIndex]);

  const changeBpm = (n: number) => {
    setBpm(clampBpm(n));
    setTempoSource("custom");
  };
  const resetBpm = () => {
    if (!song) return;
    const chartBpm = Number(song.bpm);
    setBpm(chartBpm > 0 ? clampBpm(chartBpm) : defaultBpm(song.style));
    setTempoSource(chartBpm > 0 ? "chart" : "style");
  };

  // 播放中讓目前和弦保持在畫面內（指板區是 sticky，要避開它）
  useEffect(() => {
    if (!playing) return;
    const el = document.querySelector<HTMLElement>(".chord-active");
    const stage = document.querySelector<HTMLElement>(".stage");
    if (!el || !stage) return;
    const r = el.getBoundingClientRect();
    if (r.top < stage.getBoundingClientRect().bottom + 8 || r.bottom > window.innerHeight - 8) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [selected, playing]);

  const onChartSelect = (bar: number, pos: number) => {
    setSelected({ bar, pos });
    const player = playerRef.current;
    const i = eventIndex(bar, pos);
    if (i < 0 || !player) return;
    if (player.isRunning) player.seek(i);
    else if (sound.comp || sound.bass) player.preview(live.current.timeline[i]);
  };

  // ---- 目前選取的和弦 → 指板標記 ----
  const tuningKey = tuningKeys[instrument];
  const tuning = TUNINGS[instrument][tuningKey].midi;
  const current = selected ? chartChords[selected.bar]?.[selected.pos] : undefined;
  const analysis = current?.analysis ?? null;
  const [lo, hi] = range;

  const marks = useMemo(() => {
    const out: Record<string, FretMark> = {};
    if (!analysis || !targetKey) return out;
    const byPc = marksForChord(analysis, targetKey);
    tuning.forEach((open, s) => {
      for (let f = lo; f <= hi; f++) {
        const m = byPc.get(mod(open + f, 12));
        if (m) {
          out[cellKey(s, f)] = {
            label: labelMode === "degree" ? fancy(m.degree) : fancy(m.note),
            kind: m.kind,
            chordTone: m.chordTone,
          };
        }
      }
    });
    return out;
  }, [analysis, targetKey, tuning, labelMode, lo, hi]);

  // ---- 鍵盤：左右鍵切換和弦 ----
  const playable = useMemo(() => {
    const list: Sel[] = [];
    chartChords.forEach((bar, b) => bar.forEach((c, p) => c.analysis && list.push({ bar: b, pos: p })));
    return list;
  }, [chartChords]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key === " " || e.code === "Space") {
        if (el && ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(el.tagName) && (el as HTMLInputElement).type !== "range") return;
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      if (el && ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) && (el as HTMLInputElement).type !== "radio") return;
      if (!playable.length) return;
      e.preventDefault();
      const i = playable.findIndex((x) => x.bar === selected?.bar && x.pos === selected?.pos);
      const next = e.key === "ArrowRight" ? Math.min(playable.length - 1, i + 1) : Math.max(0, i <= 0 ? 0 : i - 1);
      setSelected(playable[next]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playable, selected, togglePlay]);

  const shift = (d: number) => setSemitones((s) => mod(s + d, 12));
  const semitoneText = (i: number) => (i === 0 ? t.orig : i <= 6 ? `+${i}` : `−${12 - i}`);
  const tuningLabel = (tn: { name: string; strings: string }) => {
    const name = t.tunings[tn.name as keyof typeof t.tunings];
    return tn.strings ? `${name} (${tn.strings})` : name;
  };

  const suggestions = error instanceof ApiError ? error.suggestions : [];

  return (
    <main className="app">
      <header className="top">
        <h1>{t.appTitle}</h1>
        <form className="search" onSubmit={onSubmit}>
          <input
            type="search"
            list="song-titles"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchAria}
          />
          <datalist id="song-titles">
            {titles.map((title) => (
              <option key={title} value={title} />
            ))}
          </datalist>
          <button type="submit" disabled={loading}>
            {loading ? t.loadingBtn : t.search}
          </button>
        </form>
        <div className="lang" role="group" aria-label={t.language}>
          {(["zh", "en"] as const).map((l) => (
            <button key={l} type="button" className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>
              {l === "zh" ? "中文" : "EN"}
            </button>
          ))}
        </div>
      </header>

      {error != null && (
        <div className="notice" role="alert">
          <p>{errorText(t, error)}</p>
          {suggestions.length > 0 && (
            <p className="suggest">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => void loadSong(s)}>
                  {s}
                </button>
              ))}
            </p>
          )}
        </div>
      )}

      {song && origKey && targetKey && (
        <>
          <section className="song-meta">
            <h2>{song.title}</h2>
            <p>
              {[song.composer, song.style, song.timeSignature].filter(Boolean).join(" · ")}
              <span className="keybadge">
                {t.originalKey} {fancy(keyLabel(origKey))}
              </span>
              {semitones !== 0 && (
                <span className="keybadge keybadge-now">
                  {t.nowKey} {fancy(keyLabel(targetKey))}
                </span>
              )}
            </p>
          </section>

          <div className="tabs" role="tablist" aria-label={t.instrument}>
            {(["guitar", "bass"] as const).map((i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={instrument === i}
                className={instrument === i ? "on" : ""}
                onClick={() => setInstrument(i)}
              >
                {t.instruments[i]}
              </button>
            ))}
          </div>

          <section className="controls">
            <fieldset className="segmented">
              <legend>{t.labelMode}</legend>
              <div className="seg-row">
                {(["degree", "note"] as const).map((m) => (
                  <label key={m} className={labelMode === m ? "on" : ""}>
                    <input type="radio" name="labelMode" checked={labelMode === m} onChange={() => setLabelMode(m)} />
                    {m === "degree" ? t.degrees : t.notes}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="transpose">
              <span className="ctl-label">{t.transpose}</span>
              <button type="button" onClick={() => shift(-1)} aria-label={t.down}>
                −
              </button>
              <select value={semitones} onChange={(e) => setSemitones(Number(e.target.value))} aria-label={t.targetKey}>
                {targets.map((k, i) => (
                  <option key={i} value={i}>
                    {fancy(keyLabel(k))}　{semitoneText(i)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => shift(1)} aria-label={t.up}>
                +
              </button>
              <button type="button" className="ghost" onClick={() => setSemitones(0)} disabled={semitones === 0}>
                {t.reset}
              </button>
            </div>

            <div className="ctl range-ctl">
              <span className="ctl-label">
                {t.fretRange}{t.colon}<b>{t.fretRangeText(lo, hi)}</b>
              </span>
              <div className="range-row">
                <RangeSlider
                  min={0}
                  max={FRET_COUNT}
                  low={lo}
                  high={hi}
                  onChange={(a, b) => setRange([a, Math.max(b, 1)])}
                  lowLabel={t.rangeFrom}
                  highLabel={t.rangeTo}
                />
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setRange([0, FRET_COUNT])}
                  disabled={lo === 0 && hi === FRET_COUNT}
                >
                  {t.fretRangeAll}
                </button>
              </div>
            </div>

            <label className="ctl">
              <span className="ctl-label">{t.tuning}</span>
              <select
                value={tuningKey}
                onChange={(e) => setTuningKeys((k) => ({ ...k, [instrument]: e.target.value }))}
              >
                {Object.entries(TUNINGS[instrument]).map(([k, tn]) => (
                  <option key={k} value={k}>
                    {tuningLabel(tn)}
                  </option>
                ))}
              </select>
            </label>
            <label className="ctl">
              <span className="ctl-label">{t.spacing}</span>
              <select value={spacing} onChange={(e) => setSpacing(e.target.value as FretSpacing)}>
                <option value="realistic">{t.spacingReal}</option>
                <option value="equal">{t.spacingEqual}</option>
              </select>
            </label>
          </section>

          <section className="stage">
            <PlayerBar
              t={t}
              playing={playing}
              onToggle={togglePlay}
              bpm={bpm}
              tempoSource={tempoSource}
              onBpm={changeBpm}
              onResetBpm={resetBpm}
              loop={loopOn}
              onLoop={setLoopOn}
              countIn={countIn}
              onCountIn={setCountIn}
              countNum={countNum}
              click={sound.click}
              onClick={(v) => setSound((o) => ({ ...o, click: v }))}
              comp={sound.comp}
              onComp={(v) => setSound((o) => ({ ...o, comp: v }))}
              bass={sound.bass}
              onBass={(v) => setSound((o) => ({ ...o, bass: v }))}
              volume={sound.volume}
              onVolume={(v) => setSound((o) => ({ ...o, volume: v }))}
            />
            <div className="stage-info">
              {current && analysis ? (
                <>
                  <span className="stage-chord">{prettySymbol(current.symbol)}</span>
                  <span className="stage-roman">{fancy(analysis.roman)}</span>
                  <span className="stage-tones">
                    {analysis.tones.map((tone, i) => (
                      <span key={i} className={`tone${i === 0 ? " tone-root" : ""}${!tone.inKey ? " tone-out" : ""}`}>
                        {fancy(tone.note)}
                        <small>{fancy(tone.degree)}</small>
                      </span>
                    ))}
                  </span>
                </>
              ) : (
                <span className="stage-hint">{t.pickChord}</span>
              )}
              <span className="legend" aria-label={t.legend}>
                <i className="lg lg-root" />
                {t.root}
                <i className="lg lg-out" />
                {t.outside}
                <i className="lg lg-scale" />
                {t.inKey}
                <i className="lg lg-chord" />
                {t.chordTone}
              </span>
            </div>
            <div className="board-scroll">
              <Fretboard
                key={instrument}
                tuning={tuning}
                instrument={instrument}
                spacing={spacing}
                marks={marks}
                range={{ min: lo, max: hi }}
                accidental={targetKey.acc < 0 ? "flat" : "sharp"}
                ariaLabel={t.fretboardAria(tuning.length, FRET_COUNT)}
              />
            </div>
          </section>

          <Chart
            bars={song.bars}
            chords={chartChords}
            selected={selected}
            onSelect={onChartSelect}
          />
          <p className="hint">{t.hint}</p>
          <p className="hint">{t.playHint}</p>
        </>
      )}

      {!song && loading && <p className="loading">{t.loadingMsg}</p>}
    </main>
  );
}
