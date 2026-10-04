import { INITIAL_FEEDS, fetchAllFeedArticles, formatTimeAgo } from './feeds.js';
import { generateArticleSummary, generateDigestReport } from './summarizer.js';

// State Management
const state = {
  feeds: [...INITIAL_FEEDS],
  articles: [],
  filteredArticles: [],
  bookmarks: JSON.parse(localStorage.getItem('tech_agent_bookmarks') || '[]'),
  activeTab: 'feed',
  activeTopic: 'all',
  searchQuery: '',
  selectedCategory: 'all',
  selectedSort: 'latest',
  activeModalArticle: null
};

// DOM Elements
const elements = {
  articlesGrid: document.getElementById('articles-grid'),
  instrumentArticlesGrid: document.getElementById('instrument-articles-grid'),
  bookmarksGrid: document.getElementById('bookmarks-grid'),
  articleCountLabel: document.getElementById('article-count-label'),
  bookmarkBadge: document.getElementById('bookmark-count-badge'),
  searchInput: document.getElementById('search-input'),
  clearSearchBtn: document.getElementById('clear-search'),
  categorySelect: document.getElementById('category-select'),
  sortSelect: document.getElementById('sort-select'),
  fetchNowBtn: document.getElementById('fetch-now-btn'),
  topicChips: document.getElementById('topic-chips'),
  feedSourcesList: document.getElementById('feed-sources-list'),
  addFeedForm: document.getElementById('add-feed-form'),
  digestOutput: document.getElementById('digest-output'),
  generateDigestBtn: document.getElementById('generate-digest-btn'),
  exportBookmarksBtn: document.getElementById('export-bookmarks-btn'),
  clearBookmarksBtn: document.getElementById('clear-bookmarks-btn'),
  filterInstrumentOnlyBtn: document.getElementById('filter-instrument-only-btn'),
  articleModal: document.getElementById('article-modal'),
  modalBody: document.getElementById('modal-body'),
  closeModalBtn: document.getElementById('close-modal-btn'),
  toast: document.getElementById('toast')
};

// Initialize App
async function init() {
  setupEventListeners();
  renderFeedSourcesList();
  updateBookmarkBadge();
  await loadAllFeeds();

  // Auto poll every 5 minutes
  setInterval(() => {
    loadAllFeeds(true);
  }, 5 * 60 * 1000);
}

// Fetch Feeds
async function loadAllFeeds(isBackground = false) {
  if (!isBackground) {
    showLoadingState();
  }
  
  if (elements.fetchNowBtn) {
    const icon = elements.fetchNowBtn.querySelector('.spin-on-load');
    if (icon) icon.classList.add('spinning');
  }

  try {
    state.articles = await fetchAllFeedArticles(state.feeds);
    applyFiltersAndRender();
    if (isBackground) {
      showToast("⚡ Agent updated latest feeds in background");
    } else {
      showToast(`Loaded ${state.articles.length} latest articles`);
    }
  } catch (err) {
    console.error("Error fetching feeds:", err);
    showToast("⚠️ Could not reach some RSS feeds. Displaying cached articles.");
  } finally {
    if (elements.fetchNowBtn) {
      const icon = elements.fetchNowBtn.querySelector('.spin-on-load');
      if (icon) icon.classList.remove('spinning');
    }
  }
}

