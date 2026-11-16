#!/usr/bin/env python3
"""
ireal_scraper.py — 從 iReal Pro 論壇抓譜，解出和弦進行。

iReal Pro 的分享連結 (irealb://...) 會把和弦內容「混淆」過：
  1. 整串 URL-encode
  2. 每首歌以 "===" 分隔，欄位以 "=" 分隔：
       標題=作曲=風格=調=(轉調)=1r34LbKcu7<混淆後的和弦>=...
  3. 和弦字串每 50 字元一塊做固定的字元對調（obfusc50）
本檔實作 解混淆 -> 解析小節 -> 展開反覆記號 的整個流程。

用法範例：
  python3 ireal_scraper.py                              # 預設：到論壇 Jazz 1460 貼文找 There Will Never Be Another You
  python3 ireal_scraper.py --title "Autumn Leaves"      # 換歌
  python3 ireal_scraper.py --url <某個論壇頁面或貼文網址>
  python3 ireal_scraper.py --file links.txt             # 本機文字檔，內含 irealb:// 連結
  python3 ireal_scraper.py --irealb 'irealb://...'      # 直接貼一條連結
  python3 ireal_scraper.py --selftest                   # 不連網，只測解碼/解析邏輯

只用標準函式庫，不需 pip install。
"""
import argparse
import difflib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass, field, asdict
from pathlib import Path

PREFIX = "1r34LbKcu7"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# 論壇上 "Jazz 1460 Standards" 那串貼文（XenForo 的 goto/post 會自動轉址到該貼文）
DEFAULT_SEEDS = ["https://forums.irealpro.com/goto/post?id=31492"]

HERE = Path(__file__).resolve().parent
CACHE_DIR = HERE / "cache"
OUT_DIR = HERE / "output"


# --------------------------------------------------------------------------- #
# 1. 解混淆
# --------------------------------------------------------------------------- #
def _obfusc50(block: str) -> str:
    """對 50 字元的區塊做固定對調（這個運算是自己的反運算，編碼/解碼共用）。"""
    r = list(block)
    for i in range(5):                      # 前 5 與後 5 對調
        r[i] = block[49 - i]
        r[49 - i] = block[i]
    for i in range(10, 24):                 # 第 10~23 與對稱位置對調
        r[i] = block[49 - i]
        r[49 - i] = block[i]
    return "".join(r)


def unscramble(s: str) -> str:
    out = ""
    while len(s) > 50:
        block, s = s[:50], s[50:]
        out += block if len(s) < 2 else _obfusc50(block)
    return out + s


def scramble(s: str) -> str:
    """unscramble 的反向（僅供 selftest 使用）。"""
    return unscramble(s)


def normalize(raw: str) -> str:
    """把 iReal 內部的縮寫代碼換回比較好讀的符號。"""
    s = raw.replace("Kcl", "| x")   # 重複上一小節
    s = s.replace("LZ", " |")       # 小節線
    s = s.replace("XyQ", " ")       # 空白格
    s = s.replace("K", "|")
    return s


# --------------------------------------------------------------------------- #
# 2. 解析小節
# --------------------------------------------------------------------------- #
CHORD_RE = re.compile(r"[A-G][b#]?[^A-G/\s]*(?:/[A-G][b#]?)?")
SPECIAL = {"x", "r", "n", "p", "W"}


@dataclass
class Measure:
    chords: list
    section: str = ""          # *A *B *i ...
    repeat_start: bool = False  # {
    repeat_end: bool = False    # }
    ending: int = 0             # N1 N2 ...
    comment: str = ""
    coda: bool = False
    segno: bool = False


def _parse_text(p: str) -> dict:
    t = p
    comments = re.findall(r"<(.*?)>", t)
    t = re.sub(r"<.*?>", "", t)
    sec = re.search(r"\*([A-Za-z])", t)
    t = re.sub(r"\*[A-Za-z]", "", t)
    t = re.sub(r"T\d\d", "", t)                      # 拍號
    end = re.search(r"N(\d)", t)
    t = re.sub(r"N\d", "", t)
    coda, segno = "Q" in t, "S" in t
    t = re.sub(r"[QSUY]", "", t)
    t = re.sub(r"\([^)]*\)", "", t)                  # 括號內是備選和弦
    t = t.replace("f", "")                           # 延長記號
    t = re.sub(r"(?<!a)l(?!t)", "", t)               # 大字 (但保留 alt)
    t = re.sub(r"(?<!su)s(?!us)", "", t)             # 小字 (但保留 sus)
    tokens = t.replace(",", " ").split()
    chords = []
    for tok in tokens:
        if tok in SPECIAL:
            chords.append(tok)
        else:
            chords += CHORD_RE.findall(tok)
    return dict(chords=chords, section=sec.group(1) if sec else "",
                ending=int(end.group(1)) if end else 0,
                comment=" ".join(comments), coda=coda, segno=segno)


