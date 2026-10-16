<div align="center">

# 📖 DeepKoma — AI Manga Translator
### *Next-Generation Multimodal Comic Localization & Studio Redraw Engine*

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React 19](https://img.shields.io/badge/React-19.0+-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Celery](https://img.shields.io/badge/Celery-5.3+-37814A?style=for-the-badge&logo=celery&logoColor=white)](https://docs.celeryq.dev)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

<br/>

<p align="center">
  <img src="manga-backend/static/assets/manga_demo_preview.gif" alt="DeepKoma Demo Preview" width="85%" style="border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);"/>
</p>

*An end-to-end production platform for automated comic localization: from deep-learning text segmentation to context-aware translation and multi-layer Photoshop (.PSD) export.*

[🌐 Live Platform](https://deepkoma.pro) • [📑 Architecture Docs](ComicApp_Architecture_Report.md) • [🚀 Quickstart](#-quickstart)

---

</div>

## 🌟 Key Highlights

- **🎯 Comic Text Detector (CTD / YOLOv5)**: High-precision neural detector tailored for vertical text, irregular speech bubbles, and embedded sound effects (SFX).
- **🔍 Multilingual OCR Engine (Hayai-OCR)**: Zero-redundancy character extraction pipeline supporting Japanese (Kanji/Kana), Korean (Hangul), Chinese (Hanzi), and English.
- **🎨 Deep Inpainting (LaMa)**: Intelligent text erasure that restores complex background screentones, lineart, and color gradients without artifacts.
- **🌐 Context-Aware Translation**: Dynamic prompt routing across modern LLMs (DeepSeek AI) to capture dialect, character tone, and comic nuances accurately.
- **🖌️ Interactive Canvas Studio (React 19)**: In-browser editor enabling real-time bubble repositioning, typography styling, and custom font mapping.
- **💾 Layered Photoshop (.PSD) Export**: Generates production-ready, editable PSD files with separated text layers, saving scanlation teams over 80% manual typesetting time.
- **⚡ Cost-Optimized Cloud GPU Orchestration**: Deployed on RunPod serverless GPU pods with Network Storage (Network Volume) mounting, eliminating cold-start latency while reducing cloud compute overhead by ~75% compared to dedicated VMs.
- **🎁 Free-Tier System Quota Engine**: Transparent server-side quota tracking (300 free pages) with admin reset controls and real-time frontend indicators.

---

## 🏛️ System Architecture

```mermaid
graph TD
    Client([Web Client / Scanlator]) <--> UI[React 19 Interactive Studio]
    UI <--> Gateway[FastAPI Modular Gateway]
    
    subgraph Data & State Layer
        Gateway <--> DB[(SQLite / PostgreSQL)]
        Gateway <--> Quota[(System Quota Engine)]
    end
    
    Gateway --> TaskMgr[In-Memory Task Dispatcher]
    TaskMgr --> Worker[Asynchronous Worker Threadpool]
    
    subgraph Distributed AI Inference [RunPod Serverless GPU / Local Fallback]
        Worker <--> CTD[YOLOv5 Speech Bubble Detection]
        CTD --> OCR[Hayai-OCR Multilingual Extraction]
        OCR --> LLM[DeepSeek-V3 Contextual Translation]
        LLM --> Inpaint[LaMa Neural Text Removal]
        Inpaint --> VisionAPI[FLUX.1-Fill Inpainting]
    end
    
    Worker --> PSDGen[Multi-layer Photoshop PSD Exporter]
    PSDGen --> Client
```

---

## 📂 Project Structure (Clean Code Architecture)

```bash
AI_Manga_Translator/
├── manga-web-ui/                   # Frontend Studio (React 19, TypeScript, Vite)
│   ├── src/components/
│   │   ├── Layout/Sidebar/         # Modular Sidebar Subcomponents
│   │   │   ├── PageCard.tsx        # DnD sortable page item with status badges
│   │   │   ├── QuotaWidget.tsx     # 300 free pages quota monitor
│   │   │   ├── UploadCard.tsx      # Drag-and-drop batch upload with progress
│   │   │   └── BatchActionBar.tsx  # Contextual floating action & export bar
│   │   ├── Editor/                 # Canvas engine & bubble node controllers
│   │   └── Modals/                 # Export, settings, and shortcut modals
│   ├── src/store/                  # Zustand stores (useCanvasStore, useProjectStore, useAuthStore)
│   └── src/services/api.ts         # Centralized API service with auth token refresh
│
├── manga-backend/                  # Core API & Worker Services (Python, FastAPI)
│   ├── main.py                     # Clean Gateway Entrypoint (<200 LOC)
│   ├── dependencies.py             # Shared auth, path normalization & security guards
│   ├── system_quota.py             # 300 free pages quota management engine
│   ├── routers/                    # Clean Domain-Driven FastAPI Routers
│   │   ├── projects.py             # Project CRUD, batch export (ZIP/PSD), .manga import
│   │   ├── pages.py                # Page bubbles, PSD export, JSX ExtendScript generation
│   │   ├── translation.py          # Translation triggers, SSE progress streaming, task polling
│   │   ├── editor.py               # Inpainting (LaMa), CTD erase, AI redraw (FLUX), OCR scan
│   │   ├── system.py               # Telemetry, hardware GPU monitor, quota status/reset
│   │   └── fonts.py                # Typography management & web font serving
│   ├── comic_text_detector/        # Custom YOLOv5 text & bubble detection models
│   ├── psd_utils.py                # Multi-layer Photoshop PSD generator
│   └── worker.py                   # Local GPU/CPU inference pipeline
│
└── infra/                          # Infrastructure & Deployment manifests
    ├── Dockerfile                  # Container definition for DeepKoma backend
    └── nginx.conf                  # Production reverse proxy & SSL termination
```

---

## 🚀 Quickstart

### 1. Prerequisites
- [Docker](https://www.docker.com/) & Docker Compose
- [Python 3.10+](https://www.python.org/)
- [Node.js 18+](https://nodejs.org/) & `npm`

### 2. Configuration
Copy the sample environment file and configure your credentials:
```bash
cp deepkoma.env.example deepkoma.env
```

### 3. Running with Docker Compose (Recommended)
Launch the entire stack (FastAPI Backend, Celery Worker, Redis, and React Web UI):
```bash
docker-compose up -d --build
```
Access the application:
- **Web Studio UI**: `http://localhost:5173` (or `http://localhost:80`)
- **Interactive API Docs**: `http://localhost:8000/docs`

### 4. Local Development Setup

#### Backend:
```bash
cd manga-backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

#### Frontend:
```bash
cd manga-web-ui
npm install
npm run dev
```

---

## ⚙️ Environment Variables Reference

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `BACKEND_BASE_URL` | Public endpoint for the backend API | `http://localhost:8000` |
| `RUNPOD_API_KEY` | RunPod API token for serverless execution | `your_runpod_api_key` |
| `RUNPOD_TRANSLATE_ENDPOINT_ID` | RunPod endpoint ID for OCR/Inpaint workers | `your_endpoint_id` |
| `R2_ACCOUNT_ID` | Cloudflare R2 Account ID for media storage | `your_r2_account_id` |
| `R2_BUCKET_NAME` | S3-compatible R2 storage bucket name | `manga-temp-storage` |
| `PAYOS_CLIENT_ID` | PayOS client ID for payment integration | `your_payos_client_id` |

---

## 🧪 Testing

Run local automated test suites verifying end-to-end processing pipelines:
```bash
# Run unit & integration tests
python manga-backend/tests/test_worker_pipeline.py
python manga-backend/tests/test_ocr_languages.py
python manga-backend/tests/test_security_and_finances.py
```

---

## 📄 License

This project is released under the [MIT License](LICENSE). Contributions, bug reports, and suggestions are welcome!

<div align="center">
  <sub>Engineered with ❤️ by <b>DAO DANG THUAN</b> • Solo Full-Stack Project</sub>
</div>
