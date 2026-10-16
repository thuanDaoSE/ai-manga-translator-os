"""
Manga AI Translator - Clean FastAPI Core Gateway
=================================================
Modular API gateway orchestrating OCR, Inpainting, AI Translation,
and dynamic Typesetting for Manga/Webtoon localization.
"""

import os
import sys
import time
import shutil
import asyncio
import logging
from typing import Optional

# Setup path priorities
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)
sys.path.insert(0, os.path.join(BACKEND_DIR, "comic_text_detector"))

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("manga_backend")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("runpod").setLevel(logging.WARNING)

# Initialize FastAPI application
app = FastAPI(
    title="AI Manga Translator API",
    version="2.0.0",
    description="High-performance backend for Manga translation and typesetting"
)

# ----------------------------------------------------
# 1. CORS Configuration
# ----------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CORSStaticFiles(StaticFiles):
    """Static file provider ensuring permissive CORS headers and disabling aggressive client caching."""
    async def get_response(self, path: str, scope) -> Response:
        response = await super().get_response(path, scope)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        return response

@app.middleware("http")
async def static_cors_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/workspace"):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

# ----------------------------------------------------
# 2. Workspace and Storage Directory Setup
# ----------------------------------------------------
WORKSPACE_DIR = os.path.join(BACKEND_DIR, "workspace")
os.makedirs(WORKSPACE_DIR, exist_ok=True)
os.makedirs(os.path.join(WORKSPACE_DIR, "fonts"), exist_ok=True)

app.mount("/workspace", CORSStaticFiles(directory=WORKSPACE_DIR), name="workspace")

# ----------------------------------------------------
# 3. Mount Modular Routers
# ----------------------------------------------------
from routers.system import router as system_router
from routers.projects import router as projects_router
from routers.pages import router as pages_router
from routers.translation import router as translation_router
from routers.editor import router as editor_router
from routers.fonts import router as fonts_router

app.include_router(system_router)
app.include_router(projects_router)
app.include_router(pages_router)
app.include_router(translation_router)
app.include_router(editor_router, prefix="/api")
app.include_router(editor_router, prefix="/api/editor")
app.include_router(fonts_router)

# ----------------------------------------------------
# 4. Background Workers & Cleanup Tasks
# ----------------------------------------------------
async def auto_cleanup_workspace():
    """Background garbage collector: cleans up temporary workspace files older than 2 hours."""
    while True:
        try:
            if os.path.exists(WORKSPACE_DIR):
                now = time.time()
                expiration_seconds = 7200  # 2 hours
                for item in os.listdir(WORKSPACE_DIR):
                    if item == "fonts":
                        continue
                    item_path = os.path.join(WORKSPACE_DIR, item)
                    try:
                        age = now - os.stat(item_path).st_mtime
                        if age > expiration_seconds:
                            if os.path.isfile(item_path):
                                os.remove(item_path)
                            elif os.path.isdir(item_path):
                                shutil.rmtree(item_path, ignore_errors=True)
                    except Exception as e:
                        logger.warning(f"Cleanup error for {item}: {e}")
        except Exception as err:
            logger.error(f"Workspace cleanup error: {err}")
        await asyncio.sleep(3600)

@app.on_event("startup")
async def on_startup():
    """Execute startup warmups, background task loops, and license verification."""
    # DRM & license check
    try:
        from license_guard import verify_license_or_die, start_license_heartbeat
        verify_license_or_die()
        start_license_heartbeat()
    except ImportError:
        pass
    except Exception as e:
        logger.warning(f"License guard notice: {e}")

    # GPU models warmup
    try:
        from worker import warmup_gpu_models
        warmup_gpu_models()
    except Exception as e:
        logger.warning(f"GPU warmup notice: {e}")

    # Start background cleanup loop
    asyncio.create_task(auto_cleanup_workspace())
    logger.info("Manga AI Backend initialized successfully.")

# ----------------------------------------------------
# 5. SPA Static Frontend Serving (Optional)
# ----------------------------------------------------
static_dir = os.path.join(BACKEND_DIR, "static")
if os.path.exists(static_dir):
    assets_dir = os.path.join(static_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", CORSStaticFiles(directory=assets_dir), name="static-assets")

    @app.get("/")
    @app.get("/{spa_path:path}")
    async def serve_spa_frontend(spa_path: str = ""):
        if spa_path.startswith("api/") or spa_path.startswith("workspace/") or spa_path in ["docs", "openapi.json", "redoc"]:
            raise HTTPException(status_code=404, detail="Not Found")
        if spa_path.startswith(".") or "/." in spa_path or "\\." in spa_path:
            raise HTTPException(status_code=404, detail="Not Found")

        static_base = os.path.abspath(static_dir)
        target = os.path.abspath(os.path.join(static_base, spa_path))
        if spa_path and os.path.commonpath([target, static_base]) == static_base and os.path.isfile(target):
            return FileResponse(target)
        if "." in os.path.basename(spa_path):
            raise HTTPException(status_code=404, detail="Not Found")

        index_file = os.path.join(static_base, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"status": "online", "app": "AI Manga Translator (DeepKoma)"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
