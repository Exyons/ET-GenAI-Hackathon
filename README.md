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
            │Next.js │ │TextBee│  │Meta API  │ │ Sim    │
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
                    │  LLM (Ollama/OpenRouter)│
                    │  gTTS / faster-whisper │
                    │  Drone Simulator       │
                    └────────────────────────┘
```

## Features

### Multi-Channel Access
- **Web UI** — Real-time chat with streaming responses, image upload for crop disease diagnosis, voice input/output, dark mode, chat history
- **SMS (TextBee primary / Twilio fallback)** — For keypad/feature phones with no internet; uses your own Android phone as gateway via textbee.dev
- **WhatsApp (Meta Business API)** — Text, voice messages, and image-based diagnosis

### AI Pipeline
- **Translation**: `deep-translator` (Google Translate) — LLM only works in English
- **Intent Classification**: Rejects non-agricultural queries before reaching the LLM
- **Vision**: Farm image validation + crop disease symptom extraction via VLM (Ollama or OpenRouter)
- **RAG**: 221 chunks from 16 ICAR advisory documents covering 22 crops in ChromaDB
- **LLM**: Ollama (local) or OpenRouter (cloud) — text and vision providers selectable independently
- **TTS/STT**: `gTTS` for text-to-speech, `faster-whisper` for speech-to-text

### Multi-Language Support
- 4 languages: English, Hindi (default), Marathi, Telugu
- Entire UI rendered in selected language
- SMS/WhatsApp auto-detect farmer's preferred language

### 3D Drone Field Survey Simulation
- Interactive 3D viewport built with React Three Fiber
- Lawnmower survey pattern over user-defined field coordinates
- Simulated disease/pest detections at each waypoint with ICAR-approved treatments
- Heatmap overlay, detection markers, and precision spray visualization
- Live telemetry HUD with battery, altitude, speed, and waypoint progress
- Precision spray plan generation with chemical savings calculation

### ICAR Compliance Knowledge Base
Comprehensive advisories covering:
- **Crops**: Rice, Wheat, Cotton, Sugarcane, Soybean, Maize, Millets, Chickpea, Pigeon Pea, Groundnut, Mustard, Sunflower, Tomato, Onion, Potato, Chilli, Okra
- **Topics**: Disease management, pest control, fertilizer schedules, water/irrigation, organic farming, soil health, government schemes, banned chemicals, harvest & storage

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Python 3.11, FastAPI, SSE streaming |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, React Three Fiber |
| LLM | Ollama (local) or OpenRouter (cloud) — independently configurable |
| Vision | Ollama VLM or OpenRouter vision — independently configurable |
| Vector DB | ChromaDB with sentence-transformers embeddings |
| Translation | deep-translator (Google Translate API) |
| TTS | gTTS (Google Text-to-Speech) |
| STT | faster-whisper (CPU mode) |
| SMS | TextBee (primary, free via Android gateway) / Twilio (fallback) |
| WhatsApp | Meta WhatsApp Business Cloud API |
| Farmer DB | SQLite (profiles + message logging) |
| Package Mgmt | uv (Python), bun (Frontend) |
| Deployment | Docker Compose, Caddy reverse proxy, socat Ollama relay |

## Project Structure

```
├── backend/
│   ├── src/agri_agent_backend/
│   │   ├── llm.py            # LLM provider abstraction (Ollama + OpenRouter)
│   │   ├── agent.py          # Core AI pipeline (translate, intent, RAG, LLM, TTS, STT)
│   │   ├── api.py            # FastAPI endpoints (chat, image, STT, SMS, WhatsApp, drone)
│   │   ├── drone.py          # Drone survey simulator + spray plan generator
│   │   ├── farmer_db.py      # SQLite farmer profiles + message logging
│   │   ├── sms.py            # TextBee + Twilio SMS handler with language commands
│   │   ├── whatsapp.py       # Meta WhatsApp handler (text/image/audio)
│   │   ├── ingest.py         # ChromaDB ingestion with markdown chunking
│   │   └── scraper.py        # ICAR web page scraper (HTML → markdown)
│   ├── data/compliance/      # ICAR advisory markdown documents (16 files)
│   ├── pyproject.toml        # Python dependencies
│   ├── main.py               # Uvicorn entry point
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx      # Main chat UI + dark mode + drone panel
│   │   │   ├── i18n.ts       # Multi-language strings (EN/HI/MR/TE)
│   │   │   ├── layout.tsx    # Root layout (Inter + Geist Mono fonts)
│   │   │   └── globals.css   # Tailwind + dark mode styles
│   │   └── components/
│   │       ├── chat/         # Chat sidebar + session persistence (localStorage)
│   │       └── drone-simulator/  # 3D drone sim (React Three Fiber)
│   ├── package.json
│   └── Dockerfile
├── infrastructure/
│   └── Caddyfile             # Reverse proxy config
├── docker-compose.yml        # Dev deployment (Caddy + socat Ollama relay)
├── docker-compose.prod.yml   # Production deployment
└── .env.example
```

## Quick Start

### Prerequisites
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [bun](https://bun.sh/) (JavaScript runtime)
- [Ollama](https://ollama.ai/) running locally or remotely
- ffmpeg: `sudo apt install ffmpeg` / `brew install ffmpeg`

### 1. Clone and Configure

```bash
git clone https://github.com/Exyons/ET-GenAI-Hackathon.git
cd ET-GenAI-Hackathon

