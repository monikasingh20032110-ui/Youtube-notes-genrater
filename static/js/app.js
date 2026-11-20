/**
 * EduScribe AI - Interactive Client-Side Application
 */

// Application State
const state = {
    currentVideoId: null,
    currentMetadata: null,
    currentNote: null,
    currentFlashcardIndex: 0,
    player: null,
    isPlayerReady: false,
    quizScore: 0,
    answeredQuestions: {},
    chatHistory: [],
    apiKey: '',
    apiProvider: ''
};

// Clear any old stored client keys so server .env key is used directly
try {
    localStorage.removeItem('eduscribe_api_key');
    localStorage.removeItem('eduscribe_api_provider');
} catch (e) {}

// DOM Elements
const elements = {
    urlInput: document.getElementById('youtube-url-input'),
    generateBtn: document.getElementById('generate-btn'),
    previewCard: document.getElementById('preview-card'),
    previewThumb: document.getElementById('preview-thumb'),
    previewTitle: document.getElementById('preview-title'),
    previewChannel: document.getElementById('preview-channel'),
    previewDuration: document.getElementById('preview-duration'),
    previewWords: document.getElementById('preview-words'),
    styleSelect: document.getElementById('note-style-select'),
    loadingSection: document.getElementById('loading-section'),
    loadingStepText: document.getElementById('loading-step-text'),
    workspaceSection: document.getElementById('workspace-section'),
    heroSection: document.getElementById('hero-section'),
    historyList: document.getElementById('history-list')
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initSettings();
    initEventListeners();
    initYouTubeAPI();
    initHistorySearch();
    loadHistory();
});

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('eduscribe_theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('eduscribe_theme', isDark ? 'dark' : 'light');
    if (state.currentNote && state.currentNote.mindmap_mermaid) {
        renderMindmap(state.currentNote.mindmap_mermaid);
    }
}

// Settings
function initSettings() {}
function updateApiKeyBadge() {}
function openApiKeyModal() {}
function closeApiKeyModal() {}
function saveApiKey() {}

// Security Helper: Escape HTML to prevent DOM XSS
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// YouTube Player API
function initYouTubeAPI() {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

window.onYouTubeIframeAPIReady = function() {
    state.isPlayerReady = true;
};

function loadYouTubePlayer(videoId) {
    if (window.YT && window.YT.Player) {
        if (state.player) {
            try {
                state.player.loadVideoById(videoId);
                return;
            } catch (e) {
                console.warn(e);
            }
        }
        state.player = new YT.Player('youtube-player-container', {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: {
                'playsinline': 1,
                'rel': 0,
                'modestbranding': 1
            }
        });
    }
}

function seekVideoTo(seconds) {
    if (state.player && typeof state.player.seekTo === 'function') {
        state.player.seekTo(seconds, true);
        state.player.playVideo();
        // Scroll player into view smoothly if on mobile
        const playerEl = document.getElementById('player-wrapper');
        if (playerEl && window.innerWidth < 1024) {
            playerEl.scrollIntoView({ behavior: 'smooth' });
        }
    }
}

function showError(msg) {
    const banner = document.getElementById('error-banner');
    const text = document.getElementById('error-message');
    if (banner && text) {
        text.textContent = msg;
        banner.classList.remove('hidden');
        banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        alert(msg);
    }
}

function hideError() {
    const banner = document.getElementById('error-banner');
    if (banner) banner.classList.add('hidden');
}

// Event Listeners
function initEventListeners() {
    let debounceTimer;
    elements.urlInput.addEventListener('input', (e) => {
        hideError();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            handleUrlInput(e.target.value.trim());
        }, 500);
    });

    elements.generateBtn.addEventListener('click', () => {
        hideError();
        const url = elements.urlInput.value.trim();
        if (url) {
            startNotesGeneration(url);
        } else {
            showError("Please paste a valid YouTube video URL!");
        }
    });

    // Sample video pill clicks
    document.querySelectorAll('.sample-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            hideError();
            const sampleUrl = btn.getAttribute('data-url');
            elements.urlInput.value = sampleUrl;
            handleUrlInput(sampleUrl);
        });
    });

    // Keyboard Navigation for 3D Flashcards (P1-UI-02)
    document.addEventListener('keydown', (e) => {
        const flashcardPane = document.getElementById('tab-pane-flashcards');
        if (!flashcardPane || flashcardPane.classList.contains('hidden')) return;
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        if (e.code === 'Space' || e.key === 'Enter') {
            e.preventDefault();
            flipFlashcard();
        } else if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
            e.preventDefault();
            prevFlashcard();
        } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
            e.preventDefault();
            nextFlashcard();
        }
    });
}

