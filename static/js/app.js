/**
 * EduScribe - client application
 * Landing page hands off to /app?url=...&mode=notes|chat
 */

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */
const state = {
    currentVideoId: null,
    currentMetadata: null,
    previewUrl: null,
    currentNote: null,
    flashcards: [],
    fcIndex: 0,
    quiz: [],
    quizAnswered: {},
    quizScore: 0,
    chatHistory: [],
    chatBusy: false,
    player: null,
    pendingVideoId: null,
    timer: null
};

const $ = (id) => document.getElementById(id);
const elements = {
    urlInput: $('youtube-url-input'),
    generateBtn: $('generate-btn'),
    chatBtn: $('chat-btn'),
    previewCard: $('preview-card'),
    styleSelect: $('note-style-select'),
    workspaceSection: $('workspace-section'),
    heroSection: $('hero-section'),
    historyList: $('history-list')
};

const TAB_IDS = ['notes', 'flashcards', 'quiz', 'mindmap', 'chat'];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
function icon(name, cls = '') {
    return `<svg class="icon ${cls}"><use href="#i-${name}"/></svg>`;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function parseTimestampToSeconds(str) {
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

function formatElapsed(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function copyText(text, btn) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        ta.remove();
    }
    if (btn) {
        const original = btn.innerHTML;
        btn.innerHTML = `${icon('check', 'icon-sm')} Copied`;
        setTimeout(() => { btn.innerHTML = original; }, 1600);
    }
}

async function postJSON(url, body) {
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    let data = {};
    try { data = await resp.json(); } catch (e) {}
    return data;
}

/* ------------------------------------------------------------------ *
 * Theme & sidebar
 * ------------------------------------------------------------------ */
function toggleTheme() {
    const dark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('eduscribe_theme', dark ? 'dark' : 'light'); } catch (e) {}
}

function toggleSidebar() {
    $('sidebar').classList.toggle('-translate-x-full');
    $('sidebar-backdrop').classList.toggle('hidden');
}

function closeSidebarOnMobile() {
    const sb = $('sidebar');
    if (window.innerWidth < 1024 && !sb.classList.contains('-translate-x-full')) toggleSidebar();
}

/* ------------------------------------------------------------------ *
 * YouTube player
 * ------------------------------------------------------------------ */
function initYouTubeAPI() {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function () {
    if (state.pendingVideoId) loadYouTubePlayer(state.pendingVideoId);
};

function loadYouTubePlayer(videoId) {
    if (!(window.YT && window.YT.Player)) {
        state.pendingVideoId = videoId;
        return;
    }
    state.pendingVideoId = null;
    if (state.player && typeof state.player.loadVideoById === 'function') {
        try { state.player.loadVideoById(videoId); return; } catch (e) { /* recreate below */ }
    }
    state.player = new YT.Player('youtube-player-container', {
        height: '100%', width: '100%', videoId,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 }
    });
}

function seekVideoTo(seconds) {
    if (state.player && typeof state.player.seekTo === 'function') {
        state.player.seekTo(seconds, true);
        state.player.playVideo();
        const el = $('player-wrapper');
        if (el && window.innerWidth < 1280) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/* ------------------------------------------------------------------ *
 * Rich text: timestamps, labelled blocks, math, code
 * ------------------------------------------------------------------ */
const TIME = '\\d{1,2}:\\d{2}(?::\\d{2})?';
// [05:42]  [05:42, 06:10]  [05:42 - 06:10]
const TS_RE = new RegExp('\\[(' + TIME + '(?:\\s*(?:,|;|-|\u2013|\u2014)\\s*' + TIME + ')*)\\]', 'g');
const TIME_RE = new RegExp(TIME, 'g');

function makeTsChip(label, seconds) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ts';
    btn.title = `Jump video to ${label}`;
    btn.innerHTML = `<svg><use href="#i-play"/></svg>${escapeHtml(label)}`;
    btn.addEventListener('click', () => seekVideoTo(seconds));
    return btn;
}

/** Replace [MM:SS] text with clickable chips (skips code blocks). */
function linkTimestamps(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.nodeValue || node.nodeValue.indexOf('[') === -1) return NodeFilter.FILTER_REJECT;
            if (node.parentElement && node.parentElement.closest('pre, code, button')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    const targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);

    targets.forEach((node) => {
        const text = node.nodeValue;
        TS_RE.lastIndex = 0;
        if (!TS_RE.test(text)) return;
        TS_RE.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0, m;
        while ((m = TS_RE.exec(text)) !== null) {
            if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
            const inner = m[1];
            const times = inner.match(TIME_RE) || [];
            const isRange = /[-\u2013\u2014]/.test(inner);
            if (isRange || times.length === 1) {
                frag.appendChild(makeTsChip(isRange ? times.join(' - ') : times[0], parseTimestampToSeconds(times[0])));
            } else {
                times.forEach((t, i) => {
                    if (i) frag.appendChild(document.createTextNode(' '));
                    frag.appendChild(makeTsChip(t, parseTimestampToSeconds(t)));
                });
            }
            last = m.index + m[0].length;
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
    });
}

/** Turn "<p><strong>Definition:</strong> ..." into styled blocks. */
function decorateLabels(root) {
    root.querySelectorAll('p').forEach((p) => {
        const first = p.firstElementChild;
        if (!first || first.tagName !== 'STRONG') return;
        if (p.firstChild !== first && (p.firstChild.nodeType !== 3 || p.firstChild.nodeValue.trim())) return;
        const label = first.textContent.trim().replace(/:$/, '').toLowerCase();
        let kind = null;
        if (label === 'definition') kind = 'lab-definition';
        else if (/^example(\s*\d+)?$/.test(label)) kind = 'lab-example';
        else if (/^(common mistakes?|mistakes?|warning|pitfall|watch out)$/.test(label)) kind = 'lab-warn';
        else if (/^key points?$/.test(label)) kind = 'lab-keypoints';
        else if (/^(explanation|why it works|formula|general knowledge|answer|summary|intuition|note|tip)$/.test(label)) kind = 'lab-plain';
        if (kind) p.classList.add('lab', kind);
    });
}

function renderMath(root) {
    if (!window.renderMathInElement) return;
    try {
        renderMathInElement(root, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '\\[', right: '\\]', display: true },
                { left: '\\(', right: '\\)', display: false },
                { left: '$', right: '$', display: false }
            ],
            throwOnError: false
        });
    } catch (e) { console.warn('KaTeX error', e); }
}

