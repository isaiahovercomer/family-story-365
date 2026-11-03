# 新增一篇故事

網站沒有建置步驟。新增 `stories/<slug>/` 資料夾及 `stories/index.json` 一筆資料即可，共用 HTML、JS、CSS 不需修改。請透過 HTTP 預覽，直接用 `file://` 開啟會無法 fetch JSON。

## 1. 複製範本

```bash
cp -R stories/_template stories/my-new-story
```

slug 使用小寫英文字母、數字與連字號，例如 `my-new-story`；必須唯一。`_template` 不加入目錄，不會發布成故事卡片。範本只有 JSON，媒體檔需自行準備。

## 2. 填寫 story.json

- `story`：`id`、`title`、`category`、`sourceId`、`description`、`sourceURL`、`verse`、`verseRef`、`prayer`、`original`。請填完整原文、來源及版本資訊，勿直接沿用第一篇內容。一般原創生活故事可將 `verse`、`verseRef`、`prayer` 留空，並提供頂層 `familyPractice: { "title": "親子練習標題", "text": "練習內容" }`，閱讀器會以親子練習取代讀經禱告。
- `passages`：以段落 ID 對應 `{ "text": "你好。", "zhuyin": "ㄋㄧˇ ㄏㄠˇ" }`。每個漢字對應一個以空白分隔的注音，標點不配注音，多音字與輕聲須人工校對。
- `versions`：固定四個鍵 `toddler`、`theatre`、`comic`、`reader`。每個版本包含 `age`、`label`、`subtitle`、`icon`、`intro`、`pages`；圖示依序可用 `book`、`play`、`comic`、`text`。
- `pages`：每頁格式 `{ "scene": 0, "title": "第一頁", "passages": ["a"] }`。`scene` 從 0 起，引用下方 `scenes`；段落可重用，各版本頁數可以不同。
- `scenes`：原創 SVG 插畫字串陣列，使用 `class="scene"`、`viewBox="0 0 640 400"` 及合適的 `aria-label`。只放可信任的靜態 SVG，不放腳本、事件屬性或外部資產；第一篇原有 SVG 已完整移入資料。
- `audio`：每個版本一個音檔路徑陣列，順序、數量須與該版本 `pages` 一致。
- `media`：`poster`（影片封面）、`video`（有聲 MP4）、`subtitles`（VTT）、`productionKit`（ZIP）、`narrationKit`（離線朗讀 ZIP）、`manifest`（朗讀資產 JSON）。範本中的 `silentVideo`、`silentSubtitles` 是可保留或移除的額外資產。
- `discussion`：讀完後的 `title`、`question`、`activity`。

若影片尚未製作，設定頂層 `videoStatus: "pending"`，並從 `media` 移除 `video`（以及任何不存在的 `silentVideo` 等額外欄位）；不可用不存在的 MP4 或空字串佔位。保留真實存在的 `poster`、`subtitles`、兩種製作包與 `manifest`，閱讀器會顯示「影片製作中」且仍可逐頁朗讀。提供 `VIDEO_SPEC.md` 交接分鏡與時間軸；影片完成後加入 `media.video` 並改為 `videoStatus: "ready"`。

可用頂層 `productionNote`、`narrationNote`、`kitNote` 說明本篇的佔位畫面、語音引擎與製作包操作；未設定時沿用第一篇說明。內容須符合實際資產，避免讓讀者誤認影片或插畫已完成。

所有媒體路徑均相對於這篇故事資料夾，例如 `toddler-01.mp3`，不要加 `/`、`../` 或 `stories/<slug>/`。檔名使用英數、底線與連字號。

## 3. 放入媒體與清單

將所有引用的 MP3、MP4、VTT、PNG、ZIP 放進同一故事資料夾；待補影片不需也不應產生 MP4。範本預設每個版本一頁，至少需提供四個 MP3。要增加頁數，同步增加 `pages` 與 `audio`。

`narration-assets.json` 保留朗讀來源資訊，以及 `pages` 陣列；每個音檔一筆，至少含 `file` 與 `sha256`。可依第一篇補上 `id`、`mode`、`seconds`、`cues`。用 `sha256sum stories/my-new-story/*.mp3` 取得檔案雜湊，測試會核對。

製作包內應放這篇故事自己的稿件與素材。請勿加入金鑰、私人字型、私人音檔或未授權歌詞。

## 4. 加入目錄

在 `stories/index.json` 陣列新增一筆，注意 JSON 逗號：

```json
{
  "slug": "my-new-story",
  "title": "故事標題",
  "description": "一句故事簡介",
  "ages": "0–12 歲",
  "cover": "video-poster.png",
  "published": "2026-11-02",
  "order": 2
}
```

`title` 與 `story.json` 一致；`cover` 相對於該篇資料夾；`published` 填實際發布日期（YYYY-MM-DD）。`order` 數字越小越前面，同順序以發布日期由新到舊排列。

## 5. 測試與預覽

```bash
npm test
python3 -m http.server 8765
```

另一個終端執行：

```bash
node tests/http-smoke.mjs http://127.0.0.1:8765/
```

開啟 `http://127.0.0.1:8765/`，確認新卡片出現；開啟 `story.html?s=my-new-story`，逐一試四種版本、注音、朗讀、劇場影片字幕和下載包。單元測試檢查清單、必要欄位、引用檔案、注音數量及朗讀雜湊；HTTP 測試檢查載入路徑，不代表完成聽音或影片解碼校對。

閱讀進度依 slug 保存在裝置。第一篇繼續沿用舊儲存鍵；既有 `index.html#story/<mode>/<page>`、`#home`、`#library` 會導向第一篇並保留錨點。無錨點的首頁書籤現在顯示目錄，首頁也保留第一篇直接入口。

完成後依專案流程提交並開 PR；GitHub Pages 仍由 main 根目錄部署。