// URL Input Handling & Metadata Preview
async function handleUrlInput(url) {
    if (!url) {
        elements.previewCard.classList.add('hidden');
        return;
    }

    try {
        const resp = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });
        const data = await resp.json();

        if (data.success) {
            state.currentVideoId = data.video_id;
            state.currentMetadata = data.metadata;

            elements.previewThumb.src = data.metadata.thumbnail_url;
            elements.previewTitle.textContent = data.metadata.title;
            elements.previewChannel.textContent = data.metadata.author_name;
            elements.previewDuration.textContent = `⏱️ ${data.duration_formatted}`;
            elements.previewWords.textContent = `📖 ~${data.word_count.toLocaleString()} words (${data.estimated_read_time_mins} min read)`;

            elements.previewCard.classList.remove('hidden');

            const cachedBtn = document.getElementById('view-cached-btn');
            if (data.has_cached_notes && cachedBtn) {
                cachedBtn.classList.remove('hidden');
                cachedBtn.onclick = () => loadNoteById(data.cached_note_id);
            } else if (cachedBtn) {
                cachedBtn.classList.add('hidden');
            }
        } else {
            elements.previewCard.classList.add('hidden');
            if (data.can_paste_transcript) {
                const wrapper = document.getElementById('custom-transcript-wrapper');
                if (wrapper) {
                    wrapper.classList.remove('hidden');
                }
            }
        }
    } catch (e) {
        console.error("Preview error:", e);
    }
}

