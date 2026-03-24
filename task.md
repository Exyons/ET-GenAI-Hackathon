# Project Tasks

## Phase 1: Project Initialization
- [x] Initialize Git repository.
- [x] Create `implementation_plan.md` and `task.md`.
- [x] Scaffold root directory structure (`/frontend`, `/backend`, `/infrastructure`).
- [x] Make initial Git commit.

## Phase 2: Infrastructure & Deployment Scaffold
- [x] Create `Caddyfile` with Rate Limiting (10 req/min) and API Key Auth.
- [x] Create `docker-compose.yml` (Backend, Frontend-test, Caddy).
- [x] Create `Dockerfile` for Python Backend (using `uv`).
- [x] Create `Dockerfile` for Next.js Frontend (using `bun`).

## Phase 3: Backend Setup (Python / uv)
- [x] Initialize backend project with `uv init`.
- [x] Install dependencies (FastAPI, LangGraph, ChromaDB, Whisper).
- [x] Generate mock agricultural compliance data (Markdown/PDFs).
- [x] Setup Vector DB (ChromaDB) and ingestion script.

## Phase 4: Agent Core (LangGraph)
- [x] Build the VLM perception node (Image to Symptoms).
- [x] Build the Weather/Location context node.
- [x] Build the Compliance RAG node.
- [x] Build the Guardrail/Supervisor node (KVK Fallback).
- [x] Create API endpoints for Web App and WhatsApp Webhook.

## Phase 5: Frontend Setup (Next.js / bun)
- [x] Initialize frontend with `bun create next-app`.
- [x] Build UI: Language selector, Chat interface, Microphone (STT) integration, Image upload.
- [x] Integrate TTS playback for model responses.

## Phase 6: Testing & Edge Cases
- [ ] Test out-of-domain queries (medical, political).
- [ ] Test language switching via simulated WhatsApp payload.
- [ ] Verify Caddy rate limiting and auth.
