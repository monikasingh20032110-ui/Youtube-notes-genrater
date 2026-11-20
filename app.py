"""
EduScribe AI - Smart Lecture Notes Generator
Flask Web Application
"""

import os
import re
import json
import markdown
from flask import Flask, render_template, request, jsonify, Response, send_file, make_response
from dotenv import load_dotenv
import bleach

# Load local environment variables if available
load_dotenv()

from core.youtube_extractor import YouTubeExtractor
from core.ai_generator import AINotesGenerator
from core.database import NotesDatabase

ALLOWED_TAGS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'b', 'i', 'strong', 'em',
    'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody',
    'tr', 'th', 'td', 'span', 'hr', 'br', 'button', 'a', 'div'
]
ALLOWED_ATTRIBUTES = {
    '*': ['class', 'id', 'title'],
    'a': ['href', 'title', 'target', 'rel'],
    'button': ['class', 'onclick', 'title']
}

def sanitize_html(raw_html: str) -> str:
    """Sanitizes generated HTML output to prevent stored XSS."""
    if not raw_html:
        return ""
    return bleach.clean(raw_html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRIBUTES, strip=True)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'eduscribe-ai-secret-key-2026')

db = NotesDatabase()

# In-memory transcript cache by video_id to avoid repeated YouTube fetches
TRANSCRIPT_CACHE = {}

@app.route('/')
def index():
    recent_notes = db.get_recent_notes(limit=8)
    return render_template('index.html', recent_notes=recent_notes)

@app.route('/api/extract', methods=['POST'])
def extract_video():
    data = request.get_json() or {}
    url_or_id = data.get('url', '').strip()
    
    if not url_or_id:
        return jsonify({"success": False, "error": "Please provide a valid YouTube video URL or ID."}), 400

    video_id = YouTubeExtractor.extract_video_id(url_or_id)
    if not video_id:
        return jsonify({"success": False, "error": "Could not identify a valid YouTube video ID from the provided link."}), 400

    # Retrieve video metadata
    metadata = YouTubeExtractor.get_video_metadata(video_id)

    # Check transcript
    transcript_res = YouTubeExtractor.get_transcript(video_id)
    if not transcript_res.get("success"):
        return jsonify({
            "success": False,
            "video_id": video_id,
            "metadata": metadata,
            "can_paste_transcript": True,
            "error": transcript_res.get("error", "Unable to extract transcript for this video.")
        }), 400

    # Cache transcript in memory
    TRANSCRIPT_CACHE[video_id] = transcript_res

    # Check if we already have a generated note for this video in SQLite
    existing_note = db.get_latest_by_video_id(video_id)

    return jsonify({
        "success": True,
        "video_id": video_id,
        "metadata": metadata,
        "duration_formatted": transcript_res["duration_formatted"],
        "word_count": transcript_res["word_count"],
        "estimated_read_time_mins": transcript_res["estimated_read_time_mins"],
        "has_cached_notes": existing_note is not None,
        "cached_note_id": existing_note["id"] if existing_note else None
    })

