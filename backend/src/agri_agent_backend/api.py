from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from .agent import agent_app

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
    """Standard text/SMS endpoint."""
    state = {
        "user_query": req.query,
        "user_language": req.language,
        "location_weather": f"Location: {req.location}" if req.location else None,
        "image_symptoms": None,
        "is_agricultural": True,
        "retrieved_docs": [],
        "draft_answer": "",
        "is_safe": True,
        "final_answer": "",
        "translated_query": "",
    }

    try:
        # Run graph
        result = agent_app.invoke(state)
        return QueryResponse(
            original_query=result["user_query"],
            translated_query=result["translated_query"],
            final_answer=result["final_answer"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload_image")
async def upload_image(
    file: UploadFile = File(...), language: str = Form("hi"), query: str = Form("")
):
    """Endpoint for Vision integration. (Mocked implementation for Hackathon)."""
    # In a real scenario, we'd pass the image bytes to ollama vision model
    # For now, we simulate extraction.
    mock_symptoms = "Brown circular spots with concentric rings on lower leaves."

    state = {
        "user_query": query if query else "What disease is this?",
        "user_language": language,
        "image_symptoms": mock_symptoms,
        "location_weather": None,
        "is_agricultural": True,
        "retrieved_docs": [],
        "draft_answer": "",
        "is_safe": True,
        "final_answer": "",
        "translated_query": "",
    }

    result = agent_app.invoke(state)
    return {"symptoms_extracted": mock_symptoms, "final_answer": result["final_answer"]}


@app.post("/api/whatsapp_webhook")
async def whatsapp_webhook(request: Request):
    """Webhook for Meta WhatsApp Cloud API (Low-bandwidth connection)"""
    # 1. Parse Meta WhatsApp JSON Payload
    # 2. Check internal DB for user's preferred language based on phone number
    # 3. If payload contains "Language: Marathi", update DB
    # 4. Send text to agent_app.invoke()
    # 5. POST back to WhatsApp API
    return {"status": "success", "message": "Webhook received"}

    try:
        # Run graph
        result = agent_app.invoke(state)
        return QueryResponse(
            original_query=result["user_query"],
            translated_query=result["translated_query"],
            final_answer=result["final_answer"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload_image")
async def upload_image(
    file: UploadFile = File(...), language: str = Form("hi"), query: str = Form("")
):
    """Endpoint for Vision integration. (Mocked implementation for Hackathon)."""
    # In a real scenario, we'd pass the image bytes to ollama vision model
    # For now, we simulate extraction.
    mock_symptoms = "Brown circular spots with concentric rings on lower leaves."

    state = {
        "user_query": query if query else "What disease is this?",
        "user_language": language,
        "image_symptoms": mock_symptoms,
        "location_weather": None,
        "is_agricultural": True,
        "retrieved_docs": [],
        "draft_answer": "",
        "is_safe": True,
        "final_answer": "",
        "translated_query": "",
    }

    result = agent_app.invoke(state)
    return {"symptoms_extracted": mock_symptoms, "final_answer": result["final_answer"]}
