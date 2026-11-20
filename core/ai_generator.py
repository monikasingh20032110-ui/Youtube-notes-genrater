"""
AI Notes Generator Module
Supports Google Gemini, OpenRouter, and OpenAI APIs to synthesize high-yield pedagogical notes,
interactive flashcards, practice quizzes, visual concept maps, and interactive lecture Q&A.
"""

import os
import json
import re
import requests
from typing import Dict, Any, List, Optional, Tuple

class AINotesGenerator:
    def __init__(self, api_key: Optional[str] = None, provider: Optional[str] = None):
        self.api_key, self.provider = self._resolve_credentials(api_key, provider)

    def _resolve_credentials(self, custom_key: Optional[str], custom_provider: Optional[str]) -> Tuple[Optional[str], str]:
        """Resolves API key and provider from argument, env vars, or local api.txt file."""
        if custom_key and custom_key.strip():
            key = custom_key.strip()
            provider = custom_provider or self._detect_provider(key)
            return key, provider

        # Check environment variables
        if os.getenv("GEMINI_API_KEY"):
            return os.getenv("GEMINI_API_KEY"), "gemini"
        if os.getenv("OPENROUTER_API_KEY"):
            return os.getenv("OPENROUTER_API_KEY"), "openrouter"
        if os.getenv("OPENAI_API_KEY"):
            return os.getenv("OPENAI_API_KEY"), "openai"

        # Check for api.txt in current or parent directory
        candidate_paths = [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "api.txt"),
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "api.txt"),
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "api.txt")
        ]
        
        for path in candidate_paths:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        key = f.read().strip()
                        if key:
                            return key, self._detect_provider(key)
                except Exception:
                    pass

        return None, "none"

    def _detect_provider(self, key: str) -> str:
        """Heuristic to detect the provider based on API key prefix."""
        if key.startswith("sk-or-v1-"):
            return "openrouter"
        if key.startswith("AIzaSy") or key.startswith("AQ."):
            return "gemini"
        if key.startswith("sk-"):
            return "openai"
        return "gemini" if "AQ." in key or "AIzaSy" in key else "openrouter"

    def generate_lecture_notes(
        self,
        transcript_text: str,
        video_title: str,
        channel_name: str,
        note_style: str = "comprehensive"
    ) -> Dict[str, Any]:
        """
        Synthesizes structured notes, flashcards, quiz, and mindmap from lecture transcript.
        """
        if not self.api_key:
            return {
                "success": False,
                "error": "No API key found. Please provide an OpenRouter, Google Gemini, or OpenAI API key in settings."
            }

        prompt = self._build_notes_prompt(transcript_text, video_title, channel_name, note_style)

        try:
            if self.provider == "openrouter":
                raw_response = self._call_openrouter(prompt)
            elif self.provider == "gemini":
                raw_response = self._call_gemini(prompt)
            else:
                raw_response = self._call_openrouter(prompt) # fallback default

            if not raw_response.get("success"):
                return raw_response

            parsed_content = self._parse_ai_output(raw_response["content"], video_title)
            return {
                "success": True,
                **parsed_content
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"AI Generation error: {str(e)}"
            }

    def chat_with_lecture(
        self,
        question: str,
        transcript_text: str,
        video_title: str,
        chat_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Interactive Q&A answering questions grounded strictly in the lecture transcript.
        """
        if not self.api_key:
            return {
                "success": False,
                "error": "No API key configured. Please enter your API key to chat with this lecture."
            }

        # Truncate transcript to safe token length if extraordinarily long
        safe_transcript = transcript_text[:40000]

        system_instruction = (
            f"You are EduScribe AI, an expert academic tutor for the lecture '{video_title}'. "
            "Your role is to answer students' questions accurately, concisely, and encouragingly. "
            "Use the provided lecture transcript as your primary source of truth. "
            "Whenever relevant, cite approximate timestamps (e.g., [12:34]) where the topic was discussed. "
            "If the video does not cover the question, state that clearly and provide a helpful, brief educational explanation."
        )

        user_content = (
            f"LECTURE TRANSCRIPT CONTEXT:\n{safe_transcript}\n\n"
            f"STUDENT QUESTION:\n{question}"
        )

        try:
            if self.provider == "openrouter":
                messages = [{"role": "system", "content": system_instruction}]
                if chat_history:
                    for msg in chat_history[-6:]:
                        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
                messages.append({"role": "user", "content": user_content})
                
                chat_models = [
                    "deepseek/deepseek-chat",
                    "meta-llama/llama-3.3-70b-instruct",
                    "qwen/qwen-2.5-72b-instruct"
                ]
                last_err = ""
                for model in chat_models:
                    try:
                        resp = requests.post(
                            "https://openrouter.ai/api/v1/chat/completions",
                            headers={
                                "Authorization": f"Bearer {self.api_key}",
                                "Content-Type": "application/json",
                                "HTTP-Referer": "http://localhost:5000",
                                "X-Title": "EduScribe AI Smart Notes"
                            },
                            json={
                                "model": model,
                                "messages": messages,
                                "temperature": 0.3
                            },
                            timeout=45
                        )
                        if resp.status_code == 200:
                            answer = resp.json()["choices"][0]["message"]["content"]
                            return {"success": True, "answer": answer}
                        else:
                            last_err = f"{model}: {resp.text}"
                    except Exception as e:
                        last_err = f"{model} error: {str(e)}"
                        continue

                return {"success": False, "error": f"Chat API error: {last_err}"}

            elif self.provider == "gemini":
                full_prompt = f"{system_instruction}\n\n{user_content}"
                gemini_models = ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-flash-latest"]
                last_err = ""
                for model in gemini_models:
                    try:
                        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
                        resp = requests.post(
                            url,
                            headers={"Content-Type": "application/json"},
                            json={"contents": [{"parts": [{"text": full_prompt}]}], "generationConfig": {"temperature": 0.3}},
                            timeout=45
                        )
                        if resp.status_code == 200:
                            data = resp.json()
                            answer = data["candidates"][0]["content"]["parts"][0]["text"]
                            return {"success": True, "answer": answer}
                        else:
                            last_err = f"{model} returned {resp.status_code}: {resp.text}"
                    except Exception as e:
                        last_err = f"{model} error: {str(e)}"
                        continue
                return {"success": False, "error": f"Gemini API error: {last_err}"}
            else:
                return {"success": False, "error": "Unsupported provider"}
        except Exception as e:
            return {"success": False, "error": f"Chat request failed: {str(e)}"}

    def _build_notes_prompt(self, transcript_text: str, video_title: str, channel_name: str, note_style: str) -> str:
        # Safe length handling: take up to 45,000 characters (approx 10,000 words / 1-hour lecture)
        truncated_transcript = transcript_text[:50000]

        style_instruction = {
            "comprehensive": "Detailed, thorough university-level lecture notes with in-depth explanations, real-world analogies, and timestamped sections.",
            "quick": "Concise high-yield revision bullet points, 5-minute recap style with rapid-fire takeaways.",
            "exam": "Exam prep focused: definitions, anticipated exam questions, critical formulas/laws, and common mistakes to avoid.",
            "code_math": "Technical breakdown focusing on mathematical equations, proofs, code blocks, syntax, algorithms, and step-by-step logic."
        }.get(note_style, "Comprehensive academic notes.")

        prompt = f"""
You are an elite educational AI and academic note-taker for top university students.
Transform the following YouTube lecture transcript into beautifully structured, pedagogically sound, high-yield study notes.

LECTURE TITLE: {video_title}
INSTRUCTOR / CHANNEL: {channel_name}
NOTE STYLE: {style_instruction}

TRANSCRIPT:
{truncated_transcript}

You MUST output your response in valid JSON format matching this exact schema:
{{
  "executive_summary": "A 3-5 sentence crystal-clear summary of what this lecture is about and why it matters.",
  "learning_objectives": [
    "Objective 1",
    "Objective 2",
    "Objective 3"
  ],
  "key_concepts": [
    {{
      "term": "Key Concept / Term Name",
      "definition": "Clear concise explanation",
      "analogy": "Memorable analogy or practical example"
    }}
  ],
  "structured_notes_markdown": "Full detailed notes formatted in rich GitHub Markdown. Include: ## ⏱️ Timestamped Breakdown (using [MM:SS] format corresponding to video), ### Subsections with bold highlights, bullet points, callout quotes (> [!NOTE] ...), formulas ($...$ or $$...$$), and code snippets where relevant.",
  "mindmap_mermaid": "graph TD\\n  A[Core Topic] --> B[Subtopic 1]\\n  A --> C[Subtopic 2]\\n  B --> D[Key Detail 1]\\n  C --> E[Key Detail 2]",
  "flashcards": [
    {{
      "question": "Clear testing question on an essential concept",
      "answer": "Concise, precise answer for active recall"
    }},
    {{
      "question": "Another key testing question",
      "answer": "Another precise answer"
    }},
    {{
      "question": "Third key question",
      "answer": "Third answer"
    }},
    {{
      "question": "Fourth key question",
      "answer": "Fourth answer"
    }},
    {{
      "question": "Fifth key question",
      "answer": "Fifth answer"
    }}
  ],
  "quiz": [
    {{
      "question": "Multiple choice question 1 testing comprehension",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 0,
      "explanation": "Why Option A is correct and the underlying concept"
    }},
    {{
      "question": "Multiple choice question 2 testing application",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 1,
      "explanation": "Why Option B is correct"
    }},
    {{
      "question": "Multiple choice question 3",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 2,
      "explanation": "Why Option C is correct"
    }}
  ]
}}

CRITICAL INSTRUCTIONS:
- Ensure the JSON is completely valid without trailing commas.
- Keep the Mermaid syntax simple and valid (quote labels with parentheses or special chars).
- Do not output markdown code fences around the JSON (output pure JSON only).
"""
        return prompt

    def _call_openrouter(self, prompt: str) -> Dict[str, Any]:
        models_to_try = [
            "deepseek/deepseek-chat",
            "meta-llama/llama-3.3-70b-instruct",
            "qwen/qwen-2.5-72b-instruct",
            "mistralai/mistral-large-2407"
        ]

        last_error = ""
        for model in models_to_try:
            try:
                resp = requests.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "http://localhost:5000",
                        "X-Title": "EduScribe AI"
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": "You are a professional educational AI note synthesis engine that always outputs clean, valid JSON."},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.3,
                        "response_format": {"type": "json_object"} if "gemini" in model or "deepseek" in model else None
                    },
                    timeout=90
                )
                if resp.status_code == 200:
                    data = resp.json()
                    content = data["choices"][0]["message"]["content"]
                    return {"success": True, "content": content}
                else:
                    last_error = f"{model} returned {resp.status_code}: {resp.text}"
            except Exception as e:
                last_error = f"{model} exception: {str(e)}"
                continue

        return {"success": False, "error": f"OpenRouter request failed: {last_error}"}

    def _call_gemini(self, prompt: str) -> Dict[str, Any]:
        gemini_models = ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-flash-latest"]
        last_error = ""
        for model in gemini_models:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
                resp = requests.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "temperature": 0.3,
                            "responseMimeType": "application/json"
                        }
                    },
                    timeout=90
                )
                if resp.status_code == 200:
                    data = resp.json()
                    content = data["candidates"][0]["content"]["parts"][0]["text"]
                    return {"success": True, "content": content}
                else:
                    last_error = f"{model} returned {resp.status_code}: {resp.text}"
            except Exception as e:
                last_error = f"{model} error: {str(e)}"
                continue
        return {"success": False, "error": f"Gemini API call failed: {last_error}"}

    def _parse_ai_output(self, raw_text: str, video_title: str) -> Dict[str, Any]:
        """Safely parses JSON output from LLM, cleaning any markdown backticks if present."""
        text = raw_text.strip()
        # Remove ```json ... ``` wrapper if present
        if text.startswith("```"):
            lines = text.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()

        try:
            data = json.loads(text)
        except Exception:
            # Fallback regex search for JSON block
            json_match = re.search(r"\{.*\}", text, re.DOTALL)
            if json_match:
                try:
                    data = json.loads(json_match.group(0))
                except Exception:
                    data = {}
            else:
                data = {}

        # Construct comprehensive markdown if structured_notes_markdown is missing or empty
        notes_md = data.get("structured_notes_markdown")
        if not notes_md or len(notes_md.strip()) < 50:
            # Reconstruct from sections
            md_parts = [f"# 📖 {video_title}\n"]
            if data.get("executive_summary"):
                md_parts.append(f"## ⚡ Executive Summary\n{data['executive_summary']}\n")
            if data.get("learning_objectives"):
                md_parts.append("## 🎯 Core Learning Objectives\n" + "\n".join([f"- {obj}" for obj in data["learning_objectives"]]) + "\n")
            if data.get("key_concepts"):
                md_parts.append("## 🧠 Key Concepts & Vocabulary\n")
                for c in data["key_concepts"]:
                    md_parts.append(f"- **{c.get('term', '')}**: {c.get('definition', '')} *(Analogy: {c.get('analogy', '')})*")
                md_parts.append("\n")
            notes_md = "\n".join(md_parts)

        return {
            "executive_summary": data.get("executive_summary", ""),
            "learning_objectives": data.get("learning_objectives", []),
            "key_concepts": data.get("key_concepts", []),
            "notes_markdown": notes_md,
            "mindmap_mermaid": data.get("mindmap_mermaid", ""),
            "flashcards": data.get("flashcards", []),
            "quiz": data.get("quiz", [])
        }
