import { clampBpm, type PlayEvent } from "./tempo";

export interface SoundOptions {
  click: boolean;
  comp: boolean;
  bass: boolean;
  volume: number; // 0–1
}

export interface PlayerHooks {
  getBpm: () => number;
  getTimeline: () => readonly PlayEvent[];
  getOptions: () => SoundOptions;
  getLoop: () => boolean;
  /** 播放位置換到某個和弦時（和聲音對齊）呼叫 */
  onStep: (ev: PlayEvent, index: number) => void;
  /** 播到最後（不循環時）或被停止 */
  onStop: () => void;
}

const LOOKAHEAD_S = 0.15;
const TICK_MS = 25;
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** 低音：把音名放到 E2–D#3 附近最近的八度 */
function bassMidi(pc: number): number {
  let m = pc + 36;
  while (m < 40) m += 12;
  while (m > 51) m -= 12;
  return m;
}

/**
 * Web Audio 播放器：用 AudioContext 的時鐘排程（lookahead），
 * 和弦與發聲都排在精準的時間點上，畫面再依同一個時鐘跟上。
 */
export class Player {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private raf: number | null = null;
  private idx = 0;
  private nextTime = 0;
  private queue: { t: number; ev: PlayEvent; i: number }[] = [];
  private endAt: number | null = null;
  private running = false;

  constructor(private hooks: PlayerHooks) {}

