# Implementation Plan: Agricultural Advisory AI Agent

## 1. Project Overview
A domain-specialized AI agent for Indian agriculture designed to operate within strict compliance guardrails. It supports multi-modal inputs (vision, speech, text, location) and serves both high-connectivity (Web UI) and low-connectivity (WhatsApp/SMS) users.

*Note: To optimize for real-time Server-Sent Events (SSE) streaming (especially for models outputting `<think>` tags), the orchestration was shifted from LangGraph to a highly optimized linear FastAPI streaming pipeline. This provides instant visual feedback to the farmer.*

## 2. Tech Stack & Infrastructure
*   **AI Provider:** Ollama Cloud Server (Remote LLM/VLM execution to save VPS resources).
*   **Backend:** Python (FastAPI, ChromaDB) managed via `uv`.
*   **Frontend:** Next.js (App Router), Tailwind CSS, TypeScript managed via `bun`.
*   **Translation:** `deep-translator` (Google Translate API — no LLM involved).
*   **STT:** `faster-whisper` (backend) — accepts audio recordings from any browser/device.
*   **TTS:** `gTTS` (Google Text-to-Speech) — generates mp3 audio served to frontend.
*   **SMS:** Twilio Programmable SMS API.
*   **WhatsApp:** Meta WhatsApp Business Cloud API.
*   **Drone Simulation:** DroneKit-SITL (ArduPilot simulator) + lightweight Python fallback.
*   **Deployment (VPS):** Docker Compose, Caddy (Reverse Proxy, HTTPS, Rate Limiting, API Auth).

## 3. Architecture

```
                          ┌──────────────────┐
                          │   Indian Farmer   │
                          └────────┬─────────┘
                 ┌─────────┬──────┴──────┬──────────┐
                 │         │             │           │
            ┌────▼───┐ ┌──▼──┐    ┌─────▼────┐ ┌───▼────┐
            │ Web UI │ │ SMS │    │ WhatsApp │ │ Drone  │
            │(Next.js)│ │(Twilio)│ │(Meta API)│ │(SITL)  │
            └────┬───┘ └──┬──┘    └─────┬────┘ └───┬────┘
                 │        │             │           │
                 └────────┴──────┬──────┴───────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    FastAPI Backend      │
                    │ ┌────────────────────┐  │
                    │ │ deep-translator    │  │
                    │ │ (user lang ↔ EN)   │  │
                    │ ├────────────────────┤  │
                    │ │ Intent Classifier  │  │
                    │ ├────────────────────┤  │
                    │ │ Vision Validator   │  │
                    │ │ + Symptom Extract  │  │
                    │ ├────────────────────┤  │
                    │ │ ChromaDB RAG       │  │
                    │ │ (ICAR Compliance)  │  │
                    │ ├────────────────────┤  │
                    │ │ Ollama LLM (EN)    │  │
                    │ ├────────────────────┤  │
                    │ │ gTTS / Whisper     │  │
                    │ │ (TTS / STT)        │  │
                    │ ├────────────────────┤  │
                    │ │ DroneKit Mission   │  │
                    │ │ Planner            │  │
                    │ └────────────────────┘  │
                    └────────────────────────┘
```

## 4. Pipeline Flow (All Channels)

```
User Input (any language, any channel)
  │
  ├─ [deep-translator] → Translate to English
  ├─ [Intent Check]    → Is it agricultural? (reject if not)
  ├─ [Vision?]         → Validate farm image → Extract symptoms
  ├─ [ChromaDB RAG]    → Fetch ICAR compliance docs
  ├─ [Ollama LLM]      → Generate English response (grounded in RAG)
  ├─ [deep-translator] → Translate response to user's language
  ├─ [gTTS]            → Generate audio (for Web UI / WhatsApp voice notes)
  │
  └─ Deliver via original channel (Web SSE / SMS / WhatsApp)
```

**Critical rule:** LLM only works in English. All translation is done by `deep-translator` (deterministic, fast, free).