function highlightCode(root) {
    if (window.Prism) { try { Prism.highlightAllUnder(root); } catch (e) {} }
}

/** Wrap <pre><code> in a block with a language label and copy button. */
function enhanceCodeBlocks(root) {
    root.querySelectorAll('pre').forEach((pre) => {
        if (pre.parentElement && pre.parentElement.classList.contains('codeblock')) return;
        const code = pre.querySelector('code');
        const langClass = code ? [...code.classList].find((c) => c.startsWith('language-')) : null;
        const lang = langClass ? langClass.replace('language-', '') : 'code';
        const wrap = document.createElement('div');
        wrap.className = 'codeblock';
        const head = document.createElement('div');
        head.className = 'codeblock-head';
        head.innerHTML = `<span>${escapeHtml(lang)}</span>`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML = `${icon('copy', 'icon-sm')} Copy`;
        btn.addEventListener('click', () => copyText(code ? code.innerText : pre.innerText, btn));
        head.appendChild(btn);
        pre.parentNode.insertBefore(wrap, pre);
        wrap.appendChild(head);
        wrap.appendChild(pre);
    });
}

/** Markdown -> sanitized DOM content, protecting math from the markdown parser. */
function renderMarkdownInto(container, md) {
    const stash = [];
    const protect = (m) => { stash.push(m); return `@@MATH${stash.length - 1}@@`; };
    const safe = String(md || '')
        // Every labelled line starts its own paragraph so Definition / Example blocks stay separate
        .replace(/([^\n])\n(\*\*(?:Definition|Explanation|Example(?: \d+)?|Why it works|Key Points?|Formula|Common Mistakes?|General knowledge)\s*:\*\*)/gi, '$1\n\n$2')
        // A list needs a blank line before it, otherwise it folds into the previous paragraph
        .replace(/^(?![-*+]\s|\d+\.\s|\s)([^\n]+)\n(?=[-*+]\s)/gm, '$1\n\n')
        .replace(/\$\$[\s\S]+?\$\$/g, protect)
        .replace(/\\\[[\s\S]+?\\\]/g, protect)
        .replace(/\\\([\s\S]+?\\\)/g, protect)
        .replace(/(?<![\\$\w])\$(?!\s)[^$\n]+?(?<!\s)\$(?![\d$])/g, protect);

    let html = window.marked ? marked.parse(safe, { gfm: true, breaks: false }) : escapeHtml(safe);
    html = window.DOMPurify ? DOMPurify.sanitize(html) : escapeHtml(html);
    html = html.replace(/@@MATH(\d+)@@/g, (_, i) => escapeHtml(stash[Number(i)]));
    container.innerHTML = html;

    decorateLabels(container);
    renderMath(container);
    linkTimestamps(container);
    highlightCode(container);
    enhanceCodeBlocks(container);
}

