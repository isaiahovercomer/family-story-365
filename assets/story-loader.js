import {startReader} from './reader.js';

try {
  const slug = new URLSearchParams(location.search).get('s') || 'ice-cream-money';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('故事網址無效');
  const basePath = `./stories/${slug}/`;
  const response = await fetch(`${basePath}story.json`);
  if (!response.ok) throw new Error('找不到故事');
  const data = await response.json();
  startReader(data, basePath, slug);
} catch {
  document.querySelector('#main').innerHTML = '<section class="library-header"><h1>暫時無法載入故事</h1><p>請確認網址，或重新整理再試一次。</p><a href="./index.html">回故事目錄</a></section>';
}