---

## 5. SMS Integration (Twilio) — LOW CONNECTIVITY PRIORITY

### 5.1 Why SMS First
- Works on **any phone** (keypad, smartphone, no internet needed)
- Indian farmers with basic phones can send/receive SMS
- Twilio provides Indian phone numbers and vernacular SMS support

### 5.2 How It Works

```
Farmer sends SMS to Twilio number
  → Twilio POSTs to /api/sms/webhook
  → Backend looks up farmer's phone → gets preferred language (default: Hindi)
  → Translates SMS body to English
  → Runs through pipeline (intent → RAG → LLM)
  → Translates response back to farmer's language
  → Sends reply SMS via Twilio API
```

### 5.3 SMS Commands (Language Switching)
Farmers can text these commands to change their language:
| Command | Action |
|---------|--------|
| `LANG HI` or `भाषा हिंदी` | Switch to Hindi |
| `LANG EN` or `LANG ENGLISH` | Switch to English |
| `LANG MR` or `भाषा मराठी` | Switch to Marathi |
| `LANG TE` or `భాష తెలుగు` | Switch to Telugu |
| `HELP` or `मदद` | Show available commands |
| `DRONE` or `ड्रोन` | Request drone field scan (Phase 2) |

### 5.4 User Profile Storage
A lightweight SQLite database (no PostgreSQL needed for MVP):
```sql
CREATE TABLE farmer_profiles (
    phone_number TEXT PRIMARY KEY,
    preferred_language TEXT DEFAULT 'hi',
    farm_location TEXT,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP
);

CREATE TABLE message_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT,
    direction TEXT,  -- 'inbound' or 'outbound'
    channel TEXT,    -- 'sms', 'whatsapp', 'web'
    original_text TEXT,
    translated_text TEXT,
    response_text TEXT,
    pipeline_metadata TEXT,  -- JSON blob with scores, timing, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5.5 Environment Variables Needed
```env
TWILIO_ACCOUNT_SID=ACxxxxxx
TWILIO_AUTH_TOKEN=xxxxxx
TWILIO_PHONE_NUMBER=+91xxxxxxxxxx
```

### 5.6 Caddy Webhook Routing
Webhook endpoints must be **public** (no API key) since Twilio/Meta POST to them:
```
# In Caddyfile — exempt webhook paths from auth
@webhook path /api/sms/webhook /api/whatsapp/webhook
handle @webhook {
    reverse_proxy backend:8000
}
```

---

## 6. WhatsApp Integration (Meta Cloud API)

### 6.1 Why WhatsApp
- 500M+ WhatsApp users in India
- Supports text, voice notes, images — all useful for our pipeline
- Free tier (1,000 conversations/month) is enough for MVP

### 6.2 How It Works

```
Farmer sends WhatsApp message
  → Meta POSTs to /api/whatsapp/webhook
  → Backend parses message type:
      - Text → same pipeline as SMS
      - Voice note → download audio → Whisper STT → pipeline
      - Image → download image → Vision validate → pipeline
  → Response sent back via Meta Send Message API
  → If TTS audio available, send as voice note attachment
