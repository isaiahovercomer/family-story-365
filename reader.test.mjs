import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

// 執行實際發布的共用閱讀器；替代瀏覽器 DOM 與語音引擎邊界。
// 真實捲動位置、影片解碼與字幕另以瀏覽器驗證。
const data = JSON.parse(readFileSync(new URL('./stories/ice-cream-money/story.json', import.meta.url)));
const code = readFileSync(new URL('./assets/reader.js', import.meta.url), 'utf8')
  .replace('export function startReader(data, basePath, slug) {', '').replace(/\}\s*$/, '');

function launch(hash = '#story/theatre/0', slug = 'ice-cream-money', storyData = data) {
  const handlers = new Map();
  const elements = new Map();
  const effects = [];
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      innerHTML: '', textContent: '', value: '', disabled: false, open: false,
      classList: {toggle() {}},
      addEventListener(type, listener) {handlers.set(`${selector}:${type}`, listener);},
      querySelectorAll() {return [];},
      focus() {effects.push(['focus', selector]);},
      scrollIntoView() {effects.push(['scroll', selector]);},
      pause() {effects.push(['pause', selector]);},
      play() {effects.push(['play', selector]); return Promise.resolve();},
      load() {effects.push(['load', selector]);},
      setAttribute() {}, removeAttribute() {}
    });
    return elements.get(selector);
  }
  const document = {
    hidden: false,
    documentElement: {style: {setProperty() {}}},
    querySelector: element, querySelectorAll: () => [],
    addEventListener(type, listener) {handlers.set(`document:${type}`, listener);}
  };
  const location = {hash};
  const context = vm.createContext({
    document, location, data: storyData, slug, basePath: `./stories/${slug}/`,
    window: {
      speechSynthesis: {cancel() {effects.push(['cancel']);}, getVoices: () => [], addEventListener() {}},
      addEventListener(type, listener) {handlers.set(`window:${type}`, listener);},
      getSelection: () => ''
    },
    localStorage: {getItem: () => null, setItem() {}},
    history: {replaceState(_state, _title, hash) {location.hash = hash;}},
    setTimeout() {return 1;}, clearTimeout() {effects.push(['clearTimer']);},
    console
  });
  vm.runInContext(code, context);
  effects.length = 0;
  return {
    context, effects, location, document, element,
    run: expression => vm.runInContext(expression, context),
    emit: (target, type, event = {}) => handlers.get(`${target}:${type}`)?.(event)
  };
}

test('影片方向鍵保留快轉，不切換故事頁', () => {
  const app = launch();
  let prevented = false;
  const video = {closest: selector => selector.split(',').includes('video') ? video : null};
  app.emit('document', 'keydown', {
    key: 'ArrowRight', target: video, preventDefault() {prevented = true;}
  });
  assert.equal(app.location.hash, '#story/theatre/0');
  assert.equal(prevented, false);
});

test('一般閱讀區仍可用方向鍵翻頁', () => {
  const app = launch('#story/comic/0');
  app.emit('document', 'keydown', {key: 'ArrowRight', target: {closest: () => null}, preventDefault() {}});
  assert.equal(app.location.hash, '#story/comic/1');
});

test('影片只在劇場第一頁顯示，不在後續章節重建播放器', () => {
  assert.match(launch().element('#main').innerHTML, /<video\b/);
  for (const hash of ['#story/theatre/1', '#story/theatre/5', '#story/comic/0']) {
    assert.doesNotMatch(launch(hash).element('#main').innerHTML, /<video\b/);
  }
});

test('手動翻頁把焦點與捲動移到新場景', () => {
  const app = launch('#story/comic/0');
  app.location.hash = '#story/comic/1';
  app.emit('window', 'hashchange');
  assert.ok(app.effects.some(([action, selector]) => action === 'scroll' && selector === '.reader-main'));
  assert.ok(app.effects.some(([action, selector]) => action === 'focus' && selector === '#book'));
});

test('自動翻頁也將新場景帶入視窗', () => {
  const app = launch();
  app.run('finishedPage()');
  assert.equal(app.location.hash, '#story/theatre/1');
  assert.ok(app.effects.some(([action, selector]) => action === 'scroll' && selector === '.reader-main'));
});

