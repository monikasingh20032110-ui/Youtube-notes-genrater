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

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def generate_lecture_notes(
        self,
        transcript_text: str,
        video_title: str,
        channel_name: str,
        note_style: str = "comprehensive"
    ) -> Dict[str, Any]:
        """Structured notes + flashcards + concept map from a lecture transcript."""
        if not self.api_key:
            return {"success": False, "error": "No API key found. Add GEMINI_API_KEY to the .env file."}

        prompt = self._build_notes_prompt(transcript_text, video_title, channel_name, note_style)
        try:
            raw = self._complete(prompt, json_mode=True)
            if not raw.get("success"):
                return raw
            parsed = self._parse_ai_output(raw["content"], video_title)
            return {"success": True, **parsed}
        except Exception as e:
            return {"success": False, "error": f"AI generation error: {str(e)}"}

    def generate_quiz(
        self,
        source_text: str,
        video_title: str,
        count: int = 10,
    ) -> Dict[str, Any]:
        """Multiple-choice quiz with exactly `count` questions (best effort)."""
        if not self.api_key:
            return {"success": False, "error": "No API key found."}
        count = max(5, min(int(count or 10), 50))
        prompt = self._build_quiz_prompt(source_text, video_title, count)
        try:
            raw = self._complete(prompt, json_mode=True)
            if not raw.get("success"):
                return raw
            data = self._load_json(raw["content"])
            questions = data.get("quiz") if isinstance(data, dict) else data
            cleaned = self._clean_quiz(questions or [])
            if not cleaned:
                return {"success": False, "error": "The model returned no usable quiz questions."}
            return {"success": True, "quiz": cleaned[:count]}
        except Exception as e:
            return {"success": False, "error": f"Quiz generation error: {str(e)}"}

    def generate_mindmap(self, source_text: str, video_title: str) -> Dict[str, Any]:
        """Hierarchical concept map; every node carries a short and a full definition."""
        if not self.api_key:
            return {"success": False, "error": "No API key found."}
        prompt = self._build_mindmap_prompt(source_text, video_title)
        try:
            raw = self._complete(prompt, json_mode=True)
            if not raw.get("success"):
                return raw
            data = self._load_json(raw["content"])
            tree = self._clean_mindmap(data.get("root") if isinstance(data, dict) and "root" in data else data)
            if not tree or not tree.get("children"):
                return {"success": False, "error": "The model returned no usable concept map."}
            return {"success": True, "mindmap": tree}
        except Exception as e:
            return {"success": False, "error": f"Mind map generation error: {str(e)}"}

    def chat_with_lecture(
        self,
        question: str,
        transcript_text: str,
        video_title: str,
        chat_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """Q&A grounded in the lecture transcript, answered as structured Markdown."""
        if not self.api_key:
            return {"success": False, "error": "No API key configured."}

        safe_transcript = transcript_text[:60000]
        system_instruction = f"""You are the study tutor for the lecture "{video_title}".
The transcript below has [MM:SS] timestamps. Treat it as the primary source of truth.

Write every answer in clean Markdown, like a well-organised ChatGPT answer:
- Open with a direct 1-2 sentence answer. No greetings, no filler, no emoji.
- For anything conceptual, use a `###` heading per concept, then labelled lines:
  **Definition:** one clear sentence.
  **Explanation:** short paragraph in plain language.
  **Example 1:** a concrete example, then a line explaining it. Add Example 2 if useful.
- Simple factual questions get a short answer without headings.
- Cite where the video covers it by putting the timestamp in square brackets right after the sentence, e.g. [05:42]. Use only timestamps that exist in the transcript. Never invent one. Exactly one timestamp per bracket: write [05:42] [06:10], never [05:42, 06:10].
- Put each label (**Definition:**, **Explanation:**, **Example 1:**) on its own line, with a blank line before it.
- Put code in fenced blocks with a language tag, and math in $...$ or $$...$$.
- Use short bullet lists for steps or comparisons; use a table only for real comparisons.
- If the lecture does not cover the question, begin with "Not covered in the video." and then give a brief explanation labelled **General knowledge:**.
- Answer in the language the student writes in."""

        user_content = f"LECTURE TRANSCRIPT:\n{safe_transcript}\n\nSTUDENT QUESTION:\n{question}"
        history = [m for m in (chat_history or [])[-8:] if m.get("content")]
        try:
            res = self._chat_complete(system_instruction, history, user_content)
            if res.get("success"):
                return {"success": True, "answer": res["content"]}
            return res
        except Exception as e:
            return {"success": False, "error": f"Chat request failed: {str(e)}"}

    # ------------------------------------------------------------------ #
    # Prompts
    # ------------------------------------------------------------------ #
    def _build_notes_prompt(self, transcript_text: str, video_title: str, channel_name: str, note_style: str) -> str:
        transcript = transcript_text[:60000]

        style_instruction = {
            "comprehensive": "Thorough university-level notes. Every major topic gets a full block (definition, explanation, example, key points).",
            "quick": "Short revision notes. One compact block per topic: a one-line definition, 2-4 key points, one tiny example. Keep it fast to read.",
            "exam": "Exam preparation notes. Emphasise precise definitions, formulas, likely exam questions and common mistakes in every topic block.",
            "code_math": "Technical notes. Emphasise formulas (LaTeX), derivations step by step, algorithms, and code in fenced blocks with a language tag."
        }.get(note_style, "Thorough university-level notes.")

        return f"""You are an expert note-taker producing study notes a student could revise from without watching the video.

LECTURE TITLE: {video_title}
CHANNEL: {channel_name}
STYLE: {style_instruction}

TRANSCRIPT (with [MM:SS] timestamps):
{transcript}

LANGUAGE: Write ALL notes in clear, simple English, even if the transcript is in another language (translate it).

Return ONLY valid JSON with this schema:
{{
  "structured_notes_markdown": "<the full notes, see template>",
  "flashcards": [ {{"question": "...", "answer": "..."}} ],
  "mindmap_mermaid": "graph TD\n  A[Core Topic] --> B[Subtopic]"
}}

TEMPLATE for structured_notes_markdown (Markdown, blank line between every block, no emoji anywhere):

## Overview
2-4 sentences: what the lecture is about and why it matters.

## Learning Objectives
- 3 to 6 bullets starting with a verb (Explain, Compare, Apply ...).

## Key Terms
| Term | Meaning |
|---|---|
(6 to 12 rows, one short line each)

## Detailed Notes
Then ONE block per major topic, in lecture order, exactly in this shape:

### 1. Topic name [MM:SS]

**Definition:** One precise sentence defining the topic.

**Explanation:** A short paragraph in plain language. Explain the why, not only the what.

**Example:** A concrete worked example. Then, on a new line, **Why it works:** one sentence explaining it.

**Key Points:**
- bullet
- bullet

**Formula:** $$...$$   (only when the topic has a formula)

**Common Mistake:** one sentence   (only when the lecture warns about one, or in exam style)

(The [MM:SS] in each topic heading is the timestamp where that topic starts. Use real timestamps from the transcript.)

## Key Takeaways
- 4 to 7 bullets that summarise everything worth remembering.

RULES:
- Cover the entire lecture from start to end, not only the beginning.
- Do not invent facts that are not in the transcript. If you add background, keep it minimal.
- Math in $...$ / $$...$$. Code in fenced blocks with a language tag.
- flashcards: AT LEAST 12 cards that test understanding (why/how/compare), not trivia. Answers are 1-3 sentences.
- mindmap_mermaid: simple valid Mermaid `graph TD`, quote any label that has punctuation, at most 20 nodes.
- Output pure JSON. No code fences around it, no trailing commas.
"""

    def _build_mindmap_prompt(self, source_text: str, video_title: str) -> str:
        source = source_text[:60000]
        return f"""Build a hierarchical concept map of the lecture "{video_title}".

SOURCE MATERIAL (may include [MM:SS] timestamps):
{source}

Structure:
- "root": the lecture's central subject.
- 4 to 7 children of root: the major topics, in the order the lecture covers them.
- Each topic has 2 to 5 children: its key sub-concepts. A sub-concept may have 1 to 3 children of its own only when that clearly helps. Maximum depth is 4 levels including root.
- 25 to 45 nodes in total. Cover the whole lecture, start to end.

Every node has exactly these fields:
- "label": 1 to 5 words, no punctuation at the end.
- "short": one line, at most 14 words, a plain-language gist.
- "definition": 1 to 3 sentences that define the concept precisely and say why it matters. Do not repeat the label as the first words.
- "ts": the "MM:SS" timestamp where the lecture starts discussing it, copied from the source, or "" if unknown. Never invent one.
- "children": array of nodes (empty array for leaves).

Write in clear English. No emoji.
Return ONLY valid JSON: {{"root": {{"label": "...", "short": "...", "definition": "...", "ts": "", "children": [ ... ]}}}}
"""

    def _build_quiz_prompt(self, source_text: str, video_title: str, count: int) -> str:
        source = source_text[:60000]
        return f"""Create a multiple-choice quiz of EXACTLY {count} questions for the lecture "{video_title}".

SOURCE MATERIAL:
{source}

Rules:
- Exactly {count} questions. Cover the whole lecture evenly, from start to end.
- Mix recall, understanding and application questions. Make wrong options plausible, not silly.
- 4 options per question. Spread the correct answer across positions A, B, C and D roughly evenly.
- No "all of the above" / "none of the above". No emoji.
- explanation: 1-2 sentences saying why the correct option is right.
- Write in clear English.

Return ONLY valid JSON:
{{"quiz": [{{"question": "...", "options": ["...", "...", "...", "..."], "correct_answer": 0, "explanation": "..."}}]}}
correct_answer is the 0-based index of the right option.
"""

    # ------------------------------------------------------------------ #
    # Provider plumbing
    # ------------------------------------------------------------------ #
    GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-flash-latest"]

    def _complete(self, prompt: str, json_mode: bool = True) -> Dict[str, Any]:
        if self.provider == "gemini":
            return self._call_gemini(prompt, json_mode=json_mode)
        return self._call_openrouter(prompt)

    def _chat_complete(self, system: str, history: List[Dict[str, str]], user_content: str) -> Dict[str, Any]:
        if self.provider == "gemini":
            contents = []
            for m in history:
                role = "model" if m.get("role") in ("assistant", "model") else "user"
                contents.append({"role": role, "parts": [{"text": m["content"]}]})
            contents.append({"role": "user", "parts": [{"text": user_content}]})
            last_err = ""
            for model in self.GEMINI_MODELS:
                try:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
                    resp = requests.post(
                        url,
                        headers={"Content-Type": "application/json"},
                        json={
                            "systemInstruction": {"parts": [{"text": system}]},
                            "contents": contents,
                            "generationConfig": {"temperature": 0.3}
                        },
                        timeout=60
                    )
                    if resp.status_code == 200:
                        parts = resp.json()["candidates"][0]["content"]["parts"]
                        return {"success": True, "content": "".join(p.get("text", "") for p in parts)}
                    last_err = f"{model} returned {resp.status_code}"
                except Exception as e:
                    last_err = f"{model} error: {str(e)}"
            return {"success": False, "error": f"Gemini chat failed: {last_err}"}

        # OpenRouter / OpenAI-style
        messages = [{"role": "system", "content": system}]
        for m in history:
            messages.append({"role": "assistant" if m.get("role") in ("assistant", "model") else "user", "content": m["content"]})
        messages.append({"role": "user", "content": user_content})
        last_err = ""
        for model in ["deepseek/deepseek-chat", "meta-llama/llama-3.3-70b-instruct", "qwen/qwen-2.5-72b-instruct"]:
            try:
                resp = requests.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json",
                             "HTTP-Referer": "http://localhost:5000", "X-Title": "EduScribe AI"},
                    json={"model": model, "messages": messages, "temperature": 0.3},
                    timeout=60
                )
                if resp.status_code == 200:
                    return {"success": True, "content": resp.json()["choices"][0]["message"]["content"]}
                last_err = f"{model}: {resp.status_code}"
            except Exception as e:
                last_err = f"{model} error: {str(e)}"
        return {"success": False, "error": f"Chat API error: {last_err}"}

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

    def _call_gemini(self, prompt: str, json_mode: bool = True) -> Dict[str, Any]:
        last_error = ""
        for model in self.GEMINI_MODELS:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
                resp = requests.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": (
                            {"temperature": 0.3, "responseMimeType": "application/json"}
                            if json_mode else {"temperature": 0.3}
                        )
                    },
                    timeout=180
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

    # ------------------------------------------------------------------ #
    # Parsing helpers
    # ------------------------------------------------------------------ #
    @staticmethod
    def _load_json(raw_text: str) -> Any:
        text = (raw_text or "").strip()
        if text.startswith("```"):
            lines = text.splitlines()
            lines = lines[1:] if lines and lines[0].startswith("```") else lines
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        try:
            return json.loads(text)
        except Exception:
            m = re.search(r"\{.*\}", text, re.DOTALL)
            if m:
                try:
                    return json.loads(m.group(0))
                except Exception:
                    pass
        return {}

    @staticmethod
    def _clean_quiz(questions: List[Any]) -> List[Dict[str, Any]]:
        """Validate questions and shuffle options so the answer position is not biased."""
        import random
        out = []
        for q in questions:
            if not isinstance(q, dict):
                continue
            opts = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()]
            try:
                correct = int(q.get("correct_answer", 0))
            except Exception:
                correct = 0
            if len(opts) < 2 or not (0 <= correct < len(opts)) or not q.get("question"):
                continue
            order = list(range(len(opts)))
            random.shuffle(order)
            out.append({
                "question": str(q["question"]).strip(),
                "options": [opts[i] for i in order],
                "correct_answer": order.index(correct),
                "explanation": str(q.get("explanation", "")).strip()
            })
        return out

    @classmethod
    def _clean_mindmap(cls, node: Any, depth: int = 0) -> Optional[Dict[str, Any]]:
        if not isinstance(node, dict) or not str(node.get("label", "")).strip() or depth > 5:
            return None
        ts = str(node.get("ts", "") or "").strip()
        if not re.fullmatch(r"\d{1,2}:\d{2}(?::\d{2})?", ts):
            ts = ""
        children = [c for c in (cls._clean_mindmap(c, depth + 1) for c in (node.get("children") or [])) if c]
        return {
            "label": str(node["label"]).strip()[:60],
            "short": str(node.get("short", "")).strip()[:160],
            "definition": str(node.get("definition", "")).strip()[:600],
            "ts": ts,
            "children": children
        }

    def _parse_ai_output(self, raw_text: str, video_title: str) -> Dict[str, Any]:
        data = self._load_json(raw_text)
        if not isinstance(data, dict):
            data = {}

        notes_md = data.get("structured_notes_markdown")
        if not notes_md or len(notes_md.strip()) < 50:
            parts = [f"# {video_title}\n"]
            if data.get("executive_summary"):
                parts.append(f"## Overview\n{data['executive_summary']}\n")
            if data.get("learning_objectives"):
                parts.append("## Learning Objectives\n" + "\n".join(f"- {o}" for o in data["learning_objectives"]) + "\n")
            if data.get("key_concepts"):
                parts.append("## Key Terms\n")
                for c in data["key_concepts"]:
                    parts.append(f"**{c.get('term', '')}:** {c.get('definition', '')}\n")
            notes_md = "\n".join(parts)

        flashcards = [
            {"question": str(f.get("question", "")).strip(), "answer": str(f.get("answer", "")).strip()}
            for f in (data.get("flashcards") or [])
            if isinstance(f, dict) and f.get("question") and f.get("answer")
        ]
        return {
            "notes_markdown": notes_md,
            "mindmap_mermaid": data.get("mindmap_mermaid", ""),
            "flashcards": flashcards
        }