// Notes Generation
async function startNotesGeneration(url, forceRefresh = false) {
    const customTranscriptEl = document.getElementById('custom-transcript-input');
    const customTranscript = customTranscriptEl ? customTranscriptEl.value.trim() : '';

    elements.loadingSection.classList.remove('hidden');
    elements.loadingStepText.textContent = "Step 1/4: Analyzing lecture audio captions & key timestamps...";
    elements.generateBtn.disabled = true;

    // Animated pipeline progress indicators
    const progressStages = [
        "Step 1/4: Analyzing lecture audio captions & key timestamps...",
        "Step 2/4: Synthesizing textbook-grade notes & LaTeX equations...",
        "Step 3/4: Formulating 3D recall flashcards & comprehension quiz...",
        "Step 4/4: Constructing visual Mermaid topic mindmap...",
        "Finalizing: Saving notes to database & preparing study suite..."
    ];
    let stageIdx = 0;
    const progressInterval = setInterval(() => {
        stageIdx = (stageIdx + 1) % progressStages.length;
        if (elements.loadingStepText) {
            elements.loadingStepText.textContent = progressStages[stageIdx];
        }
    }, 2800);

    try {
        // Step 1: Ensure extract & video ID
        let videoId = state.currentVideoId;
        if (!videoId && url) {
            const extResp = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });
            const extData = await extResp.json();
            if (extData.success) {
                videoId = extData.video_id;
                state.currentVideoId = videoId;
                state.currentMetadata = extData.metadata;
            } else if (!customTranscript) {
                // If YouTube blocked captions, reveal the custom transcript paste box
                const wrapper = document.getElementById('custom-transcript-wrapper');
                if (wrapper) wrapper.classList.remove('hidden');
                clearInterval(progressInterval);
                throw new Error(extData.error || "Could not retrieve YouTube captions. You can paste the transcript text directly in the box below!");
            }
        }

        const noteStyle = elements.styleSelect ? elements.styleSelect.value : 'comprehensive';

        const genResp = await fetch('/api/generate-notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id: videoId || 'custom_lecture',
                transcript_text: customTranscript,
                note_style: noteStyle,
                api_key: state.apiKey,
                provider: state.apiProvider,
                force_refresh: forceRefresh
            })
        });

        const genData = await genResp.json();
        clearInterval(progressInterval);

        if (!genData.success) {
            if (genData.can_paste_transcript) {
                const wrapper = document.getElementById('custom-transcript-wrapper');
                if (wrapper) wrapper.classList.remove('hidden');
            }
            throw new Error(genData.error || "Could not generate notes.");
        }

        elements.loadingStepText.textContent = "Finalizing interactive study dashboard...";
        setTimeout(() => {
            elements.loadingSection.classList.add('hidden');
            elements.generateBtn.disabled = false;
            displayGeneratedNotes(genData.data);
            loadHistory();
        }, 400);

    } catch (err) {
        clearInterval(progressInterval);
        elements.loadingSection.classList.add('hidden');
        elements.generateBtn.disabled = false;
        showError(err.message);
        const wrapper = document.getElementById('custom-transcript-wrapper');
        if (wrapper) {
            wrapper.classList.remove('hidden');
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

// Display Generated Notes in Workspace
function displayGeneratedNotes(note) {
    state.currentNote = note;
    elements.workspaceSection.classList.remove('hidden');
    elements.workspaceSection.scrollIntoView({ behavior: 'smooth' });

    // Header info
    document.getElementById('workspace-title').textContent = note.title;
    document.getElementById('workspace-channel').textContent = note.channel;
    document.getElementById('workspace-duration').textContent = note.duration_formatted;
    document.getElementById('workspace-badge').textContent = (note.note_style || 'Comprehensive').toUpperCase();

    // Export links
    document.getElementById('export-md-btn').href = `/api/export/markdown/${note.id}`;
    document.getElementById('print-btn').href = `/print/${note.id}`;

    // Render HTML Notes with clickable timestamps
    const notesContainer = document.getElementById('notes-content-container');
    let formattedHtml = note.notes_html || '';

    // Replace timestamp patterns [MM:SS] or [HH:MM:SS] with interactive pills
    formattedHtml = formattedHtml.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (match, timeStr) => {
        const seconds = parseTimestampToSeconds(timeStr);
        return `<button class="timestamp-pill" onclick="seekVideoTo(${seconds})" title="Jump video to ${timeStr}">▶ ${timeStr}</button>`;
    });

    notesContainer.innerHTML = formattedHtml;

    // Render LaTeX Math Formulas if present (KaTeX)
    if (window.renderMathInElement) {
        try {
            renderMathInElement(notesContainer, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError: false
            });
        } catch (e) {
            console.warn("KaTeX render error:", e);
        }
    }

    // Code syntax highlighting (Prism.js)
    if (window.Prism) {
        try {
            Prism.highlightAllUnder(notesContainer);
        } catch (e) {
            console.warn("Prism render error:", e);
        }
    }

    // Load YouTube video player
    loadYouTubePlayer(note.video_id);

    // Render Flashcards
    renderFlashcards(note.flashcards || []);

    // Render Quiz
    renderQuiz(note.quiz || []);

    // Render Mindmap
    renderMindmap(note.mindmap_mermaid);

    // Reset Chat
    state.chatHistory = [];
    document.getElementById('chat-messages').innerHTML = `
        <div class="flex items-start gap-3 bg-indigo-50/50 dark:bg-indigo-950/20 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/40 text-sm">
            <span class="text-xl">🤖</span>
            <div>
                <p class="font-semibold text-indigo-950 dark:text-indigo-200">EduScribe Tutor Ready!</p>
                <p class="text-indigo-800/80 dark:text-indigo-300/80 mt-0.5">
                    Ask any question about this lecture! I will answer based on the instructor's exact words and timestamps.
                </p>
            </div>
        </div>
    `;

    // Activate default tab
    switchTab('notes');
}

// Convert "02:15" or "01:10:05" into total seconds
function parseTimestampToSeconds(str) {
    const parts = str.split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    return 0;
}

// Workspace Tab Navigation
function switchTab(tabId) {
    const tabs = ['notes', 'flashcards', 'quiz', 'mindmap', 'chat'];
    tabs.forEach(t => {
        const pane = document.getElementById(`tab-pane-${t}`);
        const btn = document.getElementById(`tab-btn-${t}`);
        if (pane) pane.classList.toggle('hidden', t !== tabId);
        if (btn) {
            if (t === tabId) {
                btn.className = "flex items-center gap-2 px-4 py-2.5 font-semibold text-sm rounded-lg bg-indigo-600 text-white shadow-sm transition";
            } else {
                btn.className = "flex items-center gap-2 px-4 py-2.5 font-medium text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition";
            }
        }
    });

    if (tabId === 'mindmap' && state.currentNote && state.currentNote.mindmap_mermaid) {
        renderMindmap(state.currentNote.mindmap_mermaid);
    }
}

