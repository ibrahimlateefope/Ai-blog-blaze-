
import { initializeApp }    from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAnalytics }     from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { firebaseConfig }   from "./config.js";

const app       = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db        = getFirestore(app);

const $   = id => document.getElementById(id);
const loadingState   = $('loadingState');
const emptyState     = $('emptyState');
const featuredSec    = $('featuredSection');
const featuredPost   = $('featuredPost');
const postsGrid      = $('postsGrid');
const postCount      = $('postCount');
const postModal      = $('postModal');
const modalBackdrop  = $('modalBackdrop');
const modalClose     = $('modalClose');
const modalContent   = $('modalContent');
const modalArticle   = $('modalArticle');
const themeToggle    = $('themeToggle');
const sunIcon        = $('sunIcon');
const moonIcon       = $('moonIcon');
const toast          = $('toast');

let allPosts    = [];
let activeFilter = 'all';

function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function applyThemeIcons() {
  if (isDark()) { sunIcon.style.display = 'block'; moonIcon.style.display = 'none'; }
  else          { sunIcon.style.display = 'none';  moonIcon.style.display = 'block'; }
}
const saved = localStorage.getItem('bb-theme');
if (saved) document.documentElement.setAttribute('data-theme', saved);
applyThemeIcons();

themeToggle?.addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('bb-theme', next);
  applyThemeIcons();
});

document.querySelectorAll('.topic-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.topic-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.topic;
    renderPosts(allPosts);
  });
});

const q = query(collection(db, 'posts'), orderBy('date', 'desc'));
onSnapshot(q, snapshot => {
  loadingState.classList.add('hidden');
  allPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderPosts(allPosts);
}, err => {
  loadingState.classList.add('hidden');
  console.error('Firestore error:', err);
  showToast('Could not load posts. Check Firestore rules.', true);
});

function renderPosts(posts) {
  const filtered = activeFilter === 'all'
    ? posts
    : posts.filter(p => (p.tags || []).some(t =>
        t.toLowerCase().replace(/\s+/g, '') === activeFilter.replace(/\s+/g, '')
      ));

  postCount.textContent = `${posts.length} ${posts.length === 1 ? 'story' : 'stories'}`;

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    featuredSec.classList.add('hidden');
    postsGrid.innerHTML = '';
    return;
  }
  emptyState.classList.add('hidden');

  const [first, ...rest] = filtered;
  featuredSec.classList.remove('hidden');
  featuredPost.innerHTML = featuredCardHTML(first);
  featuredPost.querySelector('.featured-card').addEventListener('click', () => openPost(first));

  postsGrid.innerHTML = rest.map(p => cardHTML(p)).join('');
  postsGrid.querySelectorAll('.post-card').forEach((card, i) => {
    card.addEventListener('click', () => openPost(rest[i]));
  });
}

function featuredCardHTML(p) {
  const img  = heroImg(p, '800x450');
  const tags = tagsHTML((p.tags || []).slice(0, 2));
  const date = fmtDate(p.date);
  return `
    <div class="featured-card" role="button" tabindex="0" aria-label="Read: ${esc(p.title)}">
      <div class="featured-body">
        <span class="featured-label">Рюд Featured Story</span>
        <h2 class="featured-title">${esc(p.title)}</h2>
        <p class="featured-excerpt">${esc(p.excerpt || '')}</p>
        <div class="post-meta">
          <time datetime="${isoDate(p.date)}">${date}</time>
          <span class="dot"></span>
          <span>${p.readTime || 5} min read</span>
        </div>
        <div class="post-tags">${tags}</div>
      </div>
      <div class="featured-image-wrap">
        <img src="${img}" alt="${esc(p.title)}" loading="lazy" width="800" height="450">
      </div>
    </div>`;
}

