# Implementation Plan: Agricultural Advisory AI Agent

## 1. Project Overview
A domain-specialized AI agent for Indian agriculture designed to operate within strict compliance guardrails. It supports multi-modal inputs (vision, speech, text, location) and serves both high-connectivity (Web UI) and low-connectivity (WhatsApp/SMS) users.

## 2. Tech Stack & Infrastructure
*   **AI Provider:** Ollama Cloud Server (Remote LLM/VLM execution to save VPS resources).
*   **Environment Configuration:** We use `.env` files to seamlessly configure and swap backend settings (e.g., `OLLAMA_MODEL=llama3.1`, `OLLAMA_VISION_MODEL=llama3.2-vision`, and future `WHISPER_TTS_MODEL`).
*   **Models:** Managed via `.env` (Reasoning/Translation, Image Analysis).
*   **Backend:** Python (FastAPI, LangGraph, ChromaDB) managed via `uv`.
*   **Frontend:** Next.js (App Router), Tailwind CSS, TypeScript managed via `bun`.
*   **Deployment (VPS):** Docker Compose, Caddy (Reverse Proxy, HTTPS, Rate Limiting, API Auth) on a 1C/4GB RAM Linux VPS.
*   **Deployment (Web Prod):** Vercel.

## 3. Multimodal & Connectivity Strategy
*   **Audio:** Local `faster-whisper` (STT) and lightweight TTS for Web UI. (Skipped for low-connectivity SMS/WhatsApp).
*   **Vision:** Image uploads parsed by VLM purely for symptom extraction (no diagnosis).
*   **Location:** Browser GPS (Web) or WhatsApp Pin / NLP extraction (SMS).
*   **Language:** STT translates to English -> English LLM processes RAG -> English Output translates to Native Language. User preferred language stored in DB.

## 4. Compliance & Guardrails (The "KVK Fallback")
*   **RAG Knowledge Base:** Synthetic/Mocked ICAR (Indian Council of Agricultural Research) compliance documents loaded into ChromaDB.
*   **Supervisor Routing:** Non-agricultural queries are explicitly rejected.
*   **Hallucination Prevention:** If an answer isn't in the RAG DB, the agent MUST output "UNKNOWN" and trigger the "Consult local KVK official" fallback.

## 5. Development Workflow
*   **Version Control:** Git repository with continuous, atomic commits.
*   **Task Tracking:** Maintained via `task.md`.

## 6. Manual Execution Guide
To run the servers manually during development (without Docker):

### Backend (Python/FastAPI)
```bash
cd backend
# Create a .env file based on .env.example
cp .env.example .env
# Activate virtual environment and run
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (Next.js/Bun)
```bash
cd frontend
# Install dependencies if not already done
bun install
# Run the development server
bun run dev
```