test('開始影片時停止逐頁播放，避免計時器中途換頁', () => {
  const app = launch();
  app.run('useDeviceVoice = true');
  app.run('playPage()');
  assert.equal(app.run('silentState'), 'playing');
  app.emit('#main', 'play', {target: {matches: selector => selector === '#story-video'}});
  assert.equal(app.run('silentState'), 'idle');
});

test('未安裝中文聲音也能播放預製旁白，暫停與繼續沿用同一音檔', () => {
  const app = launch('#story/toddler/0');
  app.run('playPage()');
  assert.ok(app.effects.some(([action, selector]) => action === 'play' && selector === '#page-audio'));
  assert.equal(app.run('recordedState'), 'playing');
  app.run('togglePlayback()');
  assert.equal(app.run('recordedState'), 'paused');
  app.run('togglePlayback()');
  assert.equal(app.run('recordedState'), 'playing');
});

test('預製旁白結束後自動播放下一頁，停止後的舊完成事件不會翻頁', () => {
  const app = launch('#story/toddler/0');
  app.run('playPage()');
  app.emit('#main', 'ended', {target: app.element('#page-audio')});
  assert.equal(app.location.hash, '#story/toddler/1');
  assert.equal(app.run('recordedState'), 'playing');
  app.run('stopPlayback()');
  app.emit('#main', 'ended', {target: app.element('#page-audio')});
  assert.equal(app.location.hash, '#story/toddler/1');
});

test('旁白播放失敗有明確提示，不自動跳過故事', async () => {
  const app = launch('#story/toddler/0');
  app.element('#page-audio').play = () => Promise.reject(new Error('載入失敗'));
  app.run('playPage()');
  await Promise.resolve();
  assert.equal(app.run('recordedState'), 'idle');
  assert.match(app.element('#player-status').textContent, /無法播放/);
  assert.equal(app.location.hash, '#story/toddler/0');
});

test('預製旁白使用與目前版本頁碼相符的資產', () => {
  for (const [hash, file] of [['#story/toddler/5', 'toddler-06.mp3'],
    ['#story/reader/2', 'reader-03.mp3'], ['#story/comic/4', 'comic-05.mp3']]) {
    assert.ok(launch(hash).element('#main').innerHTML.includes(file));
  }
});

test('音檔播放中發生媒體錯誤會停止狀態並顯示重試提示', () => {
  const app = launch('#story/toddler/0');
  app.run('playPage()');
  app.emit('#main', 'error', {target: app.element('#page-audio')});
  assert.equal(app.run('recordedState'), 'idle');
  assert.match(app.element('#player-status').textContent, /無法播放/);
});

test('音檔來源錯誤後重試會重新載入資源', () => {
  const app = launch('#story/toddler/0');
  app.element('#page-audio').error = {code: 4};
  app.run('playPage()');
  assert.ok(app.effects.some(([action, selector]) => action === 'load' && selector === '#page-audio'));
});

test('開始逐頁播放及離開可見畫面時會暫停影片', () => {
  const app = launch();
  app.run('playPage()');
  assert.ok(app.effects.some(([action, selector]) => action === 'pause' && selector === '#story-video'));
  app.effects.length = 0;
  app.document.hidden = true;
  app.emit('document', 'visibilitychange');
  assert.ok(app.effects.some(([action, selector]) => action === 'pause' && selector === '#story-video'));
});


const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const catalog = json('./stories/index.json');

test('每筆目錄必要欄位齊全、slug 唯一且資料夾與封面存在', () => {
  const seen = new Set();
  assert.ok(catalog.length > 0);
  for (const entry of catalog) {
    for (const key of ['slug', 'title', 'description', 'ages', 'cover', 'published']) {
      assert.equal(typeof entry[key], 'string', `${entry.slug}: ${key}`);
      assert.ok(entry[key].trim());
    }
    assert.match(entry.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!seen.has(entry.slug)); seen.add(entry.slug);
    assert.ok(Number.isFinite(entry.order));
    assert.match(entry.published, /^\d{4}-\d{2}-\d{2}$/);
    for (const file of ['story.json', entry.cover]) {
      assert.ok(existsSync(new URL(`./stories/${entry.slug}/${file}`, import.meta.url)), file);
    }
  }
});

