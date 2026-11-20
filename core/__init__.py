"""
Core package initialization.
"""
from .youtube_extractor import YouTubeExtractor
from .ai_generator import AINotesGenerator
from .database import NotesDatabase

__all__ = ["YouTubeExtractor", "AINotesGenerator", "NotesDatabase"]
