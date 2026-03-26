from typing import Optional, List, Dict, Any
from ollama import Client
import chromadb
import chromadb.utils.embedding_functions as embedding_functions
from deep_translator import GoogleTranslator
from gtts import gTTS
import os
import re
import io
import base64
import time
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DB_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "chroma_db")

# Environment configurations
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")
OLLAMA_VISION_MODEL = os.environ.get("OLLAMA_VISION_MODEL", "llama3.2-vision")
WHISPER_MODEL = os.environ.get("WHISPER_TTS_MODEL", "base")
DEBUG_MODE = os.environ.get("DEBUG_MODE", "false").lower() == "true"

# Map short language codes to full names and deep-translator/gtts codes
LANG_MAP = {
    "hi": {"name": "Hindi", "translator": "hi", "gtts": "hi", "whisper": "hi"},
    "mr": {"name": "Marathi", "translator": "mr", "gtts": "mr", "whisper": "mr"},
    "te": {"name": "Telugu", "translator": "te", "gtts": "te", "whisper": "te"},
    "en": {"name": "English", "translator": "en", "gtts": "en", "whisper": "en"},
    "ta": {"name": "Tamil", "translator": "ta", "gtts": "ta", "whisper": "ta"},
    "bn": {"name": "Bengali", "translator": "bn", "gtts": "bn", "whisper": "bn"},
    "kn": {"name": "Kannada", "translator": "kn", "gtts": "kn", "whisper": "kn"},
    "gu": {"name": "Gujarati", "translator": "gu", "gtts": "gu", "whisper": "gu"},
    "pa": {"name": "Punjabi", "translator": "pa", "gtts": "pa", "whisper": "pa"},
}

# Initialize Ollama client
ollama_client = Client(host=OLLAMA_BASE_URL)

# Setup Chroma Client
chroma_client = chromadb.PersistentClient(path=DB_DIR)
default_ef = embedding_functions.DefaultEmbeddingFunction()
try:
    collection = chroma_client.get_collection(
        name="agri_compliance", embedding_function=default_ef
    )
except Exception:
    collection = None

# Lazy-load Whisper model (heavy, only load on first STT request)
_whisper_model = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        debug_log("WHISPER_INIT", {"model": WHISPER_MODEL})
        _whisper_model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    return _whisper_model


def get_lang_info(code: str) -> Dict[str, str]:
    """Resolve a language code like 'hi' or 'hi-IN' to lang info dict."""
    base = code.split("-")[0].lower()
    return LANG_MAP.get(base, LANG_MAP["en"])


def debug_log(step: str, data: Dict[str, Any]) -> None:
    """Structured debug logging controlled by DEBUG_MODE env var."""
    if not DEBUG_MODE:
        return
    timestamp = time.strftime("%H:%M:%S")
    print(f"\n{'='*60}")
    print(f"[DEBUG {timestamp}] STEP: {step}")
    print(f"{'-'*60}")
    for key, value in data.items():
        val_str = str(value)
        if len(val_str) > 500:
            val_str = val_str[:500] + "... (truncated)"
        print(f"  {key}: {val_str}")
    print(f"{'='*60}\n")


def clean_think_tags(text: str) -> str:
    """Removes <think>...</think> tags and their contents."""
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    return cleaned.strip()


# --------------- Translation (deep-translator) ---------------

def translate_to_english(query: str, lang: str) -> Dict[str, Any]:
    """Translate user input to English using Google Translate."""
    lang_info = get_lang_info(lang)
    result = {
        "translated_query": query,
        "source_language": lang,
        "source_language_name": lang_info["name"],
        "was_translated": False,
        "duration_ms": 0,
    }

    if lang_info["translator"] == "en":
        debug_log("TRANSLATE_TO_EN", {"action": "skipped (already English)", "query": query})
        return result

    start = time.time()
    try:
        translated = GoogleTranslator(source=lang_info["translator"], target="en").translate(query)
        duration_ms = int((time.time() - start) * 1000)
        result.update({
            "translated_query": translated or query,
            "was_translated": True,
            "duration_ms": duration_ms,
        })
        debug_log("TRANSLATE_TO_EN", {
            "source": lang_info["name"],
            "original": query,
            "translated": translated,
            "duration_ms": duration_ms,
        })
    except Exception as e:
        debug_log("TRANSLATE_TO_EN", {"error": str(e), "fallback": "using original query"})
    return result


