/**
 * 從 iReal Pro 論壇的 "Jazz 1460 Standards" 貼文抓整份 playlist，存成 public/jazz1460.irealb.txt。
 *   npm run fetch-playlist
 * 環境變數 IREAL_THREAD_URL 可改成別的論壇頁面。網站本身只讀這個檔案，不會連到論壇。
 */
import fs from "node:fs/promises";
import path from "node:path";

const THREAD_URL =
  process.env.IREAL_THREAD_URL ?? "https://forums.irealpro.com/threads/jazz-1460-standards.12753/";
const OUT = path.join(process.cwd(), "public", "jazz1460.irealb.txt");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// --------------------------------------------------------------- 取得連結 --

function unescapeHtml(s: string): string {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#0*39;/g, "'");
}

/** 頁面上最長的那條 irealb:// 連結就是整份 playlist */
export function extractPlaylistLink(html: string): string | null {
  // 優先認 href="..." 的邊界（連結內容可能含單引號）；找不到再退回寬鬆比對
  let links = [...html.matchAll(/href="(irealb:\/\/[^"]+)"/g)].map((m) => m[1]);
  if (!links.length) links = html.match(/irealb:\/\/[^"'<>\s]+/g) ?? [];
  if (!links.length) return null;
  return unescapeHtml(links.reduce((a, b) => (b.length > a.length ? b : a)));
}


const res = await fetch(THREAD_URL, {
  headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
  signal: AbortSignal.timeout(45_000),
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const link = extractPlaylistLink(await res.text());
if (!link) throw new Error("頁面上找不到 irealb:// 連結");
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, link, "utf8");
console.log(`saved ${link.length} chars -> ${OUT}`);