def parse_measures(raw: str) -> list:
    s = normalize(raw)
    pieces = re.split(r"([\[\]{}|Z])", s)
    ms: list = []
    pend = dict(section="", repeat_start=False, ending=0)
    for p in pieces:
        if p == "{":
            pend["repeat_start"] = True
        elif p == "}":
            if ms:
                ms[-1].repeat_end = True
        elif p in ("[", "]", "|", "Z", ""):
            continue
        else:
            d = _parse_text(p)
            if d["section"]:
                pend["section"] = d["section"]
            if d["ending"]:
                pend["ending"] = d["ending"]
            if d["chords"]:
                ms.append(Measure(chords=d["chords"], section=pend["section"],
                                  repeat_start=pend["repeat_start"], ending=pend["ending"],
                                  comment=d["comment"], coda=d["coda"], segno=d["segno"]))
                pend = dict(section="", repeat_start=False, ending=0)

    # x / r / p 展開
    for i, m in enumerate(ms):
        if m.chords == ["x"] and i > 0:
            m.chords = list(ms[i - 1].chords)
        elif m.chords == ["r"] and i >= 2:
            m.chords = list(ms[i - 2].chords)
            if i + 1 < len(ms) and ms[i + 1].chords in ([], ["x"]):
                ms[i + 1].chords = list(ms[i - 1].chords)
    last = None
    for m in ms:
        new = []
        for c in m.chords:
            if c == "p" and last:
                new.append(last)
            elif c in ("n", "W"):
                new.append("N.C." if c == "n" else "")
                last = last
            else:
                new.append(c)
                last = c
        m.chords = [c for c in new if c]

    # 結尾編號（N1/N2）要往後延伸到該結尾結束
    cur = 0
    for m in ms:
        if m.ending:
            cur = m.ending
        elif m.section or m.repeat_start:
            cur = 0
        elif cur:
            m.ending = cur
        if m.repeat_end:
            cur = 0
    return ms


def expand(ms: list) -> list:
    """依反覆記號與 1/2 結尾展開成實際演奏順序。"""
    out, i, start, passn, end_idx = [], 0, 0, 1, -1
    guard = 0
    while i < len(ms) and guard < 10000:
        guard += 1
        m = ms[i]
        if m.repeat_start:
            start = i
        if passn > 1 and i > end_idx and m.ending == 0:
            passn, start = 1, i
        if m.ending and m.ending != passn:
            i += 1
            continue
        out.append(m)
        if m.repeat_end and passn == 1:
            passn, end_idx, i = 2, i, start
            continue
        i += 1
    return out


# --------------------------------------------------------------------------- #
# 3. 解析整條 irealb:// 連結
# --------------------------------------------------------------------------- #
@dataclass
class Song:
    title: str
    composer: str
    style: str
    key: str
    transpose: str = ""
    bpm: str = ""
    time_signature: str = "4/4"
    raw_chords: str = ""
    measures: list = field(default_factory=list)   # 譜面寫法
    expanded: list = field(default_factory=list)   # 展開反覆後


def _split_songs(url: str) -> list:
    url = urllib.parse.unquote(html.unescape(url.strip()))
    m = re.match(r"irealb(?:ook)?://(.+)", url, re.S)
    if not m:
        raise ValueError("不是 irealb:// 或 irealbook:// 連結")
    return [s for s in re.split(r"===", m.group(1)) if s]


def song_title(song_str: str) -> str:
    return re.split(r"=+", song_str)[0]


