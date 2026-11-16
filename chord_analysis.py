#!/usr/bin/env python3
"""
chord_analysis.py — 把 iReal 和弦進行換算成「相對調中心的級數」，並標出調外音。

慣例：調中心 = 1（例如 Eb 調：Eb=1, F=2, G=3, Ab=4, Bb=5, C=6, D=7）。
每個和弦音都用「字母拼寫」換算，所以 Db7#11 在 Eb 調裡是：
    Db=b7, F=2, Ab=4, Cb=b6, G=3   →  調外音：b7、b6

用法：
  python3 chord_analysis.py output/there_will_never_be_another_you.json
  python3 chord_analysis.py --chords "Eb^7 Db7#11 Dh7 G7b9" --key Eb
  python3 chord_analysis.py --selftest

「調內」的定義：大調 = 大音階；小調 = 自然小音階（b3 b6 b7 為調內）。
"""
import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

LETTERS = "CDEFGAB"
LETTER_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
MAJOR = [0, 2, 4, 5, 7, 9, 11]
NATURAL_MINOR_PCS = {0, 2, 3, 5, 7, 8, 10}
MAJOR_PCS = set(MAJOR)
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"]


# --------------------------------------------------------------------------- #
# 基本工具
# --------------------------------------------------------------------------- #
def acc_to_int(a: str) -> int:
    return a.count("#") - a.count("b")


def acc_symbol(n: int) -> str:
    return "#" * n if n > 0 else "b" * (-n)


def note_name(letter_idx: int, pc: int) -> str:
    letter = LETTERS[letter_idx % 7]
    diff = ((pc - LETTER_PC[letter] + 6) % 12) - 6
    return letter + acc_symbol(diff)


def parse_root(sym: str):
    m = re.match(r"^([A-G])([b#]*)(.*)$", sym)
    if not m:
        return None
    return m.group(1), acc_to_int(m.group(2)), m.group(3)


@dataclass
class Key:
    letter: str
    acc: int
    minor: bool = False

    @property
    def pc(self) -> int:
        return (LETTER_PC[self.letter] + self.acc) % 12

    @property
    def letter_idx(self) -> int:
        return LETTERS.index(self.letter)

    @property
    def name(self) -> str:
        return f"{self.letter}{acc_symbol(self.acc)}{' minor' if self.minor else ' major'}"

    @staticmethod
    def parse(s: str) -> "Key":
        """iReal 的調寫法：'Eb'、'C'、'D-'、'Bb-'"""
        minor = s.endswith("-") or s.endswith("m")
        r = parse_root(s.rstrip("-m"))
        if not r:
            raise ValueError(f"看不懂的調：{s}")
        return Key(r[0], r[1], minor)


# --------------------------------------------------------------------------- #
# 和弦符號 → 和弦音
# --------------------------------------------------------------------------- #
# 每個和弦音以 (音程數, 相對大音階的變化) 表示，例如 b7 = (7, -1)、#11 = (11, +1)
def _label(step: int, acc: int) -> str:
    return acc_symbol(acc) + str(step)


def chord_tone_specs(q: str):
    """依 iReal 和弦品質字串回傳 [(step, acc), ...]；step 可為 1..13。"""
    tones = {1: 0}                       # step -> acc（以 step 為鍵，方便被改寫）
    minor_like = False

    # --- 三和弦基礎 ---
    if q.startswith("h"):                # 半減
        tones.update({3: -1, 5: -1, 7: -1}); minor_like = True
    elif q.startswith("o"):              # 減
        tones.update({3: -1, 5: -1}); minor_like = True
        if "7" in q:
            tones[7] = -2
    elif q.startswith("+"):              # 增
        tones.update({3: 0, 5: +1})
    elif q.startswith("-"):              # 小
        tones.update({3: -1, 5: 0}); minor_like = True
    else:                                # 大 / 屬
        tones.update({3: 0, 5: 0})

    body = q.lstrip("hmo+-")
    is_maj = body.startswith("^") or "maj" in body.lower()

    # --- 六、七、九、十一、十三和弦 ---
    seventh = 7 if is_maj else None
    m = re.search(r"(?<![b#])(69|13|11|9|7|6|5)", re.sub(r"(add|sus)\d*", "", body))
    n = m.group(1) if m else ""
    if n == "6":
        tones[6] = 0
    elif n == "69":
        tones[6] = 0; tones[9] = 0
    elif n in ("7", "9", "11", "13"):
        tones.setdefault(7, 0 if is_maj else -1)
        if n in ("9", "11", "13"):
            tones[9] = 0
        if n == "11":
            tones[11] = 0
        if n == "13":
            tones[13] = 0
    elif is_maj and (7 not in tones):
        tones[7] = 0                     # 單純的 "^" 視為 maj7
    if q.startswith("o") and "7" in q:
        tones[7] = -2
    if seventh and 7 not in tones:
        tones[7] = 0
    if n == "5":                         # 強力和弦
        tones.pop(3, None)

    # --- sus / add ---
    if "sus2" in body:
        tones.pop(3, None); tones[2] = 0
    elif "sus" in body:
        tones.pop(3, None); tones[4] = 0
    for a in re.findall(r"add(\d+)", body):
        tones[int(a)] = 0

    # --- 變化音 ---
    for acc, num in re.findall(r"([b#])(5|9|11|13)", body):
        a = 1 if acc == "#" else -1
        k = int(num)
        if k == 5:
            tones[5] = a
        else:
            tones[k] = a
            if k >= 9 and 7 not in tones:
                tones[7] = 0 if is_maj else -1
    if "alt" in body:
        tones[3] = 0
        tones.setdefault(7, -1)
        tones[9] = -1; tones[10] = +1   # b9 與 #9（以 step 10 暫存，後面當作 9 的升版）
        tones[5] = -1; tones[13] = -1
    out = []
    for step in sorted(tones):
        if step == 10:                   # alt 的 #9
            out.append((9, +1))
        else:
            out.append((step, tones[step]))
    out.sort(key=lambda t: (t[0] if t[0] <= 7 else t[0] + 0.5, t[1]))
    return out, minor_like


