# 家庭時光365

給台灣 0–12 歲兒童家庭的分齡故事網站。純靜態 HTML、CSS、JavaScript，沒有建置步驟；GitHub Pages 使用 main 分支根目錄部署。

首頁讀取故事目錄，每篇使用 `story.html?s=<slug>` 閱讀，保留四種分齡版本、注音、逐頁 AI 朗讀、影片字幕與離線製作包。目前收錄〈霜淇淋的錢〉，發音、注音及改寫仍待人工校對。

## 檔案結構

```text
index.html                   故事目錄
story.html                   共用故事頁
assets/                      共用樣式、目錄、載入器與閱讀器
stories/index.json           故事清單
stories/ice-cream-money/     第一篇 JSON、21 個 MP3、MP4、VTT、封面與 ZIP
stories/_template/           新故事資料範本
reader.test.mjs              閱讀器與資料完整性測試
tests/                       搬移前內容雜湊與 HTTP 驗證工具
docs/ADD_STORY.md             新增故事指南
```

新增故事只需一個資料夾與一筆目錄資料，詳見 [新增故事指南](docs/ADD_STORY.md)。各故事的文字、注音、分頁、SVG 插畫與媒體路徑放在 `story.json`，不用修改共用程式。

舊 `index.html#story/...`、`#home`、`#library` 會導向第一篇並保留原路由。無錨點首頁顯示目錄並提供第一篇入口；第一篇的裝置閱讀進度沿用，其他故事各自保存。

## 驗證

```bash
npm test
python3 -m http.server 8765
```

另開終端執行 `node tests/http-smoke.mjs http://127.0.0.1:8765/`，確認目錄、共用檔案、各故事資料與媒體全部回傳 200。以瀏覽器開啟該網址檢查畫面、聽音與字幕；不可直接用 `file://` 預覽。

第一篇由既有網站搬移，原故事與四版本資料以搬移前 SHA-256 保護，所有媒體與資產也比對原始雜湊，確保內容未變更。請勿加入金鑰、私人字型、私人音檔或未授權歌詞。
