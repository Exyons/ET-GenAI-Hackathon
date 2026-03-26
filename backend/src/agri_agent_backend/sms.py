"""Twilio SMS handler — receives farmer SMS, runs pipeline, replies."""

import os
import re
from typing import Optional, Tuple
from twilio.rest import Client as TwilioClient
from twilio.request_validator import RequestValidator

from .agent import (
    translate_to_english,
    translate_from_english,
    check_intent_helper,
    fetch_rag_context_helper,
    build_draft_prompt,
    clean_think_tags,
    debug_log,
    get_lang_info,
    ollama_client,
    OLLAMA_MODEL,
)
from .farmer_db import get_or_create_farmer, update_language, log_message

# Twilio config
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "")

_twilio_client = None


def _get_twilio() -> Optional[TwilioClient]:
    global _twilio_client
    if _twilio_client is None and TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
        _twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    return _twilio_client


# --------------- Command Parsing ---------------

# Language switch commands (case-insensitive)
LANG_COMMANDS = {
    # English commands
    "lang hi": "hi", "lang hindi": "hi",
    "lang en": "en", "lang english": "en",
    "lang mr": "mr", "lang marathi": "mr",
    "lang te": "te", "lang telugu": "te",
    "lang ta": "ta", "lang tamil": "ta",
    "lang bn": "bn", "lang bengali": "bn",
    "lang kn": "kn", "lang kannada": "kn",
    "lang gu": "gu", "lang gujarati": "gu",
    "lang pa": "pa", "lang punjabi": "pa",
    # Hindi commands
    "भाषा हिंदी": "hi", "भाषा अंग्रेजी": "en",
    "भाषा मराठी": "mr", "भाषा तेलुगु": "te",
    # Marathi commands
    "भाषा हिंदी": "hi", "भाषा इंग्रजी": "en",
    # Telugu commands
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

    # Check help
    if clean in HELP_COMMANDS:
        return "help", None

    # Check language switch
    for cmd, lang in LANG_COMMANDS.items():
        if clean == cmd.lower():
            return "lang", lang

    return None, None


# --------------- Pipeline (non-streaming, for SMS) ---------------

def run_pipeline_sync(query: str, language: str) -> str:
    """Run the full pipeline synchronously. Returns translated response text."""
    debug_log("SMS_PIPELINE_START", {"query": query, "language": language})

    # 1. Translate to English
    translation = translate_to_english(query, language)
    eng_query = translation["translated_query"]

    # 2. Intent check
    intent = check_intent_helper(eng_query)
    if not intent["is_agricultural"]:
        reject_en = "I am an agricultural assistant. I can only help with farming, crops, and agriculture-related questions."
        return translate_from_english(reject_en, language)["translated_text"]

    # 3. RAG
    rag = fetch_rag_context_helper(eng_query)

    # 4. Generate (non-streaming)
    prompt = build_draft_prompt(rag["documents"], eng_query)
    response = ollama_client.chat(
        model=OLLAMA_MODEL, messages=[{"role": "user", "content": prompt}]
    )
    english_response = clean_think_tags(response.get("message", {}).get("content", ""))

    # 5. Translate back
    output = translate_from_english(english_response, language)
    debug_log("SMS_PIPELINE_DONE", {
        "english_response_preview": english_response[:200],
        "translated_preview": output["translated_text"][:200],
    })
    return output["translated_text"]


# --------------- SMS Send/Receive ---------------

def send_sms(to: str, body: str) -> bool:
    """Send an SMS via Twilio."""
    client = _get_twilio()
    if not client:
        debug_log("SMS_SEND_SKIP", {"reason": "Twilio not configured"})
        return False

    try:
        # SMS has 1600 char limit per message; truncate if needed
        if len(body) > 1500:
            body = body[:1497] + "..."

        message = client.messages.create(
            body=body,
            from_=TWILIO_PHONE_NUMBER,
            to=to,
        )
        debug_log("SMS_SENT", {"to": to, "sid": message.sid, "body_length": len(body)})
        return True
    except Exception as e:
        debug_log("SMS_SEND_ERROR", {"to": to, "error": str(e)})
        return False


def handle_incoming_sms(from_phone: str, body: str) -> str:
    """Process an incoming SMS and return the reply text."""
    debug_log("SMS_INCOMING", {"from": from_phone, "body": body})

    # Get or create farmer profile
    farmer = get_or_create_farmer(from_phone, channel="sms")
    lang = farmer["preferred_language"]

    # Log inbound
    log_message(from_phone, "inbound", "sms", body)

    # Check for commands
    cmd_type, cmd_value = parse_command(body)

    if cmd_type == "help":
        reply = HELP_MESSAGES.get(lang, HELP_MESSAGES["en"])
        log_message(from_phone, "outbound", "sms", "", response_text=reply)
        return reply

    if cmd_type == "lang" and cmd_value:
        lang_name = update_language(from_phone, cmd_value)
        lang_info = get_lang_info(cmd_value)
        # Respond in the NEW language
        confirm_msgs = {
            "hi": f"भाषा {lang_name} में बदल दी गई है।",
            "en": f"Language changed to {lang_name}.",
            "mr": f"भाषा {lang_name} मध्ये बदलली.",
            "te": f"భాష {lang_name}కి మార్చబడింది.",
        }
        reply = confirm_msgs.get(cmd_value, f"Language changed to {lang_name}.")
        log_message(from_phone, "outbound", "sms", "", response_text=reply)
        return reply

    # Normal query — run pipeline
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