@dataclass
class Tone:
    chord_function: str   # 相對和弦根音：1 b3 5 b7 #11 ...
    note: str             # 音名：Db F Ab Cb G
    degree: str           # 相對調中心：b7 2 4 b6 3
    in_key: bool


@dataclass
class ChordAnalysis:
    symbol: str
    roman: str
    root_degree: str
    root_note: str
    bass_degree: str
    tones: list
    outside: list         # 調外音的級數（去重，依出現順序）


def _degree_of(letter_idx: int, pc: int, key: Key):
    deg = (letter_idx - key.letter_idx) % 7 + 1
    interval = (pc - key.pc) % 12
    acc = ((interval - MAJOR[deg - 1] + 6) % 12) - 6
    in_key = interval in (NATURAL_MINOR_PCS if key.minor else MAJOR_PCS)
    return acc_symbol(acc) + str(deg), deg, acc, in_key


def analyze_chord(symbol: str, key: Key) -> ChordAnalysis | None:
    if symbol in ("N.C.", "", "x", "r", "p"):
        return None
    m = re.match(r"^([A-G][b#]*)([^/]*)(?:/([A-G][b#]*))?$", symbol)
    if not m:
        return None
    root_s, quality, bass_s = m.group(1), m.group(2), m.group(3)
    rl, racc, _ = parse_root(root_s)
    root_letter_idx = LETTERS.index(rl)
    root_pc = (LETTER_PC[rl] + racc) % 12

    specs, minor_like = chord_tone_specs(quality)
    tones, outside = [], []
    for step, acc in specs:
        diat = (step - 1) % 7 + 1
        semis = MAJOR[diat - 1] + acc
        pc = (root_pc + semis) % 12
        lidx = (root_letter_idx + diat - 1) % 7
        degree, _, _, in_key = _degree_of(lidx, pc, key)
        tones.append(Tone(_label(step, acc), note_name(lidx, pc), degree, in_key))
        if not in_key and degree not in outside:
            outside.append(degree)

    root_degree, deg, acc, _ = _degree_of(root_letter_idx, root_pc, key)
    roman = acc_symbol(acc) + (ROMAN[deg - 1].lower() if minor_like else ROMAN[deg - 1])
    suffix = (quality.lstrip("-").replace("^", "maj").replace("h", "ø").replace("o", "°"))
    roman += suffix

    bass_degree = ""
    if bass_s:
        bl, bacc, _ = parse_root(bass_s)
        bass_degree = _degree_of(LETTERS.index(bl), (LETTER_PC[bl] + bacc) % 12, key)[0]
        roman += f"/{bass_degree}"
        if bass_degree not in [t.degree for t in tones] and not _in_key_pc((LETTER_PC[bl] + bacc) % 12, key):
            outside.append(bass_degree)
    return ChordAnalysis(symbol, roman, root_degree, note_name(root_letter_idx, root_pc),
                         bass_degree, tones, outside)


def _in_key_pc(pc: int, key: Key) -> bool:
    return ((pc - key.pc) % 12) in (NATURAL_MINOR_PCS if key.minor else MAJOR_PCS)