```

### 6.3 WhatsApp Commands
Same commands as SMS, plus:
| Command | Action |
|---------|--------|
| Send image | Auto-analyzed by vision pipeline |
| Send voice note | Auto-transcribed by Whisper |
| `STATUS` or `स्थिति` | Show profile info & last query |

### 6.4 Webhook Verification
Meta requires a GET endpoint for webhook verification:
```
GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=XXX&hub.challenge=YYY
→ Return hub.challenge if verify_token matches
```

### 6.5 Environment Variables
```env
META_WHATSAPP_TOKEN=EAAxxxxxx
META_VERIFY_TOKEN=my_custom_verify_token
META_PHONE_NUMBER_ID=1234567890
```

---

## 7. Real ICAR Data Ingestion

### 7.1 Data Sources (Priority Order)
1. **KRISHI Portal** (krishi.icar.gov.in) — ICAR's centralized knowledge repo
2. **ICAR Publications** (icar.org.in/en/all-publications) — crop advisories, pest alerts
3. **data.gov.in** — Open Government Data platform with ICAR datasets
4. **Central Insecticide Board** — Updated banned/restricted pesticide list
5. **ICAR-NRIIPM** (nriipm.res.in) — Integrated Pest Management databases

### 7.2 Ingestion Strategy
Since these are primarily PDFs and HTML pages (not APIs), we'll:

1. **Curate a targeted set** of high-value documents:
   - Top 20 crop disease advisories (rice, wheat, cotton, sugarcane, maize, tomato, potato, onion, etc.)
   - Updated banned pesticides list (Central Insecticide Board)
   - Region-specific pest alerts (kharif and rabi seasons)
   - Organic farming guidelines

2. **Download & process:**
   ```
   PDF/HTML → Extract text (PyMuPDF/BeautifulSoup)
   → Clean & chunk (500-word chunks with 50-word overlap)
   → Add metadata (source, crop, disease, region, date)
   → Embed & store in ChromaDB
   ```

3. **Markdown format** (matching current mock data structure):
   ```markdown
   # [Disease/Pest Name] - ICAR Advisory
   **Source:** [URL]
   **Crop:** [Crop Name]
   **Region:** [Applicable Regions]

   ## Identification & Symptoms
   ...
   ## Environmental Triggers
   ...
   ## Recommended Management
   ### Cultural Practices
   ### Biological Control
   ### Chemical Control (Government Approved Only)
   ### Safety & Compliance Notes
   ```

### 7.3 Dependencies
```
pymupdf>=1.24.0     # PDF text extraction
beautifulsoup4>=4.12 # HTML parsing
httpx>=0.27.0        # Async HTTP for downloading
```

### 7.4 Ingestion Script Enhancement
Enhance existing `ingest.py` to:
- Accept a directory of markdown/PDF files
- Auto-detect and parse format
- Tag with metadata (crop, region, source URL)
- De-duplicate against existing collection
- Log ingestion stats

---

## 8. Multi-Language UI (Web App)

### 8.1 Strategy
The entire web UI must render in the user's selected language, not just the chat responses.

### 8.2 UI Strings Translation Map
```typescript
const UI_STRINGS: Record<string, Record<string, string>> = {
  "en-IN": {
    title: "Kisan AI - Agricultural Advisor",
    language_label: "Preferred Language:",
    placeholder: "Type or hold mic to speak...",
    ask_button: "Ask",
    placeholder_empty: "Ask a question about your crops or farming practices...",
    insights_button: "Insights",
    listen_button: "Listen",
    stop_button: "Stop",
    hide_button: "Hide",
    recording: "Recording...",
    // ... all UI strings
  },
  "hi-IN": {
    title: "किसान AI - कृषि सलाहकार",
    language_label: "पसंदीदा भाषा:",
    placeholder: "टाइप करें या माइक दबाकर बोलें...",
    ask_button: "पूछें",
    placeholder_empty: "अपनी फसलों या खेती के बारे में सवाल पूछें...",
    insights_button: "जानकारी",
    listen_button: "सुनें",
    stop_button: "रुकें",
    hide_button: "छुपाएं",
    recording: "रिकॉर्डिंग...",
  },
  "mr-IN": {
    title: "किसान AI - कृषी सल्लागार",
    language_label: "पसंतीची भाषा:",
    placeholder: "टाइप करा किंवा माइक धरून बोला...",
    ask_button: "विचारा",
    placeholder_empty: "तुमच्या पिकांबद्दल किंवा शेतीबद्दल प्रश्न विचारा...",
    insights_button: "माहिती",
    listen_button: "ऐका",
    stop_button: "थांबा",
    hide_button: "लपवा",
    recording: "रेकॉर्डिंग...",
  },
  "te-IN": {
    title: "కిసాన్ AI - వ్యవసాయ సలహాదారు",
    language_label: "ఇష్టమైన భాష:",
    placeholder: "టైప్ చేయండి లేదా మైక్ నొక్కి మాట్లాడండి...",
    ask_button: "అడగండి",
    placeholder_empty: "మీ పంటలు లేదా వ్యవసాయ పద్ధతుల గురించి ప్రశ్న అడగండి...",
    insights_button: "వివరాలు",
    listen_button: "వినండి",
    stop_button: "ఆపండి",
    hide_button: "దాచు",
    recording: "రికార్డింగ్...",
  },
};
```

### 8.3 Implementation
- Create a `useTranslation(language)` hook that returns the correct strings
- All hardcoded English strings in `page.tsx` replaced with `t("key")` calls
- Language selector itself always shows all languages in their native script
- Default language: **Hindi** (`hi-IN`)

---

## 9. Drone Integration (Simulation)

### 9.1 MVP Approach: Lightweight Python Drone Simulator + DroneKit-SITL

We implement TWO levels:

**Level 1 (Day 1 — guaranteed working):** Lightweight Python drone sim
- Python class tracking `lat, lon, altitude, heading, battery`
- Flies a lawnmower pattern over user-defined field coordinates
- At each waypoint, loads a sample aerial crop image from a dataset
- Feeds image into existing `validate_farm_image()` → `get_vision_response()` pipeline
- Streams telemetry + detection results via SSE to frontend
- Frontend shows drone position on a Leaflet.js map

**Level 2 (Day 2-3 — impressive demo):** DroneKit-SITL
- Full ArduPilot SITL simulation via `dronekit-sitl`
- Real MAVLink protocol communication
- Automated waypoint missions with realistic flight dynamics
- Same image→vision pipeline integration

### 9.2 Use Cases for Demo

1. **Automated Field Survey:**
   Farmer says (in Hindi): "मेरे खेत को स्कैन करो" → Drone flies survey pattern → Detects disease in specific zones → Returns zone-level health report

2. **Precision Spray Planning:**
   After disease detection → System plans spray mission for ONLY affected zones → Shows approved pesticide from RAG → Visualizes flight path on map

3. **NDVI Vegetation Health Map (stretch goal):**
   Simulated multispectral imagery → NDVI computation → Heatmap overlay → LLM interprets stress zones

### 9.3 Demo Narrative
*"A farmer in Maharashtra sends a voice message in Marathi asking about yellow spots on their cotton crop. Our AI dispatches a drone to survey the field, detects bacterial blight in the southeast quadrant via vision analysis, cross-references ICAR-approved treatments from our compliance database, and generates a targeted spray plan — all accessible via a simple SMS to a Twilio number."*

### 9.4 New Endpoints
```
POST /api/drone/survey       — Start a field survey simulation
GET  /api/drone/status       — SSE stream of drone telemetry + detections
POST /api/drone/spray_plan   — Generate spray mission from detection results
```

### 9.5 Dependencies
```
dronekit>=2.9.2
dronekit-sitl>=3.3.0
numpy>=1.26.0
folium>=0.16.0          # Map generation (optional, can use react-leaflet)
```

### 9.6 Sample Aerial Image Dataset
Use pre-captured crop disease images from public datasets:
- PlantVillage dataset (Kaggle)
- Drone crop disease detection datasets
- Store 20-30 sample images in `backend/data/drone_samples/`

---

## 10. Implementation Timeline (March 27-29)

### Day 1 (March 27) — Core Infrastructure
| Priority | Task | Hours |
|----------|------|-------|
| P0 | SMS integration (Twilio webhook + reply) | 3h |
| P0 | WhatsApp integration (Meta webhook + message parsing) | 3h |
| P0 | Farmer profile DB (SQLite + language commands) | 2h |
| P0 | Multi-language UI strings in frontend | 2h |
| P1 | ICAR data: download & process top 10 crop advisories | 2h |

### Day 2 (March 28) — Drone + Data
| Priority | Task | Hours |
|----------|------|-------|
| P0 | ICAR data: process remaining docs + re-ingest ChromaDB | 2h |
| P0 | Lightweight drone simulator (Python class + API) | 3h |
| P1 | DroneKit-SITL integration (if lightweight works) | 3h |
| P1 | Frontend: Leaflet map for drone visualization | 3h |
| P1 | WhatsApp: voice note + image handling | 2h |

### Day 3 (March 29) — Polish & Demo
| Priority | Task | Hours |
|----------|------|-------|
| P0 | End-to-end testing: SMS → pipeline → reply | 2h |
| P0 | End-to-end testing: WhatsApp text/voice/image | 2h |
| P0 | Drone demo: field survey → disease detection → spray plan | 2h |
| P1 | NDVI heatmap visualization (stretch) | 2h |
| P1 | Demo preparation: script, screenshots, video | 2h |
| P2 | CORS hardening, error handling, edge cases | 1h |

---

## 11. File Structure (After Implementation)

```
backend/
├── src/agri_agent_backend/
│   ├── agent.py              # Core pipeline (translate, intent, RAG, vision, TTS/STT)
│   ├── api.py                # FastAPI endpoints (ask, upload, SMS, WhatsApp, drone)
│   ├── sms.py                # Twilio SMS handler
│   ├── whatsapp.py           # Meta WhatsApp handler
│   ├── drone.py              # Drone simulator + DroneKit integration
│   ├── farmer_db.py          # SQLite farmer profiles + message logging
│   ├── ingest.py             # ChromaDB ingestion (enhanced for PDFs)
│   └── scraper.py            # ICAR document downloader/parser
├── data/
│   ├── compliance/           # ICAR advisory documents (markdown)
│   ├── drone_samples/        # Sample aerial crop images
│   └── icar_raw/             # Downloaded ICAR PDFs (gitignored)
├── farmer_profiles.db        # SQLite database
├── chroma_db/                # Vector database
└── pyproject.toml

