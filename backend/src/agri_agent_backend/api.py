from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import StreamingResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import json
import time
from dotenv import load_dotenv
from .agent import (
    validate_farm_image,
    get_vision_response,
    translate_to_english,
    translate_from_english,
    text_to_speech,
    transcribe_audio,
    check_intent_helper,
    fetch_rag_context_helper,
    build_draft_prompt,
    clean_think_tags,
    debug_log,
    ollama_client,
    OLLAMA_MODEL,
    DEBUG_MODE,
)
from .sms import handle_incoming_sms, send_sms
from .whatsapp import (
    parse_webhook_payload,
    handle_whatsapp_message,
    send_whatsapp_text,
    META_VERIFY_TOKEN,
)
from .drone import DroneSimulator, generate_spray_plan

load_dotenv()

app = FastAPI(title="Agricultural Advisory AI Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str
    language: str = "hi"
    location: Optional[str] = None


def sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@app.post("/api/ask_stream")
async def ask_agent_stream(req: QueryRequest):
    """Streaming endpoint. LLM works in English; translation handled by deep-translator."""

    async def event_generator():
        pipeline_start = time.time()
        try:
            # 1. Translate user input to English
            yield sse_event({"type": "status", "step": "translate"})
            translation = translate_to_english(req.query, req.language)
            eng_query = translation["translated_query"]
            yield sse_event({
                "type": "metadata", "step": "translate",
                "data": {
                    "original_query": req.query,
                    "translated_query": eng_query,
                    "was_translated": translation["was_translated"],
                    "source_language": translation["source_language_name"],
                    "duration_ms": translation["duration_ms"],
                },
            })

            # 2. Intent check (on English text)
            yield sse_event({"type": "status", "step": "intent"})
            intent = check_intent_helper(eng_query)
            yield sse_event({
                "type": "metadata", "step": "intent",
                "data": {
                    "is_agricultural": intent["is_agricultural"],
                    "raw_response": intent["raw_response"],
                    "duration_ms": intent["duration_ms"],
                },
            })

            if not intent["is_agricultural"]:
                reject_en = "I am an agricultural assistant. I can only help with farming, crops, and agriculture-related questions."
                reject_translated = translate_from_english(reject_en, req.language)
                yield sse_event({"type": "chunk", "content": reject_translated["translated_text"]})
                tts_result = text_to_speech(reject_translated["translated_text"], req.language)
                if tts_result["audio_base64"]:
                    yield sse_event({"type": "audio", "audio_base64": tts_result["audio_base64"]})
                yield sse_event({"type": "done", "total_duration_ms": int((time.time() - pipeline_start) * 1000)})
                return

            # 3. RAG Context
            yield sse_event({"type": "status", "step": "rag"})
            rag = fetch_rag_context_helper(eng_query)
            yield sse_event({
                "type": "metadata", "step": "rag",
                "data": {
                    "num_documents": len(rag["documents"]),
                    "scores": rag["scores"],
                    "sources": rag["sources"],
                    "doc_previews": [d[:150] + "..." if len(d) > 150 else d for d in rag["documents"]],
                    "duration_ms": rag["duration_ms"],
                },
            })

            # 4. Generate English response (streamed), collect full text
            yield sse_event({"type": "status", "step": "generate"})
            prompt = build_draft_prompt(rag["documents"], eng_query)
            debug_log("GENERATE", {"model": OLLAMA_MODEL, "prompt_length": len(prompt)})

            gen_start = time.time()
            token_count = 0
            english_response = ""
            for chunk in ollama_client.chat(
                model=OLLAMA_MODEL,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
            ):
                content = chunk.get("message", {}).get("content", "")
                if content:
                    token_count += 1
                    english_response += content

            english_response = clean_think_tags(english_response)
            gen_duration = int((time.time() - gen_start) * 1000)
            yield sse_event({
                "type": "metadata", "step": "generate",
                "data": {
                    "model": OLLAMA_MODEL,
                    "english_response": english_response[:300],
                    "chunks_streamed": token_count,
                    "generation_duration_ms": gen_duration,
                },
            })

            # 5. Translate English response to user's language
            yield sse_event({"type": "status", "step": "translate_response"})
            output_translation = translate_from_english(english_response, req.language)
            final_text = output_translation["translated_text"]
            yield sse_event({
                "type": "metadata", "step": "translate_response",
                "data": {
                    "target_language": output_translation["target_language_name"],
                    "was_translated": output_translation["was_translated"],
                    "duration_ms": output_translation["duration_ms"],
                },
            })

            # Send the final translated response as a single chunk
            yield sse_event({"type": "chunk", "content": final_text})

            # 6. Generate TTS audio
            yield sse_event({"type": "status", "step": "tts"})
            tts_result = text_to_speech(final_text, req.language)
            yield sse_event({
                "type": "metadata", "step": "tts",
                "data": {
                    "duration_ms": tts_result["duration_ms"],
                    "error": tts_result.get("error"),
                },
            })
            if tts_result["audio_base64"]:
                yield sse_event({"type": "audio", "audio_base64": tts_result["audio_base64"]})

            total_duration = int((time.time() - pipeline_start) * 1000)
            yield sse_event({"type": "done", "total_duration_ms": total_duration})
        except Exception as e:
            debug_log("STREAM_ERROR", {"error": str(e)})
            print(f"Stream error: {e}")
            yield sse_event({"type": "error", "message": f"Backend error: {str(e)}"})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/upload_image_stream")
async def upload_image_stream(
    file: UploadFile = File(...), language: str = Form("hi"), query: str = Form("")
):
    """Streaming Vision endpoint with farm image validation."""

    async def event_generator():
        pipeline_start = time.time()
        try:
            image_bytes = await file.read()
            debug_log("IMAGE_UPLOAD", {
                "filename": file.filename,
                "content_type": file.content_type,
                "size_kb": round(len(image_bytes) / 1024, 1),
            })

            # 1. Validate: is this a farm/crop image?
            yield sse_event({"type": "status", "step": "vision_validate"})
            validation = validate_farm_image(image_bytes)
            yield sse_event({
                "type": "metadata", "step": "vision_validate",
                "data": {
                    "is_farm_image": validation["is_farm_image"],
                    "description": validation["description"],
                    "model": validation["model"],
                    "duration_ms": validation["duration_ms"],
                    "error": validation.get("error"),
                },
            })

            if not validation["is_farm_image"]:
                reject_en = "This image does not appear to contain agricultural or farming content. Please upload a photo of your crop, field, or plant so I can help diagnose any issues."
                reject_translated = translate_from_english(reject_en, language)
                yield sse_event({"type": "chunk", "content": reject_translated["translated_text"]})
                tts_result = text_to_speech(reject_translated["translated_text"], language)
                if tts_result["audio_base64"]:
                    yield sse_event({"type": "audio", "audio_base64": tts_result["audio_base64"]})
                yield sse_event({"type": "done", "total_duration_ms": int((time.time() - pipeline_start) * 1000)})
                return

            # 2. Vision symptom extraction
            yield sse_event({"type": "status", "step": "vision"})
            vision_prompt = "Analyze this agricultural image. Identify the crop type and any visible symptoms of disease, pest damage, or nutrient deficiency. Output ONLY a short description of what you observe."
            vision_result = get_vision_response(image_bytes, prompt=vision_prompt)
            symptoms = vision_result["symptoms"]
            yield sse_event({
                "type": "metadata", "step": "vision",
                "data": {
                    "filename": file.filename,
                    "image_size_kb": round(len(image_bytes) / 1024, 1),
                    "model": vision_result["model"],
                    "symptoms_detected": symptoms,
                    "duration_ms": vision_result["duration_ms"],
                    "error": vision_result.get("error"),
                },
            })

            # 3. Translate user query to English
            user_query = query if query else "What is wrong with this crop?"
            yield sse_event({"type": "status", "step": "translate"})
            translation = translate_to_english(user_query, language)
            eng_query = translation["translated_query"]
            yield sse_event({
                "type": "metadata", "step": "translate",
                "data": {
                    "original_query": user_query,
                    "translated_query": eng_query,
                    "was_translated": translation["was_translated"],
                    "source_language": translation["source_language_name"],
                    "duration_ms": translation["duration_ms"],
                },
            })

            # 4. RAG Context
            yield sse_event({"type": "status", "step": "rag"})
            rag = fetch_rag_context_helper(eng_query + " " + symptoms)
            yield sse_event({
                "type": "metadata", "step": "rag",
                "data": {
                    "num_documents": len(rag["documents"]),
                    "scores": rag["scores"],
                    "sources": rag["sources"],
                    "doc_previews": [d[:150] + "..." if len(d) > 150 else d for d in rag["documents"]],
                    "duration_ms": rag["duration_ms"],
                },
            })

            # 5. Generate English response
            yield sse_event({"type": "status", "step": "generate"})
            prompt = build_draft_prompt(rag["documents"], eng_query, symptoms=symptoms)

            gen_start = time.time()
            token_count = 0
            english_response = ""
            for chunk in ollama_client.chat(
                model=OLLAMA_MODEL,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
            ):
                content = chunk.get("message", {}).get("content", "")
                if content:
                    token_count += 1
                    english_response += content

            english_response = clean_think_tags(english_response)
            gen_duration = int((time.time() - gen_start) * 1000)
            yield sse_event({
                "type": "metadata", "step": "generate",
                "data": {
                    "model": OLLAMA_MODEL,
                    "english_response": english_response[:300],
                    "chunks_streamed": token_count,
                    "generation_duration_ms": gen_duration,
                },
            })

            # 6. Translate to user language
            yield sse_event({"type": "status", "step": "translate_response"})
            output_translation = translate_from_english(english_response, language)
            final_text = output_translation["translated_text"]
            yield sse_event({
                "type": "metadata", "step": "translate_response",
                "data": {
                    "target_language": output_translation["target_language_name"],
                    "was_translated": output_translation["was_translated"],
                    "duration_ms": output_translation["duration_ms"],
                },
            })

            yield sse_event({"type": "chunk", "content": final_text})

            # 7. TTS
            yield sse_event({"type": "status", "step": "tts"})
            tts_result = text_to_speech(final_text, language)
            yield sse_event({
                "type": "metadata", "step": "tts",
                "data": {
                    "duration_ms": tts_result["duration_ms"],
                    "error": tts_result.get("error"),
                },
            })
            if tts_result["audio_base64"]:
                yield sse_event({"type": "audio", "audio_base64": tts_result["audio_base64"]})

            total_duration = int((time.time() - pipeline_start) * 1000)
            yield sse_event({"type": "done", "total_duration_ms": total_duration})
        except Exception as e:
            debug_log("VISION_STREAM_ERROR", {"error": str(e)})
            print(f"Stream error: {e}")
            yield sse_event({"type": "error", "message": f"Backend error: {str(e)}"})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/transcribe")
async def transcribe_endpoint(
    file: UploadFile = File(...), language: str = Form("hi")
):
    """STT endpoint: accepts audio file, returns transcribed text."""
    audio_bytes = await file.read()
    debug_log("STT_REQUEST", {
        "filename": file.filename,
        "content_type": file.content_type,
        "size_kb": round(len(audio_bytes) / 1024, 1),
        "language": language,
    })
    result = transcribe_audio(audio_bytes, language)
    if result["error"]:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"text": result["text"], "language_detected": result["language_detected"]}


