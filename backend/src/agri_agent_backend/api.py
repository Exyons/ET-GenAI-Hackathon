from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import json
import time
from dotenv import load_dotenv
from .agent import (
    get_vision_response,
    translate_to_english_helper,
    check_intent_helper,
    fetch_rag_context_helper,
    build_draft_prompt,
    clean_think_tags,
    debug_log,
    ollama_client,
    OLLAMA_MODEL,
    DEBUG_MODE,
)

load_dotenv()

app = FastAPI(title="Agricultural Advisory AI Agent API")

# Setup CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str
    language: str = "hi"
    location: Optional[str] = None


class QueryResponse(BaseModel):
    original_query: str
    translated_query: str
    final_answer: str


def sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@app.post("/api/ask", response_model=QueryResponse)
async def ask_agent(req: QueryRequest):
    """Fallback standard endpoint."""
    try:
        translation = translate_to_english_helper(req.query, req.language)
        eng_query = translation["translated_query"]
        intent = check_intent_helper(eng_query)

        if not intent["is_agricultural"]:
            final_ans = "I am an agricultural assistant. Please consult a relevant professional."
        else:
            rag = fetch_rag_context_helper(eng_query)
            prompt = build_draft_prompt(rag["documents"], eng_query, req.language)
            response = ollama_client.chat(
                model=OLLAMA_MODEL, messages=[{"role": "user", "content": prompt}]
            )
            final_ans = clean_think_tags(response.get("message", {}).get("content", ""))

        return QueryResponse(
            original_query=req.query, translated_query=eng_query, final_answer=final_ans
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ask_stream")
async def ask_agent_stream(req: QueryRequest):
    """Streaming endpoint for SSE with pipeline metadata."""

    async def event_generator():
        pipeline_start = time.time()
        try:
            # 1. Translate
            yield sse_event({"type": "status", "step": "translate"})
            translation = translate_to_english_helper(req.query, req.language)
            eng_query = translation["translated_query"]
            yield sse_event({
                "type": "metadata",
                "step": "translate",
                "data": {
                    "original_query": req.query,
                    "translated_query": eng_query,
                    "was_translated": translation["was_translated"],
                    "source_language": translation["source_language"],
                    "duration_ms": translation["duration_ms"],
                },
            })

            # 2. Intent
            yield sse_event({"type": "status", "step": "intent"})
            intent = check_intent_helper(eng_query)
            yield sse_event({
                "type": "metadata",
                "step": "intent",
                "data": {
                    "is_agricultural": intent["is_agricultural"],
                    "raw_response": intent["raw_response"],
                    "duration_ms": intent["duration_ms"],
                },
            })

            if not intent["is_agricultural"]:
                msg = "I am an agricultural assistant. Please consult a relevant professional."
                yield sse_event({"type": "chunk", "content": msg})
                yield sse_event({"type": "done", "total_duration_ms": int((time.time() - pipeline_start) * 1000)})
                return

            # 3. RAG Context
            yield sse_event({"type": "status", "step": "rag"})
            rag = fetch_rag_context_helper(eng_query)
            yield sse_event({
                "type": "metadata",
                "step": "rag",
                "data": {
                    "num_documents": len(rag["documents"]),
                    "scores": rag["scores"],
                    "sources": rag["sources"],
                    "doc_previews": [d[:150] + "..." if len(d) > 150 else d for d in rag["documents"]],
                    "duration_ms": rag["duration_ms"],
                },
            })

            # 4. Generate & Stream
            yield sse_event({"type": "status", "step": "generate"})
            prompt = build_draft_prompt(rag["documents"], eng_query, req.language)
            debug_log("GENERATE", {"model": OLLAMA_MODEL, "prompt_length": len(prompt)})

            gen_start = time.time()
            token_count = 0
            for chunk in ollama_client.chat(
                model=OLLAMA_MODEL,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
            ):
                content = chunk.get("message", {}).get("content", "")
                if content:
                    token_count += 1
                    yield sse_event({"type": "chunk", "content": content})

            gen_duration = int((time.time() - gen_start) * 1000)
            total_duration = int((time.time() - pipeline_start) * 1000)
            yield sse_event({
                "type": "metadata",
                "step": "generate",
                "data": {
                    "model": OLLAMA_MODEL,
                    "chunks_streamed": token_count,
                    "generation_duration_ms": gen_duration,
                },
            })
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
    """Streaming Vision endpoint with pipeline metadata."""

    async def event_generator():
        pipeline_start = time.time()
        try:
            # 1. Vision Analysis
            yield sse_event({"type": "status", "step": "vision"})
            image_bytes = await file.read()
            debug_log("IMAGE_UPLOAD", {
                "filename": file.filename,
                "content_type": file.content_type,
                "size_bytes": len(image_bytes),
                "size_kb": round(len(image_bytes) / 1024, 1),
            })

            vision_prompt = "Analyze this agricultural image. Identify the crop type and any visible symptoms. Output ONLY a short description of symptoms."
            vision_result = get_vision_response(image_bytes, prompt=vision_prompt)
            symptoms = vision_result["symptoms"]

            yield sse_event({
                "type": "metadata",
                "step": "vision",
                "data": {
                    "filename": file.filename,
                    "image_size_kb": round(len(image_bytes) / 1024, 1),
                    "model": vision_result["model"],
                    "symptoms_detected": symptoms,
                    "duration_ms": vision_result["duration_ms"],
                    "error": vision_result.get("error"),
                },
            })

            user_query = query if query else "What is wrong with this crop?"

            # 2. Translate
            yield sse_event({"type": "status", "step": "translate"})
            translation = translate_to_english_helper(user_query, language)
            eng_query = translation["translated_query"]
            yield sse_event({
                "type": "metadata",
                "step": "translate",
                "data": {
                    "original_query": user_query,
                    "translated_query": eng_query,
                    "was_translated": translation["was_translated"],
                    "duration_ms": translation["duration_ms"],
                },
            })

            # 3. RAG Context
            yield sse_event({"type": "status", "step": "rag"})
            rag = fetch_rag_context_helper(eng_query + " " + symptoms)
            yield sse_event({
                "type": "metadata",
                "step": "rag",
                "data": {
                    "num_documents": len(rag["documents"]),
                    "scores": rag["scores"],
                    "sources": rag["sources"],
                    "doc_previews": [d[:150] + "..." if len(d) > 150 else d for d in rag["documents"]],
                    "duration_ms": rag["duration_ms"],
                },
            })

            # 4. Generate & Stream
            yield sse_event({"type": "status", "step": "generate"})
            prompt = build_draft_prompt(rag["documents"], eng_query, language, symptoms=symptoms)
            debug_log("GENERATE_VISION", {
                "model": OLLAMA_MODEL,
                "prompt_length": len(prompt),
                "symptoms": symptoms,
            })

            gen_start = time.time()
            token_count = 0
            for chunk in ollama_client.chat(
                model=OLLAMA_MODEL,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
            ):
                content = chunk.get("message", {}).get("content", "")
                if content:
                    token_count += 1
                    yield sse_event({"type": "chunk", "content": content})

            gen_duration = int((time.time() - gen_start) * 1000)
            total_duration = int((time.time() - pipeline_start) * 1000)
            yield sse_event({
                "type": "metadata",
                "step": "generate",
                "data": {
                    "model": OLLAMA_MODEL,
                    "chunks_streamed": token_count,
                    "generation_duration_ms": gen_duration,
                },
            })
            yield sse_event({"type": "done", "total_duration_ms": total_duration})
        except Exception as e:
            debug_log("VISION_STREAM_ERROR", {"error": str(e)})
            print(f"Stream error: {e}")
            yield sse_event({"type": "error", "message": f"Backend error: {str(e)}"})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/whatsapp_webhook")
async def whatsapp_webhook(request: Request):
    """Webhook for Meta WhatsApp Cloud API (Low-bandwidth connection)"""
    return {"status": "success", "message": "Webhook received"}
