// 先啟動 python3 -m http.server，再以參數提供網站根網址（可包含專案子路徑）。
import assert from 'node:assert/strict';
const base = new URL(process.argv[2] || 'http://127.0.0.1:8765/');
let count = 0;
async function get(path) {
  const url = new URL(path, base);
  const response = await fetch(url);
  assert.equal(response.status, 200, `${url} 應回傳 200`);
  count++;
  return response;
}
for (const file of ['index.html', 'story.html', 'assets/site.css', 'assets/catalog.js', 'assets/story-loader.js', 'assets/reader.js']) await (await get(file)).arrayBuffer();
const entries = await (await get('stories/index.json')).json();
for (const entry of entries) {
  await (await get(`story.html?s=${entry.slug}`)).arrayBuffer();
  const folder = `stories/${entry.slug}/`;
  const data = await (await get(`${folder}story.json`)).json();
  for (const mode of Object.keys(data.versions)) {
    await (await get(`story.html?s=${entry.slug}#story/${mode}/0`)).arrayBuffer();
  }
  for (const file of new Set([entry.cover, ...Object.values(data.media), ...Object.values(data.audio).flat()])) {
    await (await get(folder + file)).arrayBuffer();
  }
}
console.log(`HTTP 驗證通過：${count} 個頁面、共用檔案、資料與媒體請求全部回傳 200（${base}）。`);