/* ------------------------------------------------------------------ *
 * Init
 * ------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
    initYouTubeAPI();
    MindMap.init({ onSeek: seekVideoTo });
    initSelectionToolbar();
    initEventListeners();
    initHistorySearch();
    loadHistory();
    resetChat();
    handleLaunchParams();
});

function handleLaunchParams() {
    const params = new URLSearchParams(window.location.search);
    const url = (params.get('url') || '').trim();
    const mode = params.get('mode') || '';
    if (url) elements.urlInput.value = url;

    if (url && mode === 'chat') startChatMode(url);
    else if (url && mode === 'notes') startNotesGeneration(url);
    else if (url) handleUrlInput(url);

    if (!url && mode === 'chat') {
        showError('Paste a YouTube link below, then press Chat.', true);
        elements.urlInput.focus();
    }
    // Keep the address bar clean once handled
    if (window.history && window.history.replaceState && (url || mode)) {
        window.history.replaceState({}, '', '/app');
    }
}

function initEventListeners() {
    let debounce;
    elements.urlInput.addEventListener('input', (e) => {
        hideError();
        clearTimeout(debounce);
        debounce = setTimeout(() => handleUrlInput(e.target.value.trim()), 600);
    });
    elements.urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); elements.generateBtn.click(); }
    });

    elements.generateBtn.addEventListener('click', () => {
        hideError();
        const url = elements.urlInput.value.trim();
        if (!url) return showError('Paste a YouTube link first.');
        startNotesGeneration(url);
    });
    elements.chatBtn.addEventListener('click', () => {
        hideError();
        const url = elements.urlInput.value.trim();
        if (!url) return showError('Paste a YouTube link first.');
        startChatMode(url);
    });

    document.querySelectorAll('.sample-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
            hideError();
            const u = btn.getAttribute('data-url');
            elements.urlInput.value = u;
            handleUrlInput(u);
        });
    });

    // Flashcard keyboard controls
    document.addEventListener('keydown', (e) => {
        const pane = $('tab-pane-flashcards');
        if (!pane || pane.classList.contains('hidden')) return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); flipFlashcard(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); prevFlashcard(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); nextFlashcard(); }
        else if (e.key === 'k' || e.key === 'K') { markFlashcard(true); }
        else if (e.key === 'j' || e.key === 'J') { markFlashcard(false); }
    });

    // Chat form
    const chatInput = $('chat-input');
    $('chat-form').addEventListener('submit', (e) => { e.preventDefault(); sendChatMessage(); });
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
    });

    $('mm-rebuild').addEventListener('click', () => ensureMindmap(true));
    $('quiz-count-home').addEventListener('change', (e) => { $('quiz-count-select').value = e.target.value; });
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */
function showError(msg, soft = false) {
    const banner = $('error-banner');
    $('error-message').textContent = msg;
    banner.classList.remove('hidden');
    banner.classList.add('flex');
    if (!elements.heroSection.classList.contains('hidden')) banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
    const banner = $('error-banner');
    banner.classList.add('hidden');
    banner.classList.remove('flex');
}

/* ------------------------------------------------------------------ *
 * Video preview / extraction
 * ------------------------------------------------------------------ */
async function handleUrlInput(url) {
    if (!url) { elements.previewCard.classList.add('hidden'); return; }
    try {
        const data = await postJSON('/api/extract', { url });
        if (data.success) {
            state.previewUrl = url;
            state.currentVideoId = data.video_id;
            state.currentMetadata = data.metadata;

            $('preview-thumb').src = data.metadata.thumbnail_url;
            $('preview-title').textContent = data.metadata.title;
            $('preview-channel').textContent = data.metadata.author_name;
            $('preview-duration').textContent = data.duration_formatted;
            $('preview-words').textContent = `${data.word_count.toLocaleString()} words, about ${data.estimated_read_time_mins} min to read`;
            elements.previewCard.classList.remove('hidden');

            const cachedBtn = $('view-cached-btn');
            if (data.has_cached_notes) {
                cachedBtn.classList.remove('hidden');
                cachedBtn.onclick = () => loadNoteById(data.cached_note_id);
            } else {
                cachedBtn.classList.add('hidden');
            }
        } else {
            elements.previewCard.classList.add('hidden');
            state.previewUrl = null;
            if (data.can_paste_transcript) $('custom-transcript-wrapper').classList.remove('hidden');
        }
    } catch (e) {
        console.error('Preview error:', e);
    }
}

/** Ensure state has a video id for this URL; returns data or throws. */
async function ensureVideo(url) {
    if (state.currentVideoId && state.previewUrl === url) return;
    const data = await postJSON('/api/extract', { url });
    if (!data.success) {
        if (data.can_paste_transcript) $('custom-transcript-wrapper').classList.remove('hidden');
        throw new Error(data.error || 'Could not read this video. You can paste the transcript instead.');
    }
    state.previewUrl = url;
    state.currentVideoId = data.video_id;
    state.currentMetadata = data.metadata;
    state._lastExtract = data;
}

/* ------------------------------------------------------------------ *
 * Workspace shell
 * ------------------------------------------------------------------ */
function showWorkspace() {
    elements.workspaceSection.classList.remove('hidden');
    elements.heroSection.classList.add('hidden');
    window.scrollTo({ top: 0 });
    closeSidebarOnMobile();
}

function goHome() {
    elements.workspaceSection.classList.add('hidden');
    elements.heroSection.classList.remove('hidden');
    state.currentNote = null;
    markActiveHistory(null);
    window.scrollTo({ top: 0 });
    elements.urlInput.focus();
    closeSidebarOnMobile();
}

function setHeader({ title, channel, duration, videoId, noteId }) {
    $('workspace-title').textContent = title || 'Lecture';
    $('workspace-channel').textContent = channel || '';
    $('workspace-duration').textContent = duration || '';
    const hasVideo = videoId && videoId !== 'custom_lecture';
    $('player-wrapper').parentElement.classList.toggle('hidden', !hasVideo);
    if (hasVideo) loadYouTubePlayer(videoId);

    const hasNote = Boolean(noteId);
    ['copy-notes-btn', 'export-md-btn', 'print-btn'].forEach((id) => $(id).classList.toggle('hidden', !hasNote));
    if (hasNote) {
        $('export-md-btn').href = `/api/export/markdown/${noteId}`;
        $('print-btn').href = `/print/${noteId}`;
    }
}

function resetPanes() {
    $('notes-content-container').innerHTML = '';
    $('notes-status').classList.add('hidden');
    $('notes-empty').classList.add('hidden');
    renderFlashcards([]);
    renderQuiz([]);
    MindMap.clear();
    buildToc();
    resetChat();
}