# --------------------------------------------------------------------------- #
# 整首歌
# --------------------------------------------------------------------------- #
def analyze_song(measures: list, key: Key) -> list:
    """measures: [{'chords': [...], 'section': 'A'}, ...] → 每個和弦一列"""
    rows, sec = [], ""
    for bar_no, m in enumerate(measures, 1):
        if m.get("section"):
            sec = m["section"]
        for pos, sym in enumerate(m["chords"], 1):
            a = analyze_chord(sym, key)
            if a is None:
                rows.append(dict(bar=bar_no, pos=pos, beats=len(m["chords"]), section=sec,
                                 symbol=sym, analysis=None))
            else:
                rows.append(dict(bar=bar_no, pos=pos, beats=len(m["chords"]), section=sec,
                                 symbol=sym, analysis=asdict(a)))
    return rows


def render(rows: list, key: Key) -> str:
    w = lambda s, n: s + " " * max(0, n - _width(s))
    lines = [f"調：{key.name}（1 = {key.letter}{acc_symbol(key.acc)}）  "
             f"調外 = 不屬於{'自然小音階' if key.minor else '大音階'}的音", ""]
    lines.append(w("小節", 6) + w("段", 4) + w("和弦", 10) + w("級數", 14)
                 + w("和弦音（級數）", 30) + "調外音")
    lines.append("-" * 78)
    for r in rows:
        a = r["analysis"]
        bar = f"{r['bar']}" + (f".{r['pos']}" if r["beats"] > 1 else "")
        if a is None:
            lines.append(w(bar, 6) + w(r["section"], 4) + w(r["symbol"], 10) + "-")
            continue
        degs = " ".join(t["degree"] for t in a["tones"])
        lines.append(w(bar, 6) + w(r["section"], 4) + w(a["symbol"], 10) + w(a["roman"], 14)
                     + w(degs, 30) + (", ".join(a["outside"]) if a["outside"] else "-"))
    # 彙整
    lines += ["", "== 含調外音的和弦 =="]
    seen = set()
    for r in rows:
        a = r["analysis"]
        if a and a["outside"] and a["symbol"] not in seen:
            seen.add(a["symbol"])
            detail = "  ".join(f"{t['note']}={t['degree']}{'*' if not t['in_key'] else ''}" for t in a["tones"])
            lines.append(f"{a['symbol']:<10}{a['roman']:<14}{detail}    → 調外：{', '.join(a['outside'])}")
    lines.append("\n（* = 調外音）")
    return "\n".join(lines)


def _width(s: str) -> int:           # 中文字佔 2 格，讓表格對齊
    return sum(2 if ord(c) > 0x2E80 else 1 for c in s)


# --------------------------------------------------------------------------- #
def selftest() -> int:
    k = Key.parse("Eb")

    def deg(sym):
        a = analyze_chord(sym, k)
        return [t.degree for t in a.tones], a.outside, a.roman

    d, out, roman = deg("Db7#11")                    # 你舉的例子：b7 與 b6
    assert d == ["b7", "2", "4", "b6", "3"], d
    assert out == ["b7", "b6"], out
    assert roman == "bVII7#11", roman
    assert deg("Eb^7") == (["1", "3", "5", "7"], [], "Imaj7")
    assert deg("Bb7")[0] == ["5", "7", "2", "4"] and deg("Bb7")[1] == []
    assert deg("C-7") == (["6", "1", "3", "5"], [], "vi7")
    d, out, roman = deg("Dh7")                       # D F Ab C，全在調內
    assert d == ["7", "2", "4", "6"] and out == [] and roman == "viiø7", (d, out, roman)
    d, out, roman = deg("G7b9")                      # G B D F Ab
    assert d == ["3", "#5", "7", "2", "4"] and out == ["#5"], (d, out)
    d, out, roman = deg("Eb/G")
    assert roman == "I/3" and out == [], (roman, out)
    assert deg("Ah7")[1] == ["#4"]
    km = Key.parse("D-")                             # 小調：b3 b6 b7 為調內
    assert analyze_chord("F^7", km).outside == []
    print("selftest OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="和弦級數分析")
    ap.add_argument("json_file", nargs="?", help="ireal_scraper.py 輸出的 .json")
    ap.add_argument("--chords", help='直接輸入和弦，用空白分隔，例如 "Eb^7 Db7#11"')
    ap.add_argument("--key", help="調（搭配 --chords，例如 Eb、D-）")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()

    if a.chords:
        key = Key.parse(a.key or "C")
        measures = [{"chords": [c]} for c in a.chords.split()]
    elif a.json_file:
        p = Path(a.json_file)
        data = json.loads(p.read_text(encoding="utf-8"))
        key = Key.parse(a.key or data["key"])
        measures = data.get("expanded") or data["measures"]
    else:
        ap.print_help()
        return 1

    rows = analyze_song(measures, key)
    text = render(rows, key)
    print(text)
    if a.json_file:
        base = Path(a.json_file).with_suffix("")
        base.with_name(base.name + ".analysis.txt").write_text(text, encoding="utf-8")
        base.with_name(base.name + ".analysis.json").write_text(
            json.dumps({"key": key.name, "rows": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n已存：{base}.analysis.txt / .analysis.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
