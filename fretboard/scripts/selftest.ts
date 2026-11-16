import assert from "node:assert/strict";
import {
  analyzeChord, parseKey, prettySymbol, transposeSymbol, transposeTargets, keyLabel,
} from "../src/lib/chord";
import { marksForChord } from "../src/lib/marks";
import fs from "node:fs";
import { buildIndex, findSong, listTitles } from "../src/lib/catalog";
import { buildTimeline, clampBpm, defaultBpm, quarterBeatsPerBar } from "../src/lib/tempo";
import { parseSong, scramble, splitSongs, songTitle, looksLikeSong, unscramble } from "../src/lib/ireal";

const Eb = parseKey("Eb");

// ---- 1. 混淆來回 ----
const sample = "[T44*A{Eb^7 LZFm7 ,Bb7 LZEb^7 LZEb7 XyQLZN1Ab^7 LZAbm7 Db7 LZGm7 C7 LZFm7 Bb7 }N2Eb^7 KclLZ]";
assert.equal(unscramble(scramble(sample)), sample);

// ---- 2. 真實資料：論壇 Jazz 1460 裡的 There Will Never Be Another You ----
const REAL = "There%20Will%20Never%20Be%20Another%20You%3DWarren%20Harry%3D%3DMedium%20Up%20Swing%3DEb%3D%3D1r34LbKcu77-bBZ4Eb%5E7QyX7-C%7CQyX9b7GQ%7CyX7hDZL%20lcKQyXKcl%20L4T%5BA*X7F%7CQb7XyQ%7CQyX7%5EbE%7CQyX117%23bD%7CQyX7%5EbA%5BB*%5DC-7XyE%7CQyXX9b7G%20LZF-hDZL%20lcKQyX7%5Eb%5BEA*%5DQyX7bB%7CQyX77XyQ%7ClcKQyQyX117XyQKQyX7%5EbA%5BC*%5DQyXb7E%7CQyX7-bBZL%20lc%7CDb7%23-C%7CQybB%206bXyQ%7CAB%207-FZL7C%207-GZ7LbA%207%5EbEZL7D%207hb7LZE7%5EbE%7C7%20Z%3D%3D0%3D0";
const url = "irealb://" + REAL + "%3D%3D%3DJazz%201460";
const songs = splitSongs(url);
assert.equal(songs.length, 2);
assert.equal(looksLikeSong(songs[0]), true);
assert.equal(looksLikeSong(songs[1]), false); // playlist 名稱
assert.equal(songTitle(songs[0]), "There Will Never Be Another You");
const song = parseSong(songs[0]);
assert.equal(song.key, "Eb");
assert.equal(song.bars.length, 32);
assert.deepEqual(song.bars.map((b) => b.section).filter(Boolean), ["A", "B", "A", "C"]);
assert.deepEqual(song.bars[9].chords, ["Db7#11"]);
assert.deepEqual(song.bars[27].chords, ["Ah7", "D7"]);

// ---- 3. 級數 ----
const deg = (s: string) => {
  const a = analyzeChord(s, Eb)!;
  return { d: a.tones.map((t) => t.degree), out: a.outside, roman: a.roman };
};
assert.deepEqual(deg("Db7#11"), { d: ["b7", "2", "4", "b6", "3"], out: ["b7", "b6"], roman: "bVII7#11" });
assert.deepEqual(deg("Eb^7"), { d: ["1", "3", "5", "7"], out: [], roman: "Imaj7" });
assert.deepEqual(deg("Dh7"), { d: ["7", "2", "4", "6"], out: [], roman: "viiø7" });
assert.deepEqual(deg("G7b9"), { d: ["3", "#5", "7", "2", "4"], out: ["#5"], roman: "III7b9" });
assert.deepEqual(deg("Bb-7").out, ["b7"]);
assert.deepEqual(deg("Eb/G"), { d: ["1", "3", "5"], out: [], roman: "I/3" });
assert.deepEqual(deg("Ah7").out, ["#4"]);

// ---- 4. 指板標記規則 ----
const degrees = (s: string) =>
  [...marksForChord(analyzeChord(s, Eb)!, Eb).values()].map((m) => `${m.degree}:${m.kind[0]}${m.chordTone ? "*" : ""}`).sort();
assert.deepEqual(degrees("Db7#11"), ["1:s", "2:s*", "3:s*", "4:s*", "5:s", "b6:o*", "b7:r*"].sort());
// Eb7：b7 為調外音（且是和弦音）→ 不標 7
assert.deepEqual(degrees("Eb7"), ["1:r*", "2:s", "3:s*", "4:s", "5:s*", "6:s", "b7:o*"].sort());
// G7b9：#5（B 還原）調外 → 不標 5；根音 3 紅色
assert.deepEqual(degrees("G7b9"), ["1:s", "2:s*", "3:r*", "4:s*", "6:s", "7:s*", "#5:o*"].sort());
// 全在調內的和弦：不會多出調外音，也沒有黃色
assert.ok(![...marksForChord(analyzeChord("Eb^7", Eb)!, Eb).values()].some((m) => m.kind === "outside"));
assert.equal(marksForChord(analyzeChord("Eb^7", Eb)!, Eb).size, 7);

