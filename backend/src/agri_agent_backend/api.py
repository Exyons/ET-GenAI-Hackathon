from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import json
from dotenv import load_dotenv
from .agent import (
    get_vision_response,
    translate_to_english_helper,
    check_intent_helper,
    fetch_rag_context_helper,
    build_draft_prompt,
    clean_think_tags,
    ollama_client,
    OLLAMA_MODEL,
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


@app.post("/api/ask", response_model=QueryResponse)
async def ask_agent(req: QueryRequest):
    """Fallback standard endpoint."""
    try:
        eng_query = translate_to_english_helper(req.query, req.language)
        is_agri = check_intent_helper(eng_query)

        if not is_agri:
            final_ans = "I am an agricultural assistant. Please consult a relevant professional."
        else:
            docs = fetch_rag_context_helper(eng_query)
            prompt = build_draft_prompt(docs, eng_query, req.language)
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
    """Streaming endpoint for SSE."""

    async def event_generator():
        try:
            # 1. Translate
            yield f"data: {json.dumps({'type': 'status', 'step': 'translate'})}\n\n"
            eng_query = translate_to_english_helper(req.query, req.language)

            # 2. Intent
            yield f"data: {json.dumps({'type': 'status', 'step': 'intent'})}\n\n"
            is_agri = check_intent_helper(eng_query)

            if not is_agri:
                msg = "I am an agricultural assistant. Please consult a relevant professional."
                yield f"data: {json.dumps({'type': 'chunk', 'content': msg})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return

            # 3. RAG Context
            yield f"data: {json.dumps({'type': 'status', 'step': 'rag'})}\n\n"
            docs = fetch_rag_context_helper(eng_query)

            # 4. Generate & Stream
            yield f"data: {json.dumps({'type': 'status', 'step': 'generate'})}\n\n"
            prompt = build_draft_prompt(docs, eng_query, req.language)

            for chunk in ollama_client.chat(
                model=OLLAMA_MODEL,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
            ):
                content = chunk.get("message", {}).get("content", "")
                if content:
                    yield f"data: {json.dumps({'type': 'chunk', 'content': content})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            print(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Backend error occurred.'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/upload_image_stream")
async def upload_image_stream(
    file: UploadFile = File(...), language: str = Form("hi"), query: str = Form("")
):
    """Streaming Vision endpoint."""

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'status', 'step': 'vision'})}\n\n"
            image_bytes = await file.read()
            prompt = "Analyze this agricultural image. Identify the crop type and any visible symptoms. Output ONLY a short description of symptoms."
            symptoms = get_vision_response(image_bytes, prompt=prompt)

            user_query = query if query else "What is wrong with this crop?"

            yield f"data: {json.dumps({'type': 'status', 'step': 'translate'})}\n\n"
            eng_query = translate_to_english_helper(user_query, language)

            yield f"data: {json.dumps({'type': 'status', 'step': 'rag'})}\n\n"
            docs = fetch_rag_context_helper(eng_query + " " + symptoms)

            yield f"data: {json.dumps({'type': 'status', 'step': 'generate'})}\n\n"
            prompt = build_draft_prompt(docs, eng_query, language, symptoms=symptoms)

            for chunk in ollama_client.chat(
                model=OLLAMA_MODEL,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
            ):
                content = chunk.get("message", {}).get("content", "")
                if content:
                    yield f"data: {json.dumps({'type': 'chunk', 'content': content})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            print(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Backend error occurred.'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/whatsapp_webhook")
async def whatsapp_webhook(request: Request):
    """Webhook for Meta WhatsApp Cloud API (Low-bandwidth connection)"""
    return {"status": "success", "message": "Webhook received"}