test('所有故事四版本、注音、分頁與資產引用完整', () => {
  for (const entry of catalog) {
    const d = json(`./stories/${entry.slug}/story.json`);
    const fileExists = file => {
      assert.equal(typeof file, 'string');
      assert.match(file, /^[a-zA-Z0-9_./-]+$/);
      assert.ok(!file.startsWith('/') && !file.split('/').includes('..'));
      assert.ok(existsSync(new URL(`./stories/${entry.slug}/${file}`, import.meta.url)), file);
    };
    for (const key of ['id', 'title', 'category', 'description', 'sourceId', 'sourceURL', 'original']) {
      assert.ok(d.story[key]?.trim(), `${entry.slug}: ${key}`);
    }
    if (d.familyPractice) {
      assert.ok(d.familyPractice.title?.trim());
      assert.ok(d.familyPractice.text?.trim());
    } else {
      for (const key of ['verse', 'verseRef', 'prayer']) assert.ok(d.story[key]?.trim());
    }
    assert.equal(entry.title, d.story.title);
    for (const key of ['title', 'question', 'activity']) assert.ok(d.discussion[key]?.trim());
    assert.ok(d.scenes.length > 0);
    for (const mode of ['toddler', 'theatre', 'comic', 'reader']) {
      const v = d.versions[mode];
      for (const key of ['age', 'label', 'subtitle', 'icon', 'intro']) assert.ok(v[key]?.trim());
      assert.ok(v.pages.length > 0);
      assert.equal(d.audio[mode].length, v.pages.length);
      for (const page of v.pages) {
        assert.ok(page.title?.trim());
        assert.ok(d.scenes[page.scene]);
        assert.ok(page.passages.length > 0);
        for (const id of page.passages) assert.ok(d.passages[id], id);
      }
      d.audio[mode].forEach(fileExists);
    }
    for (const passage of Object.values(d.passages)) {
      assert.ok(passage.text?.trim());
      assert.equal([...passage.text].filter(c => /\p{Script=Han}/u.test(c)).length, passage.zhuyin.trim().split(/\s+/).length);
    }
    for (const key of ['subtitles','poster','productionKit','narrationKit','manifest']) {
      assert.ok(d.media[key]);
    }
    if (d.videoStatus === 'pending') assert.equal(d.media.video, undefined);
    else fileExists(d.media.video);
    Object.values(d.media).forEach(fileExists);
    const manifest = json(`./stories/${entry.slug}/${d.media.manifest}`);
    const files = Object.values(d.audio).flat();
    assert.deepEqual(manifest.pages.map(page => page.file).sort(), [...files].sort());
    for (const page of manifest.pages) {
      fileExists(page.file);
      assert.ok(files.includes(page.file));
      assert.equal(createHash('sha256').update(readFileSync(new URL(`./stories/${entry.slug}/${page.file}`, import.meta.url))).digest('hex'), page.sha256);
    }
  }
});

test('第一篇原故事、逐句文字注音及四版本資料與搬移前完全一致', () => {
  const original = {story: data.story, passages: data.passages, versions: data.versions};
  const expected = readFileSync(new URL('./tests/original-content.sha256', import.meta.url), 'utf8').trim();
  assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'), expected);
});

test('每篇閱讀進度分開，第一篇沿用原書籤', () => {
  assert.equal(launch().run('storageKey'), 'family-story-365-progress-v1');
  assert.equal(launch('#home', 'another-story').run('storageKey'), 'family-story-365-progress-v1:another-story');
});