/** Chat-first flow: open the workspace on the chat tab right after the transcript is fetched. */
async function startChatMode(url) {
    setBusy(true);
    try {
        await ensureVideo(url);
        const m = state.currentMetadata || {};
        state.currentNote = null;
        showWorkspace();
        resetPanes();
        setHeader({ title: m.title, channel: m.author_name, duration: state._lastExtract ? state._lastExtract.duration_formatted : '', videoId: state.currentVideoId, noteId: null });
        $('notes-empty').classList.remove('hidden');
        markActiveHistory(null);
        switchTab('chat');
        $('chat-input').focus({ preventScroll: true });
    } catch (err) {
        showError(err.message);
    } finally {
        setBusy(false);
    }
}

function setBusy(busy) {
    elements.generateBtn.disabled = busy;
    elements.chatBtn.disabled = busy;
}

/* ------------------------------------------------------------------ *
 * Notes generation
 * ------------------------------------------------------------------ */
function startNotesTimer() {
    const started = Date.now();
    const label = $('loading-step-text');
    clearInterval(state.timer);
    label.textContent = 'Generating notes. This takes a minute or two. 0:00';
    state.timer = setInterval(() => {
        label.textContent = `Generating notes. This takes a minute or two. ${formatElapsed(Date.now() - started)}`;
    }, 1000);
}

function stopNotesTimer() { clearInterval(state.timer); state.timer = null; }

async function startNotesGeneration(url, forceRefresh = false) {
    const customTranscript = ($('custom-transcript-input').value || '').trim();
    setBusy(true);
    hideError();

    try {
        if (!customTranscript) {
            if (!url) throw new Error('Paste a YouTube link first.');
            await ensureVideo(url);
        }
        const videoId = customTranscript ? 'custom_lecture' : state.currentVideoId;
        const meta = customTranscript ? { title: 'Pasted lecture', author_name: 'Custom transcript' } : (state.currentMetadata || {});

        state.currentNote = null;
        showWorkspace();
        resetPanes();
        setHeader({ title: meta.title, channel: meta.author_name, duration: state._lastExtract && !customTranscript ? state._lastExtract.duration_formatted : '', videoId, noteId: null });
        markActiveHistory(null);
        switchTab('notes');
        $('notes-status').classList.remove('hidden');
        startNotesTimer();

        const data = await postJSON('/api/generate-notes', {
            video_id: videoId,
            transcript_text: customTranscript,
            note_style: elements.styleSelect.value,
            quiz_count: Number($('quiz-count-home').value) || 10,
            force_refresh: forceRefresh
        });
        stopNotesTimer();
        $('notes-status').classList.add('hidden');

        if (!data.success) throw new Error(data.error || 'Could not generate notes.');
        displayGeneratedNotes(data.data, { keepTab: true });
        loadHistory();
    } catch (err) {
        stopNotesTimer();
        $('notes-status').classList.add('hidden');
        if (elements.workspaceSection.classList.contains('hidden')) {
            showError(err.message);
        } else {
            const box = $('notes-empty');
            box.classList.remove('hidden');
            box.firstChild.textContent = err.message + ' ';
        }
    } finally {
        setBusy(false);
    }
}

function generateFromWorkspace() {
    const url = state.currentVideoId ? `https://www.youtube.com/watch?v=${state.currentVideoId}` : '';
    startNotesGeneration(url);
}

/* ------------------------------------------------------------------ *
 * Display a saved/generated note
 * ------------------------------------------------------------------ */
function displayGeneratedNotes(note, opts = {}) {
    state.currentNote = note;
    state.currentVideoId = note.video_id !== 'custom_lecture' ? note.video_id : state.currentVideoId;

    showWorkspace();
    setHeader({ title: note.title, channel: note.channel, duration: note.duration_formatted, videoId: note.video_id, noteId: note.id });
    $('notes-status').classList.add('hidden');
    $('notes-empty').classList.add('hidden');

    const container = $('notes-content-container');
    container.innerHTML = note.notes_html || '';
    decorateLabels(container);
    renderMath(container);
    linkTimestamps(container);
    highlightCode(container);

    renderFlashcards(note.flashcards || []);
    renderQuiz(note.quiz || []);
    buildToc();
    if ($('tab-pane-mindmap') && !$('tab-pane-mindmap').classList.contains('hidden')) ensureMindmap();
    if ($('quiz-count-select')) {
        const n = String((note.quiz || []).length || 10);
        const sel = $('quiz-count-select');
        if ([...sel.options].some((o) => o.value === n)) sel.value = n;
    }

    if (!opts.keepChat) resetChat();
    markActiveHistory(note.id);
    if (!opts.keepTab) switchTab('notes');
}

async function loadNoteById(noteId) {
    try {
        const resp = await fetch(`/api/notes/${noteId}`);
        const data = await resp.json();
        if (data.success) {
            displayGeneratedNotes(data.data);
        } else {
            showError(data.error || 'Could not load this note.');
        }
    } catch (e) {
        showError('Could not load this note.');
    }
}

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */
function switchTab(tabId) {
    TAB_IDS.forEach((t) => {
        const pane = $(`tab-pane-${t}`);
        const btn = $(`tab-btn-${t}`);
        if (pane) pane.classList.toggle('hidden', t !== tabId);
        if (btn) btn.setAttribute('aria-selected', t === tabId ? 'true' : 'false');
    });
    if (tabId === 'mindmap') ensureMindmap();
    $('toc-card').classList.toggle('xl:block', tabId === 'notes');
    $('toc-card').classList.toggle('hidden', tabId !== 'notes' || !$('toc-list').children.length);
    document.body.classList.toggle('chat-open', tabId === 'chat');
    if (tabId === 'chat') { window.scrollTo({ top: 0 }); scrollChatToBottom(); }
    hideSelectionToolbar();
}