@app.route('/api/generate-notes', methods=['POST'])
def generate_notes():
    data = request.get_json() or {}
    video_id = data.get('video_id', '').strip()
    custom_transcript = data.get('transcript_text', '').strip()
    note_style = data.get('note_style', 'comprehensive')
    custom_api_key = data.get('api_key', '').strip()
    custom_provider = data.get('provider', '')
    force_refresh = data.get('force_refresh', False)

    if not video_id and not custom_transcript:
        return jsonify({"success": False, "error": "Missing video ID or transcript text."}), 400

    if not video_id:
        video_id = "custom_lecture"

    # Check cache in DB first unless force refresh requested or custom transcript provided
    if not force_refresh and not custom_transcript:
        existing = db.get_latest_by_video_id(video_id, note_style)
        if existing:
            return jsonify({
                "success": True,
                "cached": True,
                "note_id": existing["id"],
                "data": existing
            })

    # Retrieve or use provided transcript
    if custom_transcript:
        transcript_text = custom_transcript
        duration_formatted = "Lecture Notes"
        metadata = {
            "title": data.get("title", "Custom Educational Lecture"),
            "author_name": data.get("channel", "Educational Source"),
            "thumbnail_url": data.get("thumbnail_url", "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80")
        }
    else:
        transcript_data = TRANSCRIPT_CACHE.get(video_id)
        if not transcript_data:
            transcript_data = YouTubeExtractor.get_transcript(video_id)
            if not transcript_data.get("success"):
                return jsonify({"success": False, "error": transcript_data.get("error", "Could not fetch transcript."), "can_paste_transcript": True}), 400
            TRANSCRIPT_CACHE[video_id] = transcript_data
        
        transcript_text = transcript_data.get("formatted_transcript", transcript_data.get("plain_text", ""))
        duration_formatted = transcript_data.get("duration_formatted", "00:00")
        metadata = YouTubeExtractor.get_video_metadata(video_id)

    video_title = metadata.get("title", "Lecture")
    channel = metadata.get("author_name", "YouTube Channel")

    # Initialize AI generator
    ai = AINotesGenerator(api_key=custom_api_key, provider=custom_provider)

    ai_result = ai.generate_lecture_notes(
        transcript_text=transcript_text,
        video_title=video_title,
        channel_name=channel,
        note_style=note_style
    )

    if not ai_result.get("success"):
        return jsonify({"success": False, "error": ai_result.get("error", "Failed to generate notes.")}), 500

    # Convert notes markdown to rich HTML with tables and fenced code
    md_text = ai_result.get("notes_markdown", "")
    raw_html = markdown.markdown(
        md_text,
        extensions=['extra', 'sane_lists', 'tables', 'nl2br']
    )
    html_content = sanitize_html(raw_html)

    # Save to SQLite database
    note_record = {
        "video_id": video_id,
        "video_url": f"https://www.youtube.com/watch?v={video_id}",
        "title": video_title,
        "channel": channel,
        "thumbnail_url": metadata.get("thumbnail_url", ""),
        "duration_formatted": duration_formatted,
        "note_style": note_style,
        "notes_markdown": md_text,
        "notes_html": html_content,
        "flashcards": ai_result.get("flashcards", []),
        "quiz": ai_result.get("quiz", []),
        "mindmap_mermaid": ai_result.get("mindmap_mermaid", "")
    }

    note_id = db.save_note(note_record)
    note_record["id"] = note_id

    return jsonify({
        "success": True,
        "cached": False,
        "note_id": note_id,
        "data": note_record
    })

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json() or {}
    video_id = data.get('video_id', '').strip()
    question = data.get('question', '').strip()
    custom_api_key = data.get('api_key', '').strip()
    custom_provider = data.get('provider', '')
    history = data.get('history', [])

    if not video_id or not question:
        return jsonify({"success": False, "error": "Missing video ID or question."}), 400

    transcript_data = TRANSCRIPT_CACHE.get(video_id)
    if not transcript_data:
        transcript_data = YouTubeExtractor.get_transcript(video_id)
        if not transcript_data.get("success"):
            return jsonify({"success": False, "error": "Could not access video transcript."}), 400
        TRANSCRIPT_CACHE[video_id] = transcript_data

    metadata = YouTubeExtractor.get_video_metadata(video_id)
    ai = AINotesGenerator(api_key=custom_api_key, provider=custom_provider)

    result = ai.chat_with_lecture(
        question=question,
        transcript_text=transcript_data.get("formatted_transcript", transcript_data.get("plain_text", "")),
        video_title=metadata.get("title", "Lecture"),
        chat_history=history
    )

    if not result.get("success"):
        return jsonify({"success": False, "error": result.get("error", "Chat failed.")}), 500

    return jsonify({"success": True, "answer": result.get("answer", "")})

@app.route('/api/notes/<int:note_id>')
def get_note(note_id: int):
    note = db.get_note_by_id(note_id)
    if not note:
        return jsonify({"success": False, "error": "Note not found."}), 404
    return jsonify({"success": True, "data": note})

@app.route('/api/notes/<int:note_id>', methods=['DELETE'])
def delete_note(note_id: int):
    success = db.delete_note(note_id)
    return jsonify({"success": success})

@app.route('/api/history')
def get_history():
    notes = db.get_recent_notes(limit=20)
    return jsonify({"success": True, "notes": notes})

@app.route('/api/search')
def search_notes():
    q = request.args.get('q', '').strip()
    if not q:
        notes = db.get_recent_notes(limit=20)
    else:
        notes = db.search_notes(q, limit=20)
    return jsonify({"success": True, "notes": notes})

@app.route('/api/export/markdown/<int:note_id>')
def export_markdown(note_id: int):
    note = db.get_note_by_id(note_id)
    if not note:
        return "Note not found", 404

    filename = re.sub(r'[^a-zA-Z0-9_-]', '_', note.get('title', 'lecture_notes'))[:40] + ".md"
    response = make_response(note.get("notes_markdown", ""))
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    response.headers["Content-Type"] = "text/markdown; charset=utf-8"
    return response

@app.route('/print/<int:note_id>')
def print_note(note_id: int):
    note = db.get_note_by_id(note_id)
    if not note:
        return "Note not found", 404
    return render_template('print.html', note=note)

if __name__ == '__main__':
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', 5000))
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    print(f"🚀 EduScribe AI Notes Generator server running on http://{host}:{port} (debug={debug_mode})")
    app.run(host=host, port=port, debug=debug_mode)