  get isRunning() {
    return this.running;
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
    }
    void this.ctx.resume();
    this.setVolume(this.hooks.getOptions().volume);
    return this.ctx;
  }

  setVolume(v: number) {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.9, this.ctx.currentTime, 0.02);
  }

  start(index: number) {
    const ctx = this.ensure();
    this.stopTimers();
    this.running = true;
    this.idx = Math.max(0, index);
    this.nextTime = ctx.currentTime + 0.08;
    this.queue = [];
    this.endAt = null;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
    const frame = () => {
      this.drainQueue();
      if (this.running) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** 播放中跳到指定和弦 */
  seek(index: number) {
    if (!this.running || !this.ctx) return;
    this.idx = Math.max(0, index);
    this.nextTime = this.ctx.currentTime + 0.05;
    this.queue = [];
    this.endAt = null;
  }

  stop() {
    const was = this.running;
    this.running = false;
    this.stopTimers();
    this.queue = [];
    if (was) this.hooks.onStop();
  }

  /** 沒在播放時，點和弦就聽一下 */
  preview(ev: PlayEvent) {
    const ctx = this.ensure();
    const bpm = clampBpm(this.hooks.getBpm());
    this.schedule({ ...ev, offset: 0, beats: Math.min(ev.beats, 2) }, ctx.currentTime + 0.03, 60 / bpm);
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }

  private stopTimers() {
    if (this.timer != null) clearInterval(this.timer);
    if (this.raf != null) cancelAnimationFrame(this.raf);
    this.timer = this.raf = null;
  }

  private drainQueue() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    let last: { ev: PlayEvent; i: number } | null = null;
    while (this.queue.length && this.queue[0].t <= now) last = this.queue.shift()!;
    if (last) this.hooks.onStep(last.ev, last.i);
    if (this.endAt != null && now >= this.endAt && !this.queue.length) this.stop();
  }

  private tick() {
    const ctx = this.ctx;
    if (!ctx || !this.running || this.endAt != null) return;
    const tl = this.hooks.getTimeline();
    if (!tl.length) return this.stop();
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      if (this.idx >= tl.length) this.idx = 0;
      const ev = tl[this.idx];
      const beatDur = 60 / clampBpm(this.hooks.getBpm());
      this.schedule(ev, this.nextTime, beatDur);
      this.queue.push({ t: this.nextTime, ev, i: this.idx });
      this.nextTime += ev.beats * beatDur;
      this.idx++;
      if (this.idx >= tl.length) {
        if (this.hooks.getLoop()) this.idx = 0;
        else {
          this.endAt = this.nextTime;
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- 發聲 --

  private schedule(ev: PlayEvent, t: number, beatDur: number) {
    const o = this.hooks.getOptions();
    // 這個和弦涵蓋的整數拍（相對於小節）
    const beatsIn: { time: number; first: boolean; bar1: boolean; i: number }[] = [];
    const eps = 1e-6;
    beatsIn.push({ time: t, first: true, bar1: Math.abs(ev.offset) < eps, i: 0 });
    let i = 1;
    for (let k = Math.floor(ev.offset + eps) + 1; k < ev.offset + ev.beats - eps; k++, i++) {
      beatsIn.push({ time: t + (k - ev.offset) * beatDur, first: false, bar1: false, i });
    }

    if (o.click) {
      // 節拍器：每個整數拍；小節第一拍重音
      const startK = Math.ceil(ev.offset - eps);
      for (let k = startK; k < ev.offset + ev.beats - eps; k++) {
        this.click(t + (k - ev.offset) * beatDur, k === 0);
      }
    }
    if (!ev.sound) return;
    const n = beatsIn.length;
    beatsIn.forEach((b, idx) => {
      if (o.comp) this.strum(ev.sound!.voicing, b.time, beatDur * 0.55, b.first ? 1 : 0.65);
      if (o.bass) {
        const s = ev.sound!;
        let pc = s.rootPc;
        if (idx > 0) {
          if (idx === n - 1 && n >= 2 && ev.nextRootPc != null && ev.nextRootPc !== s.rootPc) {
            pc = (ev.nextRootPc + (idx % 2 ? 11 : 1)) % 12; // 半音接近下一個根音
          } else pc = [s.fifthPc, s.thirdPc, s.fifthPc][(idx - 1) % 3];
        }
        this.bassNote(bassMidi(pc), b.time, beatDur * 0.92, idx === 0 ? 1 : 0.85);
      }
    });
  }

  private click(time: number, accent: boolean) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1600 : 1100;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.14, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    osc.connect(g).connect(this.master!);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  private strum(midis: number[], time: number, dur: number, vel: number) {
    const per = (0.24 / Math.sqrt(Math.max(midis.length, 1))) * vel;
    midis.forEach((m, i) => pianoNote(this.ctx!, this.master!, m, time + i * 0.008, dur, per));
  }

  private bassNote(m: number, time: number, dur: number, vel: number) {
    bassPluck(this.ctx!, this.master!, m, time, dur, 0.5 * vel);
  }
}

// ------------------------------------------------------------ 音色（合成）--
// 不用任何音檔：鋼琴用「泛音列 + 兩根略微失諧的弦 + 琴槌敲擊雜音 + 亮到暗的濾波」模擬；
// 低音提琴用「富含泛音的撥弦 + 指板敲擊聲 + 濾波掃頻 + 低八度的 sine」模擬。

type Ctx = BaseAudioContext;
const waveCache = new WeakMap<Ctx, Record<string, PeriodicWave>>();
const noiseCache = new WeakMap<Ctx, AudioBuffer>();

function wave(ctx: Ctx, name: string, partials: (n: number) => number, count: number): PeriodicWave {
  const cache = waveCache.get(ctx) ?? {};
  waveCache.set(ctx, cache);
  if (!cache[name]) {
    const real = new Float32Array(count + 1);
    const imag = new Float32Array(count + 1);
    for (let n = 1; n <= count; n++) imag[n] = partials(n);
    cache[name] = ctx.createPeriodicWave(real, imag);
  }
  return cache[name];
}

function noise(ctx: Ctx): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** 短促的雜音（琴槌 / 手指敲擊） */
function thump(ctx: Ctx, out: AudioNode, time: number, freq: number, q: number, gain: number, len: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + len);
  src.connect(bp).connect(g).connect(out);
  src.start(time);
  src.stop(time + len + 0.01);
}

/** 一個鋼琴音。gain 是峰值音量；dur 是按住的時間，之後 ~120ms 內收掉。 */
export function pianoNote(ctx: Ctx, out: AudioNode, midi: number, time: number, dur: number, gain: number) {
  const f0 = midiHz(midi);
  const tau = Math.max(0.25, 0.35 + (84 - midi) * 0.018); // 低音衰減慢、高音快
  const peak = gain;
  const end = Math.max(peak * Math.exp(-dur / tau), 0.0002);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.min(9000, f0 * 16), time);
  filter.frequency.exponentialRampToValueAtTime(Math.max(f0 * 3, 400), time + Math.min(dur, 0.5));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(peak, time + 0.003);
  g.gain.exponentialRampToValueAtTime(end, time + Math.max(dur, 0.02));
  g.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(dur, 0.02) + 0.12);
  filter.connect(g).connect(out);

  const w = wave(ctx, "piano", (n) => (n % 2 === 0 ? 0.8 : 1) / Math.pow(n, 1.25), 14);
  const spread = midi < 52 ? 1.5 : 3.5; // 兩根弦略微失諧 → 厚度
  for (const detune of [-spread, spread]) {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(w);
    osc.frequency.value = f0;
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(time);
    osc.stop(time + Math.max(dur, 0.02) + 0.15);
  }
  thump(ctx, out, time, Math.min(f0 * 4, 3000), 0.9, peak * 0.35, 0.025);
}

/** 一個低音提琴撥弦音（midi 是實際發聲的音高） */
export function bassPluck(ctx: Ctx, out: AudioNode, midi: number, time: number, dur: number, gain: number) {
  const f0 = midiHz(midi);
  const len = Math.max(dur, 0.05);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(Math.min(2200, f0 * 14), time);
  filter.frequency.exponentialRampToValueAtTime(Math.max(f0 * 2.5, 260), time + Math.min(len, 0.22));

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(gain, time + 0.008);
  g.gain.exponentialRampToValueAtTime(gain * 0.4, time + len * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, time + len + 0.06);
  filter.connect(g).connect(out);

  const body = wave(ctx, "bass", (n) => 1 / Math.pow(n, 0.95), 18);
  const main = ctx.createOscillator();
  main.setPeriodicWave(body);
  main.frequency.value = f0;
  main.connect(filter);

  // 純音的基音：讓小喇叭也聽得到音高
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = f0;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.55;
  sub.connect(subGain).connect(g);

  for (const o of [main, sub]) {
    o.start(time);
    o.stop(time + len + 0.1);
  }
  thump(ctx, out, time, 650, 1.2, gain * 0.5, 0.035);
}