// Flashcards
function renderFlashcards(flashcards) {
    state.currentFlashcardIndex = 0;
    const container = document.getElementById('flashcard-container');
    const emptyState = document.getElementById('flashcard-empty');
    const counter = document.getElementById('flashcard-counter');

    if (!flashcards || flashcards.length === 0) {
        if (container) container.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (container) container.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');
    updateFlashcardView();
}

function updateFlashcardView() {
    const flashcards = state.currentNote.flashcards || [];
    if (!flashcards.length) return;

    const fc = flashcards[state.currentFlashcardIndex];
    document.getElementById('fc-question').textContent = fc.question;
    document.getElementById('fc-answer').textContent = fc.answer;
    document.getElementById('flashcard-counter').textContent = `Card ${state.currentFlashcardIndex + 1} of ${flashcards.length}`;

    // Reset flip
    const cardInner = document.getElementById('flashcard-inner');
    if (cardInner) cardInner.classList.remove('rotate-y-180');
}

function flipFlashcard() {
    const cardInner = document.getElementById('flashcard-inner');
    if (cardInner) cardInner.classList.toggle('rotate-y-180');
}

function nextFlashcard() {
    const flashcards = state.currentNote.flashcards || [];
    if (state.currentFlashcardIndex < flashcards.length - 1) {
        state.currentFlashcardIndex++;
        updateFlashcardView();
    }
}

function prevFlashcard() {
    if (state.currentFlashcardIndex > 0) {
        state.currentFlashcardIndex--;
        updateFlashcardView();
    }
}

// Interactive Quiz
function renderQuiz(quizItems) {
    const quizContainer = document.getElementById('quiz-questions-list');
    state.quizScore = 0;
    state.answeredQuestions = {};

    if (!quizItems || quizItems.length === 0) {
        quizContainer.innerHTML = `<p class="text-gray-500 text-sm py-4">No quiz generated for this video.</p>`;
        return;
    }

    let html = '';
    quizItems.forEach((q, qIdx) => {
        html += `
            <div class="p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm" id="quiz-card-${qIdx}">
                <p class="font-semibold text-gray-900 dark:text-gray-100 mb-3 text-base">
                    ${qIdx + 1}. ${q.question}
                </p>
                <div class="space-y-2">
                    ${q.options.map((opt, optIdx) => `
                        <button class="quiz-option-btn w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-sm transition flex items-center justify-between"
                                onclick="selectQuizOption(${qIdx}, ${optIdx}, ${q.correct_answer})">
                            <span>${opt}</span>
                            <span class="quiz-status-icon text-lg"></span>
                        </button>
                    `).join('')}
                </div>
                <div class="explanation-box hidden mt-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 border-l-4">
                    <strong>Explanation:</strong> ${q.explanation}
                </div>
            </div>
        `;
    });

    quizContainer.innerHTML = html;
    updateQuizScoreDisplay();
}

function selectQuizOption(questionIdx, selectedIdx, correctIdx) {
    if (state.answeredQuestions[questionIdx] !== undefined) return; // Prevent re-answering

    state.answeredQuestions[questionIdx] = selectedIdx;
    const card = document.getElementById(`quiz-card-${questionIdx}`);
    const buttons = card.querySelectorAll('.quiz-option-btn');
    const explanation = card.querySelector('.explanation-box');

    buttons.forEach((btn, idx) => {
        btn.disabled = true;
        if (idx === correctIdx) {
            btn.classList.add('bg-emerald-50', 'dark:bg-emerald-950/40', 'border-emerald-500', 'text-emerald-900', 'dark:text-emerald-200', 'font-medium');
            btn.querySelector('.quiz-status-icon').textContent = '✓';
        } else if (idx === selectedIdx) {
            btn.classList.add('bg-rose-50', 'dark:bg-rose-950/40', 'border-rose-500', 'text-rose-900', 'dark:text-rose-200');
            btn.querySelector('.quiz-status-icon').textContent = '✗';
        }
    });

    if (selectedIdx === correctIdx) {
        state.quizScore++;
        if (explanation) explanation.classList.add('border-emerald-500');
    } else {
        if (explanation) explanation.classList.add('border-rose-500');
    }

    if (explanation) explanation.classList.remove('hidden');
    updateQuizScoreDisplay();

    // If all questions answered, reveal Retake Quiz button
    const totalQuestions = (state.currentNote && state.currentNote.quiz) ? state.currentNote.quiz.length : 0;
    if (Object.keys(state.answeredQuestions).length >= totalQuestions && totalQuestions > 0) {
        const retakeBtn = document.getElementById('retake-quiz-btn');
        if (retakeBtn) retakeBtn.classList.remove('hidden');
    }
}

function updateQuizScoreDisplay() {
    const scoreEl = document.getElementById('quiz-score-badge');
    const total = (state.currentNote && state.currentNote.quiz) ? state.currentNote.quiz.length : 0;
    if (scoreEl) {
        scoreEl.textContent = `Score: ${state.quizScore} / ${total}`;
    }
}

function retakeQuiz() {
    if (!state.currentNote || !state.currentNote.quiz) return;
    renderQuiz(state.currentNote.quiz);
    const retakeBtn = document.getElementById('retake-quiz-btn');
    if (retakeBtn) retakeBtn.classList.add('hidden');
}

// Mindmap (Mermaid v10 Modern API with Theme Support)
async function renderMindmap(mermaidCode) {
    const container = document.getElementById('mindmap-render-target');
    if (!mermaidCode || !mermaidCode.trim()) {
        container.innerHTML = `<div class="p-8 text-center text-gray-500">No concept mindmap available.</div>`;
        return;
    }

    const isDark = document.documentElement.classList.contains('dark');
    if (window.mermaid) {
        try {
            mermaid.initialize({
                startOnLoad: false,
                theme: isDark ? 'dark' : 'default',
                securityLevel: 'loose'
            });
            const renderId = 'mermaid-svg-' + Date.now();
            const { svg } = await mermaid.render(renderId, mermaidCode.trim());
            container.innerHTML = `<div class="w-full overflow-x-auto flex justify-center py-2">${svg}</div>`;
            return;
        } catch (e) {
            console.warn("Modern Mermaid render fallback:", e);
        }
    }

    container.innerHTML = `<pre class="text-xs p-4 bg-gray-100 dark:bg-gray-800 rounded text-gray-800 dark:text-gray-200 overflow-x-auto max-w-full">${escapeHtml(mermaidCode)}</pre>`;
}

// Chat with Lecture
async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const question = input.value.trim();
    if (!question || !state.currentNote) return;

    input.value = '';
    const chatContainer = document.getElementById('chat-messages');

    // Append user message (XSS safe)
    chatContainer.innerHTML += `
        <div class="flex items-start gap-3 justify-end text-sm">
            <div class="bg-indigo-600 text-white p-3 rounded-2xl rounded-tr-none max-w-[85%] shadow-sm">
                ${escapeHtml(question)}
            </div>
            <span class="text-xl">🧑‍🎓</span>
        </div>
    `;
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Append thinking placeholder
    const thinkingId = 'thinking-' + Date.now();
    chatContainer.innerHTML += `
        <div id="${thinkingId}" class="flex items-start gap-3 text-sm">
            <span class="text-xl">🤖</span>
            <div class="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 p-3 rounded-2xl rounded-tl-none animate-pulse">
                Thinking and referencing lecture timestamps...
            </div>
        </div>
    `;
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id: state.currentNote.video_id,
                question: question,
                api_key: state.apiKey,
                provider: state.apiProvider,
                history: state.chatHistory
            })
        });

        const data = await resp.json();
        const placeholder = document.getElementById(thinkingId);
        if (placeholder) placeholder.remove();

        if (data.success) {
            let answerHtml = data.answer.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (match, timeStr) => {
                const seconds = parseTimestampToSeconds(timeStr);
                return `<button class="timestamp-pill" onclick="seekVideoTo(${seconds})" title="Jump to ${timeStr}">▶ ${timeStr}</button>`;
            });

            chatContainer.innerHTML += `
                <div class="flex items-start gap-3 text-sm">
                    <span class="text-xl">🤖</span>
                    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3.5 rounded-2xl rounded-tl-none max-w-[85%] text-gray-800 dark:text-gray-200 shadow-sm leading-relaxed">
                        ${answerHtml}
                    </div>
                </div>
            `;

            state.chatHistory.push({ role: 'user', content: question });
            state.chatHistory.push({ role: 'assistant', content: data.answer });
        } else {
            chatContainer.innerHTML += `
                <div class="flex items-start gap-3 text-sm">
                    <span class="text-xl">⚠️</span>
                    <div class="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 rounded-2xl text-rose-700 dark:text-rose-300">
                        ${data.error || "Failed to generate answer."}
                    </div>
                </div>
            `;
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;

    } catch (e) {
        const placeholder = document.getElementById(thinkingId);
        if (placeholder) placeholder.remove();
        alert("Chat error: " + e.message);
    }
}

