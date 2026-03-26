"""Meta WhatsApp Business Cloud API handler."""

import os
import httpx
from typing import Optional, Dict, Any

from .agent import (
    validate_farm_image,
    get_vision_response,
    translate_to_english,
    translate_from_english,
    transcribe_audio,
    text_to_speech,
    check_intent_helper,
    fetch_rag_context_helper,
    build_draft_prompt,
    clean_think_tags,
    debug_log,
    ollama_client,
    OLLAMA_MODEL,
)
from .farmer_db import get_or_create_farmer, update_language, log_message
from .sms import parse_command, HELP_MESSAGES, run_pipeline_sync

# Meta WhatsApp config
META_WHATSAPP_TOKEN = os.environ.get("META_WHATSAPP_TOKEN", "")
META_VERIFY_TOKEN = os.environ.get("META_VERIFY_TOKEN", "kisan_ai_verify_2024")
META_PHONE_NUMBER_ID = os.environ.get("META_PHONE_NUMBER_ID", "")
META_API_BASE = "https://graph.facebook.com/v21.0"


# --------------- Send Messages ---------------

def _wa_headers() -> dict:
    return {
        "Authorization": f"Bearer {META_WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }


def send_whatsapp_text(to: str, text: str) -> bool:
    """Send a text message via WhatsApp Cloud API."""
    if not META_WHATSAPP_TOKEN or not META_PHONE_NUMBER_ID:
        debug_log("WA_SEND_SKIP", {"reason": "WhatsApp not configured"})
        return False

    url = f"{META_API_BASE}/{META_PHONE_NUMBER_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }

    try:
        resp = httpx.post(url, json=payload, headers=_wa_headers(), timeout=30)
        debug_log("WA_SENT", {"to": to, "status": resp.status_code, "body_length": len(text)})
        return resp.status_code == 200
    except Exception as e:
        debug_log("WA_SEND_ERROR", {"to": to, "error": str(e)})
        return False


def _download_whatsapp_media(media_id: str) -> Optional[bytes]:
    """Download media (image/audio) from WhatsApp by media ID."""
    if not META_WHATSAPP_TOKEN:
        return None

    try:
        # Step 1: Get media URL
        url_resp = httpx.get(
            f"{META_API_BASE}/{media_id}",
            headers=_wa_headers(),
            timeout=30,
        )
        media_url = url_resp.json().get("url")
        if not media_url:
            return None

        # Step 2: Download the actual file
        dl_resp = httpx.get(
            media_url,
            headers={"Authorization": f"Bearer {META_WHATSAPP_TOKEN}"},
            timeout=60,
        )
        debug_log("WA_MEDIA_DOWNLOAD", {"media_id": media_id, "size_kb": round(len(dl_resp.content) / 1024, 1)})
        return dl_resp.content
    except Exception as e:
        debug_log("WA_MEDIA_ERROR", {"media_id": media_id, "error": str(e)})
        return None


# --------------- Parse Incoming Webhook ---------------

def parse_webhook_payload(payload: dict) -> Optional[Dict[str, Any]]:
    """Extract message info from Meta webhook payload. Returns None if not a user message."""
    try:
        entry = payload.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])

        if not messages:
            return None

        msg = messages[0]
        from_phone = msg.get("from", "")
        msg_type = msg.get("type", "")

        result: Dict[str, Any] = {
            "from": from_phone,
            "type": msg_type,
            "text": "",
            "media_id": "",
        }

        if msg_type == "text":
            result["text"] = msg.get("text", {}).get("body", "")
        elif msg_type == "image":
            result["media_id"] = msg.get("image", {}).get("id", "")
            result["text"] = msg.get("image", {}).get("caption", "")
        elif msg_type == "audio":
            result["media_id"] = msg.get("audio", {}).get("id", "")

        return result
    except (IndexError, KeyError):
        return None


# --------------- Handle Message ---------------