// ---- 5. 轉調（以級數重新拼寫）----
const F = parseKey("F");
const tr = (s: string, to = F) => transposeSymbol(s, Eb, to);
assert.equal(tr("Eb^7"), "F^7");
assert.equal(tr("Db7#11"), "Eb7#11"); // 不是 D#7#11
assert.equal(tr("Dh7"), "Eh7");
assert.equal(tr("G7b9"), "A7b9");
assert.equal(tr("Eb/G"), "F/A");
assert.equal(tr("Bb-7"), "C-7");
assert.equal(tr("N.C."), "N.C.");
assert.equal(tr("Db7#11", parseKey("E")), "D7#11");
// 轉調後級數不變
for (const s of ["Db7#11", "G7b9", "Ah7", "D7", "C7", "Ab7"]) {
  for (const t of transposeTargets(Eb)) {
    const a = analyzeChord(s, Eb)!;
    const b = analyzeChord(transposeSymbol(s, Eb, t), t)!;
    assert.deepEqual(b.tones.map((x) => x.degree), a.tones.map((x) => x.degree), `${s} → ${keyLabel(t)}`);
    assert.equal(b.roman, a.roman);
  }
}
assert.deepEqual(transposeTargets(Eb).map(keyLabel), ["Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B", "C", "Db", "D"]);
assert.equal(prettySymbol("Db7#11"), "D♭7♯11");
assert.equal(prettySymbol("Eb^7"), "E♭Δ7");
assert.equal(prettySymbol("Dh7"), "Dø7");

// ---- 6. 小調 ----
const Dm = parseKey("D-");
assert.equal(analyzeChord("F^7", Dm)!.outside.length, 0); // bIII 在自然小調內
const a7 = analyzeChord("A7", Dm)!; // A C# E G：C# 相對 D 是 7（還原），屬調外音
assert.deepEqual(a7.outside, ["7"]);
assert.equal(a7.roman, "V7");
// 小調的 V7：調外的 7 取代調內的 b7（不重複標記）
const m = [...marksForChord(a7, Dm).values()].map((x) => x.degree);
assert.ok(m.includes("7") && !m.includes("b7"));

// ---- 7. 速度與時間軸 ----
assert.equal(parseSong(songs[0]).bpm, ""); // 這份資料沒給速度（0）
assert.equal(defaultBpm("Ballad"), 66);
assert.equal(defaultBpm("Medium Up Swing"), 170);
assert.equal(defaultBpm("whatever"), 120);
assert.equal(clampBpm(9999), 320);
assert.equal(quarterBeatsPerBar("4/4"), 4);
assert.equal(quarterBeatsPerBar("6/8"), 3);
assert.equal(quarterBeatsPerBar("3/4"), 3);
{
  const song = parseSong(songs[0]);
  const analyses = song.bars.map((b) => b.chords.map((c) => analyzeChord(c, Eb)));
  const tl = buildTimeline(song.bars, analyses, song.timeSignature);
  const total = tl.reduce((n, e) => n + e.beats, 0);
  assert.equal(total, song.bars.length * 4); // 每小節 4 拍
  const two = tl.find((e) => e.pos === 1); // 一小節兩個和弦 → 各 2 拍，第二個從第 3 拍開始
  if (two) { assert.equal(two.beats, 2); assert.equal(two.offset, 2); }
  const first = tl[0].sound!;
  assert.equal(first.rootPc, 3); // Eb
  assert.ok(first.voicing.length >= 3 && first.voicing.every((m, i, a) => i === 0 || m > a[i - 1]));
  assert.ok(tl[tl.length - 1].nextRootPc !== null); // 最後一個接回開頭
}

// ---- 8. 標題搜尋（用 public/ 裡真正的 playlist）----
{
  const file = new URL("../public/jazz1460.irealb.txt", import.meta.url);
  if (fs.existsSync(file)) {
    const idx = buildIndex(fs.readFileSync(file, "utf8").trim());
    assert.equal(idx.entries.length, 1460);
    assert.equal(listTitles(idx).length, 1460);
    const hit = findSong(idx, "there will never be another you");
    assert.ok(hit.song && hit.song.key === "Eb" && hit.song.bars.length > 30);
    const amb = findSong(idx, "autumn");
    assert.equal(amb.song, null); // 不只一首 → 回候選清單
    assert.ok(!amb.song && amb.suggestions.length > 1);
    assert.equal(findSong(idx, "zzzqqqxxx").song, null);
  }
}

console.log("selftest OK");