test('每種分齡每一頁都引用該篇音檔，劇場引用該篇影片字幕與下載包', () => {
  for (const [mode, version] of Object.entries(data.versions)) {
    for (let i = 0; i < version.pages.length; i++) {
      const html = launch(`#story/${mode}/${i}`).element('#main').innerHTML;
      assert.ok(html.includes(`./stories/ice-cream-money/${data.audio[mode][i]}`));
      assert.ok(html.includes('./stories/ice-cream-money/story-production-kit.zip'));
    }
  }
  const html = launch().element('#main').innerHTML;
  for (const key of ['video','subtitles','poster']) assert.ok(html.includes(`./stories/ice-cream-money/${data.media[key]}`));
});

async function loadStory(search, response = {ok: true, json: async () => data}) {
  const requests = [], started = [], main = {innerHTML: ''};
  const source = readFileSync(new URL('./assets/story-loader.js', import.meta.url), 'utf8').replace(/^import .*;\n/, '');
  await vm.runInNewContext(`(async () => {${source}})()`, {
    location: {search}, URLSearchParams,
    document: {querySelector: () => main},
    fetch: async url => {requests.push(url); return response;},
    startReader: (...args) => started.push(args)
  });
  return {requests, started, main};
}

test('故事載入器預設第一篇，也能載入其他 slug', async () => {
  for (const [search, slug] of [['', 'ice-cream-money'], ['?s=new-story', 'new-story']]) {
    const app = await loadStory(search);
    assert.deepEqual(app.requests, [`./stories/${slug}/story.json`]);
    assert.equal(app.started[0][2], slug);
  }
});

test('無效 slug 不發送請求，404 與網路失敗有返回目錄提示', async () => {
  for (const search of ['?s=../private', '?s=%2Fetc', '?s=_template']) {
    const app = await loadStory(search);
    assert.equal(app.requests.length, 0);
    assert.match(app.main.innerHTML, /回故事目錄/);
  }
  for (const response of [{ok: false}, {ok: true, json: async () => {throw new Error('網路失敗');}}]) {
    const app = await loadStory('?s=missing', response);
    assert.equal(app.started.length, 0);
    assert.match(app.main.innerHTML, /回故事目錄/);
  }
});

function domNode() {
  return {children: [], textContent: '', append(...children) {this.children.push(...children);}};
}
async function loadCatalog(hash = '', entries = catalog, ok = true) {
  const node = domNode(), redirects = [], requests = [];
  const source = readFileSync(new URL('./assets/catalog.js', import.meta.url), 'utf8');
  await vm.runInNewContext(`(async () => {${source}})()`, {
    location: {hash, replace: url => redirects.push(url)},
    window: {addEventListener() {}}, encodeURIComponent,
    document: {querySelector: () => node, createElement: domNode},
    fetch: async url => {requests.push(url); return {ok, json: async () => entries};}
  });
  return {node, redirects, requests};
}

test('首頁依清單排序產生多篇故事卡片與相對連結', async () => {
  const extra = {...catalog[0], slug: 'second-story', title: '另一篇故事', order: 0};
  const app = await loadCatalog('', [catalog[0], extra]);
  assert.equal(app.node.children.length, 2);
  assert.equal(app.node.children[0].href, './story.html?s=second-story');
  assert.equal(app.node.children[0].children[0].src, './stories/second-story/video-poster.png');
});

test('舊錨點保留路由導向第一篇，首頁跳讀錨點不誤導向', async () => {
  for (const hash of ['#story/toddler/2', '#story/reader/1', '#home', '#library']) {
    const app = await loadCatalog(hash);
    assert.deepEqual(app.redirects, [`./story.html?s=ice-cream-money${hash}`]);
    assert.equal(app.requests.length, 0);
  }
  assert.equal((await loadCatalog('#main')).redirects.length, 0);
});

test('空目錄與載入錯誤都有可讀提示', async () => {
  assert.match((await loadCatalog('', [])).node.textContent, /準備中/);
  assert.match((await loadCatalog('', [], false)).node.textContent, /無法載入/);
});

test('自主閱讀頁的教材編號由故事資料提供', () => {
  const app = launch('#story/reader/0');
  app.run("story.sourceId = '測試-20'");
  try { assert.match(app.run('readingMarkup(versions.reader, versions.reader.pages[0])'), /測試-20 ／ 1/); }
  finally { app.run("story.sourceId = '真-10'"); }
});