function showLoadingState() {
  if (elements.articlesGrid) {
    elements.articlesGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon spin-on-load spinning">⚡</div>
        <h4>Agent Scanning Feeds & Fetching News...</h4>
        <p>Connecting to IEEE Spectrum, EE Times, Hackaday, AllAboutCircuits...</p>
      </div>
    `;
  }
  if (elements.articleCountLabel) {
    elements.articleCountLabel.textContent = "Scanning channels...";
  }
}

// Filter and Render Logic
function applyFiltersAndRender() {
  let result = [...state.articles];

  // Category Filter
  if (state.selectedCategory !== 'all') {
    result = result.filter(a => a.category === state.selectedCategory);
  }

  // Topic Chip Filter
  if (state.activeTopic !== 'all') {
    result = result.filter(a => a.topics.includes(state.activeTopic));
  }

  // Search Filter
  if (state.searchQuery.trim() !== '') {
    const q = state.searchQuery.toLowerCase().trim();
    result = result.filter(a => 
      a.title.toLowerCase().includes(q) || 
      a.snippet.toLowerCase().includes(q) || 
      a.source.toLowerCase().includes(q)
    );
  }

  // Sorting
  if (state.selectedSort === 'latest') {
    result.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  } else if (state.selectedSort === 'oldest') {
    result.sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));
  } else if (state.selectedSort === 'title') {
    result.sort((a, b) => a.title.localeCompare(b.title));
  }

  state.filteredArticles = result;
  renderArticlesGrid(elements.articlesGrid, result);
  renderInstrumentTabArticles();
  renderBookmarksGrid();

  if (elements.articleCountLabel) {
    elements.articleCountLabel.textContent = `Showing ${result.length} of ${state.articles.length} articles`;
  }
}

function renderArticlesGrid(targetEl, articles) {
  if (!targetEl) return;

  if (articles.length === 0) {
    targetEl.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🔍</div>
        <h4>No Articles Found</h4>
        <p>Try clearing your search query or choosing a different category chip.</p>
      </div>
    `;
    return;
  }

  targetEl.innerHTML = articles.map(art => {
    const isBookmarked = state.bookmarks.some(b => b.id === art.id);
    return `
      <article class="article-card" data-id="${art.id}">
        <div class="card-top">
          <span class="source-tag">${escapeHtml(art.source)}</span>
          <span class="category-tag">${escapeHtml(art.category)}</span>
        </div>

        <h3 class="article-title">${escapeHtml(art.title)}</h3>
        <p class="article-snippet">${escapeHtml(art.snippet)}</p>

        <div class="card-footer">
          <span class="pub-date">🕒 ${formatTimeAgo(art.pubDate)} • ${art.readTime || '4 min'}</span>

          <div class="card-actions">
            <button class="action-btn ${isBookmarked ? 'bookmarked' : ''}" data-action="bookmark" data-id="${art.id}" title="${isBookmarked ? 'Remove Bookmark' : 'Save to Vault'}">
              ${isBookmarked ? '★ Saved' : '☆ Save'}
            </button>
            <button class="action-btn" data-action="read" data-id="${art.id}" title="Read AI Summary">
              💡 Summary
            </button>
            <a href="${art.link}" target="_blank" rel="noopener noreferrer" class="action-btn" title="Open Original Link">
              ↗ Open
            </a>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderInstrumentTabArticles() {
  if (!elements.instrumentArticlesGrid) return;
  const instArticles = state.articles.filter(a => 
    a.category === 'instruments' || 
    a.topics.some(t => ['oscilloscopes', 'multimeter', 'analyzer', 'generator', 'instruments'].includes(t))
  );
  renderArticlesGrid(elements.instrumentArticlesGrid, instArticles);
}

function renderBookmarksGrid() {
  if (!elements.bookmarksGrid) return;
  if (state.bookmarks.length === 0) {
    elements.bookmarksGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🔖</div>
        <h4>Your Vault is Empty</h4>
        <p>Click "☆ Save" on any article to store it here for offline reading or export.</p>
      </div>
    `;
  } else {
    renderArticlesGrid(elements.bookmarksGrid, state.bookmarks);
  }
}

// Event Listeners
function setupEventListeners() {
  // Navigation Tabs
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabTarget = btn.getAttribute('data-tab');
      switchTab(tabTarget);
    });
  });

  // Search input
  elements.searchInput?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    if (state.searchQuery) {
      elements.clearSearchBtn?.classList.remove('hidden');
    } else {
      elements.clearSearchBtn?.classList.add('hidden');
    }
    applyFiltersAndRender();
  });

  elements.clearSearchBtn?.addEventListener('click', () => {
    state.searchQuery = '';
    if (elements.searchInput) elements.searchInput.value = '';
    elements.clearSearchBtn.classList.add('hidden');
    applyFiltersAndRender();
  });

  // Category & Sort selects
  elements.categorySelect?.addEventListener('change', (e) => {
    state.selectedCategory = e.target.value;
    applyFiltersAndRender();
  });

  elements.sortSelect?.addEventListener('change', (e) => {
    state.selectedSort = e.target.value;
    applyFiltersAndRender();
  });

  elements.fetchNowBtn?.addEventListener('click', () => {
    loadAllFeeds();
  });

  // Topic Chips
  elements.topicChips?.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.activeTopic = chip.getAttribute('data-topic');
    applyFiltersAndRender();
  });

  // Instrument Cards click filter
  document.querySelectorAll('.instrument-card').forEach(card => {
    card.addEventListener('click', () => {
      const kw = card.getAttribute('data-kw');
      state.activeTopic = kw;
      switchTab('feed');
      // Highlight chip if exists
      document.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-topic') === kw);
      });
      applyFiltersAndRender();
    });
  });

  elements.filterInstrumentOnlyBtn?.addEventListener('click', () => {
    state.selectedCategory = 'instruments';
    if (elements.categorySelect) elements.categorySelect.value = 'instruments';
    switchTab('feed');
    applyFiltersAndRender();
  });

  // Global Grid Delegated Actions (Bookmark, Summary)
  document.body.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('.action-btn');
    if (!actionBtn) return;

    const action = actionBtn.getAttribute('data-action');
    const id = actionBtn.getAttribute('data-id');
    if (!action || !id) return;

    const article = state.articles.find(a => a.id === id) || state.bookmarks.find(b => b.id === id);
    if (!article) return;

    if (action === 'bookmark') {
      toggleBookmark(article);
    } else if (action === 'read') {
      openArticleModal(article);
    }
  });

  // Modal Close
  elements.closeModalBtn?.addEventListener('click', closeModal);
  document.querySelector('.modal-overlay')?.addEventListener('click', closeModal);

  // AI Digest Generation
  elements.generateDigestBtn?.addEventListener('click', () => {
    const tf = document.getElementById('digest-timeframe')?.value || 'today';
    const focus = document.getElementById('digest-focus')?.value || 'all';
    
    if (elements.digestOutput) {
      elements.digestOutput.innerHTML = generateDigestReport(state.articles, tf, focus);
      showToast("✨ AI Executive Digest synthesized successfully!");
    }
  });

  // Bookmarks Vault Actions
  elements.exportBookmarksBtn?.addEventListener('click', exportBookmarksMarkdown);
  elements.clearBookmarksBtn?.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all bookmarked articles?")) {
      state.bookmarks = [];
      saveBookmarks();
      applyFiltersAndRender();
      showToast("Cleared all bookmarks");
    }
  });

  // Add Feed Form
  elements.addFeedForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('feed-name-input').value.trim();
    const url = document.getElementById('feed-url-input').value.trim();
    const category = document.getElementById('feed-cat-input').value;

    if (name && url) {
      const newFeed = { id: `custom-${Date.now()}`, name, url, category, icon: '📡' };
      state.feeds.push(newFeed);
      renderFeedSourcesList();
      elements.addFeedForm.reset();
      showToast(`Added channel "${name}"!`);
      loadAllFeeds();
    }
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabId}`);
  });
}

// Bookmarks logic
function toggleBookmark(article) {
  const index = state.bookmarks.findIndex(b => b.id === article.id);
  if (index >= 0) {
    state.bookmarks.splice(index, 1);
    showToast("Removed from bookmarks");
  } else {
    state.bookmarks.push(article);
    showToast("Bookmark saved to Vault!");
  }
  saveBookmarks();
  applyFiltersAndRender();
}

function saveBookmarks() {
  localStorage.setItem('tech_agent_bookmarks', JSON.stringify(state.bookmarks));
  updateBookmarkBadge();
}

function updateBookmarkBadge() {
  if (elements.bookmarkBadge) {
    elements.bookmarkBadge.textContent = state.bookmarks.length;
  }
}

function exportBookmarksMarkdown() {
  if (state.bookmarks.length === 0) {
    showToast("Vault is empty. Add bookmarks first!");
    return;
  }

  let md = `# TechInsight Agent Saved Articles & Digest\n\n`;
  md += `Exported on: ${new Date().toLocaleString()}\n\n`;

  state.bookmarks.forEach((art, i) => {
    md += `### ${i + 1}. [${art.title}](${art.link})\n`;
    md += `- **Source:** ${art.source}\n`;
    md += `- **Category:** ${art.category.toUpperCase()}\n`;
    md += `- **Published:** ${art.pubDate}\n`;
    md += `- **Snippet:** ${art.snippet}\n\n`;
  });

  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `TechInsight_Bookmarks_${Date.now()}.md`;
  a.click();
  showToast("Exported reading list to Markdown!");
}

