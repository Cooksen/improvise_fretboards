/**
 * 標題索引與模糊搜尋（純函式，瀏覽器與 Node 都能用）。
 * 資料來源是 public/jazz1460.irealb.txt 整份 playlist 連結。
 */
import { looksLikeSong, parseSong, safeDecode, songTitle, splitSongs, type Song } from "./ireal";

// ------------------------------------------------------------------ 索引 --

export interface Index {
  entries: { title: string; norm: string; raw: string }[];
}

export function normalizeTitle(t: string): string {
  let s = safeDecode(t).toLowerCase().replace(/[’']ll\b/g, " will").replace(/[’']/g, "");
  const m = s.match(/^(.*),\s*(the|a|an)$/); // "Night Has A Thousand Eyes, The" → "the night …"
  if (m) s = `${m[2]} ${m[1]}`;
  return s.replace(/[^a-z0-9À-ɏ]+/g, " ").trim();
}

export function buildIndex(link: string): Index {
  const seen = new Set<string>();
  const entries: Index["entries"] = [];
  for (const raw of splitSongs(link)) {
    if (!looksLikeSong(raw)) continue;
    const title = songTitle(raw);
    if (seen.has(title)) continue;
    seen.add(title);
    entries.push({ title, norm: normalizeTitle(title), raw });
  }
  return { entries };
}

// ------------------------------------------------------------------ 搜尋 --

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function scoreTitle(queryNorm: string, titleNorm: string): number {
  if (!queryNorm) return 0;
  if (queryNorm === titleNorm) return 1;
  const strip = (s: string) => s.replace(/^(the|a|an) /, "");
  const q = strip(queryNorm);
  const t = strip(titleNorm);
  if (q === t) return 0.99;
  const qt = q.split(" ");
  const tt = t.split(" ");
  if ((" " + t + " ").includes(" " + q + " ")) return 0.9 - Math.min(0.1, (tt.length - qt.length) * 0.01);
  if (qt.length > 1 && qt.every((w) => tt.includes(w))) return 0.85;
  const lev = 1 - levenshtein(q, t) / Math.max(q.length, t.length);
  return lev * 0.8;
}

export function listTitles(index: Index): string[] {
  return index.entries.map((e) => e.title).sort((a, b) => a.localeCompare(b));
}

export function searchTitles(index: Index, query: string, limit = 6): { title: string; score: number }[] {
  const q = normalizeTitle(query);
  return index.entries
    .map((e) => ({ title: e.title, score: scoreTitle(q, e.norm) }))
    .filter((r) => r.score > 0.3)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export const MATCH_THRESHOLD = 0.85;
const EXACT_THRESHOLD = 0.99;

export type FindResult =
  | { song: Song; score: number }
  | { song: null; ambiguous: boolean; suggestions: string[] };

/**
 * 完全符合就直接載入；只有一首夠接近也載入；
 * 同時符合多首（例如只輸入 "autumn"）就回傳候選清單讓使用者選。
 */
export function findSong(index: Index, query: string): FindResult {
  const { entries } = index;
  const hits = searchTitles(index, query, 8);
  const good = hits.filter((h) => h.score >= MATCH_THRESHOLD);
  const pick = hits[0] && hits[0].score >= EXACT_THRESHOLD ? hits[0] : good.length === 1 ? good[0] : null;
  if (!pick) {
    return { song: null, ambiguous: good.length > 1, suggestions: hits.slice(0, 6).map((h) => h.title) };
  }
  const entry = entries.find((e) => e.title === pick.title)!;
  return { song: parseSong(entry.raw), score: pick.score };
}