/* ------------------------------------------------------------------ *
 * Flashcards (with remembered progress)
 * ------------------------------------------------------------------ */
function fcStorageKey() {
    const n = state.currentNote;
    return 'eduscribe:fc:' + (n ? n.id : state.currentVideoId || 'none');
}
function loadFcProgress() {
    try { return JSON.parse(localStorage.getItem(fcStorageKey()) || '{}'); } catch (e) { return {}; }
}
function saveFcProgress() {
    try { localStorage.setItem(fcStorageKey(), JSON.stringify(state.fcKnown)); } catch (e) {}
}

function renderFlashcards(cards) {
    state.fcAll = (cards || []).filter((c) => c && c.question && c.answer);
    state.fcKnown = loadFcProgress();
    state.fcReviewOnly = false;
    applyFlashcardFilter(true);
}

function applyFlashcardFilter(resetIndex) {
    const known = state.fcKnown || {};
    state.flashcards = state.fcReviewOnly ? state.fcAll.filter((c) => !known[c.question]) : state.fcAll.slice();
    if (resetIndex) state.fcIndex = 0;
    state.fcIndex = Math.min(state.fcIndex, Math.max(0, state.flashcards.length - 1));

    const hasAny = state.fcAll.length > 0;
    $('flashcard-area').classList.toggle('hidden', !hasAny);
    $('flashcard-empty').classList.toggle('hidden', hasAny);
    const toggle = $('fc-review-toggle');
    toggle.setAttribute('aria-pressed', String(state.fcReviewOnly));
    toggle.classList.toggle('btn-outline', state.fcReviewOnly);
    if (hasAny) showFlashcard(false);
}

function showFlashcard(animate = true) {
    const total = state.flashcards.length;
    const knownCount = state.fcAll.filter((c) => (state.fcKnown || {})[c.question]).length;
    $('fc-known').textContent = `${knownCount} known`;

    if (!total) {
        // Review-only filter with nothing left: everything is known
        $('fc-question').textContent = 'All cards marked as known.';
        $('fc-answer').textContent = 'Use Reset to start over.';
        $('flashcard-counter').textContent = '0 / 0';
        $('fc-progress-bar').style.width = '100%';
        $('fc-prev').disabled = true; $('fc-next').disabled = true;
        $('flashcard-inner').classList.remove('rotate-y-180');
        return;
    }

    const card = state.flashcards[state.fcIndex];
    const inner = $('flashcard-inner');
    const wasFlipped = inner.classList.contains('rotate-y-180');
    inner.classList.remove('rotate-y-180');
    const apply = () => {
        $('fc-question').textContent = card.question;
        $('fc-answer').textContent = card.answer;
    };
    // Wait for the flip-back so the next answer is never visible mid-turn
    if (animate && wasFlipped) setTimeout(apply, 220); else apply();

    $('flashcard-counter').textContent = `${state.fcIndex + 1} / ${total}`;
    $('fc-progress-bar').style.width = `${((state.fcIndex + 1) / total) * 100}%`;
    $('fc-prev').disabled = state.fcIndex === 0;
    $('fc-next').disabled = state.fcIndex === total - 1;
}

function flipFlashcard() { if (state.flashcards.length) $('flashcard-inner').classList.toggle('rotate-y-180'); }
function nextFlashcard() { if (state.fcIndex < state.flashcards.length - 1) { state.fcIndex++; showFlashcard(); } }
function prevFlashcard() { if (state.fcIndex > 0) { state.fcIndex--; showFlashcard(); } }

function markFlashcard(isKnown) {
    const card = state.flashcards[state.fcIndex];
    if (!card) return;
    if (isKnown) state.fcKnown[card.question] = 1; else delete state.fcKnown[card.question];
    saveFcProgress();
    if (state.fcReviewOnly && isKnown) {
        // The card leaves the deck: stay on the same position, which is now the next card
        applyFlashcardFilter(false);
    } else if (state.fcIndex < state.flashcards.length - 1) {
        state.fcIndex++;
        showFlashcard();
    } else {
        showFlashcard(false);
    }
}

function toggleReviewOnly() { state.fcReviewOnly = !state.fcReviewOnly; applyFlashcardFilter(true); }

function resetFlashcardProgress() {
    state.fcKnown = {};
    saveFcProgress();
    applyFlashcardFilter(true);
}

function shuffleFlashcards() {
    const a = state.fcAll;
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    applyFlashcardFilter(true);
}

/* ------------------------------------------------------------------ *
 * Quiz
 * ------------------------------------------------------------------ */