frontend/
├── src/app/
│   ├── page.tsx              # Main chat UI (multi-language)
│   ├── i18n.ts               # UI string translations
│   ├── drone/page.tsx        # Drone map visualization (Leaflet)
│   └── globals.css
└── package.json

infrastructure/
└── Caddyfile                 # Updated with public webhook routes
```

---

## 12. Environment Variables (Complete)

```env
# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemini-3-flash-preview:cloud
OLLAMA_VISION_MODEL=qwen3-vl:235b-cloud

# Database
CHROMA_EMBEDDING_MODEL=all-MiniLM-L6-v2

# Audio
WHISPER_TTS_MODEL=base

# Debug
DEBUG_MODE=true

# Security
SECRET_API_KEY=dev_secret_key_123

# Twilio (SMS)
TWILIO_ACCOUNT_SID=ACxxxxxx
TWILIO_AUTH_TOKEN=xxxxxx
TWILIO_PHONE_NUMBER=+91xxxxxxxxxx

# Meta WhatsApp
META_WHATSAPP_TOKEN=EAAxxxxxx
META_VERIFY_TOKEN=my_custom_verify_token
META_PHONE_NUMBER_ID=1234567890

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 13. Compliance & Guardrails
*   **RAG Knowledge Base:** Real ICAR compliance documents loaded into ChromaDB.
*   **Supervisor Routing:** Non-agricultural queries rejected before reaching the LLM.
*   **Vision Validation:** Non-farm images rejected before entering the pipeline.
*   **Hallucination Prevention:** If answer isn't in RAG DB, agent outputs KVK fallback message.
*   **Banned Chemicals:** RAG includes Central Insecticide Board restricted list.
*   **Channel-agnostic:** Same guardrails apply whether query comes from Web, SMS, or WhatsApp.
