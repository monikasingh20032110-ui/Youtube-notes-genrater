# 🎓 EduScribe AI - Smart YouTube Lecture Notes Generator

EduScribe AI is an AI-powered educational platform that converts any YouTube educational lecture into structured, university-grade study notes, interactive flashcards, self-assessment quizzes, visual concept maps, and an AI chat tutor grounded in the video's transcript.

---

## 🌟 Key Features

1. **Intelligent YouTube Ingestion & Transcript Extraction**:
   - Parses standard, shortened (`youtu.be`), mobile, embed, and shorts URLs.
   - Extracts manual or auto-generated English captions and multi-language translated captions via `youtube-transcript-api`.
   - Real-time video metadata retrieval (title, author/channel, duration, thumbnail) via YouTube oEmbed API without requiring Google Cloud quotas.

2. **Pedagogical AI Note Synthesis**:
   - **Executive Summary**: 30-second high-yield overview.
   - **Core Learning Objectives**: Key outcomes of the lecture.
   - **Key Concepts & Vocabulary**: Technical terms paired with clear definitions and memorable analogies.
   - **Timestamped Lecture Breakdown**: Organized notes with embedded `[MM:SS]` timestamp pills.
   - **Multiple Note Styles**:
     - 📚 *Comprehensive*: In-depth textbook-style notes.
     - ⚡ *Quick 5-Min Revision*: High-yield bullet points.
     - 🎯 *Exam Cram*: Definitions, formulas, and common exam pitfalls.
     - 🧪 *Code & Math*: Step-by-step algorithms, equations, and code snippets.

3. **Active Recall Flashcards (3D Flip Animation)**:
   - AI generates targeted active-recall question-and-answer pairs.
   - Interactive 3D flip card UI with card navigation.

4. **Self-Assessment Comprehension Quiz**:
   - Multiple choice questions testing comprehension and application.
   - Instant grading feedback (correct/incorrect) with conceptual explanations.

5. **Visual Concept Mindmap**:
   - Synthesizes Mermaid.js concept graphs illustrating topic relationships.

6. **Interactive YouTube Player Sync**:
   - Embedded video player responds to timestamps in notes.
   - Clicking any `[MM:SS]` pill in the notes automatically jumps the video to that exact second.

7. **"Chat with Lecture" AI Tutor**:
   - Students can ask questions directly about difficult parts of the lecture.
   - AI tutor answers strictly grounded in the video transcript, citing exact moments.

8. **Export & Persistence**:
   - Instant Markdown (`.md`) download.
   - One-click PDF / Print-ready formatted stylesheet.
   - Local SQLite database (`notes.db`) to preserve past lectures and enable instant cached reloading.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.9+ (Installed version: Python 3.13)
- Required packages:
  ```bash
  pip install -r requirements.txt
  ```

### 2. Configure API Keys
You can set your API key in either `.env` or in the web UI settings modal:
```env
# .env file
OPENROUTER_API_KEY=your_openrouter_key
# OR
GEMINI_API_KEY=your_gemini_api_key
```

### 3. Run the Server
From the `ai_notes_generator` directory:
```bash
python app.py
```
Open your browser and navigate to:
```
http://127.0.0.1:5000
```

---

## 🏗️ System Architecture

```
ai_notes_generator/
│
├── core/
│   ├── __init__.py
│   ├── youtube_extractor.py   # URL parsing, oEmbed metadata & transcript retrieval
│   ├── ai_generator.py        # Multi-provider LLM prompt synthesis (Gemini/OpenRouter)
│   └── database.py            # SQLite database manager for notes and history
│
├── static/
│   ├── css/
│   │   └── style.css          # Custom styling, 3D flashcard flips & dark mode
│   └── js/
│       └── app.js             # Client SPA logic, YouTube iframe API sync, quiz & tabs
│
├── templates/
│   ├── index.html             # Main responsive dashboard
│   └── print.html             # Clean print & PDF export template
│
├── .env                       # Environment configuration
├── requirements.txt           # Python dependencies
└── app.py                     # Flask backend REST endpoints & routing
```

---

## 💡 Viva / Project Presentation Highlights

When demonstrating this project for academic evaluations, interviews, or project viva:
1. **Explain the Transcript Extraction Pipeline**: How `youtube-transcript-api` queries YouTube subtitle tracks without requiring expensive video-to-text audio transcription overhead.
2. **Explain the Prompt Engineering & Output Parsing**: How the system instructs the LLM to return strict, validated JSON with separate keys for Markdown notes, flashcards, quiz questions, and Mermaid diagrams.
3. **Explain Timestamp Synchronization**: How client-side regex parsing converts `[MM:SS]` timestamps into interactive HTML buttons that invoke YouTube's Iframe API `player.seekTo(seconds, true)`.
4. **Explain Caching & Performance**: How SQLite indexes video IDs to make repeat queries instantaneous without consuming redundant LLM tokens.
