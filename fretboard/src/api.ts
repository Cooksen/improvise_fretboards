import { buildIndex, findSong, listTitles, type Index } from "./lib/catalog";
import type { Song } from "./lib/ireal";

export type ApiErrorCode = "empty" | "not_found" | "ambiguous" | "upstream" | "network";

/** 錯誤只帶代碼與參數，文字由前端依語言組出來 */
export class ApiError extends Error {
  code: ApiErrorCode;
  query: string;
  suggestions: string[];
  detail: string;
  constructor(code: ApiErrorCode, opts: { query?: string; suggestions?: string[]; detail?: string } = {}) {
    super(opts.detail ?? code);
    this.code = code;
    this.query = opts.query ?? "";
    this.suggestions = opts.suggestions ?? [];
    this.detail = opts.detail ?? "";
  }
}

/** 整份 playlist 是網站自己的靜態檔（public/jazz1460.irealb.txt），不需要伺服器，也能放在 GitHub Pages */
const PLAYLIST_URL = `${import.meta.env.BASE_URL}jazz1460.irealb.txt`;

let indexPromise: Promise<Index> | null = null;

function getIndex(): Promise<Index> {
  indexPromise ??= (async () => {
    let res: Response;
    try {
      res = await fetch(PLAYLIST_URL);
    } catch {
      throw new ApiError("network");
    }
    if (!res.ok) throw new ApiError("upstream", { detail: `HTTP ${res.status}` });
    const text = (await res.text()).trim();
    if (!text.startsWith("irealb")) throw new ApiError("upstream", { detail: "playlist file is not an irealb:// link" });
    return buildIndex(text);
  })().catch((e) => {
    indexPromise = null; // 失敗不要永久快取
    throw e;
  });
  return indexPromise;
}

export const fetchTitles = async () => listTitles(await getIndex()).sort((a, b) => a.localeCompare(b));

export async function fetchSong(title: string): Promise<Song> {
  const q = title.trim();
  if (!q) throw new ApiError("empty");
  const result = findSong(await getIndex(), q);
  if (!result.song) {
    throw new ApiError(result.ambiguous ? "ambiguous" : "not_found", { query: q, suggestions: result.suggestions });
  }
  return result.song;
}
