# Kisan AI - Agricultural Advisory Agent for Indian Farmers

A domain-specialized AI agent that provides real-time agricultural advice to Indian farmers through multiple channels — Web UI, SMS, and WhatsApp. Built with compliance guardrails, multi-language support, and drone-based field survey simulation.

## Architecture

```
                          ┌──────────────────┐
                          │   Indian Farmer   │
                          └────────┬─────────┘
                 ┌─────────┬──────┴──────┬──────────┐
                 │         │             │           │
            ┌────▼───┐ ┌──▼──┐    ┌─────▼────┐ ┌───▼────┐
            │ Web UI │ │ SMS │    │ WhatsApp │ │ Drone  │
            │Next.js │ │Twilio│   │Meta API  │ │ Sim    │
            └────┬───┘ └──┬──┘    └─────┬────┘ └───┬────┘
                 └────────┴──────┬──────┴───────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    FastAPI Backend      │
                    │                        │
                    │  deep-translator       │
                    │  (user lang ↔ EN)      │
                    │                        │
                    │  Intent Classifier     │
                    │  Vision Validator      │
                    │  ChromaDB RAG (ICAR)   │
                    │  Ollama LLM (EN only)  │
                    │  gTTS / faster-whisper │
                    │  Drone Simulator       │
                    └────────────────────────┘
```

## Features

### Multi-Channel Access
- **Web UI** — Real-time chat with streaming responses, image upload for crop disease diagnosis, voice input/output
- **SMS (Twilio)** — For keypad/feature phones with no internet; language commands via text (`lang hi`, `भाषा हिंदी`)
- **WhatsApp (Meta Business API)** — Text, voice messages, and image-based diagnosis

### AI Pipeline
- **Translation**: `deep-translator` (Google Translate) — LLM only works in English
- **Intent Classification**: Rejects non-agricultural queries before reaching the LLM
- **Vision**: Farm image validation + crop disease symptom extraction via VLM
- **RAG**: 221 chunks from 16 ICAR advisory documents covering 22 crops in ChromaDB
- **LLM**: Ollama-hosted models generate English responses grounded in RAG context
- **TTS/STT**: `gTTS` for text-to-speech, `faster-whisper` for speech-to-text

### Multi-Language Support
- 4 languages: English, Hindi (default), Marathi, Telugu
- Entire UI rendered in selected language
- SMS/WhatsApp auto-detect farmer's preferred language

### Drone Field Survey Simulation
- Lawnmower survey pattern over user-defined field coordinates
- Simulated disease/pest detections at each waypoint with ICAR-approved treatments
- Precision spray plan generation with chemical savings calculation
- Live telemetry streaming via SSE

### ICAR Compliance Knowledge Base
Comprehensive advisories covering:
- **Crops**: Rice, Wheat, Cotton, Sugarcane, Soybean, Maize, Millets, Chickpea, Pigeon Pea, Groundnut, Mustard, Sunflower, Tomato, Onion, Potato, Chilli, Okra
- **Topics**: Disease management, pest control, fertilizer schedules, water/irrigation, organic farming, soil health, government schemes, banned chemicals, harvest & storage

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Python 3.11, FastAPI, SSE streaming |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| LLM | Ollama (configurable model) |
| Vision | Ollama VLM (configurable model) |
| Vector DB | ChromaDB with sentence-transformers embeddings |
| Translation | deep-translator (Google Translate API) |
| TTS | gTTS (Google Text-to-Speech) |
| STT | faster-whisper (CPU mode) |
| SMS | Twilio Programmable SMS |
| WhatsApp | Meta WhatsApp Business Cloud API |
| Farmer DB | SQLite (profiles + message logging) |
| Package Mgmt | uv (Python), bun (Frontend) |
| Deployment | Docker Compose, Caddy (HTTPS, rate limiting, API auth) |

## Project Structure

```
├── backend/
│   ├── src/agri_agent_backend/
│   │   ├── agent.py          # Core AI pipeline (translate, intent, RAG, LLM, TTS, STT)
│   │   ├── api.py            # FastAPI endpoints (chat, image, STT, SMS, WhatsApp, drone)
│   │   ├── drone.py          # Drone survey simulator + spray plan generator
│   │   ├── farmer_db.py      # SQLite farmer profiles + message logging
│   │   ├── sms.py            # Twilio SMS handler with language commands
│   │   ├── whatsapp.py       # Meta WhatsApp handler (text/image/audio)
│   │   ├── ingest.py         # ChromaDB ingestion with markdown chunking
│   │   └── scraper.py        # ICAR web page scraper (HTML → markdown)
│   ├── data/compliance/      # ICAR advisory markdown documents (16 files)
│   ├── pyproject.toml        # Python dependencies
│   ├── main.py               # Uvicorn entry point
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx          # Main chat UI + drone survey panel
│   │   ├── i18n.ts           # Multi-language strings (EN/HI/MR/TE)
│   │   ├── layout.tsx        # Root layout
│   │   └── globals.css       # Tailwind styles
│   ├── package.json
│   └── Dockerfile
├── infrastructure/
│   └── Caddyfile             # Reverse proxy with API auth + webhook routes
├── docker-compose.yml
├── .env.example
└── README.md
```

