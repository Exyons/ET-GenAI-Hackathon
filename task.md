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

## Phase 4: Agent Core
- [x] Build the VLM perception node (Image to Symptoms).
- [x] Build the Compliance RAG node.
- [x] Build the Guardrail/Supervisor node (KVK Fallback).
- [x] Create API endpoints for Web App.
- [x] Replace LLM translation with deep-translator.
- [x] Replace browser TTS/STT with gTTS + faster-whisper (backend).
- [x] Add farm image validation in vision pipeline.
- [x] Add DEBUG_MODE with structured pipeline logging.
- [x] Add pipeline metadata (confidence scores, timing) via SSE.

## Phase 5: Frontend Setup (Next.js / bun)
- [x] Initialize frontend with `bun create next-app`.
- [x] Build UI: Language selector, Chat interface, Image upload.
- [x] Integrate TTS playback from backend (gTTS audio).
- [x] Integrate STT via MediaRecorder + backend Whisper.
- [x] Add "Insights" panel with pipeline details per message.
- [x] Add SVG icons for Mic, Play, Stop, Image buttons.

## Phase 6: Testing & Edge Cases
- [x] Test out-of-domain queries (medical, political).
- [x] Test language switching.
- [x] Verify Caddy rate limiting and auth.

---

## Phase 7: SMS Integration (Twilio)
- [ ] Add `twilio` dependency via `uv add twilio`.
- [ ] Create `farmer_db.py` — SQLite for farmer profiles + message logging.
- [ ] Create `sms.py` — Twilio SMS webhook handler + reply logic.
- [ ] Add SMS command parsing (LANG HI, LANG EN, HELP, etc.).
- [ ] Add `/api/sms/webhook` endpoint in `api.py`.
- [ ] Update Caddyfile to allow public access to webhook endpoints.
- [ ] Test: send SMS → receive agricultural advice reply.

## Phase 8: WhatsApp Integration (Meta Cloud API)
- [ ] Add WhatsApp webhook verification (GET endpoint).
- [ ] Create `whatsapp.py` — Meta message parser + sender.
- [ ] Handle text messages → pipeline → reply.
- [ ] Handle voice notes → download → Whisper STT → pipeline → reply.
- [ ] Handle image messages → download → vision pipeline → reply.
- [ ] Add language switch commands for WhatsApp.
- [ ] Test: send WhatsApp message → receive advice reply.

## Phase 9: Real ICAR Data Ingestion
- [ ] Add `pymupdf`, `beautifulsoup4`, `httpx` dependencies.
- [ ] Create `scraper.py` — ICAR document downloader/parser.
- [ ] Download top 20 crop disease advisories from ICAR/KRISHI portal.
- [ ] Download updated banned pesticides list from Central Insecticide Board.
- [ ] Process PDFs/HTML → clean markdown chunks with metadata.
- [ ] Enhance `ingest.py` to handle PDF + metadata tagging.
- [ ] Re-ingest ChromaDB with real ICAR data.
- [ ] Test RAG retrieval quality with real data.

## Phase 10: Multi-Language UI
- [ ] Create `i18n.ts` with UI string translations (Hindi, Marathi, Telugu, English).
- [ ] Replace all hardcoded English strings in `page.tsx` with `t("key")` calls.
- [ ] Default language: Hindi (`hi-IN`).
- [ ] Test full UI rendering in all 4 languages.

## Phase 11: Drone Simulation
- [ ] Add `dronekit`, `dronekit-sitl`, `numpy` dependencies.
- [ ] Create lightweight Python drone simulator class.
- [ ] Create `drone.py` — survey planner, telemetry streamer.
- [ ] Add `/api/drone/survey` and `/api/drone/status` endpoints.
- [ ] Add sample aerial crop images to `data/drone_samples/`.
- [ ] Integrate drone image captures with vision pipeline.
- [ ] Frontend: Add Leaflet map for drone visualization (new page or tab).
- [ ] Implement precision spray plan generation from detection results.
- [ ] DroneKit-SITL integration (upgrade from lightweight sim).
- [ ] NDVI heatmap generation (stretch goal).

## Phase 12: Polish & Demo (March 29)
- [ ] End-to-end test: SMS → pipeline → reply in Hindi.
- [ ] End-to-end test: WhatsApp text/voice/image → reply.
- [ ] End-to-end test: Drone survey → disease detection → spray plan.
- [ ] Demo script preparation.
- [ ] CORS hardening, error handling, edge cases.
- [ ] Final commit + deployment.