def parse_song(song_str: str) -> Song:
    parts = re.split(r"=+", song_str)
    if len(parts) < 5:
        raise ValueError("欄位不足（可能是 playlist 名稱）")
    idx = next((i for i, p in enumerate(parts) if p.startswith(PREFIX)), None)
    if idx is not None:                              # irealb：混淆過
        raw = unscramble(parts[idx][len(PREFIX):])
        extra = parts[idx + 1:]
        transpose = parts[4] if idx == 5 else ""
    else:                                            # irealbook：純文字
        raw = parts[5] if len(parts) > 5 else ""
        extra, transpose = parts[6:], ""
    ts = re.search(r"T(\d)(\d)", raw)
    song = Song(title=parts[0], composer=parts[1], style=parts[2], key=parts[3],
                transpose=transpose,
                bpm=(extra[1] if len(extra) > 1 and extra[1] not in ("0", "") else ""),
                time_signature=f"{ts.group(1)}/{ts.group(2)}" if ts else "4/4",
                raw_chords=raw)
    ms = parse_measures(raw)
    song.measures = ms
    song.expanded = expand(ms)
    return song


def find_and_parse(urls: list, query: str):
    """在多條 (可能是整個 playlist 的) 連結裡找標題相近的歌。"""
    qn = _norm(query)
    best = (0.0, None)
    for u in urls:
        try:
            songs = _split_songs(u)
        except ValueError:
            continue
        for s in songs:
            t = _norm(song_title(s))
            if not t:
                continue
            score = 1.0 if t == qn else difflib.SequenceMatcher(None, t, qn).ratio()
            if score > best[0]:
                best = (score, s)
    if best[1] is None or best[0] < 0.8:
        return None, best[0]
    return parse_song(best[1]), best[0]


def _norm(t: str) -> str:
    t = urllib.parse.unquote(t).lower().replace("'ll", " will")
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


# --------------------------------------------------------------------------- #
# 4. 抓網頁
# --------------------------------------------------------------------------- #
LINK_RE = re.compile(r"irealb(?:ook)?://[^\"'<>\s]+")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=40) as r:
        raw = r.read()
        cs = r.headers.get_content_charset() or "utf-8"
    return raw.decode(cs, "replace")


def extract_links(text: str) -> list:
    found = LINK_RE.findall(html.unescape(text))
    if not found:                                    # 有些網站會把整條 URL 再編碼一次
        dec = urllib.parse.unquote(html.unescape(text))
        found = LINK_RE.findall(dec)
    return found


def scrape(urls: list, verbose=True) -> list:
    CACHE_DIR.mkdir(exist_ok=True)
    links = []
    for u in urls:
        if verbose:
            print(f"[fetch] {u}")
        try:
            page = fetch(u)
        except Exception as e:                       # noqa: BLE001
            print(f"  ! 失敗：{e}")
            continue
        name = re.sub(r"[^A-Za-z0-9]+", "_", u)[-80:] + ".html"
        (CACHE_DIR / name).write_text(page, encoding="utf-8")
        found = extract_links(page)
        if verbose:
            print(f"  -> {len(page):,} bytes，找到 {len(found)} 條 irealb 連結（已存 cache/{name}）")
        if not found and verbose:
            hints = sorted(set(re.findall(r'href="([^"]*(?:irealb|playlist|download|attachment)[^"]*)"',
                                          html.unescape(page), re.I)))[:15]
            if hints:
                print("  可能相關的連結（可用 --url 再試）：")
                for h in hints:
                    print("   ", h)
        links += found
    return links


# --------------------------------------------------------------------------- #
# 5. 輸出
# --------------------------------------------------------------------------- #
def render_grid(ms: list, per_line=4) -> str:
    lines, sec = [], None
    row = []
    def flush():
        nonlocal row
        if row:
            lines.append("| " + " | ".join(f"{c:<14}" for c in row) + " |")
            row = []
    for m in ms:
        if m.section and m.section != sec:
            flush()
            sec = m.section
            lines.append(f"[{sec}]")
        row.append(" ".join(m.chords))
        if len(row) == per_line:
            flush()
    flush()
    return "\n".join(lines)


def report(song: Song) -> str:
    out = [f"Title    : {song.title}", f"Composer : {song.composer}",
           f"Style    : {song.style}", f"Key      : {song.key}",
           f"Time sig : {song.time_signature}", f"BPM      : {song.bpm or '-'}",
           f"Bars     : {len(song.measures)} (譜面)  /  {len(song.expanded)} (展開反覆後)", "",
           "== 譜面寫法 ==", render_grid(song.measures), "",
           "== 展開反覆後 ==", render_grid(song.expanded)]
    return "\n".join(out)