# --------------- SMS (Twilio) ---------------

@app.post("/api/sms/webhook")
async def sms_webhook(request: Request):
    """Twilio SMS webhook — receives incoming SMS, replies via Twilio."""
    form = await request.form()
    from_phone = form.get("From", "")
    body = form.get("Body", "")

    if not from_phone or not body:
        return PlainTextResponse("OK")

    debug_log("SMS_WEBHOOK", {"from": from_phone, "body": body[:100]})

    # Process and get reply
    reply = handle_incoming_sms(from_phone, body)

    # Send reply via Twilio
    send_sms(from_phone, reply)

    # Return TwiML empty response (we send via API, not TwiML)
    return PlainTextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        media_type="application/xml",
    )


# --------------- WhatsApp (Meta Cloud API) ---------------

@app.get("/api/whatsapp/webhook")
async def whatsapp_verify(request: Request):
    """Meta webhook verification (GET request with challenge)."""
    params = request.query_params
    mode = params.get("hub.mode", "")
    token = params.get("hub.verify_token", "")
    challenge = params.get("hub.challenge", "")

    if mode == "subscribe" and token == META_VERIFY_TOKEN:
        debug_log("WA_VERIFY", {"status": "verified"})
        return PlainTextResponse(challenge)

    debug_log("WA_VERIFY", {"status": "rejected", "token": token})
    return PlainTextResponse("Forbidden", status_code=403)