def translate_from_english(text: str, lang: str) -> Dict[str, Any]:
    """Translate English LLM output back to user's language."""
    lang_info = get_lang_info(lang)
    result = {
        "translated_text": text,
        "target_language": lang,
        "target_language_name": lang_info["name"],
        "was_translated": False,
        "duration_ms": 0,
    }

    if lang_info["translator"] == "en":
        debug_log("TRANSLATE_FROM_EN", {"action": "skipped (target is English)"})
        return result

    start = time.time()
    try:
        translated = GoogleTranslator(source="en", target=lang_info["translator"]).translate(text)
        duration_ms = int((time.time() - start) * 1000)
        result.update({
            "translated_text": translated or text,
            "was_translated": True,
            "duration_ms": duration_ms,
        })
        debug_log("TRANSLATE_FROM_EN", {
            "target": lang_info["name"],
            "english_text_preview": text[:200],
            "translated_preview": (translated or "")[:200],
            "duration_ms": duration_ms,
        })
    except Exception as e:
        debug_log("TRANSLATE_FROM_EN", {"error": str(e), "fallback": "using English text"})
    return result


# --------------- STT (faster-whisper) ---------------

def transcribe_audio(audio_bytes: bytes, lang: str) -> Dict[str, Any]:
    """Transcribe audio bytes to text using faster-whisper."""
    import tempfile

    start = time.time()
    lang_info = get_lang_info(lang)
    result = {
        "text": "",
        "language_detected": "",
        "duration_ms": 0,
        "error": None,
    }

    try:
        model = _get_whisper_model()
        # faster-whisper needs a file path — write to temp file
        # Use .webm extension so ffmpeg (used internally) knows the format
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            segments, info = model.transcribe(tmp_path, language=lang_info["whisper"])
            text = " ".join(seg.text for seg in segments).strip()
        finally:
            os.unlink(tmp_path)

        duration_ms = int((time.time() - start) * 1000)

        result.update({
            "text": text,
            "language_detected": info.language,
            "duration_ms": duration_ms,
        })
        debug_log("STT", {
            "requested_language": lang_info["name"],
            "detected_language": info.language,
            "transcribed_text": text,
            "duration_ms": duration_ms,
        })
    except Exception as e:
        result["error"] = str(e)
        debug_log("STT_ERROR", {"error": str(e), "audio_size_kb": round(len(audio_bytes) / 1024, 1)})
    return result


# --------------- TTS (gTTS) ---------------

def text_to_speech(text: str, lang: str) -> Dict[str, Any]:
    """Convert text to speech audio (mp3 bytes) using gTTS."""
    start = time.time()
    lang_info = get_lang_info(lang)
    result: Dict[str, Any] = {
        "audio_base64": "",
        "duration_ms": 0,
        "error": None,
    }

    try:
        # Clean think tags from TTS output (handle both closed and unclosed)
        clean_text = clean_think_tags(text)
        # Also remove unclosed <think> tags
        clean_text = re.sub(r"<think>.*", "", clean_text, flags=re.DOTALL).strip()
        # Remove any remaining HTML-like tags
        clean_text = re.sub(r"<[^>]+>", "", clean_text).strip()
        if not clean_text:
            result["error"] = "No text to speak"
            return result

        # gTTS has practical limits — truncate very long text
        max_tts_chars = 5000
        if len(clean_text) > max_tts_chars:
            clean_text = clean_text[:max_tts_chars]
            debug_log("TTS", {"warning": f"Truncated to {max_tts_chars} chars"})

        tts = gTTS(text=clean_text, lang=lang_info["gtts"])
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        audio_b64 = base64.b64encode(audio_buffer.read()).decode("utf-8")
        duration_ms = int((time.time() - start) * 1000)

        result.update({
            "audio_base64": audio_b64,
            "duration_ms": duration_ms,
        })
        debug_log("TTS", {
            "language": lang_info["name"],
            "text_length": len(clean_text),
            "audio_size_kb": round(len(audio_b64) * 3 / 4 / 1024, 1),
            "duration_ms": duration_ms,
        })
    except Exception as e:
        result["error"] = str(e)
        debug_log("TTS_ERROR", {"error": str(e), "text_preview": text[:100]})
        debug_log("TTS_ERROR", {"error": str(e)})
    return result