// Copy Markdown to Clipboard
function copyNotesMarkdown() {
    if (!state.currentNote || !state.currentNote.notes_markdown) return;
    navigator.clipboard.writeText(state.currentNote.notes_markdown).then(() => {
        const btn = document.getElementById('copy-notes-btn');
        const origText = btn.innerHTML;
        btn.innerHTML = `✓ Copied!`;
        setTimeout(() => { btn.innerHTML = origText; }, 2000);
    });
}

// Search & History Sidebar
let searchDebounceTimer;
function initHistorySearch() {
    const searchInput = document.getElementById('history-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                loadHistory(e.target.value.trim());
            }, 250);
        });
    }
}

// Load Previous Note from History
async function loadNoteById(noteId) {
    try {
        const resp = await fetch(`/api/notes/${noteId}`);
        const data = await resp.json();
        if (data.success) {
            displayGeneratedNotes(data.data);
        }
    } catch (e) {
        console.error("Error loading note:", e);
    }
}

// Delete Note by ID (P1-API)
async function deleteNoteById(noteId, event) {
    if (event) event.stopPropagation();
    if (!confirm("Are you sure you want to delete this saved lecture note?")) return;

    try {
        const resp = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.success) {
            if (state.currentNote && state.currentNote.id === noteId) {
                elements.workspaceSection.classList.add('hidden');
                elements.heroSection.classList.remove('hidden');
                state.currentNote = null;
            }
            loadHistory();
        } else {
            alert("Could not delete note: " + (data.error || 'Server error'));
        }
    } catch (e) {
        alert("Error deleting note: " + e.message);
    }
}

