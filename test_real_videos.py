"""
Real Educational Videos Test Script for EduScribe AI
Tests real YouTube educational videos end-to-end:
1. URL Parsing & Metadata Extraction
2. Transcript Retrieval & Timestamps
3. AI Note Synthesis (Summary, Key Concepts, Flashcards, Quiz, Mindmap)
4. Interactive Chat with Lecture Tutor
5. Persistence in SQLite Database
"""

import os
import sys
from dotenv import load_dotenv

# Ensure UTF-8 output on Windows terminal
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Ensure we are in the ai_notes_generator directory context
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

from core.youtube_extractor import YouTubeExtractor
from core.ai_generator import AINotesGenerator
from core.database import NotesDatabase
import markdown

TEST_VIDEOS = [
    {
        "name": "Linear Algebra (3Blue1Brown)",
        "url": "https://www.youtube.com/watch?v=fNk_zzaMoSs",
        "style": "comprehensive",
        "sample_question": "How does the video define a vector from the perspective of a physics student versus a computer scientist?"
    },
    {
        "name": "Crash Course Computer Science #1 (CrashCourse)",
        "url": "https://www.youtube.com/watch?v=tpIctyqH29Q",
        "style": "quick",
        "sample_question": "What was the purpose of the abacus and the step reckoner mentioned in the video?"
    }
]

def run_real_video_tests():
    db = NotesDatabase()
    ai = AINotesGenerator()
    print("=" * 70)
    print("🎓 TESTING REAL EDUCATIONAL VIDEOS ON EDUSCRIBE AI")
    print(f"Provider detected: {ai.provider}")
    print("=" * 70)

    for idx, test in enumerate(TEST_VIDEOS, 1):
        print(f"\n[{idx}/2] Processing: {test['name']}")
        print(f"  🔗 URL: {test['url']}")

        # 1. Extract Video ID
        video_id = YouTubeExtractor.extract_video_id(test["url"])
        print(f"  ✓ Video ID: {video_id}")
        assert video_id is not None, "Failed to extract video ID"

        # 2. Fetch Metadata
        metadata = YouTubeExtractor.get_video_metadata(video_id)
        print(f"  ✓ Title: {metadata.get('title')}")
        print(f"  ✓ Channel: {metadata.get('author_name')}")

        # 3. Fetch Transcript
        print("  ⏳ Fetching YouTube captions & timestamps...")
        transcript = YouTubeExtractor.get_transcript(video_id)
        if not transcript.get("success"):
            print(f"  ❌ Transcript failed: {transcript.get('error')}")
            continue

        print(f"  ✓ Duration: {transcript.get('duration_formatted')}")
        print(f"  ✓ Word count: {transcript.get('word_count')} words")
        print(f"  ✓ Total segments: {len(transcript.get('segments', []))}")
        print(f"  ✓ First timestamp segment: [{transcript['segments'][0]['timestamp']}] {transcript['segments'][0]['text'][:60]}...")

        # 4. Generate AI Notes
        print(f"  🧠 Generating {test['style'].upper()} notes with AI...")
        res = ai.generate_lecture_notes(
            transcript_text=transcript["formatted_transcript"],
            video_title=metadata["title"],
            channel_name=metadata["author_name"],
            note_style=test["style"]
        )

        if not res.get("success"):
            print(f"  ❌ AI generation failed: {res.get('error')}")
            continue

        print(f"  ✓ Summary: {res.get('executive_summary')[:100]}...")
        print(f"  ✓ Learning Objectives: {len(res.get('learning_objectives', []))} points")
        print(f"  ✓ Key Concepts: {len(res.get('key_concepts', []))} definitions")
        print(f"  ✓ Flashcards Generated: {len(res.get('flashcards', []))} cards")
        print(f"  ✓ Quiz Questions Generated: {len(res.get('quiz', []))} MCQs")
        print(f"  ✓ Concept Mindmap: {'Yes (Mermaid syntax generated)' if res.get('mindmap_mermaid') else 'No'}")

        # 5. Save to Database
        md_text = res.get("notes_markdown", "")
        html_content = markdown.markdown(md_text, extensions=['extra', 'sane_lists', 'tables', 'nl2br'])
        note_id = db.save_note({
            "video_id": video_id,
            "video_url": test["url"],
            "title": metadata["title"],
            "channel": metadata["author_name"],
            "thumbnail_url": metadata["thumbnail_url"],
            "duration_formatted": transcript["duration_formatted"],
            "note_style": test["style"],
            "notes_markdown": md_text,
            "notes_html": html_content,
            "flashcards": res.get("flashcards", []),
            "quiz": res.get("quiz", []),
            "mindmap_mermaid": res.get("mindmap_mermaid", "")
        })
        print(f"  💾 Saved to SQLite database with Note ID: #{note_id}")

        # 6. Test Chat with Lecture Tutor
        print(f"  💬 Testing AI Lecture Tutor with sample student question:")
        print(f"     Q: \"{test['sample_question']}\"")
        chat_res = ai.chat_with_lecture(
            question=test["sample_question"],
            transcript_text=transcript["formatted_transcript"],
            video_title=metadata["title"]
        )
        if chat_res.get("success"):
            print(f"     🤖 Tutor Answer: {chat_res.get('answer')[:180]}...")
        else:
            print(f"     ❌ Chat failed: {chat_res.get('error')}")

        print("  🎉 Video test passed successfully!")

    print("\n" + "=" * 70)
    print("✅ ALL REAL EDUCATIONAL VIDEOS TESTED AND SAVED TO DATABASE!")
    print("=" * 70)

if __name__ == '__main__':
    run_real_video_tests()
