"""SMS handler — textbee.dev (primary) + Twilio (fallback).

textbee.dev uses your own Android phone as the SMS gateway.
Twilio is used as a fallback when textbee is not configured.
"""

import os
import re
import hmac
import hashlib
import httpx
from typing import Optional, Tuple

from .agent import (
    translate_to_english,
    translate_from_english,
    check_intent_helper,
    fetch_rag_context_helper,
    build_draft_prompt,
    clean_think_tags,
    debug_log,
)
from . import llm
from .farmer_db import get_or_create_farmer, update_language, log_message

# ---------- TextBee config ----------
TEXTBEE_API_KEY = os.environ.get("TEXTBEE_API_KEY", "")
TEXTBEE_DEVICE_ID = os.environ.get("TEXTBEE_DEVICE_ID", "")
TEXTBEE_WEBHOOK_SECRET = os.environ.get("TEXTBEE_WEBHOOK_SECRET", "")
TEXTBEE_BASE_URL = "https://api.textbee.dev/api/v1"

# ---------- Twilio config (fallback) ----------
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "")

_twilio_client = None


def _get_twilio():
    global _twilio_client
    if _twilio_client is None and TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
        from twilio.rest import Client as TwilioClient
        _twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    return _twilio_client


def textbee_available() -> bool:
    return bool(TEXTBEE_API_KEY and TEXTBEE_DEVICE_ID)


def twilio_available() -> bool:
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER)


# --------------- Command Parsing ---------------

LANG_COMMANDS = {
    "lang hi": "hi", "lang hindi": "hi",
    "lang en": "en", "lang english": "en",
    "lang mr": "mr", "lang marathi": "mr",
    "lang te": "te", "lang telugu": "te",
    "lang ta": "ta", "lang tamil": "ta",
    "lang bn": "bn", "lang bengali": "bn",
    "lang kn": "kn", "lang kannada": "kn",
    "lang gu": "gu", "lang gujarati": "gu",
    "lang pa": "pa", "lang punjabi": "pa",
    "भाषा हिंदी": "hi", "भाषा अंग्रेजी": "en",
    "भाषा मराठी": "mr", "भाषा तेलुगु": "te",
    "भाषा इंग्रजी": "en",
    "భాష హిందీ": "hi", "భాష ఆంగ్లం": "en",
    "భాష తెలుగు": "te", "భాష మరాఠీ": "mr",
}

HELP_COMMANDS = {"help", "मदद", "मदत", "సహాయం"}

HELP_MESSAGES = {
    "hi": (
        "किसान AI मदद:\n"
        "- कोई भी कृषि प्रश्न पूछें\n"
        "- भाषा बदलें: LANG HI / LANG EN / LANG MR / LANG TE\n"
        "- या हिंदी में: भाषा हिंदी / भाषा अंग्रेजी\n"
        "- फसल की फोटो भेजें (WhatsApp पर)\n"
    ),
    "en": (
        "Kisan AI Help:\n"
        "- Ask any agriculture question\n"
        "- Change language: LANG HI / LANG EN / LANG MR / LANG TE\n"
        "- Send crop photo (on WhatsApp)\n"
    ),
    "mr": (
        "किसान AI मदत:\n"
        "- कोणताही कृषी प्रश्न विचारा\n"
        "- भाषा बदला: LANG HI / LANG EN / LANG MR / LANG TE\n"
        "- पिकाचा फोटो पाठवा (WhatsApp वर)\n"
    ),
    "te": (
        "కిసాన్ AI సహాయం:\n"
        "- ఏదైనా వ్యవసాయ ప్రశ్న అడగండి\n"
        "- భాష మార్చండి: LANG HI / LANG EN / LANG MR / LANG TE\n"
        "- పంట ఫోటో పంపండి (WhatsApp లో)\n"
    ),
}


def parse_command(text: str) -> Tuple[Optional[str], Optional[str]]:
    """Parse SMS text for commands. Returns (command_type, value) or (None, None)."""
    clean = text.strip().lower()

    if clean in HELP_COMMANDS:
        return "help", None

    for cmd, lang in LANG_COMMANDS.items():
        if clean == cmd.lower():
            return "lang", lang

    return None, None


# --------------- Pipeline (non-streaming, for SMS) ---------------

def run_pipeline_sync(query: str, language: str) -> str:
    """Run the full pipeline synchronously. Returns translated response text."""
    debug_log("SMS_PIPELINE_START", {"query": query, "language": language})

    translation = translate_to_english(query, language)
    eng_query = translation["translated_query"]

    intent = check_intent_helper(eng_query)
    if not intent["is_agricultural"]:
        reject_en = "I am an agricultural assistant. I can only help with farming, crops, and agriculture-related questions."
        return translate_from_english(reject_en, language)["translated_text"]

    rag = fetch_rag_context_helper(eng_query)

    prompt = build_draft_prompt(rag["documents"], eng_query)
    response = llm.chat(prompt)
    english_response = clean_think_tags(response.get("message", {}).get("content", ""))

    # Strip markdown for SMS (plain text channel)
    english_response = re.sub(r"\*+", "", english_response)
    english_response = re.sub(r"#{1,6}\s*", "", english_response)
    english_response = re.sub(r"`{1,3}(.+?)`{1,3}", r"\1", english_response)
    english_response = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", english_response)

    output = translate_from_english(english_response, language)
    debug_log("SMS_PIPELINE_DONE", {
        "english_response_preview": english_response[:200],
        "translated_preview": output["translated_text"][:200],
    })
    return output["translated_text"]


