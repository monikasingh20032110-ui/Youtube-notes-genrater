"""
YouTube Extractor Module
Handles URL parsing, video metadata retrieval via oEmbed, and transcript fetching with timestamp formatting.
Compatible with all versions of youtube-transcript-api.
"""

import re
import requests
from typing import Dict, Any, List, Optional
import youtube_transcript_api
from youtube_transcript_api import (
    YouTubeTranscriptApi,
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable
)
try:
    from youtube_transcript_api._errors import RequestBlocked, IpBlocked
except Exception:
    try:
        from youtube_transcript_api import RequestBlocked, IpBlocked
    except Exception:
        class RequestBlocked(Exception): pass
        class IpBlocked(Exception): pass

class YouTubeExtractor:
    @staticmethod
    def extract_video_id(url_or_id: str) -> Optional[str]:
        """
        Extract the 11-character YouTube video ID from various URL formats.
        Supports:
        - https://www.youtube.com/watch?v=VIDEO_ID
        - https://youtu.be/VIDEO_ID
        - https://www.youtube.com/embed/VIDEO_ID
        - https://www.youtube.com/shorts/VIDEO_ID
        - https://m.youtube.com/watch?v=VIDEO_ID
        - Raw 11-character video ID
        """
        if not url_or_id:
            return None
            
        url_or_id = url_or_id.strip()
        
        # If it's already an 11-character alphanumeric/dash/underscore ID
        if re.fullmatch(r"^[a-zA-Z0-9_-]{11}$", url_or_id):
            return url_or_id
            
        patterns = [
            r"(?:v=|\/v\/|youtu\.be\/|embed\/|shorts\/|\/e\/)([\w-]{11})",
            r"(?:embed\/|v\/|watch\?v=|watch\?.+&v=)([\w-]{11})",
            r"(?:youtu\.be\/)([\w-]{11})",
            r"(?:youtube\.com\/shorts\/)([\w-]{11})"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url_or_id)
            if match:
                return match.group(1)
                
        return None

    @staticmethod
    def get_video_metadata(video_id: str) -> Dict[str, Any]:
        """
        Fetches public video metadata using YouTube's oEmbed endpoint (no API key required).
        """
        clean_url = f"https://www.youtube.com/watch?v={video_id}"
        oembed_url = f"https://www.youtube.com/oembed?url={clean_url}&format=json"
        
        metadata = {
            "video_id": video_id,
            "url": clean_url,
            "title": "YouTube Educational Lecture",
            "author_name": "Educational Channel",
            "author_url": "",
            "thumbnail_url": f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg",
            "fallback_thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
        }
        
        try:
            resp = requests.get(oembed_url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                metadata["title"] = data.get("title", metadata["title"])
                metadata["author_name"] = data.get("author_name", metadata["author_name"])
                metadata["author_url"] = data.get("author_url", "")
                if data.get("thumbnail_url"):
                    metadata["thumbnail_url"] = data["thumbnail_url"]
        except Exception:
            pass
            
        return metadata

    @classmethod
    def get_transcript(cls, video_id: str) -> Dict[str, Any]:
        """
        Fetches transcript entries with timestamps, formats them into structured text,
        and calculates total duration and word count.
        """
        try:
            raw_entries = cls._fetch_raw_transcript_entries(video_id)

            if not raw_entries:
                return {
                    "success": False,
                    "error": "No captions or transcript found for this video. Subtitles might be disabled."
                }

            # Format entries with timestamps [MM:SS] or [HH:MM:SS]
            formatted_segments = []
            full_text_parts = []
            total_duration_sec = 0.0

            for entry in raw_entries:
                # Handle either dict or object
                if isinstance(entry, dict):
                    start_sec = entry.get('start', 0.0)
                    duration_sec = entry.get('duration', 0.0)
                    text = entry.get('text', '')
                else:
                    start_sec = getattr(entry, 'start', 0.0)
                    duration_sec = getattr(entry, 'duration', 0.0)
                    text = getattr(entry, 'text', '')

                text = text.replace('\n', ' ').strip()
                if not text:
                    continue

                end_sec = start_sec + duration_sec
                if end_sec > total_duration_sec:
                    total_duration_sec = end_sec

                # Format seconds to MM:SS or HH:MM:SS
                timestamp_str = cls._format_timestamp(start_sec)
                formatted_segments.append({
                    "start": round(start_sec, 2),
                    "duration": round(duration_sec, 2),
                    "timestamp": timestamp_str,
                    "text": text
                })
                full_text_parts.append(f"[{timestamp_str}] {text}")

            full_transcript_with_timestamps = "\n".join(full_text_parts)
            plain_transcript = " ".join([seg["text"] for seg in formatted_segments])
            word_count = len(plain_transcript.split())

            return {
                "success": True,
                "video_id": video_id,
                "segments": formatted_segments,
                "formatted_transcript": full_transcript_with_timestamps,
                "plain_text": plain_transcript,
                "duration_seconds": round(total_duration_sec),
                "duration_formatted": cls._format_timestamp(total_duration_sec),
                "word_count": word_count,
                "estimated_read_time_mins": max(1, round(word_count / 180))
            }

        except (RequestBlocked, IpBlocked) as e:
            return {
                "success": False,
                "blocked_by_youtube": True,
                "error": "YouTube is temporarily rate-limiting automated subtitle downloads. No worries! You can copy the transcript directly from YouTube in 2 clicks and paste it below."
            }
        except TranscriptsDisabled:
            return {
                "success": False,
                "error": "Transcripts are disabled by the video creator for this YouTube video. You can paste your own notes or transcript below to generate study materials!"
            }
        except NoTranscriptFound:
            return {
                "success": False,
                "error": "No English captions were found for this video. You can paste the transcript or notes below."
            }
        except VideoUnavailable:
            return {
                "success": False,
                "error": "This video is unavailable, private, or has been removed."
            }
        except Exception as e:
            err_str = str(e)
            if "blocking requests from your IP" in err_str or "RequestBlocked" in err_str or "IpBlocked" in err_str or "429" in err_str:
                return {
                    "success": False,
                    "blocked_by_youtube": True,
                    "error": "YouTube is temporarily rate-limiting automated subtitle downloads. No worries! You can copy the transcript directly from YouTube in 2 clicks and paste it below."
                }
            return {
                "success": False,
                "error": f"Failed to retrieve transcript: {err_str}"
            }

    @classmethod
    def _fetch_raw_transcript_entries(cls, video_id: str) -> List[Any]:
        """Helper to invoke modern or legacy youtube-transcript-api methods."""
        # Check modern API (v1.0+)
        if hasattr(YouTubeTranscriptApi, 'fetch') or hasattr(YouTubeTranscriptApi, 'list'):
            api = YouTubeTranscriptApi()
            try:
                transcript_list = api.list(video_id)
                # Try finding English first
                try:
                    transcript_obj = transcript_list.find_transcript(['en', 'en-US', 'en-GB'])
                except Exception:
                    try:
                        first_transcript = next(iter(transcript_list))
                        if getattr(first_transcript, 'is_translatable', False):
                            transcript_obj = first_transcript.translate('en')
                        else:
                            transcript_obj = first_transcript
                    except Exception:
                        transcript_obj = None

                if transcript_obj:
                    fetched = transcript_obj.fetch()
                    return fetched.to_raw_data() if hasattr(fetched, 'to_raw_data') else list(fetched)
            except Exception:
                pass

            fetched = api.fetch(video_id)
            return fetched.to_raw_data() if hasattr(fetched, 'to_raw_data') else list(fetched)

        # Legacy classmethod fallback (v0.x)
        if hasattr(YouTubeTranscriptApi, 'get_transcript'):
            return YouTubeTranscriptApi.get_transcript(video_id)

        raise RuntimeError("No compatible transcript fetch method found on YouTubeTranscriptApi")

    @staticmethod
    def _format_timestamp(seconds: float) -> str:
        """Helper to convert seconds into HH:MM:SS or MM:SS."""
        total_seconds = int(seconds)
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        secs = total_seconds % 60
        if hours > 0:
            return f"{hours:02d}:{minutes:02d}:{secs:02d}"
        return f"{minutes:02d}:{secs:02d}"