def save(song: Song) -> None:
    OUT_DIR.mkdir(exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "_", song.title.lower()).strip("_")
    d = asdict(song)
    (OUT_DIR / f"{slug}.json").write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / f"{slug}.txt").write_text(report(song), encoding="utf-8")
    print(f"\n已存：{OUT_DIR / (slug + '.json')}\n      {OUT_DIR / (slug + '.txt')}")


# --------------------------------------------------------------------------- #
# 6. selftest（不連網，只驗證解混淆與解析流程；曲子是虛構的）
# --------------------------------------------------------------------------- #
def selftest() -> int:
    raw = ("[T44*A{Eb^7 LZFm7 ,Bb7 LZEb^7 LZEb7 XyQLZN1Ab^7 LZAbm7 Db7 LZGm7 C7 LZFm7 Bb7 }"
           "N2Eb^7 KclLZ*BGm7 C7 LZF-7 Bb7sus LZEb^7 LZnLZ*CEb/G LZpLZ(C7)Eb6 Z")
    # 1) 混淆來回
    assert unscramble(scramble(raw)) == raw, "scramble/unscramble 不是反運算"
    # 2) 完整 URL 流程（含 playlist 內多首歌 + 結尾的 playlist 名稱）
    enc = urllib.parse.quote(f"Selftest Tune=Nobody=Medium Swing=Eb==" + PREFIX + scramble(raw) + "=0=0=0")
    url = "irealb://" + enc + urllib.parse.quote("===Other Song=X=Ballad=C=n=" + PREFIX + scramble("[T44C^7 LZ]")
                                               + "===My Playlist")
    song, score = find_and_parse([url], "selftest tune")
    assert song and score == 1.0, "找不到歌"
    got = [" ".join(m.chords) for m in song.measures]
    print(report(song))
    want_written = ["Eb^7", "Fm7 Bb7", "Eb^7", "Eb7", "Ab^7", "Abm7 Db7", "Gm7 C7", "Fm7 Bb7",
                    "Eb^7", "Eb^7", "Gm7 C7", "F-7 Bb7sus", "Eb^7", "N.C.", "Eb/G", "Eb/G", "Eb6"]
    assert got == want_written, f"\n got {got}\nwant {want_written}"
    exp = [" ".join(m.chords) for m in song.expanded]
    want_exp = ["Eb^7", "Fm7 Bb7", "Eb^7", "Eb7",
                "Ab^7", "Abm7 Db7", "Gm7 C7", "Fm7 Bb7",           # 第一次：1 結尾
                "Eb^7", "Fm7 Bb7", "Eb^7", "Eb7", "Eb^7", "Eb^7",   # 第二次：2 結尾
                "Gm7 C7", "F-7 Bb7sus", "Eb^7", "N.C.", "Eb/G", "Eb/G", "Eb6"]
    assert exp == want_exp, f"\n got {exp}\nwant {want_exp}"
    print("\nselftest OK")
    return 0


# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(description="抓 iReal Pro 譜並解出和弦進行")
    ap.add_argument("--title", default="There Will Never Be Another You", help="要找的歌名")
    ap.add_argument("--url", action="append", help="要抓的網頁（可重複）；預設為論壇 Jazz 1460 貼文")
    ap.add_argument("--file", help="本機文字/HTML 檔，內含 irealb:// 連結")
    ap.add_argument("--irealb", help="直接貼一條 irealb:// 連結")
    ap.add_argument("--list", action="store_true", help="只列出找到的所有歌名")
    ap.add_argument("--selftest", action="store_true", help="不連網，測試解碼邏輯")
    a = ap.parse_args()

    if a.selftest:
        return selftest()

    links = []
    if a.irealb:
        links.append(a.irealb)
    if a.file:
        links += extract_links(Path(a.file).read_text(encoding="utf-8", errors="replace"))
    if not links:
        links = scrape(a.url or DEFAULT_SEEDS)
    if not links:
        print("\n沒有找到任何 irealb:// 連結。請打開 cache/ 內存下的 HTML 看頁面結構，"
              "或用 --url 指到實際放連結的頁面。")
        return 1

    if a.list:
        for u in links:
            for s in _split_songs(u):
                print(song_title(s))
        return 0

    song, score = find_and_parse(links, a.title)
    if not song:
        print(f"找不到「{a.title}」（最接近分數 {score:.2f}）。可用 --list 看有哪些歌。")
        return 1
    print()
    print(report(song))
    save(song)
    return 0


if __name__ == "__main__":
    sys.exit(main())