// Modal Article Reader
function openArticleModal(article) {
  state.activeModalArticle = article;
  const summary = generateArticleSummary(article);

  elements.modalBody.innerHTML = `
    <span class="source-tag">${escapeHtml(article.source)} • ${escapeHtml(article.category.toUpperCase())}</span>
    <h2 style="font-size: 1.4rem; margin: 0.5rem 0 1rem 0; line-height: 1.3;">${escapeHtml(article.title)}</h2>

    <div style="background: rgba(99, 102, 241, 0.1); border-left: 3px solid var(--accent-primary); padding: 1rem; border-radius: 4px; margin-bottom: 1.25rem;">
      <h4 style="color: #a5b4fc; font-size: 0.9rem; margin-bottom: 0.4rem;">🤖 AI Executive Summary</h4>
      <p style="font-size: 0.88rem; color: var(--text-primary); line-height: 1.5;">${escapeHtml(summary.executiveSummary)}</p>
    </div>

    <div style="margin-bottom: 1.25rem;">
      <h4 style="font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--accent-secondary);">📌 Key Takeaways</h4>
      <ul style="padding-left: 1.2rem; font-size: 0.88rem; color: var(--text-secondary);">
        ${summary.keyTakeaways.map(k => `<li style="margin-bottom: 0.3rem;">${escapeHtml(k)}</li>`).join('')}
      </ul>
    </div>

    <div style="margin-bottom: 1.5rem;">
      <h4 style="font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--accent-emerald);">🔬 Technical & Instrument Highlights</h4>
      <ul style="padding-left: 1.2rem; font-size: 0.88rem; color: var(--text-secondary);">
        ${summary.technicalHighlights.map(h => `<li style="margin-bottom: 0.3rem;">${escapeHtml(h)}</li>`).join('')}
      </ul>
    </div>

    <div style="display: flex; gap: 0.75rem; justify-content: flex-end; border-top: 1px solid var(--border-glass); padding-top: 1rem;">
      <a href="${article.link}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
        Read Full Article at Source ↗
      </a>
    </div>
  `;

  elements.articleModal.classList.remove('hidden');
}

function closeModal() {
  elements.articleModal?.classList.add('hidden');
}

// Feed Settings UI
function renderFeedSourcesList() {
  if (!elements.feedSourcesList) return;
  elements.feedSourcesList.innerHTML = state.feeds.map(f => `
    <li class="feed-item">
      <div class="feed-info">
        <h4>${f.icon} ${escapeHtml(f.name)}</h4>
        <span>${escapeHtml(f.url)} • <strong style="color: var(--accent-secondary);">${f.category}</strong></span>
      </div>
      <span class="inst-badge">Active</span>
    </li>
  `).join('');
}

// Toast Notifications
function showToast(msg) {
  if (!elements.toast) return;
  elements.toast.textContent = msg;
  elements.toast.classList.remove('hidden');
  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3000);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.addEventListener('DOMContentLoaded', init);
