"""
Unit and Integration Test Suite for EduScribe AI
"""

import unittest
import json
import os
import tempfile
from core.youtube_extractor import YouTubeExtractor
from core.database import NotesDatabase
from core.ai_generator import AINotesGenerator

class TestYouTubeExtractor(unittest.TestCase):
    def test_extract_video_id_standard(self):
        url = "https://www.youtube.com/watch?v=aircAruvnKk"
        self.assertEqual(YouTubeExtractor.extract_video_id(url), "aircAruvnKk")

    def test_extract_video_id_short(self):
        url = "https://youtu.be/kqtD5dpn9C8?t=120"
        self.assertEqual(YouTubeExtractor.extract_video_id(url), "kqtD5dpn9C8")

    def test_extract_video_id_embed(self):
        url = "https://www.youtube.com/embed/dQw4w9WgXcQ"
        self.assertEqual(YouTubeExtractor.extract_video_id(url), "dQw4w9WgXcQ")

    def test_extract_video_id_shorts(self):
        url = "https://www.youtube.com/shorts/3dcli9i_pvA"
        self.assertEqual(YouTubeExtractor.extract_video_id(url), "3dcli9i_pvA")

    def test_extract_video_id_raw(self):
        vid = "aircAruvnKk"
        self.assertEqual(YouTubeExtractor.extract_video_id(vid), "aircAruvnKk")

    def test_format_timestamp(self):
        self.assertEqual(YouTubeExtractor._format_timestamp(65), "01:05")
        self.assertEqual(YouTubeExtractor._format_timestamp(3665), "01:01:05")

class TestDatabase(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        self.db = NotesDatabase(self.temp_db.name)

    def tearDown(self):
        self.temp_db.close()
        if os.path.exists(self.temp_db.name):
            try:
                os.remove(self.temp_db.name)
            except Exception:
                pass

    def test_save_and_retrieve_note(self):
        note_data = {
            "video_id": "test_vid_123",
            "video_url": "https://www.youtube.com/watch?v=test_vid_123",
            "title": "Introduction to Linear Algebra",
            "channel": "MIT OpenCourseWare",
            "thumbnail_url": "https://example.com/thumb.jpg",
            "duration_formatted": "45:30",
            "note_style": "comprehensive",
            "notes_markdown": "# Notes\nVector spaces and matrices.",
            "notes_html": "<h1>Notes</h1><p>Vector spaces and matrices.</p>",
            "flashcards": [{"question": "What is a matrix?", "answer": "A rectangular array of numbers."}],
            "quiz": [{"question": "Is det(I) = 1?", "options": ["Yes", "No"], "correct_answer": 0, "explanation": "Identity matrix determinant is 1."}],
            "mindmap_mermaid": "graph TD\n A --> B"
        }
        note_id = self.db.save_note(note_data)
        self.assertIsInstance(note_id, int)

        retrieved = self.db.get_note_by_id(note_id)
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["title"], "Introduction to Linear Algebra")
        self.assertEqual(len(retrieved["flashcards"]), 1)
        self.assertEqual(len(retrieved["quiz"]), 1)

        by_vid = self.db.get_latest_by_video_id("test_vid_123")
        self.assertIsNotNone(by_vid)
        self.assertEqual(by_vid["id"], note_id)

class TestAIParsing(unittest.TestCase):
    def test_parse_clean_json(self):
        ai = AINotesGenerator()
        sample_json = json.dumps({
            "executive_summary": "Lecture on Calculus.",
            "learning_objectives": ["Understand derivatives", "Calculate limits"],
            "key_concepts": [{"term": "Derivative", "definition": "Rate of change", "analogy": "Speedometer"}],
            "structured_notes_markdown": "## Detailed notes on derivatives",
            "mindmap_mermaid": "graph TD\n A --> B",
            "flashcards": [{"question": "What is dx/dt?", "answer": "Velocity"}],
            "quiz": [{"question": "Limit of 1/x as x->inf?", "options": ["0", "1", "inf"], "correct_answer": 0, "explanation": "Approaches zero"}]
        })
        res = ai._parse_ai_output(sample_json, "Calculus 101")
        self.assertEqual(res["executive_summary"], "Lecture on Calculus.")
        self.assertEqual(len(res["learning_objectives"]), 2)
        self.assertEqual(len(res["flashcards"]), 1)

if __name__ == '__main__':
    unittest.main()