# --------------- Intent Check ---------------

def check_intent_helper(query: str) -> Dict[str, Any]:
    """Checks if the English query is agricultural."""
    start = time.time()
    prompt = f"Is the following query related to agriculture, farming, crops, plant diseases, weather, or pests? Query: '{query}'. Reply with ONLY 'YES' or 'NO'."
    result = {
        "is_agricultural": True,
        "raw_response": "",
        "duration_ms": 0,
    }
    try:
        response = ollama_client.chat(
            model=OLLAMA_MODEL, messages=[{"role": "user", "content": prompt}]
        )
        raw_ans = response.get("message", {}).get("content", "")
        ans = clean_think_tags(raw_ans).strip().upper()
        duration_ms = int((time.time() - start) * 1000)

        is_agri = not ("NO" in ans and "YES" not in ans)
        result.update({
            "is_agricultural": is_agri,
            "raw_response": ans,
            "duration_ms": duration_ms,
        })
        debug_log("INTENT", {
            "query": query,
            "cleaned_response": ans,
            "is_agricultural": is_agri,
            "duration_ms": duration_ms,
        })
    except Exception as e:
        debug_log("INTENT", {"error": str(e), "fallback": "defaulting to agricultural=True"})
    return result


# --------------- RAG ---------------

def fetch_rag_context_helper(query: str) -> Dict[str, Any]:
    """Fetches relevant compliance guidelines from Vector DB."""
    start = time.time()
    result: Dict[str, Any] = {
        "documents": [],
        "scores": [],
        "sources": [],
        "duration_ms": 0,
    }

    if not collection:
        debug_log("RAG", {"error": "ChromaDB collection not found", "query": query})
        return result

    try:
        results = collection.query(
            query_texts=[query],
            n_results=3,
            include=["documents", "distances", "metadatas"],
        )
        documents = results["documents"][0] if results["documents"] else []
        distances = results["distances"][0] if results.get("distances") else []
        metadatas = results["metadatas"][0] if results.get("metadatas") else []

        scores = [round(1.0 / (1.0 + d), 4) for d in distances] if distances else []
        sources = [m.get("source", "unknown") for m in metadatas] if metadatas else []

        duration_ms = int((time.time() - start) * 1000)
        result.update({
            "documents": documents,
            "scores": scores,
            "sources": sources,
            "distances_raw": [round(d, 4) for d in distances] if distances else [],
            "duration_ms": duration_ms,
        })
        debug_log("RAG", {
            "query": query,
            "num_results": len(documents),
            "scores": scores,
            "sources": sources,
            "duration_ms": duration_ms,
        })
    except Exception as e:
        debug_log("RAG", {"error": str(e), "query": query})
    return result


# --------------- LLM Prompt (English only) ---------------