# Copy environment template
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
# LLM Provider — "ollama" or "openrouter" (independent for text and vision)
LLM_PROVIDER=ollama
VISION_LLM_PROVIDER=ollama

# Ollama (when using ollama provider)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
OLLAMA_VISION_MODEL=llama3.2-vision

# OpenRouter (when using openrouter provider)
OPENROUTER_API_KEY=sk-or-xxxxxxxx
OPENROUTER_MODEL=google/gemini-2.5-flash-preview
OPENROUTER_VISION_MODEL=google/gemini-2.5-flash-preview

WHISPER_TTS_MODEL=small
DEBUG_MODE=true
```

You can mix providers — e.g. text from OpenRouter, vision from Ollama:
```env
LLM_PROVIDER=openrouter
VISION_LLM_PROVIDER=ollama
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
uv sync

# Ingest ICAR advisory documents into ChromaDB
uv run python -m agri_agent_backend.ingest

# Start the backend (port 8000)
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
bun install

# Set API URL for local dev (backend runs on port 8000)
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

# Start development server (port 3000)
bun run dev
```

Open http://localhost:3000

### 4. Docker Deployment

```bash
# Start all services (Caddy + backend + frontend + Ollama relay)
docker compose up -d

# Access at http://localhost:8080
```

> **Important**: Docker deployment requires `output: "standalone"` in `frontend/next.config.ts`. Uncomment the line before building the Docker image.

This starts 4 containers:
- **ollama-relay** — socat bridge forwarding to host Ollama (`127.0.0.1:11434`)
- **backend** — FastAPI on port 8000
- **frontend** — Next.js on port 3000
- **caddy** — Reverse proxy on `:8080` (routes `/api/*` → backend, everything else → frontend)

> Ollama must be running on the host. The socat relay bridges `127.0.0.1:11434` into the container network.

### 5. Vercel Deployment (Frontend)

1. Push your repo to GitHub
2. Import the project in [vercel.com](https://vercel.com) → set the **Root Directory** to `frontend`
3. Add the environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-domain.com
   ```
4. Deploy — Vercel auto-detects Next.js and handles bundling

> **Note**: `output: "standalone"` in `next.config.ts` must be **commented out** for Vercel (it's serverless, not containerized). The line is commented out by default — only uncomment it for Docker builds.

### 6. SMS Setup (TextBee)

TextBee uses your Android phone as an SMS gateway (free tier: 50 SMS/day).

1. Install the [TextBee Android app](https://textbee.dev)
2. Register your device at [app.textbee.dev](https://app.textbee.dev)
3. Add credentials to `backend/.env`:
   ```env
   TEXTBEE_API_KEY=your_api_key
   TEXTBEE_DEVICE_ID=your_device_id
   TEXTBEE_WEBHOOK_SECRET=your_webhook_secret_min_20_chars
   ```
4. Configure webhook URL in TextBee dashboard: `https://your-domain/api/sms/textbee/webhook`

Twilio works as automatic fallback if TextBee is not configured or fails.

### 7. WhatsApp Setup (Meta Business API)

1. Go to [developers.facebook.com](https://developers.facebook.com) → Create a new app → select **Business** type
2. Add the **WhatsApp** product to your app
3. From the WhatsApp dashboard, copy your credentials and add to `backend/.env`:
   ```env
   META_WHATSAPP_TOKEN=EAAxxxxxx          # Temporary access token (24h) or permanent token
   META_VERIFY_TOKEN=kisan_ai_verify_2024  # Your chosen verify token
   META_PHONE_NUMBER_ID=1234567890         # Phone Number ID from dashboard
   ```
4. Configure webhook in Meta dashboard (WhatsApp → Configuration):
   - **Callback URL**: `https://your-domain/api/whatsapp/webhook`
   - **Verify Token**: `kisan_ai_verify_2024` (must match your `.env`)
   - Subscribe to the **messages** field
5. For local development, use [ngrok](https://ngrok.com) to expose your backend:
   ```bash
   ngrok http 8000
   # Use the ngrok HTTPS URL as your callback URL
   ```

The free test setup allows up to 5 whitelisted recipient numbers — enough for hackathon demos. WhatsApp supports text, image (crop disease diagnosis), and voice messages.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Healthcheck — returns service status, Ollama connectivity, and provider config |
| POST | `/api/ask_stream` | Text query → SSE stream (translate → intent → RAG → LLM → translate → TTS) |
| POST | `/api/upload_image_stream` | Image + query → SSE stream (validate → vision → RAG → LLM → translate → TTS) |
| POST | `/api/transcribe` | Audio file → transcribed text (faster-whisper) |
| POST | `/api/sms/textbee/webhook` | TextBee SMS webhook (incoming SMS → process → reply) |
| POST | `/api/sms/twilio/webhook` | Twilio SMS webhook (fallback) |
| GET | `/api/sms/status` | Check which SMS providers are configured |
| GET/POST | `/api/whatsapp/webhook` | Meta WhatsApp webhook (verify + incoming messages) |
| POST | `/api/drone/survey` | Start drone survey → SSE stream of telemetry + detections |
| POST | `/api/drone/spray_plan` | Generate precision spray plan from survey detections |

## SMS Commands

Farmers can text these commands:

| Command | Action |
|---------|--------|
| `help` / `मदद` / `मदत` / `సహాయం` | Get help in current language |
| `lang en` / `lang hi` / `lang mr` / `lang te` | Switch language |
| `भाषा हिंदी` / `भाषा मराठी` / `భాష తెలుగు` | Switch language (native script) |
| Any other text | Treated as agricultural query |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `ollama` | Text LLM provider — `ollama` or `openrouter` |
| `VISION_LLM_PROVIDER` | (same as `LLM_PROVIDER`) | Vision LLM provider — `ollama` or `openrouter` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `llama3.1` | Ollama model for text generation |
| `OLLAMA_VISION_MODEL` | `llama3.2-vision` | Ollama model for image analysis |
| `OPENROUTER_API_KEY` | — | OpenRouter API key (required when using openrouter provider) |
| `OPENROUTER_MODEL` | `google/gemini-2.5-flash-preview` | OpenRouter model for text generation |
| `OPENROUTER_VISION_MODEL` | `google/gemini-2.5-flash-preview` | OpenRouter model for image analysis |
| `WHISPER_TTS_MODEL` | `small` | Whisper model size (tiny/base/small/medium/large) |
| `DEBUG_MODE` | `false` | Enable verbose pipeline logging |
| `SECRET_API_KEY` | `dev_secret_key_123` | API authentication key |
| `TEXTBEE_API_KEY` | — | TextBee API key (primary SMS) |
| `TEXTBEE_DEVICE_ID` | — | TextBee registered device ID |
| `TEXTBEE_WEBHOOK_SECRET` | — | TextBee webhook HMAC secret (min 20 chars) |
| `TWILIO_ACCOUNT_SID` | — | Twilio account SID (SMS fallback) |
| `TWILIO_AUTH_TOKEN` | — | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | — | Twilio phone number (E.164 format) |
| `META_WHATSAPP_TOKEN` | — | Meta WhatsApp Business API token |
| `META_VERIFY_TOKEN` | `kisan_ai_verify_2024` | Meta webhook verification token |
| `META_PHONE_NUMBER_ID` | — | Meta WhatsApp phone number ID |

## Adding ICAR Data

```bash
cd backend

# Add markdown files to data/compliance/, then re-ingest:
uv run python -m agri_agent_backend.ingest
```

## Compliance Guardrails

- **Intent Filter**: Non-agricultural queries are rejected before reaching the LLM
- **Vision Validator**: Non-farm images are rejected before entering the pipeline
- **RAG Grounding**: LLM responses are grounded in ICAR-approved advisory documents
- **Banned Chemicals**: Agent will never recommend prohibited chemicals and suggests safer alternatives
- **KVK Fallback**: When the agent cannot find a relevant answer, it directs farmers to their nearest Krishi Vigyan Kendra

## License

This project was built for the ET Gen AI Hackathon 2026.