function renderQuiz(quiz) {
    state.quiz = quiz || [];
    state.quizAnswered = {};
    state.quizScore = 0;
    $('quiz-summary').classList.add('hidden');
    $('retake-quiz-btn').classList.add('hidden');

    const list = $('quiz-questions-list');
    if (!state.quiz.length) {
        list.innerHTML = `<p class="py-10 text-center text-[14px] text-muted">No quiz yet. Choose a number of questions and press Regenerate.</p>`;
        updateQuizScore();
        $('regen-quiz-btn').disabled = !state.currentNote;
        return;
    }
    $('regen-quiz-btn').disabled = !state.currentNote;

    list.innerHTML = state.quiz.map((q, qi) => `
        <div class="q-card" id="quiz-card-${qi}">
            <div class="q-num">${String(qi + 1).padStart(2, '0')} / ${String(state.quiz.length).padStart(2, '0')}</div>
            <p class="mt-2 mb-4 font-medium leading-snug">${escapeHtml(q.question)}</p>
            <div class="space-y-2">
                ${q.options.map((opt, oi) => `
                    <button type="button" class="opt" data-q="${qi}" data-o="${oi}">
                        <span class="letter">${'ABCDEFGH'[oi]}</span>
                        <span>${escapeHtml(opt)}</span>
                    </button>`).join('')}
            </div>
            <div class="explain hidden"></div>
        </div>`).join('');

    list.querySelectorAll('.opt').forEach((btn) => {
        btn.addEventListener('click', () => answerQuiz(Number(btn.dataset.q), Number(btn.dataset.o)));
    });
    updateQuizScore();
}

function answerQuiz(qi, oi) {
    if (state.quizAnswered[qi] !== undefined) return;
    const q = state.quiz[qi];
    state.quizAnswered[qi] = oi;
    const correct = oi === q.correct_answer;
    if (correct) state.quizScore++;

    const card = $(`quiz-card-${qi}`);
    card.querySelectorAll('.opt').forEach((b) => {
        const idx = Number(b.dataset.o);
        b.disabled = true;
        if (idx === q.correct_answer) b.classList.add('is-correct');
        else if (idx === oi) b.classList.add('is-wrong');
        else b.classList.add('is-dim');
    });
    const ex = card.querySelector('.explain');
    ex.classList.remove('hidden');
    ex.classList.add(correct ? 'good' : 'bad');
    ex.innerHTML = `<b class="font-medium" style="color:var(--ink)">${correct ? 'Correct.' : 'Not quite.'}</b> ${escapeHtml(q.explanation || '')}`;

    updateQuizScore();
    if (Object.keys(state.quizAnswered).length === state.quiz.length) showQuizSummary();
}

function updateQuizScore() {
    const answered = Object.keys(state.quizAnswered).length;
    $('quiz-score-badge').textContent = state.quiz.length
        ? `${state.quizScore} correct, ${answered} of ${state.quiz.length} answered`
        : '';
}

