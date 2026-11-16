# Improv Fretboard

輸入歌名 → 從 iReal Pro 論壇的 Jazz 1460 清單抓譜 → 依小節列出和弦 →
點和弦，指板上標出「可以彈的音」。支援級數/音名切換、即時轉調、品位範圍滑桿、吉他 / Bass 分頁，
介面有中文與英文（右上角切換，預設依瀏覽器語言並記住選擇）。

Type a song title → the chart is fetched from the iReal Pro forum's Jazz 1460 list → chords are laid out
bar by bar → click a chord to see every playable note on the fretboard. Degree/note-name labels, live
transposition, a fret-range slider, Guitar / Bass tabs; UI in English and Chinese (toggle top-right).

## 執行

```bash
npm install
npm run dev        # 開啟 http://localhost:5173
npm test           # 解碼 / 級數 / 標記規則 / 轉調 / 搜尋 / 時間軸的自我測試
npm run build      # 靜態網站輸出到 dist/（可直接放 GitHub Pages）
```

純前端、沒有伺服器：整份 Jazz 1460 清單是網站自己的靜態檔 `public/jazz1460.irealb.txt`（約 650 KB），
瀏覽器載入後在本機解析、搜尋。需要 Node 20.19+ / 22+。

要更新清單：`npm run fetch-playlist`（從 iReal Pro 論壇重新抓，覆寫 `public/jazz1460.irealb.txt`；
環境變數 `IREAL_THREAD_URL` 可改來源頁）。

## 部署到 GitHub Pages

repo 根目錄的 `.github/workflows/deploy.yml` 會在 push 到 `main` 時自動測試、建置並部署。
第一次要到 repo 的 Settings → Pages，把 Source 選成 **GitHub Actions**。網址會是 `https://<帳號>.github.io/<repo>/`。
（建置用相對路徑 `base: "./"`，放在任何 repo 名稱下都能跑。）

## 播放（自動前進 + 聲音）

- 指板上方的播放列：▶ 播放／暫停（空白鍵也可以）。依譜逐小節自動前進，指板跟著換；同一小節內有多個和弦就平均分配拍數。
- **速度**：譜上有給就照譜（顯示「依譜上速度」）；沒有的話依風格給預設值（顯示「譜上沒有速度」），可用 −／+、數字或滑桿自己調（40–320 BPM），「還原速度」可回到預設。
  註：目前的 Jazz 1460 歌單裡所有譜都沒有速度，所以實際上都會用風格預設。
- **聲音**：瀏覽器內建合成器（Web Audio，不需要任何音檔），模擬**鋼琴**（每拍輕刷和弦伴奏）與**低音提琴**（根音 + 走路低音，和弦最後一拍會半音接近下一個根音）。可個別開關「鋼琴」「低音提琴」「節拍器」，另有音量。沒在播放時點和弦會試聽一下。
- 「循環」打開就一直重複整首；點譜上的和弦可以在播放中跳到那裡。
- 轉調後播放會用轉調後的和弦。

## 指板標記規則

- 以調中心為 1（Eb 調：Eb=1、F=2、G=3 …）。標出「調內音階」的七個音。
- 和弦若含調外音 → 標黃色，並移除同一級數的調內音（有 b7 就不標 7、有 b6 就不標 6）。
- 和弦根音標紅色（優先於黃色）。白框 = 和弦本身的和弦音。
- 小調以自然小音階為「調內」。

## 品位範圍與 Bass

- 「品位範圍」雙滑桿：只標記範圍內（含頭尾）的音，範圍外的品位不顯示，範圍內的品位會放大填滿指板；0 品代表空弦（最高把手至少在 1 品）。
- Bass 分頁：四弦（E A D G），可選 Standard / Drop D / 降半音；標記規則與吉他相同。
  吉他與 Bass 各自記住調弦，品位範圍與轉調共用。

## 轉調

用「級數」重新拼寫和弦（Eb 調的 Db7#11 轉到 F 調是 Eb7#11，不是 D#7#11）；指板的級數不變、音名會跟著變。

## 結構

```
public/jazz1460.irealb.txt  整份 playlist（網站直接讀取）
scripts/fetch-playlist.ts   從論壇重新抓 playlist
scripts/selftest.ts         自我測試
src/api.ts                  載入 playlist、搜尋（純前端）
src/lib/ireal.ts            irealb:// 解混淆與小節解析
src/lib/catalog.ts          標題索引與模糊搜尋
src/lib/chord.ts            和弦符號 → 和弦音 → 級數；轉調
src/lib/marks.ts            指板標記規則
src/lib/tempo.ts, audio.ts  時間軸、速度、Web Audio 合成器
src/i18n.ts                 中英文字典
src/components/             Fretboard（SVG）、Chart（小節圖）、RangeSlider、Player
```

## 關於譜的內容

譜來自 iReal Pro 論壇公開分享的 Jazz 1460 清單，版權屬原作者；本專案僅供個人學習與非營利使用。