def build_draft_prompt(
    docs: List[str],
    eng_query: str,
    weather: str = "",
    symptoms: str = "",
) -> str:
    context = "\n\n".join(docs)
    return f"""You are a strict agricultural advisor in India.
Context from official guidelines:
{context}

User Query: {eng_query}
Image Symptoms: {symptoms}
Weather Context: {weather}

Instructions:
1. Analyze the context and the user query.
2. Answer the query based ONLY on the context provided above.
3. If the context does not contain the answer, or if the user asks for a banned chemical, you MUST output EXACTLY: "I do not have enough verified information to answer this safely. Please consult your local Krishi Vigyan Kendra (KVK) official or agricultural officer."
4. DO NOT guess or hallucinate.
5. Respond in English only. Keep the language simple and suitable for a farmer.
"""


# --------------- Vision ---------------

def validate_farm_image(image_bytes: bytes, model: str = OLLAMA_VISION_MODEL) -> Dict[str, Any]:
    """Check if the uploaded image contains agricultural/farm content."""
    start = time.time()
    result: Dict[str, Any] = {
        "is_farm_image": False,
        "description": "",
        "model": model,
        "duration_ms": 0,
        "error": None,
    }

    prompt = """Look at this image and determine if it shows agricultural or farming content (crops, fields, plants, soil, farm animals, agricultural equipment, plant diseases, pests, etc.).

Reply in this exact format:
FARM: YES or NO
DESCRIPTION: one sentence describing what you see in the image"""

    try:
        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        response = ollama_client.chat(
            model=model,
            messages=[{"role": "user", "content": prompt, "images": [b64_image]}],
        )
        raw = clean_think_tags(response.get("message", {}).get("content", ""))
        duration_ms = int((time.time() - start) * 1000)

        is_farm = "YES" in raw.upper().split("DESCRIPTION")[0] if "DESCRIPTION" in raw.upper() else "YES" in raw.upper()
        # Extract description
        desc = raw
        if "DESCRIPTION:" in raw.upper():
            desc = raw.split(":", 2)[-1].strip() if raw.count(":") >= 2 else raw

        result.update({
            "is_farm_image": is_farm,
            "description": desc,
            "raw_response": raw,
            "duration_ms": duration_ms,
        })
        debug_log("VISION_VALIDATE", {
            "is_farm_image": is_farm,
            "description": desc,
            "raw_response": raw,
            "duration_ms": duration_ms,
        })
    except Exception as e:
        duration_ms = int((time.time() - start) * 1000)
        result.update({"error": str(e), "duration_ms": duration_ms})
        debug_log("VISION_VALIDATE_ERROR", {"error": str(e)})
    return result


def get_vision_response(
    image_bytes: bytes, prompt: str, model: str = OLLAMA_VISION_MODEL
) -> Dict[str, Any]:
    """Query Ollama Vision model for symptom extraction."""
    start = time.time()
    result: Dict[str, Any] = {
        "symptoms": "",
        "model": model,
        "image_size_bytes": len(image_bytes),
        "duration_ms": 0,
        "error": None,
    }

    debug_log("VISION_START", {
        "model": model,
        "image_size_kb": round(len(image_bytes) / 1024, 1),
        "prompt": prompt,
    })

    try:
        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        response = ollama_client.chat(
            model=model,
            messages=[{"role": "user", "content": prompt, "images": [b64_image]}],
        )
        raw_content = response.get("message", {}).get("content", "")
        symptoms = clean_think_tags(raw_content)
        duration_ms = int((time.time() - start) * 1000)

        result.update({
            "symptoms": symptoms,
            "raw_response": raw_content[:500],
            "duration_ms": duration_ms,
        })
        debug_log("VISION_DONE", {
            "symptoms_extracted": symptoms,
            "duration_ms": duration_ms,
        })
    except Exception as e:
        duration_ms = int((time.time() - start) * 1000)
        result.update({
            "symptoms": f"[Error: Unable to analyze image: {e}]",
            "error": str(e),
            "duration_ms": duration_ms,
        })
        debug_log("VISION_ERROR", {"error": str(e)})
    return result