# --------------- SMS Send (textbee primary, Twilio fallback) ---------------

def send_sms(to: str, body: str) -> bool:
    """Send SMS — tries textbee first, falls back to Twilio."""
    # SMS has ~1600 char limit; truncate if needed
    if len(body) > 1500:
        body = body[:1497] + "..."

    if textbee_available():
        ok = _send_via_textbee(to, body)
        if ok:
            return True
        debug_log("SMS_TEXTBEE_FAILED_FALLBACK", {"to": to})

    if twilio_available():
        return _send_via_twilio(to, body)

    debug_log("SMS_SEND_SKIP", {"reason": "No SMS provider configured"})
    return False


def _send_via_textbee(to: str, body: str) -> bool:
    """Send SMS via textbee.dev API."""
    try:
        url = f"{TEXTBEE_BASE_URL}/gateway/devices/{TEXTBEE_DEVICE_ID}/send-sms"
        resp = httpx.post(
            url,
            json={"recipients": [to], "message": body},
            headers={
                "x-api-key": TEXTBEE_API_KEY,
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        resp.raise_for_status()
        debug_log("SMS_TEXTBEE_SENT", {"to": to, "status": resp.status_code, "body_length": len(body)})
        return True
    except Exception as e:
        debug_log("SMS_TEXTBEE_ERROR", {"to": to, "error": str(e)})
        return False


def _send_via_twilio(to: str, body: str) -> bool:
    """Send SMS via Twilio (fallback)."""
    client = _get_twilio()
    if not client:
        return False
    try:
        message = client.messages.create(body=body, from_=TWILIO_PHONE_NUMBER, to=to)
        debug_log("SMS_TWILIO_SENT", {"to": to, "sid": message.sid, "body_length": len(body)})
        return True
    except Exception as e:
        debug_log("SMS_TWILIO_ERROR", {"to": to, "error": str(e)})
        return False


# --------------- TextBee Webhook Verification ---------------

def verify_textbee_signature(payload_bytes: bytes, signature: str) -> bool:
    """Verify HMAC-SHA256 signature from textbee webhook."""
    if not TEXTBEE_WEBHOOK_SECRET:
        debug_log("TEXTBEE_SIG_SKIP", {"reason": "No webhook secret configured"})
        return True  # Allow unverified in dev

    expected = hmac.new(
        TEXTBEE_WEBHOOK_SECRET.encode(),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# --------------- Incoming SMS Handler ---------------

def handle_incoming_sms(from_phone: str, body: str) -> str:
    """Process an incoming SMS and return the reply text."""
    debug_log("SMS_INCOMING", {"from": from_phone, "body": body})

    farmer = get_or_create_farmer(from_phone, channel="sms")
    lang = farmer["preferred_language"]

    log_message(from_phone, "inbound", "sms", body)

    cmd_type, cmd_value = parse_command(body)

    if cmd_type == "help":
        reply = HELP_MESSAGES.get(lang, HELP_MESSAGES["en"])
        log_message(from_phone, "outbound", "sms", "", response_text=reply)
        return reply

    if cmd_type == "lang" and cmd_value:
        lang_name = update_language(from_phone, cmd_value)
        confirm_msgs = {
            "hi": f"भाषा {lang_name} में बदल दी गई है।",
            "en": f"Language changed to {lang_name}.",
            "mr": f"भाषा {lang_name} मध्ये बदलली.",
            "te": f"భాష {lang_name}కి మార్చబడింది.",
        }
        reply = confirm_msgs.get(cmd_value, f"Language changed to {lang_name}.")
        log_message(from_phone, "outbound", "sms", "", response_text=reply)
        return reply

    try:
        reply = run_pipeline_sync(body, lang)
    except Exception as e:
        debug_log("SMS_PIPELINE_ERROR", {"error": str(e)})
        error_msgs = {
            "hi": "माफ़ करें, कुछ गलत हो गया। कृपया बाद में फिर से कोशिश करें।",
            "en": "Sorry, something went wrong. Please try again later.",
            "mr": "माफ करा, काहीतरी चूक झाली. कृपया नंतर पुन्हा प्रयत्न करा.",
            "te": "క్షమించండి, ఏదో తప్పు జరిగింది. దయచేసి తర్వాత మళ్ళీ ప్రయత్నించండి.",
        }
        reply = error_msgs.get(lang, error_msgs["en"])

    log_message(from_phone, "outbound", "sms", body, response_text=reply)
    return reply
