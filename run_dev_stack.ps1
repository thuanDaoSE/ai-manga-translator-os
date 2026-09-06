# 🚀 SCRIPT KHỞI ĐỘNG DỰ ÁN TỰ ĐỘNG (Powershell)
# Đặt file này tại thư mục gốc của dự án (AI_Manga_Translator) và chạy bằng Powershell.

$ErrorActionPreference = "Stop"

# 1. Kiểm tra và tự động bật Docker Desktop nếu chưa chạy
Write-Host "-------------------------------------------" -ForegroundColor Cyan
Write-Host "1. Kiểm tra Docker Desktop..." -ForegroundColor Cyan
Write-Host "-------------------------------------------" -ForegroundColor Cyan
$dockerProcess = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue

if (-not $dockerProcess) {
    Write-Host "Docker Desktop đang tắt. Đang tự động kích hoạt..." -ForegroundColor Yellow
    $dockerPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPath) {
        Start-Process $dockerPath
        Write-Host "Đang chờ Docker Desktop khởi động (Có thể mất 15-30 giây)..." -ForegroundColor Yellow
        
        $dockerReady = $false
        for ($i = 0; $i -lt 30; $i++) {
            & docker ps >$null 2>&1
            if ($LASTEXITCODE -eq 0) {
                $dockerReady = $true
                break
            }
            Start-Sleep -Seconds 2
        }
        if (-not $dockerReady) {
            Write-Warning "Docker Desktop khởi động hơi lâu, tiếp tục chạy các lệnh sau..."
        } else {
            Write-Host "✅ Docker Desktop đã sẵn sàng!" -ForegroundColor Green
        }
    } else {
        Write-Warning "Không tìm thấy Docker Desktop tại đường dẫn mặc định: $dockerPath"
    }
} else {
    Write-Host "✅ Docker Desktop đã đang chạy." -ForegroundColor Green
}

# 2. Kiểm tra và khởi động các container Database & Redis
Write-Host "`n-------------------------------------------" -ForegroundColor Cyan
Write-Host "2. Kiểm tra Container Database & Redis..." -ForegroundColor Cyan
Write-Host "-------------------------------------------" -ForegroundColor Cyan

try {
    $runningContainers = & docker ps --format "{{.Names}}"
    $dbRunning = ($runningContainers | Select-String -Pattern "db|postgres" -Quiet)
    $redisRunning = ($runningContainers | Select-String -Pattern "redis" -Quiet)
} catch {
    # Nếu docker daemon chưa phản hồi, mặc định coi như cần chạy lệnh up
    $dbRunning = $false
    $redisRunning = $false
}

if (-not $dbRunning -or -not $redisRunning) {
    Write-Host "Database hoặc Redis chưa chạy. Tiến hành chạy docker-compose..." -ForegroundColor Yellow
    $composePath = Join-Path $PSScriptRoot "docker-compose.yml"
    if (Test-Path $composePath) {
        # Chỉ khởi chạy db và redis dịch vụ (không khởi chạy các dịch vụ backend/frontend trong docker compose)
        Start-Process docker-compose -ArgumentList "up -d db redis" -WorkingDirectory $PSScriptRoot -NoNewWindow -Wait
        Write-Host "✅ Đã gửi lệnh khởi động Database & Redis container." -ForegroundColor Green
    } else {
        Write-Warning "Không tìm thấy file docker-compose.yml ở thư mục gốc để khởi chạy tự động."
    }
    Start-Sleep -Seconds 3
} else {
    Write-Host "✅ Database & Redis Container đã đang chạy." -ForegroundColor Green
}

# 3. Khởi động 3 Terminal chạy dịch vụ
Write-Host "`n-------------------------------------------" -ForegroundColor Cyan
Write-Host "3. Mở các terminal chạy ứng dụng..." -ForegroundColor Cyan
Write-Host "-------------------------------------------" -ForegroundColor Cyan

$backendDir = Join-Path $PSScriptRoot "manga-backend"
$frontendDir = Join-Path $PSScriptRoot "manga-web-ui"

# Terminal 1: Backend FastAPI (Uvicorn)
Write-Host "👉 Khởi chạy Terminal 1: Backend FastAPI (Uvicorn)..." -ForegroundColor Yellow
$backendCmd = "Set-Location -Path '$backendDir'; & ./venv/Scripts/activate.ps1; uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$backendCmd" -WorkingDirectory $backendDir

# Terminal 2: Celery Worker
Write-Host "👉 Khởi chạy Terminal 2: Celery Worker..." -ForegroundColor Yellow
$celeryCmd = "Set-Location -Path '$backendDir'; & ./venv/Scripts/activate.ps1; celery -A worker.celery_app worker --loglevel=info -P threads"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$celeryCmd" -WorkingDirectory $backendDir

# Terminal 3: Frontend React (Vite)
Write-Host "👉 Khởi chạy Terminal 3: Frontend React (Vite)..." -ForegroundColor Yellow
$frontendCmd = "Set-Location -Path '$frontendDir'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$frontendCmd" -WorkingDirectory $frontendDir

Write-Host "`n🎉 Hoàn tất! 3 cửa sổ terminal đã được mở để chạy dự án." -ForegroundColor Green