function showQuizSummary() {
    const total = state.quiz.length;
    const pct = Math.round((state.quizScore / total) * 100);
    const box = $('quiz-summary');
    box.classList.remove('hidden');
    box.innerHTML = `
        <div class="eyebrow">Result</div>
        <div class="mt-1 text-[28px] font-semibold tracking-tight">${state.quizScore} / ${total} <span class="text-[15px] font-normal text-muted">${pct}%</span></div>
        <p class="mt-1 text-[13px] text-muted">${pct >= 80 ? 'Strong grasp of the material.' : pct >= 50 ? 'Decent. Review the topics you missed.' : 'Worth re-reading the notes, then try again.'}</p>`;
    $('retake-quiz-btn').classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function retakeQuiz() { renderQuiz(state.quiz); window.scrollTo({ top: 0, behavior: 'smooth' }); }

async function regenerateQuiz() {
    if (!state.currentNote) return;
    const count = Number($('quiz-count-select').value) || 10;
    const btn = $('regen-quiz-btn');
    btn.disabled = true;
    $('quiz-loading').classList.remove('hidden');
    $('quiz-questions-list').classList.add('hidden');
    $('quiz-summary').classList.add('hidden');
    try {
        const data = await postJSON(`/api/notes/${state.currentNote.id}/quiz`, { count });
        if (!data.success) throw new Error(data.error || 'Could not generate the quiz.');
        state.currentNote.quiz = data.quiz;
        renderQuiz(data.quiz);
    } catch (e) {
        $('quiz-questions-list').innerHTML = `<p class="py-8 text-center text-[14px]" style="color:var(--bad)">${escapeHtml(e.message)}</p>`;
    } finally {
        $('quiz-loading').classList.add('hidden');
        $('quiz-questions-list').classList.remove('hidden');
        btn.disabled = false;
    }
}

/* ------------------------------------------------------------------ *
 * Concept map
 * ------------------------------------------------------------------ */
function setMapStatus(html) {
    const box = $('mm-status');
    if (!html) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.innerHTML = html;
    box.classList.remove('hidden');
}

async function ensureMindmap(force = false) {
    const note = state.currentNote;
    if (!note) {
        MindMap.clear();
        setMapStatus(`<span>The concept map is built from your notes.</span><button class="btn btn-sm" onclick="generateFromWorkspace()">Generate notes</button>`);
        return;
    }
    if (note.mindmap && !force) {
        setMapStatus('');
        MindMap.render(note.mindmap);
        return;
    }
    if (state.mapBusy) return;
    state.mapBusy = true;
    MindMap.clear();
    setMapStatus(`<div class="spinner"></div><span>Building the concept map...</span>`);
    try {
        const data = await postJSON(`/api/notes/${note.id}/mindmap`, {});
        if (!data.success) throw new Error(data.error || 'Could not build the map.');
        note.mindmap = data.mindmap;
        if (state.currentNote === note) { setMapStatus(''); MindMap.render(note.mindmap); }
    } catch (e) {
        setMapStatus(`<span style="color:var(--bad)">${escapeHtml(e.message)}</span><button class="btn btn-outline btn-sm" onclick="ensureMindmap(true)">Try again</button>`);
    } finally {
        state.mapBusy = false;
    }
}

/* ------------------------------------------------------------------ *
 * Chat
 * ------------------------------------------------------------------ */
const SUGGESTIONS = [
    'Summarize this lecture',
    'What are the key concepts?',
    'Give me examples of the main ideas',
    'What should I remember for an exam?'
];

function resetChat() {
    state.chatHistory = [];
    state.chatBusy = false;
    const box = $('chat-messages');
    box.innerHTML = `
        <div class="m-auto max-w-md w-full text-center" id="chat-empty">
            <h3 class="font-semibold tracking-tight">Ask about this lecture</h3>
            <p class="mt-1 text-[13px] text-muted">Answers cite timestamps. Click one to jump the video.</p>
            <div class="mt-5 grid gap-2 text-left">
                ${SUGGESTIONS.map((s) => `<button type="button" class="suggest" data-q="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}
            </div>
        </div>`;
    box.querySelectorAll('.suggest').forEach((b) => b.addEventListener('click', () => sendChatMessage(b.dataset.q)));
}

function scrollChatToBottom() {
    const box = $('chat-messages');
    box.scrollTop = box.scrollHeight;
}

function appendUserMessage(text, quote) {
    const empty = $('chat-empty');
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'msg-user';
    div.textContent = text;
    if (quote) {
        const q = document.createElement('div');
        q.className = 'text-[12px] mt-1.5 pl-2 border-l-2 border-line text-muted line-clamp-2';
        q.textContent = quote;
        div.appendChild(q);
    }
    $('chat-messages').appendChild(div);
    scrollChatToBottom();
}

function appendAssistantMessage(markdown) {
    const wrap = document.createElement('div');
    wrap.className = 'msg-ai';
    const body = document.createElement('div');
    body.className = 'notes';
    renderMarkdownInto(body, markdown);
    wrap.appendChild(body);

    const tools = document.createElement('div');
    tools.className = 'msg-tools';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn-ghost btn-sm';
    copy.innerHTML = `${icon('copy', 'icon-sm')} Copy`;
    copy.addEventListener('click', () => copyText(markdown, copy));
    tools.appendChild(copy);
    wrap.appendChild(tools);

    $('chat-messages').appendChild(wrap);
    scrollChatToBottom();
}

async function sendChatMessage(preset, display, quote) {
    if (state.chatBusy) return;
    const input = $('chat-input');
    const question = (preset || input.value).trim();
    if (!question) return;
    if (!state.currentVideoId && !state.currentNote) return;

    state.chatBusy = true;
    $('chat-send').disabled = true;
    input.value = '';
    input.style.height = 'auto';
    appendUserMessage(display || question, quote);

    const thinking = document.createElement('div');
    thinking.className = 'msg-ai';
    thinking.innerHTML = '<div class="typing" aria-label="Thinking"><i></i><i></i><i></i></div>';
    $('chat-messages').appendChild(thinking);
    scrollChatToBottom();

    try {
        const data = await postJSON('/api/chat', {
            video_id: (state.currentNote && state.currentNote.video_id) || state.currentVideoId,
            note_id: state.currentNote ? state.currentNote.id : null,
            question,
            history: state.chatHistory
        });
        thinking.remove();
        if (!data.success) throw new Error(data.error || 'Chat failed.');
        state.chatHistory.push({ role: 'user', content: question }, { role: 'assistant', content: data.answer });
        appendAssistantMessage(data.answer);
    } catch (e) {
        thinking.remove();
        const err = document.createElement('div');
        err.className = 'msg-ai text-[13px] flex items-center gap-2';
        err.style.color = 'var(--bad)';
        err.innerHTML = `${icon('alert')} <span>${escapeHtml(e.message)}</span>`;
        $('chat-messages').appendChild(err);
        scrollChatToBottom();
    } finally {
        state.chatBusy = false;
        $('chat-send').disabled = false;
        input.focus({ preventScroll: true });
    }
}

/* ------------------------------------------------------------------ *
 * Export helpers
 * ------------------------------------------------------------------ */
function copyNotesMarkdown() {
    if (!state.currentNote) return;
    copyText(state.currentNote.notes_markdown || '', $('copy-notes-btn'));
}

/* ------------------------------------------------------------------ *
 * Library (sidebar)
 * ------------------------------------------------------------------ */
function initHistorySearch() {
    const input = $('history-search-input');
    let t;
    input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => loadHistory(input.value.trim()), 250);
    });
}

function markActiveHistory(id) {
    document.querySelectorAll('.history-item').forEach((el) => {
        el.classList.toggle('active', id !== null && Number(el.dataset.id) === Number(id));
    });
}

async function deleteNoteById(noteId, event) {
    if (event) event.stopPropagation();
    if (!confirm('Delete this saved lecture?')) return;
    try {
        const resp = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.success) {
            if (state.currentNote && state.currentNote.id === noteId) goHome();
            loadHistory($('history-search-input').value.trim());
        } else {
            alert('Could not delete: ' + (data.error || 'server error'));
        }
    } catch (e) {
        alert('Could not delete: ' + e.message);
    }
}

async function loadHistory(searchQuery = '') {
    try {
        const url = searchQuery ? `/api/search?q=${encodeURIComponent(searchQuery)}` : '/api/history';
        const resp = await fetch(url);
        const data = await resp.json();
        if (!(data.success && elements.historyList)) return;

        $('saved-count-badge').textContent = data.notes.length ? String(data.notes.length) : '';
        if (!data.notes.length) {
            elements.historyList.innerHTML = `<p class="px-3 py-6 text-[13px] text-subtle text-center">${searchQuery ? 'No matches.' : 'Nothing saved yet.'}</p>`;
            return;
        }
        elements.historyList.innerHTML = data.notes.map((n) => `
            <div class="history-item" role="button" tabindex="0" data-id="${n.id}">
                <img src="${escapeHtml(n.thumbnail_url)}" alt="" class="w-11 h-8 object-cover rounded border border-line flex-shrink-0" loading="lazy" onerror="this.style.visibility='hidden'">
                <div class="min-w-0 flex-1">
                    <p class="text-[13px] font-medium truncate">${escapeHtml(n.title)}</p>
                    <p class="text-[11.5px] text-subtle truncate">${escapeHtml(n.channel)}</p>
                </div>
                <button type="button" class="del btn btn-ghost btn-icon !w-7 !h-7" title="Delete" aria-label="Delete saved lecture">${icon('trash', 'icon-sm')}</button>
            </div>`).join('');

        elements.historyList.querySelectorAll('.history-item').forEach((el) => {
            const id = Number(el.dataset.id);
            el.addEventListener('click', () => loadNoteById(id));
            el.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadNoteById(id); });
            el.querySelector('.del').addEventListener('click', (e) => deleteNoteById(id, e));
        });
        markActiveHistory(state.currentNote ? state.currentNote.id : null);
    } catch (e) {
        console.error('History error:', e);
    }
}


/* ------------------------------------------------------------------ *
 * Contents list with scroll-spy
 * ------------------------------------------------------------------ */
let tocObserver = null;

function buildToc() {
    const list = $('toc-list');
    const card = $('toc-card');
    if (tocObserver) { tocObserver.disconnect(); tocObserver = null; }
    list.innerHTML = '';
    const headings = [...$('notes-content-container').querySelectorAll('h2, h3')];
    if (headings.length < 3) { card.classList.add('hidden'); return; }

    const links = new Map();
    headings.forEach((h, i) => {
        h.id = `sec-${i}`;
        const label = h.textContent.replace(/\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*$/, '').trim();
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#sec-${i}`;
        a.textContent = label;
        a.className = h.tagName === 'H2' ? 'sec' : 'sub';
        a.addEventListener('click', (e) => {
            e.preventDefault();
            h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        li.appendChild(a);
        list.appendChild(li);
        links.set(h, a);
    });
    if (!$('tab-pane-notes').classList.contains('hidden')) card.classList.remove('hidden');

    tocObserver = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
            if (en.isIntersecting) {
                links.forEach((a) => a.classList.remove('active'));
                const a = links.get(en.target);
                if (a) { a.classList.add('active'); a.scrollIntoView({ block: 'nearest' }); }
            }
        });
    }, { rootMargin: '-10% 0px -80% 0px' });
    headings.forEach((h) => tocObserver.observe(h));
}