function cardHTML(p) {
  const img  = heroImg(p, '640x360');
  const tags = tagsHTML((p.tags || []).slice(0, 2));
  return `
    <article class="post-card" role="button" tabindex="0" aria-label="Read: ${esc(p.title)}">
      <div class="card-image">
        <img src="${img}" alt="${esc(p.title)}" loading="lazy" width="640" height="360">
      </div>
      <div class="card-body">
        <div class="card-tags">${tags}</div>
        <h2 class="card-title">${esc(p.title)}</h2>
        <p class="card-excerpt">${esc(p.excerpt || '')}</p>
        <div class="card-meta">
          <time datetime="${isoDate(p.date)}">${fmtDate(p.date)}</time>
          <span>${p.readTime || 5} min read</span>
        </div>
      </div>
    </article>`;
}

function tagsHTML(tags) {
  return tags.map(t => {
    const cls = t.toLowerCase().replace(/[^a-z]/g, '');
    return `<span class="tag tag-${cls}">${esc(t)}</span>`;
  }).join('');
}

function heroImg(p, size) {
  return (p.images && p.images[0])
    ? p.images[0]
    : `https://placehold.co/${size}/14b8a6/ffffff?text=${encodeURIComponent((p.title || 'Post').slice(0, 20))}`;
}

function openPost(post) {
  const images = post.images || [];
  const hero   = images[0] || `https://placehold.co/1200x630/14b8a6/ffffff?text=${encodeURIComponent((post.title||'').slice(0,20))}`;
  const tags   = tagsHTML((post.tags || []).slice(0, 3));

  let md = post.content || '';
  let imgIdx = 1;
  md = md.replace(/!\[([^\]]*)\]\([^)]*placehold\.co[^)]*\)/g, () => {
    const url = images[imgIdx] || hero;
    imgIdx++;
    return `![image](${url})`;
  });

  const bodyHTML = typeof marked !== 'undefined'
    ? marked.parse(md)
    : `<p>${esc(post.excerpt || '')}</p>`;

  modalArticle.innerHTML = `
    <div class="reading-progress"><div class="reading-progress-bar" id="readBar"></div></div>
    <div class="article-hero-img">
      <img src="${hero}" alt="${esc(post.title)}" loading="eager" width="740" height="416">
    </div>
    <div class="article-header">
      <div class="article-tags">${tags}</div>
      <h1 class="article-title" id="modalArticleTitle">${esc(post.title)}</h1>
      <div class="article-meta">
        <time datetime="${isoDate(post.date)}">${fmtDate(post.date)}</time>
        <span class="dot"></span>
        <span>${post.readTime || 5} min read</span>
        <span class="dot"></span>
        <span>AI Generated</span>
      </div>
    </div>
    <div class="article-body">${bodyHTML}</div>`;

  postModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  modalContent.scrollTop = 0;
  history.pushState(null, '', `#${post.id}`);
}

modalContent?.addEventListener('scroll', () => {
  const bar = document.getElementById('readBar');
  if (!bar) return;
  const pct = modalContent.scrollTop / (modalContent.scrollHeight - modalContent.clientHeight);
  bar.style.width = `${Math.min(100, pct * 100).toFixed(1)}%`;
});

function closePost() {
  postModal.classList.remove('open');
  document.body.style.overflow = '';
  history.pushState(null, '', window.location.pathname);
}
modalClose?.addEventListener('click', closePost);
modalBackdrop?.addEventListener('click', closePost);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePost(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList.contains('featured-card')) e.target.click();
  if (e.key === 'Enter' && e.target.classList.contains('post-card')) e.target.click();
});

window.addEventListener('load', () => {
  const hash = location.hash.slice(1);
  if (hash && allPosts.length) {
    const p = allPosts.find(x => x.id === hash);
    if (p) openPost(p);
  }
});

function esc(s = '') {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}
function isoDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().slice(0, 10);
}
function showToast(msg, isErr = false) {
  toast.textContent = msg;
  toast.className   = `toast${isErr ? ' error' : ''}`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}
