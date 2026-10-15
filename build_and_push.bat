@echo off
echo ========================================================
echo 🎨 AI Manga Translator: Building Image with FLUX Engine
echo Target: thuandaose/ai-manga-translator:latest
echo ========================================================

docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker chua duoc cai dat hoac Docker Desktop chua duoc bat!
    echo Vui long mo Docker Desktop truoc khi chay script nay.
    pause
    exit /b 1
)

echo.
echo [1/2] Dang tien hanh Docker build (co the mat 5-15 phut tuy toc do mang)...
docker build -t thuandaose/ai-manga-translator:latest -t thuandaose/ai-manga-translator:v2.0 .
if errorlevel 1 (
    echo [ERROR] Docker build that bai!
    pause
    exit /b 1
)

echo.
echo [2/2] Dang push image len Docker Hub...
docker push thuandaose/ai-manga-translator:latest
docker push thuandaose/ai-manga-translator:v2.0
if errorlevel 1 (
    echo [ERROR] Docker push that bai! Hay chac chan ban da chay 'docker login'.
    pause
    exit /b 1
)

echo ========================================================
echo [SUCCESS] Da build va push thanh cong thuandaose/ai-manga-translator:latest & v2.0!
echo ========================================================
pause