## Quick Start

### Prerequisites
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [bun](https://bun.sh/) (JavaScript runtime)
- [Ollama](https://ollama.ai/) running locally or remotely
- ffmpeg (required by faster-whisper): `sudo apt install ffmpeg` / `brew install ffmpeg`

### 1. Clone and Configure

```bash
git clone https://github.com/Exyons/ET-GenAI-Hackathon.git
cd ET-GenAI-Hackathon

# Copy environment template
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
# Point to your Ollama instance
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
OLLAMA_VISION_MODEL=llama3.2-vision

# Whisper model for STT (small recommended for Indian languages)
WHISPER_TTS_MODEL=small

# Enable debug logging
DEBUG_MODE=true
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
uv sync

# Ingest ICAR advisory documents into ChromaDB
uv run python -m agri_agent_backend.ingest

# Start the backend (port 8000)
uv run uvicorn agri_agent_backend.api:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
bun install

# Start development server (port 3000)
bun run dev
```

Open http://localhost:3000 — the UI defaults to Hindi.

### 4. Docker Deployment (Production)

```bash
# Configure environment
cp .env.example .env
# Edit .env with your settings

docker-compose up -d
```

Caddy handles HTTPS automatically. Update `infrastructure/Caddyfile` with your domain.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ask_stream` | Text query → SSE stream (translate → intent → RAG → LLM → translate → TTS) |
| POST | `/api/upload_image_stream` | Image + query → SSE stream (validate → vision → RAG → LLM → translate → TTS) |
| POST | `/api/transcribe` | Audio file → transcribed text (faster-whisper) |
| POST | `/api/sms/webhook` | Twilio SMS webhook (incoming SMS → process → reply) |
| GET/POST | `/api/whatsapp/webhook` | Meta WhatsApp webhook (verify + incoming messages) |
| POST | `/api/drone/survey` | Start drone survey → SSE stream of telemetry + detections |
| POST | `/api/drone/spray_plan` | Generate precision spray plan from survey detections |

## SMS Commands

Farmers can text these commands to the Twilio number:

| Command | Action |
|---------|--------|
| `help` / `madad` / `sahayata` | Get help message in current language |
| `lang en` / `lang hi` / `lang mr` / `lang te` | Switch language |
| `भाषा हिंदी` / `भाषा मराठी` | Switch language (native script) |
| Any other text | Treated as agricultural query |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `llama3.1` | LLM model for text generation |
| `OLLAMA_VISION_MODEL` | `llama3.2-vision` | VLM model for image analysis |
| `CHROMA_EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Sentence transformer for embeddings |
| `WHISPER_TTS_MODEL` | `small` | Whisper model size (tiny/base/small/medium/large) |
| `DEBUG_MODE` | `false` | Enable verbose pipeline logging |
| `SECRET_API_KEY` | `dev_secret_key_123` | API authentication key (Caddy) |
| `TWILIO_ACCOUNT_SID` | — | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | — | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | — | Twilio phone number (E.164 format) |
| `META_WHATSAPP_TOKEN` | — | Meta WhatsApp Business API token |
| `META_VERIFY_TOKEN` | `kisan_ai_verify_2024` | Meta webhook verification token |
| `META_PHONE_NUMBER_ID` | — | Meta WhatsApp phone number ID |

## Adding ICAR Data

### Manual
Add markdown files to `backend/data/compliance/`, then re-ingest:
```bash
cd backend
uv run python -m agri_agent_backend.ingest
```

### Scraping
```bash
cd backend
# Scrape a specific ICAR advisory page
uv run python -m agri_agent_backend.scraper --url https://example.com/advisory

# Re-ingest all documents
uv run python -m agri_agent_backend.ingest
```

## Compliance Guardrails

- **Intent Filter**: Non-agricultural queries are rejected before reaching the LLM
- **Vision Validator**: Non-farm images are rejected before entering the pipeline
- **RAG Grounding**: LLM responses are grounded in ICAR-approved advisory documents
- **Banned Chemicals**: Database includes banned/restricted pesticide list — agent will never recommend prohibited chemicals
- **KVK Fallback**: When the agent cannot find a relevant answer, it directs farmers to their nearest Krishi Vigyan Kendra

## License

This project was built for the ET Gen AI Hackathon 2026.
