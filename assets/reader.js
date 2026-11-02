export function startReader(data, basePath, slug) {

function clampPage(value, length) {
  const page = Number(value);
  return Number.isFinite(page) ? Math.min(Math.max(0, Math.floor(page)), Math.max(0, length - 1)) : 0;
}

function parseRoute(hash, versions) {
  const [view, mode, page] = hash.replace(/^#/, '').split('/');
  if (view === 'library') return {view};
  if (view === 'story' && Object.hasOwn(versions, mode)) {
    return {view, mode, page: clampPage(page, versions[mode].pages.length)};
  }
  return {view: 'home'};
}

function annotate(text, zhuyin) {
  const sounds = zhuyin.trim().split(/\s+/);
  let index = 0;
  const tokens = [...text].map(char => ({char, sound: /\p{Script=Han}/u.test(char) ? sounds[index++] : ''}));
  if (index !== sounds.length || tokens.some(t => t.sound === undefined)) {
    throw new Error(`注音與文字數量不一致：${text}（${index}/${sounds.length}）`);
  }
  return tokens;
}

function localChineseVoices(voices) {
  return voices.filter(v => /^zh[-_]/i.test(v.lang) && v.localService === true)
    .sort((a, b) => Number(/TW/i.test(b.lang)) - Number(/TW/i.test(a.lang)));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

const {story, passages, versions} = data;
const asset = file => basePath + file;
function sceneMarkup(scene, {decorative = false} = {}) {
  const svg = data.scenes[scene] || '';
  return decorative ? svg.replace(/role="img" aria-label="[^"]*"/, 'aria-hidden="true"') : svg;
}

function icon(name, size = 22) {
  const shapes = {
    book: '<path d="M12 6C8 3 4 4 2 5v14c4-2 7-1 10 1m0-14c4-3 8-2 10-1v14c-4-2-7-1-10 1V6Z"/>',
    play: '<path d="m9 5 11 7-11 7Z"/>',
    comic: '<path d="M3 4h18v13H11l-6 4v-4H3Z"/><path d="M7 9h10M7 13h6"/>',
    text: '<path d="M5 5h14M12 5v15M8 20h8M4 5v3M20 5v3"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
    sound: '<path d="M4 9h4l5-4v14l-5-4H4Z"/><path d="M17 8q5 4 0 8M19 4q9 8 0 16"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    replay: '<path d="M4 9a8 8 0 1 1 0 7M4 3v6h6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${shapes[name] || shapes.book}</svg>`;
}

class Narrator {
  constructor(engine, createUtterance) {
    this.engine = engine;
    this.createUtterance = createUtterance;
    this.state = 'idle';
    this.generation = 0;
  }

  stop() {
    this.generation++;
    this.state = 'idle';
    this.engine?.cancel();
    this.current = null;
  }

  play(lines, voice, rate, onEnd = () => {}, onError = () => {}) {
    this.stop();
    if (!this.engine || !voice?.localService || !lines.length) return false;
    // cancel() 清除佇列，卻不會解除引擎的全域暫停狀態。
    if (this.engine.paused) this.engine.resume();
    const generation = this.generation;
    this.state = 'playing';
    let index = 0;
    const next = () => {
      if (generation !== this.generation) return;
      if (index === lines.length) {
        this.state = 'idle';
        this.current = null;
        this.generation++;
        onEnd();
        return;
      }
      const utterance = this.createUtterance(lines[index++]);
      utterance.voice = voice;
      utterance.lang = voice.lang || 'zh-TW';
      utterance.rate = rate;
      utterance.onend = next;
      utterance.onerror = event => {
        if (generation !== this.generation) return;
        this.stop();
        onError(event.error || 'unknown');
      };
      this.current = utterance;
      this.engine.speak(utterance);
    };
    next();
    return true;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.engine.pause();
    this.state = 'paused';
  }

  resume() {
    if (this.state !== 'paused') return;
    this.engine.resume();
    this.state = 'playing';
  }
}

const esc = escapeHTML;

const main = document.querySelector('#main');
const synth = window.speechSynthesis;
const narrator = new Narrator(synth, text => new SpeechSynthesisUtterance(text));
let route = parseRoute(location.hash, versions);
let voices = [];
let selectedVoice = '';
let rate = 1;
let useDeviceVoice = false;
let recordedState = 'idle';
let recordedGeneration = 0;
let showZhuyin = true;
let fontSize = 23;
let silentTimer = null;
let silentState = 'idle';
let silentStarted = 0;
let silentRemaining = 7000;
let autoTurn = true;
const storageKey = slug === 'ice-cream-money' ? 'family-story-365-progress-v1' : `family-story-365-progress-v1:${slug}`;
const path = (mode, page = 0) => `#story/${mode}/${page}`;
const announce = text => {document.querySelector('#announcement').textContent = text;};

function savedProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved.mode === 'string' && Object.hasOwn(versions, saved.mode)) {
      return parseRoute(path(saved.mode, saved.page), versions);
    }
  } catch { /* 隱私模式或損壞資料不阻擋閱讀。 */ }
  return null;
}

function saveProgress() {
  if (route.view !== 'story') return;
  try {localStorage.setItem(storageKey, JSON.stringify({mode: route.mode, page: route.page}));} catch { /* 可繼續閱讀 */ }
}

function homeMarkup() {
  const saved = savedProgress();
  return `<section class="library-header"><p class="eyebrow">${esc(story.category)}</p><h1>${esc(story.title)}</h1>
    <p>${esc(story.description)}</p></section>
  <section aria-labelledby="versions-title"><div class="section-head">
    <div><h2 id="versions-title">一個故事，四種陪伴</h2><p>選一種適合孩子的方式，從這裡開始。</p></div>
    <span class="section-number">陪伴 0–12 歲的每一步</span></div>
    <div class="version-grid">${Object.entries(versions).map(([mode, version]) => `
      <a class="version-card" href="${path(mode)}"><span class="mode-icon">${icon(version.icon)}</span>
        <small>${esc(version.age)}</small><h3>${esc(version.label)}</h3><p>${esc(version.subtitle)}</p>
        <span class="go">${icon('arrow', 19)}</span></a>`).join('')}</div>
  </section>
  <p>${saved ? `<a href="${path(saved.mode,saved.page)}">接著讀：${versions[saved.mode].label} 第 ${saved.page+1} 頁</a> · ` : ''}<a href="./index.html">查看故事目錄</a></p>`;
}
function libraryMarkup() { return homeMarkup(); }

function textMarkup(ids, ruby = false) {
  return ids.map(id => {
    const passage = passages[id];
    const text = ruby ? annotate(passage.text, passage.zhuyin).map(({char, sound}) => sound ?
      `<ruby>${esc(char)}<rp>（</rp><rt>${esc(sound)}</rt><rp>）</rp></ruby>` : esc(char)).join('') : esc(passage.text);
    return `<p>${text}</p>`;
  }).join('');
}

function readingMarkup(version, page) {
  if (route.mode === 'comic') {
    const middle = Math.ceil(page.passages.length / 2);
    return `<div class="comic-grid">${[page.passages.slice(0, middle), page.passages.slice(middle)]
      .filter(ids => ids.length).map(ids => `<section class="comic-panel">${sceneMarkup(page.scene)}
        <div class="speech-bubble">${textMarkup(ids, true)}</div></section>`).join('')}</div>`;
  }
  if (route.mode === 'reader') {
    return `<article class="article"><div class="vignette">${sceneMarkup(page.scene)}</div>
      <p class="page-kicker">${esc(story.sourceId)} ／ ${route.page + 1}</p><h2>${esc(page.title)}</h2>
      ${textMarkup(page.passages, true)}</article>`;
  }
  return `<div class="${route.mode === 'theatre' ? 'theatre' : 'book-picture'}">
    <div class="picture">${sceneMarkup(page.scene)}${route.mode === 'theatre' ?
    '<span class="stage-label">網頁輕動畫 · 點擊下方開始播放</span>' : ''}</div>
    <section class="page-copy"><div class="page-kicker">${esc(version.label)} ／ ${route.page + 1}</div>
      <h2>${esc(page.title)}</h2>${textMarkup(page.passages)}</section></div>`;
}

function storyMarkup() {
  const version = versions[route.mode];
  const page = version.pages[route.page];
  const isRead = ['comic', 'reader'].includes(route.mode);
  const isEnd = route.page === version.pages.length - 1;
  return `<nav class="breadcrumbs" aria-label="麵包屑"><a href="#home">首頁</a><span>／</span>
    <a href="./index.html">故事書架</a><span>／</span><span>${esc(story.category)}</span></nav>
    <div class="story-top"><div><h1>${esc(story.title)}</h1><p>${esc(version.intro)}</p></div>
      <span class="story-badge">${esc(story.sourceId)} · 分齡故事</span></div>
    <nav class="version-tabs" aria-label="選擇故事版本">${Object.entries(versions).map(([mode, v]) => `
      <a href="${path(mode)}" class="${mode === route.mode ? 'active' : ''}"
        ${mode === route.mode ? 'aria-current="page"' : ''}>${icon(v.icon)}
        <span>${esc(v.label)}<small>${esc(v.age)}</small></span></a>`).join('')}</nav>
    ${route.mode === 'theatre' && route.page === 0 ? data.videoStatus === 'pending' ? `
    <section class="end-card video-preview" aria-labelledby="video-title">
      <h2 id="video-title">影片製作中</h2>
      <p>可以先閱讀下方故事，或播放每頁朗讀。正式影片與插畫將另行製作。</p>
      <a class="text-link" href="${asset(data.media.subtitles)}" download>下載劇場字幕（VTT）</a>
    </section>` : `
    <section class="end-card video-preview" aria-labelledby="video-title">
      <h2 id="video-title">先看一段故事影片</h2>
      <p>${data.scenes.length} 個場景，搭配 AI 合成女聲與繁體中文字幕。朗讀發音與語氣仍為試聽版。</p>
      <video id="story-video" controls playsinline preload="metadata" poster="${asset(data.media.poster)}"
        aria-label="${esc(story.title)}：有聲故事影片">
        <source src="${asset(data.media.video)}" type="video/mp4">
        <track kind="subtitles" src="${asset(data.media.subtitles)}" srclang="zh-TW" label="繁體中文" default>
        你的瀏覽器無法播放此影片，請使用下方連結下載。
      </video>
      <p class="video-links"><a class="text-link" href="${asset(data.media.video)}" download>下載有聲影片</a>
        <a class="text-link" href="${asset(data.media.subtitles)}" download>下載字幕（VTT）</a>
        <button class="secondary" id="read-scenes">逐頁讀完整故事 ${icon('arrow', 17)}</button></p>
      <p class="note">字幕可用播放器選單切換；下載影片時請一併下載字幕。下方有完整故事與裝置朗讀。</p>
    </section>` : ''}
    <div class="reader-layout"><aside class="chapters" aria-label="故事章節"><div class="chapter-heading">這篇故事的旅程</div>
      ${version.pages.map((p, i) => `<a class="${i === route.page ? 'active' : ''}" href="${path(route.mode, i)}"
        ${i === route.page ? 'aria-current="step"' : ''}><span class="chapter-num">0${i + 1}</span>
        ${esc(p.title)}</a>`).join('')}
      <p>閱讀進度保存在這台裝置，<br>下次再來可以接著讀。</p></aside>
    <div class="reader-main"><div class="reading-toolbar"><span>${esc(version.age)} ／ ${esc(version.label)}</span>
      <div class="tools">${isRead ? `<label class="toggle"><input id="zhuyin" type="checkbox"
        ${showZhuyin ? 'checked' : ''}>注音</label>` : `<label class="toggle"><input id="auto-turn" type="checkbox"
        ${autoTurn ? 'checked' : ''}>自動翻頁</label>`}
        <button class="font-button" data-size="-2" aria-label="縮小文字" ${fontSize <= 19 ? 'disabled' : ''}>A−</button>
        <button class="font-button" data-size="2" aria-label="放大文字" ${fontSize >= 31 ? 'disabled' : ''}>A＋</button>
      </div></div>
      <div class="book ${showZhuyin ? '' : 'hide-zhuyin'}" id="book" tabindex="-1"
        aria-label="第 ${route.page + 1} 頁：${esc(page.title)}">${readingMarkup(version, page)}</div>
      <audio id="page-audio" preload="none"
        src="${asset(data.audio[route.mode][route.page])}"></audio>
      <div class="transport"><div class="audio-controls">
        <button id="play" class="primary">${icon('play', 19)}<span>開始朗讀</span></button>
        <button id="replay" class="replay" aria-label="從這頁重新播放">${icon('replay', 19)}</button></div>
        <div class="pager"><button id="previous" aria-label="上一頁" ${route.page === 0 ? 'disabled' : ''}>
          ${icon('back', 19)}</button><span>${route.page + 1} / ${version.pages.length}</span>
          <button id="next" aria-label="下一頁" ${isEnd ? 'disabled' : ''}>${icon('arrow', 19)}</button></div></div>
      <div class="progress-track" role="progressbar" aria-label="故事閱讀進度" aria-valuemin="0"
        aria-valuemax="${version.pages.length}" aria-valuenow="${route.page + 1}">
        <span style="width:${(route.page + 1) / version.pages.length * 100}%"></span></div>
      <p class="player-status" id="player-status" role="status"></p>
      <p class="player-note" id="player-note"></p>
      ${isEnd ? `<section class="end-card"><p class="eyebrow">故事讀完了，聊聊吧</p><h3>${esc(data.discussion.title)}</h3>
        <p class="question">${esc(data.discussion.question)}</p>
        <p>${esc(data.discussion.activity)}</p>
        <a class="text-link" href="${path(route.mode)}">再讀一次 ${icon('replay', 17)}</a></section>` : ''}
      ${data.familyPractice ? `<details class="faith"><summary>${esc(data.familyPractice.title)}</summary><p>${esc(data.familyPractice.text)}</p></details>` : `<details class="faith"><summary>一起讀經、禱告</summary><div class="faith-content">
        <section><h3>一句經文</h3><p>『${esc(story.verse)}』─${esc(story.verseRef)}。</p></section>
        <section><h3>一起禱告</h3><p>${esc(story.prayer)}</p></section></div></details>`}
      <details class="faith"><summary>查看原故事與版本說明</summary><p>${esc(story.original)}</p>
        <p class="note">${data.productionNote ? esc(data.productionNote) : '四個閱讀版本依原故事改寫；畫面是原創 SVG 示範插畫。劇場提供精簡字幕影片，以及可逐頁播放的網頁輕動畫。旁白由本機模型生成，並非真人錄音；發音與語氣仍待校對。'}</p>
      </details>
      <details class="faith"><summary>給家長：下載本機製作包</summary>
        <p>${data.videoStatus === 'pending' ? '包含這篇故事的旁白稿、朗讀音檔、字幕與影片製作交接規格。' : '包含這篇故事的旁白稿、插畫、朗讀腳本與影片組裝工具。'}</p>
        <p>${esc(data.kitNote || '朗讀腳本需在Windows執行；聲音品質與可用性仍待裝置實測。')}</p>
        <a class="text-link" href="${asset(data.media.productionKit)}" download>下載製作包（ZIP）</a>
        <p><a class="text-link" href="${asset(data.media.narrationKit)}" download>下載離線 AI 朗讀製作包</a></p>
        <p class="note">${esc(data.narrationNote || '本機語音引擎：sherpa-onnx／MeloTTS。一般中文模型，尚未完成台灣口音校對。')}</p>
      </details>
      <p class="source">故事來源：家庭時光365 · ${esc(story.sourceId)} · <a href="${esc(story.sourceURL)}"
        target="_blank" rel="noopener">原始教材</a>。改寫與注音為示範校對稿。</p>
    </div></div>`;
}

function stopPlayback({pauseVideo = true} = {}) {
  recordedGeneration++;
  recordedState = 'idle';
  const audio = document.querySelector('#page-audio');
  if (audio) {audio.pause(); audio.currentTime = 0;}
  if (pauseVideo) document.querySelector('#story-video')?.pause();
  narrator.stop();
  clearTimeout(silentTimer);
  silentState = 'idle';
  silentRemaining = 7000;
}

function render({focus = false} = {}) {
  const previous = route;
  route = parseRoute(location.hash, versions);
  main.innerHTML = route.view === 'home' ? homeMarkup() : route.view === 'library' ? libraryMarkup() : storyMarkup();
  document.title = route.view === 'story' ? `${story.title}・${versions[route.mode].label}｜家庭時光365` :
    '家庭時光365｜一起讀故事，慢慢長大';
  document.querySelectorAll('[data-nav]').forEach(a => {
    if (a.dataset.nav === route.view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  saveProgress();
  updatePlayer();
  const pageChanged = previous.view === 'story' && route.view === 'story' &&
    previous.mode === route.mode && previous.page !== route.page;
  if (pageChanged) showScene();
  else if (focus) {
    main.focus({preventScroll: true});
    main.scrollIntoView({block: 'start', behavior: 'instant'});
  }
}

function showScene() {
  document.querySelector('#book')?.focus({preventScroll: true});
  document.querySelector('.reader-main')?.scrollIntoView({block: 'start', behavior: 'instant'});
}

function turnPage(direction) {
  if (route.view !== 'story') return;
  const page = route.page + direction;
  if (page < 0 || page >= versions[route.mode].pages.length) return;
  location.hash = path(route.mode, page);
}

function finishedPage() {
  if (route.view !== 'story') return;
  const canContinue = autoTurn && ['toddler', 'theatre'].includes(route.mode) &&
    route.page < versions[route.mode].pages.length - 1;
  if (canContinue) {
    // replaceState 不觸發 hashchange；先停舊聲音，再建立下一頁的新朗讀。
    stopPlayback();
    history.replaceState(null, '', path(route.mode, route.page + 1));
    render();
    playPage();
  } else {
    silentState = 'idle';
    silentRemaining = 7000;
    updatePlayer();
    const status = document.querySelector('#player-status');
    if (status) status.textContent = '這一頁播放完了。';
  }
}

function currentVoice() {
  return voices.find(v => v.voiceURI === selectedVoice) || voices[0];
}

function playPage() {
  if (route.view !== 'story') return;
  document.querySelector('#story-video')?.pause();
  if (!useDeviceVoice) {playRecording(); return;}
  const voice = currentVoice();
  const page = versions[route.mode].pages[route.page];
  if (!voice && route.mode === 'theatre') {
    silentState = 'playing';
    silentStarted = Date.now();
    silentTimer = setTimeout(finishedPage, silentRemaining);
  } else if (voice) {
    narrator.play(page.passages.map(id => passages[id].text), voice, rate, finishedPage, () => {
      updatePlayer();
      document.querySelector('#player-status').textContent = '這個聲音暫時無法播放，請在朗讀設定換一個聲音。';
    });
  }
  updatePlayer();
}

function playRecording() {
  const audio = document.querySelector('#page-audio');
  if (!audio) return;
  if (audio.error) audio.load();
  const generation = ++recordedGeneration;
  recordedState = 'playing';
  audio.playbackRate = rate;
  audio.play().catch(() => {
    if (generation !== recordedGeneration || recordedState !== 'playing') return;
    recordedState = 'idle';
    updatePlayer();
    document.querySelector('#player-status').textContent =
      '音檔暫時無法播放，請再按一次；也可以在朗讀設定切換裝置聲音。';
  });
  updatePlayer();
}

function updatePlayer() {
  const button = document.querySelector('#play');
  if (!button) return;
  const state = recordedState !== 'idle' ? recordedState : narrator.state !== 'idle' ? narrator.state : silentState;
  const hasVoice = !useDeviceVoice || Boolean(currentVoice());
  const theatre = route.mode === 'theatre';
  const label = state === 'playing' ? '暫停' : state === 'paused' ? '繼續播放' :
    hasVoice ? (theatre ? '播放故事' : '開始朗讀') : theatre ? '播放無聲動畫' : '尚無本機中文聲音';
  button.innerHTML = `${icon(state === 'playing' ? 'pause' : 'play', 19)}<span>${label}</span>`;
  button.disabled = !hasVoice && !theatre;
  document.querySelector('#replay').disabled = !hasVoice && !theatre;
  const book = document.querySelector('#book');
  book.classList.toggle('playing', theatre && state !== 'idle');
  book.classList.toggle('is-paused', state === 'paused');
  document.querySelector('#player-status').textContent = state === 'playing' ?
    (hasVoice ? '正在朗讀這一頁…' : '無聲動畫播放中，每個場景停留 7 秒。') : state === 'paused' ? '已暫停。' : '';
  document.querySelector('#player-note').textContent = !useDeviceVoice ?
    'AI 朗讀試聽版：本機模型產生的固定音檔，手機可直接播放；發音與語氣仍待校對。' : hasVoice ?
    `裝置朗讀：${currentVoice().name}。可在「朗讀設定」切換聲音；目前為語音試聽版。` :
    '這台裝置尚未提供本機中文聲音；仍可翻頁閱讀。請在系統安裝中文語音，再重新開啟瀏覽器。';
}

function togglePlayback() {
  if (recordedState === 'playing') {
    recordedState = 'paused';
    document.querySelector('#page-audio').pause();
  } else if (recordedState === 'paused') playRecording();
  else if (narrator.state === 'playing') narrator.pause();
  else if (narrator.state === 'paused') narrator.resume();
  else if (silentState === 'playing') {
    clearTimeout(silentTimer);
    silentRemaining = Math.max(100, silentRemaining - (Date.now() - silentStarted));
    silentState = 'paused';
  } else if (silentState === 'paused') {
    silentState = 'playing';
    silentStarted = Date.now();
    silentTimer = setTimeout(finishedPage, silentRemaining);
  } else playPage();
  updatePlayer();
}

function refreshVoices() {
  voices = localChineseVoices(synth?.getVoices() || []);
  const select = document.querySelector('#voice');
  select.innerHTML = voices.length ? voices.map((v, i) =>
    `<option value="${i}">${esc(v.name)}（${esc(v.lang)}・本機）</option>`).join('') :
    '<option value="">找不到本機中文聲音</option>';
  const previous = voices.findIndex(v => v.voiceURI === selectedVoice);
  select.value = voices.length ? String(Math.max(0, previous)) : '';
  selectedVoice = voices[Number(select.value)]?.voiceURI || '';
  select.disabled = !voices.length;
  document.querySelector('#voice-test').disabled = !voices.length;
  document.querySelector('#voice-status').textContent = voices.length ?
    '優先列出台灣中文聲音。請先試聽，確認發音與語氣。' :
    '沒有可用的本機中文聲音。請安裝作業系統的中文語音；閱讀功能仍可使用。';
  updatePlayer();
}

main.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.id === 'next') turnPage(1);
  if (button.id === 'previous') turnPage(-1);
  if (button.id === 'read-scenes') {stopPlayback(); updatePlayer(); showScene();}
  if (button.id === 'play') togglePlayback();
  if (button.id === 'replay') {stopPlayback(); playPage();}
  if (button.dataset.size) {
    fontSize = Math.min(31, Math.max(19, fontSize + Number(button.dataset.size)));
    document.documentElement.style.setProperty('--reading-size', `${fontSize}px`);
    main.querySelectorAll('[data-size]').forEach(b => {
      b.disabled = Number(b.dataset.size) < 0 ? fontSize <= 19 : fontSize >= 31;
    });
  }
});

// play 不冒泡，使用捕獲階段協調兩種播放器。
main.addEventListener('play', event => {
  if (event.target.matches('#story-video')) {
    stopPlayback({pauseVideo: false});
    updatePlayer();
  }
}, true);

main.addEventListener('ended', event => {
  if (event.target !== document.querySelector('#page-audio') || recordedState !== 'playing') return;
  recordedState = 'idle';
  finishedPage();
}, true);

main.addEventListener('error', event => {
  if (event.target !== document.querySelector('#page-audio') || useDeviceVoice) return;
  stopPlayback();
  updatePlayer();
  document.querySelector('#player-status').textContent = '音檔暫時無法播放，請再按一次或切換裝置聲音。';
}, true);

main.addEventListener('change', event => {
  if (event.target.id === 'zhuyin') {
    showZhuyin = event.target.checked;
    document.querySelector('#book').classList.toggle('hide-zhuyin', !showZhuyin);
  }
  if (event.target.id === 'auto-turn') autoTurn = event.target.checked;
});

document.querySelector('#settings-open').addEventListener('click', () => {
  stopPlayback(); updatePlayer(); refreshVoices(); document.querySelector('#settings').showModal();
});
document.querySelector('#settings').addEventListener('close', () => {stopPlayback(); updatePlayer();});
document.querySelector('#device-voice').addEventListener('change', event => {
  stopPlayback(); useDeviceVoice = event.target.checked; updatePlayer();
});
document.querySelector('#voice').addEventListener('change', event => {
  narrator.stop(); selectedVoice = voices[Number(event.target.value)]?.voiceURI || ''; updatePlayer();
});
document.querySelector('#rate').addEventListener('input', event => {
  stopPlayback(); rate = Number(event.target.value);
  document.querySelector('#rate-value').textContent = `${rate.toFixed(1)} 倍`;
});
document.querySelector('#voice-test').addEventListener('click', () => {
  narrator.play([`今天，我們一起讀${story.title}。`], currentVoice(), rate, () => {
    document.querySelector('#voice-status').textContent = '試聽完成。';
  }, () => {document.querySelector('#voice-status').textContent = '播放失敗，請換一個聲音再試一次。';});
});
window.addEventListener('hashchange', () => {
  stopPlayback(); render({focus: true});
  if (route.view === 'story') announce(`第 ${route.page + 1} 頁：${versions[route.mode].pages[route.page].title}`);
});
window.addEventListener('pagehide', stopPlayback);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {stopPlayback(); updatePlayer();}
});
document.addEventListener('keydown', event => {
  if (route.view !== 'story' || document.querySelector('#settings').open ||
    event.target.closest('input,select,textarea,button,a,video,audio,summary,[contenteditable]')) return;
  if (event.key === 'ArrowRight') {event.preventDefault(); turnPage(1);}
  if (event.key === 'ArrowLeft') {event.preventDefault(); turnPage(-1);}
});
let touchStart;
main.addEventListener('touchstart', event => {
  const touch = event.changedTouches[0];
  touchStart = event.target.closest('#book') ? {x: touch.clientX, y: touch.clientY} : null;
}, {passive: true});
main.addEventListener('touchend', event => {
  if (!touchStart || window.getSelection()?.toString()) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 2) turnPage(dx < 0 ? 1 : -1);
  touchStart = null;
}, {passive: true});
document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault(); main.focus();
});
synth?.addEventListener('voiceschanged', refreshVoices);
render();
refreshVoices();


}
