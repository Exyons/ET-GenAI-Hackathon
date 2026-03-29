"""LLM provider abstraction — Ollama (local) and OpenRouter (cloud).

Supports independent provider selection for text and vision models:
  LLM_PROVIDER=openrouter       (text model)
  VISION_LLM_PROVIDER=ollama    (vision model)

Both default to "ollama" if not set.
"""

import os
import base64
import httpx
from typing import Generator, List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

# ---------- Provider config ----------
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "ollama").lower()
VISION_LLM_PROVIDER = os.environ.get("VISION_LLM_PROVIDER", LLM_PROVIDER).lower()

# Ollama
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")
OLLAMA_VISION_MODEL = os.environ.get("OLLAMA_VISION_MODEL", "llama3.2-vision")

# OpenRouter
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash-preview")
OPENROUTER_VISION_MODEL = os.environ.get("OPENROUTER_VISION_MODEL", "google/gemini-2.5-flash-preview")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Resolved model names (used for metadata/logging)
TEXT_MODEL = OPENROUTER_MODEL if LLM_PROVIDER == "openrouter" else OLLAMA_MODEL
VISION_MODEL = OPENROUTER_VISION_MODEL if VISION_LLM_PROVIDER == "openrouter" else OLLAMA_VISION_MODEL

# ---------- Ollama client (lazy) ----------
_ollama_client = None


def _get_ollama():
    global _ollama_client
    if _ollama_client is None:
        from ollama import Client
        _ollama_client = Client(host=OLLAMA_BASE_URL)
    return _ollama_client


def ollama_available() -> bool:
    try:
        _get_ollama().list()
        return True
    except Exception:
        return False


# ---------- OpenRouter helpers ----------
def _openrouter_headers() -> dict:
    return {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://kisanai.machoboiverse.space",
        "X-Title": "Kisan AI",
    }


def _openrouter_chat(model: str, messages: List[Dict], stream: bool = False, timeout: int = 120) -> Any:
    """Call OpenRouter chat completions API."""
    payload = {"model": model, "messages": messages, "stream": stream}
    if stream:
        return _openrouter_chat_stream(model, messages, timeout)
    resp = httpx.post(
        f"{OPENROUTER_BASE_URL}/chat/completions",
        json=payload,
        headers=_openrouter_headers(),
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    # Return in ollama-compatible format
    return {"message": {"content": content}}


def _openrouter_chat_stream(model: str, messages: List[Dict], timeout: int = 120) -> Generator:
    """Stream OpenRouter chat completions, yielding ollama-compatible chunks."""
    import json
    payload = {"model": model, "messages": messages, "stream": True}
    with httpx.stream(
        "POST",
        f"{OPENROUTER_BASE_URL}/chat/completions",
        json=payload,
        headers=_openrouter_headers(),
        timeout=timeout,
    ) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if not line.startswith("data: "):
                continue
            data_str = line[6:].strip()
            if data_str == "[DONE]":
                break
            try:
                data = json.loads(data_str)
                delta = data.get("choices", [{}])[0].get("delta", {})
                content = delta.get("content", "")
                if content:
                    yield {"message": {"content": content}}
            except (json.JSONDecodeError, IndexError, KeyError):
                continue


def _build_vision_messages_openrouter(prompt: str, b64_image: str) -> List[Dict]:
    """Build OpenRouter-compatible multimodal message with image."""
    return [{
        "role": "user",
        "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"}},
        ],
    }]


# ---------- Public API ----------

def chat(prompt: str, stream: bool = False) -> Any:
    """Send a text chat to the configured LLM provider."""
    messages = [{"role": "user", "content": prompt}]
    if LLM_PROVIDER == "openrouter":
        return _openrouter_chat(OPENROUTER_MODEL, messages, stream=stream)
    return _get_ollama().chat(model=OLLAMA_MODEL, messages=messages, stream=stream)


def chat_vision(prompt: str, image_bytes: bytes, stream: bool = False) -> Any:
    """Send a vision chat to the configured vision LLM provider."""
    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    if VISION_LLM_PROVIDER == "openrouter":
        messages = _build_vision_messages_openrouter(prompt, b64_image)
        model = OPENROUTER_VISION_MODEL
        return _openrouter_chat(model, messages, stream=stream)
    # Ollama vision format
    messages = [{"role": "user", "content": prompt, "images": [b64_image]}]
    return _get_ollama().chat(model=OLLAMA_VISION_MODEL, messages=messages, stream=stream)


def get_text_model() -> str:
    """Return the active text model name."""
    return TEXT_MODEL


def get_vision_model() -> str:
    """Return the active vision model name."""
    return VISION_MODEL


def get_provider_info() -> Dict[str, str]:
    """Return current provider configuration for healthcheck."""
    return {
        "text_provider": LLM_PROVIDER,
        "text_model": TEXT_MODEL,
        "vision_provider": VISION_LLM_PROVIDER,
        "vision_model": VISION_MODEL,
    }
