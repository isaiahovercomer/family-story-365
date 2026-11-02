const catalog = document.querySelector('#catalog');
const legacyHash = /^#(?:story(?:\/|$)|home$|library$)/;
function redirectLegacy() {
  if (!legacyHash.test(location.hash)) return false;
  location.replace(`./story.html?s=ice-cream-money${location.hash}`);
  return true;
}
window.addEventListener('hashchange', redirectLegacy);

if (!redirectLegacy()) {
  try {
    const response = await fetch('./stories/index.json');
    if (!response.ok) throw new Error('目錄載入失敗');
    const stories = await response.json();
    catalog.textContent = '';
    for (const story of stories.sort((a, b) => a.order - b.order || b.published.localeCompare(a.published))) {
      const card = document.createElement('a');
      card.className = 'story-card';
      card.href = `./story.html?s=${encodeURIComponent(story.slug)}`;
      const cover = document.createElement('img');
      cover.className = 'catalog-cover';
      cover.src = `./stories/${story.slug}/${story.cover}`;
      cover.alt = ''; cover.loading = 'lazy';
      const copy = document.createElement('div');
      copy.className = 'story-card-copy';
      for (const [tag, text] of [['h2', story.title], ['p', story.description], ['small', `適合 ${story.ages} · ${story.published}`]]) {
        const child = document.createElement(tag);
        child.textContent = text;
        copy.append(child);
      }
      card.append(cover, copy);
      catalog.append(card);
    }
    if (!stories.length) catalog.textContent = '故事準備中，請稍後再來。';
  } catch {
    catalog.textContent = '故事目錄暫時無法載入，請重新整理再試一次。';
  }
}