def handle_whatsapp_message(msg_info: Dict[str, Any]) -> str:
    """Process a WhatsApp message and return reply text."""
    from_phone = msg_info["from"]
    msg_type = msg_info["type"]
    text = msg_info.get("text", "")
    media_id = msg_info.get("media_id", "")

    debug_log("WA_INCOMING", {"from": from_phone, "type": msg_type, "text": text[:100]})

    # Get/create farmer
    farmer = get_or_create_farmer(from_phone, channel="whatsapp")
    lang = farmer["preferred_language"]

    # Log inbound
    log_message(from_phone, "inbound", "whatsapp", text or f"[{msg_type}]")

    # --- Text message ---
    if msg_type == "text" and text:
        # Check commands first
        cmd_type, cmd_value = parse_command(text)

        if cmd_type == "help":
            reply = HELP_MESSAGES.get(lang, HELP_MESSAGES["en"])
        elif cmd_type == "lang" and cmd_value:
            lang_name = update_language(from_phone, cmd_value)
            confirm = {
                "hi": f"भाषा {lang_name} में बदल दी गई है।",
                "en": f"Language changed to {lang_name}.",
                "mr": f"भाषा {lang_name} मध्ये बदलली.",
                "te": f"భాష {lang_name}కి మార్చబడింది.",
            }
            reply = confirm.get(cmd_value, f"Language changed to {lang_name}.")
        else:
            reply = run_pipeline_sync(text, lang)

        log_message(from_phone, "outbound", "whatsapp", text, response_text=reply)
        return reply

    # --- Image message ---
    if msg_type == "image" and media_id:
        image_bytes = _download_whatsapp_media(media_id)
        if not image_bytes:
            reply = translate_from_english(
                "Sorry, I couldn't download the image. Please try sending it again.",
                lang,
            )["translated_text"]
            log_message(from_phone, "outbound", "whatsapp", "[image download failed]", response_text=reply)
            return reply

        # Validate farm image
        validation = validate_farm_image(image_bytes)
        if not validation["is_farm_image"]:
            reply = translate_from_english(
                "This image doesn't appear to show agricultural content. Please send a photo of your crop, field, or plant.",
                lang,
            )["translated_text"]
            log_message(from_phone, "outbound", "whatsapp", "[non-farm image]", response_text=reply)
            return reply

        # Extract symptoms
        vision_result = get_vision_response(
            image_bytes,
            prompt="Analyze this agricultural image. Identify the crop type and any visible symptoms. Output ONLY a short description.",
        )
        symptoms = vision_result["symptoms"]

        # Use caption as query, or default
        user_query = text if text else "What is wrong with this crop?"
        translation = translate_to_english(user_query, lang)
        eng_query = translation["translated_query"]

        # RAG + generate
        rag = fetch_rag_context_helper(eng_query + " " + symptoms)
        prompt = build_draft_prompt(rag["documents"], eng_query, symptoms=symptoms)
        response = ollama_client.chat(
            model=OLLAMA_MODEL, messages=[{"role": "user", "content": prompt}]
        )
        english_response = clean_think_tags(response.get("message", {}).get("content", ""))
        reply = translate_from_english(english_response, lang)["translated_text"]

        log_message(from_phone, "outbound", "whatsapp", f"[image] {text}", response_text=reply)
        return reply

    # --- Audio/voice note ---
    if msg_type == "audio" and media_id:
        audio_bytes = _download_whatsapp_media(media_id)
        if not audio_bytes:
            reply = translate_from_english(
                "Sorry, I couldn't process your voice message. Please try again or type your question.",
                lang,
            )["translated_text"]
            log_message(from_phone, "outbound", "whatsapp", "[audio download failed]", response_text=reply)
            return reply

        # Transcribe
        stt_result = transcribe_audio(audio_bytes, lang)
        if stt_result["error"] or not stt_result["text"]:
            reply = translate_from_english(
                "Sorry, I couldn't understand the voice message. Please try again or type your question.",
                lang,
            )["translated_text"]
            log_message(from_phone, "outbound", "whatsapp", "[stt failed]", response_text=reply)
            return reply

        transcribed = stt_result["text"]
        debug_log("WA_VOICE_TRANSCRIBED", {"text": transcribed})

        # Run pipeline with transcribed text
        reply = run_pipeline_sync(transcribed, lang)
        log_message(from_phone, "outbound", "whatsapp", f"[voice] {transcribed}", response_text=reply)
        return reply

    # Unsupported message type
    reply = translate_from_english(
        "I can process text messages, images, and voice notes. Please send one of these.",
        lang,
    )["translated_text"]
    log_message(from_phone, "outbound", "whatsapp", f"[unsupported: {msg_type}]", response_text=reply)
    return reply