// Load History Sidebar with optional search
async function loadHistory(searchQuery = '') {
    try {
        const url = searchQuery ? `/api/search?q=${encodeURIComponent(searchQuery)}` : '/api/history';
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.success && elements.historyList) {
            const countBadge = document.getElementById('saved-count-badge');
            if (countBadge) {
                countBadge.textContent = `${data.notes.length} note${data.notes.length === 1 ? '' : 's'}`;
            }

            if (!data.notes.length) {
                elements.historyList.innerHTML = `<p class="text-xs text-gray-400 py-3 text-center">${searchQuery ? 'No matching notes found.' : 'No notes generated yet.'}</p>`;
                return;
            }
            elements.historyList.innerHTML = data.notes.map(n => `
                <div class="group flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                     onclick="loadNoteById(${n.id})">
                    <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                        <img src="${escapeHtml(n.thumbnail_url) || 'https://via.placeholder.com/60x40'}" class="w-10 h-7 object-cover rounded flex-shrink-0" alt="thumb">
                        <div class="truncate">
                            <p class="text-xs font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">${escapeHtml(n.title)}</p>
                            <p class="text-[10px] text-gray-400">${escapeHtml(n.channel)} • ${escapeHtml(n.duration_formatted)}</p>
                        </div>
                    </div>
                    <button type="button" onclick="deleteNoteById(${n.id}, event)" title="Delete saved lecture" class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-rose-500 rounded transition text-xs flex-shrink-0 ml-1">
                        🗑️
                    </button>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error("Error loading history:", e);
    }
}