test('第一篇所有搬移資產與原提交位元組一致', () => {
  for (const [file, hash] of Object.entries(json('./tests/original-assets.json'))) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`./stories/ice-cream-money/${file}`, import.meta.url))).digest('hex'), hash, file);
  }
});

test('新增故事的特殊標題在閱讀器中安全顯示', () => {
  const app = launch('#story/reader/0');
  const originalTitle = data.versions.reader.pages[0].title;
  data.versions.reader.pages[0].title = '一起讀 "新故事" <第一頁>';
  try {
    const html = app.run('storyMarkup()');
    assert.ok(html.includes('aria-label="第 1 頁：一起讀 &quot;新故事&quot; &lt;第一頁&gt;"'));
    assert.ok(html.includes('<h2>一起讀 &quot;新故事&quot; &lt;第一頁&gt;</h2>'));
  } finally {data.versions.reader.pages[0].title = originalTitle;}
});


test('待補影片保留逐頁朗讀且不輸出空影片來源', () => {
  const pending = structuredClone(data);
  pending.videoStatus = 'pending';
  delete pending.media.video;
  const html = launch('#story/theatre/0', 'pending-story', pending).element('#main').innerHTML;
  assert.match(html, /影片製作中/);
  assert.doesNotMatch(html, /<video\b|undefined/);
  assert.match(html, /theatre-01.mp3/);
});

test('一般原創故事顯示親子練習，保留第一篇信仰內容', () => {
  const secular = structuredClone(data);
  secular.familyPractice = {title: '一起停一下', text: '吸一口氣，說說需要。'};
  const html = launch('#story/reader/0', 'secular-story', secular).element('#main').innerHTML;
  assert.match(html, /一起停一下/);
  assert.doesNotMatch(html, /一起讀經、禱告|一句經文|一起禱告/);
  assert.match(launch().element('#main').innerHTML, /一起讀經、禱告/);
});

test('第二篇有四版本21頁、待補影片規格與原創內容', () => {
  assert.ok(catalog.some(entry => entry.slug === 'block-bridge'));
  const d = json('./stories/block-bridge/story.json');
  assert.equal(d.videoStatus, 'pending');
  assert.equal(d.media.video, undefined);
  assert.ok(d.familyPractice.text.trim());
  assert.equal(d.story.verse, '');
  assert.equal(d.story.prayer, '');
  for (const [mode, count] of [['toddler',6],['theatre',6],['comic',6],['reader',3]]) {
    assert.equal(d.versions[mode].pages.length, count);
    assert.equal(d.audio[mode].length, count);
  }
  assert.ok(existsSync(new URL('./stories/block-bridge/VIDEO_SPEC.md', import.meta.url)));
});

test('第二篇字幕依實際逐句時間對齊本文與音檔', () => {
  const d = json('./stories/block-bridge/story.json');
  const manifest = json('./stories/block-bridge/narration-assets.json');
  assert.equal(manifest.engine, 'sherpa-onnx');
  assert.equal(manifest.speed, 0.78);
  for (const page of manifest.pages) {
    const index = Number(page.id.slice(-2)) - 1;
    const ids = d.versions[page.mode].pages[index].passages;
    assert.deepEqual(page.cues.map(cue => cue.text), ids.map(id => d.passages[id].text));
    let end = 0;
    for (const cue of page.cues) {
      assert.ok(cue.start >= end && cue.end > cue.start && cue.end <= page.seconds);
      end = cue.end;
    }
    const vtt = readFileSync(new URL(`./stories/block-bridge/${page.id}.zh-TW.vtt`, import.meta.url), 'utf8');
    assert.ok(vtt.startsWith('WEBVTT\n'));
    for (const cue of page.cues) assert.ok(vtt.includes(cue.text));
  }
});

test('鋪好地墊使用攤開義的一聲注音', () => {
  const passage = json('./stories/block-bridge/story.json').passages.q;
  const chars = [...passage.text].filter(c => /\p{Script=Han}/u.test(c));
  assert.equal(passage.zhuyin.split(/\s+/)[chars.indexOf('鋪')], 'ㄆㄨ');
});