@app.post("/api/whatsapp/webhook")
async def whatsapp_webhook(request: Request):
    """Meta WhatsApp webhook — receives messages, replies via API."""
    payload = await request.json()
    debug_log("WA_WEBHOOK_RAW", {"payload_keys": list(payload.keys())})

    msg_info = parse_webhook_payload(payload)
    if not msg_info:
        # Not a user message (could be status update, etc.)
        return {"status": "ok"}

    # Process and reply
    reply = handle_whatsapp_message(msg_info)
    send_whatsapp_text(msg_info["from"], reply)

    return {"status": "ok"}


# --------------- Drone Simulation ---------------


class SurveyRequest(BaseModel):
    """Field bounds for drone survey."""
    nw_lat: float
    nw_lon: float
    se_lat: float
    se_lon: float
    altitude: float = 50.0
    grid_rows: int = 4
    grid_cols: int = 4


class SprayPlanRequest(BaseModel):
    """Detections from a survey for spray plan generation."""
    detections: list[dict]
    field_bounds: dict


@app.post("/api/drone/survey")
async def drone_survey(req: SurveyRequest):
    """Start a drone survey simulation. Returns SSE stream of telemetry + detections."""

    field_bounds = {
        "nw": [req.nw_lat, req.nw_lon],
        "se": [req.se_lat, req.se_lon],
    }

    debug_log("DRONE_SURVEY", {
        "field_bounds": field_bounds,
        "altitude": req.altitude,
        "grid": f"{req.grid_rows}x{req.grid_cols}",
    })

    sim = DroneSimulator(
        field_bounds=field_bounds,
        altitude=req.altitude,
        grid_rows=req.grid_rows,
        grid_cols=req.grid_cols,
    )

    def event_generator():
        for event in sim.run_survey(step_delay=0.3):
            yield sse_event(event)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/drone/spray_plan")
async def drone_spray_plan(req: SprayPlanRequest):
    """Generate a precision spray plan from drone survey detections."""
    debug_log("SPRAY_PLAN", {"num_detections": len(req.detections)})
    plan = generate_spray_plan(req.detections, req.field_bounds)
    return plan