/* ------------------------------------------------------------------ *
 * Select text anywhere in the notes or chat: ask, simplify, quiz, copy
 * ------------------------------------------------------------------ */
let selectedText = '';

function hideSelectionToolbar() { const p = $('sel-pop'); if (p) p.classList.add('hidden'); }

function initSelectionToolbar() {
    const pop = $('sel-pop');
    const check = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return hideSelectionToolbar();
        const text = sel.toString().trim();
        const node = sel.anchorNode && (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode);
        if (text.length < 4 || !node || !node.closest('.notes')) return hideSelectionToolbar();
        selectedText = text.slice(0, 700);
        const r = sel.getRangeAt(0).getBoundingClientRect();
        pop.classList.remove('hidden');
        const w = pop.offsetWidth, h = pop.offsetHeight;
        let left = r.left + r.width / 2 - w / 2;
        left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
        let top = r.top - h - 10;
        if (top < 8) top = r.bottom + 10;
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';
    };
    document.addEventListener('mouseup', () => setTimeout(check, 10));
    document.addEventListener('keyup', (e) => { if (e.shiftKey || e.key.startsWith('Arrow')) setTimeout(check, 10); });
    document.addEventListener('touchend', () => setTimeout(check, 300));
    document.addEventListener('mousedown', (e) => { if (!pop.contains(e.target)) hideSelectionToolbar(); });
    window.addEventListener('scroll', hideSelectionToolbar, { passive: true });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideSelectionToolbar(); });

    pop.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection alive
    pop.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
            const act = btn.dataset.act;
            const text = selectedText;
            hideSelectionToolbar();
            if (act === 'copy') return copyText(text, null);
            if (!state.currentVideoId && !state.currentNote) return;
            const prompts = {
                ask: `Explain this part of the lecture in more depth. Give a definition and an example.\n\n"${text}"`,
                simplify: `Explain this in very simple words, as if I am new to the topic. Use one everyday analogy.\n\n"${text}"`,
                quiz: `Quiz me on this. Ask 3 short questions one at a time, starting with the first, and wait for my answer.\n\n"${text}"`
            };
            switchTab('chat');
            window.getSelection().removeAllRanges();
            const titles = { ask: 'Explain this in more depth', simplify: 'Explain this simply', quiz: 'Quiz me on this' };
            sendChatMessage(prompts[act], titles[act], text);
        });
    });
}
