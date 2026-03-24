# Implementation Plan: Agricultural Advisory AI Agent

## 1. Project Overview
A domain-specialized AI agent for Indian agriculture designed to operate within strict compliance guardrails. It supports multi-modal inputs (vision, speech, text, location) and serves both high-connectivity (Web UI) and low-connectivity (WhatsApp/SMS) users.

*Note: To optimize for real-time Server-Sent Events (SSE) streaming (especially for models outputting `<think>` tags), the orchestration was shifted from LangGraph to a highly optimized linear FastAPI streaming pipeline. This provides instant visual feedback to the farmer.*

## 2. Tech Stack & Infrastructure
*   **AI Provider:** Ollama Cloud Server (Remote LLM/VLM execution to save VPS resources).
*   **Environment Configuration:** We use `.env` files to seamlessly configure and swap backend settings (e.g., `OLLAMA_MODEL=nemotron-3-super:cloud`, `OLLAMA_VISION_MODEL=qwen3-vl:235b-cloud`).
*   **Backend:** Python (FastAPI, ChromaDB) managed via `uv`.
*   **Frontend:** Next.js (App Router), Tailwind CSS, TypeScript managed via `bun`.
*   **Deployment (VPS):** Docker Compose, Caddy (Reverse Proxy, HTTPS, Rate Limiting, API Auth) on a 1C/4GB RAM Linux VPS.

## 3. Multimodal & Connectivity Strategy
*   **Audio:** Native Web Speech API (`window.SpeechRecognition` and `window.speechSynthesis`) for zero-cost, localized Speech-to-Text and Text-to-Speech in the browser (Hindi, Marathi, Telugu, etc.).
*   **Vision:** Image uploads parsed by VLM purely for symptom extraction (no diagnosis).
*   **Location:** Browser GPS (Web) or WhatsApp Pin / NLP extraction (SMS).
*   **Language:** STT translates to English -> English LLM processes RAG -> LLM drafts final answer and translates back to Native Language in a single streaming pass.

## 4. Compliance & Guardrails (The "KVK Fallback")
*   **RAG Knowledge Base:** Synthetic/Mocked ICAR (Indian Council of Agricultural Research) compliance documents loaded into ChromaDB.
*   **Supervisor Routing:** Non-agricultural queries are explicitly rejected before reaching the LLM.
*   **Hallucination Prevention:** If an answer isn't in the RAG DB, the agent MUST output a fallback message and trigger the "Consult local KVK official" response.

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

## 7. What's Left (Future Scope / Phase 2)
While the Hackathon MVP is fully functional, the following items are scoped for a production release:
1. **WhatsApp Cloud API Integration:** Connect the currently mocked `/api/whatsapp_webhook` to real Meta Webhooks for live SMS/WhatsApp interaction.
2. **Persistent User Profiles:** Replace the session-based language preference with a PostgreSQL database tracking farmer profiles (Phone Number -> Preferred Language, Farm Size, Crop History).
3. **Automated Knowledge Ingestion:** Replace the manual Mock ICAR Markdown files with a web-scraper that pulls live PDFs from Indian Government Agricultural portals and chunks them into ChromaDB automatically.
